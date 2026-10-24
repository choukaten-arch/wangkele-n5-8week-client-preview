const form = document.querySelector("#changePasswordForm");
const currentPasswordField = document.querySelector("#currentPasswordField");
const currentPasswordInput = document.querySelector("#currentPassword");
const newPasswordInput = document.querySelector("#newPassword");
const confirmPasswordInput = document.querySelector("#confirmPassword");
const message = document.querySelector("#passwordModeMessage");
const errorBox = document.querySelector("#changePasswordError");
const submitButton = document.querySelector("#changePasswordButton");
const cancelLink = document.querySelector("#cancelPasswordChange");

let passwordChangeRequired = false;

function safeReturnTo() {
  const candidate = new URLSearchParams(location.search).get("returnTo") || "/";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  try {
    const target = new URL(candidate, location.origin);
    if (target.origin !== location.origin
      || target.pathname.startsWith("/login")
      || target.pathname.startsWith("/change-password")) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

function loginUrl({ changed = false } = {}) {
  const params = new URLSearchParams({ returnTo: safeReturnTo() });
  if (changed) params.set("changed", "1");
  return `/login/?${params}`;
}

function currentPageLoginUrl() {
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  return `/login/?returnTo=${encodeURIComponent(returnTo)}`;
}

function requiresPasswordChange(payload) {
  return payload?.passwordChangeRequired === true
    || payload?.learner?.passwordChangeRequired === true;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "密碼服務暫時無法使用，請稍後再試。");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function configureForm(session) {
  passwordChangeRequired = requiresPasswordChange(session);
  currentPasswordField.classList.toggle("hidden", passwordChangeRequired);
  currentPasswordInput.required = !passwordChangeRequired;
  cancelLink.classList.toggle("hidden", passwordChangeRequired);
  cancelLink.href = safeReturnTo();
  message.textContent = passwordChangeRequired
    ? "首次或使用一次性密碼登入後，請先設定新密碼再繼續。"
    : "為了確認是本人操作，請先輸入目前密碼。";
  form.classList.remove("hidden");
  (passwordChangeRequired ? newPasswordInput : currentPasswordInput).focus();
}

async function initialize() {
  try {
    configureForm(await requestJson("/api/n5-auth/session"));
  } catch (error) {
    if (error.status === 401) {
      location.replace(window.__N5_APP_PATH__(currentPageLoginUrl()));
      return;
    }
    message.textContent = error.message;
    errorBox.textContent = error.message;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorBox.textContent = "";

  if (newPasswordInput.value !== confirmPasswordInput.value) {
    errorBox.textContent = "兩次輸入的新密碼不一致。";
    confirmPasswordInput.focus();
    return;
  }
  if (!form.reportValidity()) return;

  submitButton.disabled = true;
  submitButton.textContent = "儲存中…";
  try {
    const body = { newPassword: newPasswordInput.value };
    if (!passwordChangeRequired) body.currentPassword = currentPasswordInput.value;
    await requestJson("/api/n5-auth/password", {
      method: "POST",
      headers: { "X-N5-Learner-Action": "1" },
      body: JSON.stringify(body)
    });
    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    confirmPasswordInput.value = "";
    location.replace(window.__N5_APP_PATH__(loginUrl({ changed: true }))); 
  } catch (error) {
    currentPasswordInput.value = "";
    errorBox.textContent = error.message;
    (passwordChangeRequired ? newPasswordInput : currentPasswordInput).focus();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "儲存新密碼";
  }
});

initialize();
