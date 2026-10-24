const SUBJECT_KEY = "wkl_n5_8week_auth_subject";
const PROGRESS_PREFIX = "wkl_n5_8week_";
const ADMIN_STORAGE_KEY = "wkl_n5_8week_review_v1";

function currentReturnTo() {
  return `${location.pathname}${location.search}${location.hash}`;
}

function loginUrl() {
  return `/login/?returnTo=${encodeURIComponent(currentReturnTo())}`;
}

function passwordChangeUrl() {
  return `/change-password/?returnTo=${encodeURIComponent(currentReturnTo())}`;
}

function requiresPasswordChange(payload) {
  return payload?.passwordChangeRequired === true
    || payload?.learner?.passwordChangeRequired === true;
}

function clearLearnerBrowserState() {
  const keys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key?.startsWith(PROGRESS_PREFIX) && key !== ADMIN_STORAGE_KEY) keys.push(key);
  }
  keys.forEach(key => localStorage.removeItem(key));
}

function keepCurrentLearnerSeparate(learnerId) {
  const previous = localStorage.getItem(SUBJECT_KEY);
  if (previous && previous !== learnerId) clearLearnerBrowserState();
  localStorage.setItem(SUBJECT_KEY, learnerId);
}

async function requestSession() {
  const response = await fetch("/api/n5-auth/session", {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401) location.replace(window.__N5_APP_PATH__(loginUrl()));
    throw new Error(payload.message || "無法確認登入狀態。");
  }
  return payload;
}

function renderSession(learner) {
  document.querySelectorAll("[data-learner-name]").forEach(node => {
    node.textContent = learner.displayName || "已登入學員";
  });

  document.querySelectorAll(".learner-session-control").forEach(control => {
    if (control.querySelector("[data-auth-change-password]")) return;
    const link = document.createElement("a");
    link.dataset.authChangePassword = "";
    link.className = "auth-password-link";
    link.href = window.__N5_APP_PATH__(passwordChangeUrl());
    link.textContent = "修改密碼";
    const logoutButton = control.querySelector("[data-auth-logout]");
    control.insertBefore(link, logoutButton || null);
  });
}

async function logout() {
  document.querySelectorAll("[data-auth-logout]").forEach(button => { button.disabled = true; });
  try {
    await fetch("/api/n5-auth/session", {
      method: "DELETE",
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" }
    });
  } finally {
    clearLearnerBrowserState();
    location.replace(window.__N5_APP_PATH__("/login/"));
  }
}

document.querySelectorAll("[data-auth-logout]").forEach(button => {
  button.addEventListener("click", logout);
});

try {
  const session = await requestSession();
  if (requiresPasswordChange(session)) {
    location.replace(window.__N5_APP_PATH__(passwordChangeUrl()));
  } else {
    keepCurrentLearnerSeparate(String(session.learner?.learnerId || ""));
    renderSession(session.learner || {});
    document.documentElement.dataset.authReady = "true";
  }
} catch (error) {
  console.error("Failed to confirm learner session", error);
}
