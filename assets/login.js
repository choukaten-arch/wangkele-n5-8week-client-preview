const form = document.querySelector("#loginForm");
const accountInput = document.querySelector("#account");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#loginButton");
const errorBox = document.querySelector("#loginError");
const forgotForm = document.querySelector("#forgotPasswordForm");
const forgotEmailInput = document.querySelector("#forgotEmail");
const forgotButton = document.querySelector("#forgotPasswordButton");
const forgotError = document.querySelector("#forgotPasswordError");
const forgotResult = document.querySelector("#forgotPasswordResult");
const forgotPanel = document.querySelector(".forgot-password-panel");

function safeReturnTo() {
  const candidate = new URLSearchParams(location.search).get("returnTo") || "/";
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return "/";
  try {
    const target = new URL(candidate, location.origin);
    if (target.origin !== location.origin || target.pathname.startsWith("/login")) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return "/";
  }
}

function passwordChangeUrl() {
  const target = safeReturnTo();
  const returnTo = target.startsWith("/change-password") ? "/" : target;
  return `/change-password/?returnTo=${encodeURIComponent(returnTo)}`;
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
    const error = new Error(payload.message || "服務暫時無法使用，請稍後再試。");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function setButtonLabel(button, label) {
  const textNode = button.firstChild;
  if (textNode?.nodeType === Node.TEXT_NODE) textNode.textContent = `${label} `;
  else button.textContent = label;
}

function renderForgotPasswordResult(payload) {
  forgotResult.replaceChildren();

  const message = document.createElement("p");
  message.textContent = payload?.message || "如果信箱與帳號資料相符，系統會提供密碼重設方式。";
  forgotResult.append(message);

  if (payload?.oneTimePassword) {
    const notice = document.createElement("p");
    notice.textContent = "測試用一次性密碼（僅顯示這一次）：";
    const password = document.createElement("code");
    password.textContent = String(payload.oneTimePassword);
    const hint = document.createElement("p");
    hint.textContent = "請使用此密碼登入，登入後立即設定新密碼。";
    forgotResult.append(notice, password, hint);
  }

  forgotResult.classList.remove("hidden");
}

async function continueIfSignedIn() {
  try {
    const session = await requestJson("/api/n5-auth/session");
    location.replace(window.__N5_APP_PATH__(requiresPasswordChange(session) ? passwordChangeUrl() : safeReturnTo()));
  } catch (error) {
    if (error.status !== 401) {
      errorBox.classList.remove("is-success");
      errorBox.textContent = error.message;
    }
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorBox.classList.remove("is-success");
  errorBox.textContent = "";
  if (!form.reportValidity()) return;

  submitButton.disabled = true;
  setButtonLabel(submitButton, "登入中…");
  try {
    const result = await requestJson("/api/n5-auth/login", {
      method: "POST",
      body: JSON.stringify({
        account: accountInput.value.trim(),
        password: passwordInput.value
      })
    });
    passwordInput.value = "";
    location.replace(window.__N5_APP_PATH__(requiresPasswordChange(result) ? passwordChangeUrl() : safeReturnTo()));
  } catch (error) {
    passwordInput.value = "";
    errorBox.textContent = error.message;
    passwordInput.focus();
  } finally {
    submitButton.disabled = false;
    setButtonLabel(submitButton, "登入並繼續");
  }
});

forgotForm.addEventListener("submit", async event => {
  event.preventDefault();
  forgotError.textContent = "";
  forgotResult.replaceChildren();
  forgotResult.classList.add("hidden");
  if (!forgotForm.reportValidity()) return;

  forgotButton.disabled = true;
  forgotButton.textContent = "處理中…";
  try {
    const email = forgotEmailInput.value.trim();
    const result = await requestJson("/api/n5-auth/forgot-password", {
      method: "POST",
      headers: { "X-N5-Learner-Action": "1" },
      body: JSON.stringify({ email })
    });
    accountInput.value = email;
    renderForgotPasswordResult(result);
  } catch (error) {
    forgotError.textContent = error.message;
  } finally {
    forgotButton.disabled = false;
    forgotButton.textContent = "取得重設方式";
  }
});

forgotPanel.addEventListener("toggle", () => {
  if (!forgotPanel.open) {
    forgotResult.replaceChildren();
    forgotResult.classList.add("hidden");
    return;
  }
  if (!forgotEmailInput.value) {
    forgotEmailInput.value = accountInput.value.trim();
  }
});

const query = new URLSearchParams(location.search);
if (query.get("changed") === "1") {
  errorBox.classList.add("is-success");
  errorBox.textContent = "密碼已更新，請用新密碼重新登入。";
}

continueIfSignedIn();
