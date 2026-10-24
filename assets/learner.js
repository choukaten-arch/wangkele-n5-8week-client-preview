const STORAGE_KEY = "wkl_n5_8week_learner_v1:demo-session";
const API_ROOT = "../api/n5-learner";

const views = {
  loading: document.querySelector("#loadingView"),
  error: document.querySelector("#errorView"),
  dashboard: document.querySelector("#dashboardView")
};

const elements = {
  retryButton: document.querySelector("#retryButton"),
  errorText: document.querySelector("#errorText"),
  syncButton: document.querySelector("#syncButton"),
  syncStatus: document.querySelector("#syncStatus"),
  avatarInitial: document.querySelector("#avatarInitial"),
  learnerName: document.querySelector("#learnerName"),
  learnerCohort: document.querySelector("#learnerCohort"),
  provenanceLabel: document.querySelector("#provenanceLabel"),
  provenanceWarning: document.querySelector("#provenanceWarning"),
  snapshotGenerated: document.querySelector("#snapshotGenerated"),
  metricCoverage: document.querySelector("#metricCoverage"),
  metricCoverageNote: document.querySelector("#metricCoverageNote"),
  metricAccuracy: document.querySelector("#metricAccuracy"),
  metricAccuracyNote: document.querySelector("#metricAccuracyNote"),
  metricRhythm: document.querySelector("#metricRhythm"),
  metricFocus: document.querySelector("#metricFocus"),
  dimensionProfile: document.querySelector("#dimensionProfile"),
  nextActions: document.querySelector("#nextActions"),
  lessonBodyMap: document.querySelector("#lessonBodyMap"),
  activityTimeline: document.querySelector("#activityTimeline"),
  methodCards: document.querySelector("#methodCards"),
  chatTitle: document.querySelector("#chatTitle"),
  chatMessages: document.querySelector("#chatMessages"),
  privacyStorage: document.querySelector("#privacyStorage"),
  privacyBrowser: document.querySelector("#privacyBrowser"),
  privacyChat: document.querySelector("#privacyChat"),
  loginHistoryPanel: document.querySelector("#loginHistoryPanel"),
  loginHistoryLoading: document.querySelector("#loginHistoryLoading"),
  loginHistoryError: document.querySelector("#loginHistoryError"),
  loginHistoryErrorText: document.querySelector("#loginHistoryErrorText"),
  loginHistoryRetry: document.querySelector("#loginHistoryRetry"),
  loginHistoryEmpty: document.querySelector("#loginHistoryEmpty"),
  loginHistoryContent: document.querySelector("#loginHistoryContent"),
  latestLoginTime: document.querySelector("#latestLoginTime"),
  latestLoginSummary: document.querySelector("#latestLoginSummary"),
  loginHistoryCount: document.querySelector("#loginHistoryCount"),
  loginHistoryList: document.querySelector("#loginHistoryList"),
  practiceTimePanel: document.querySelector("#practiceTimePanel"),
  practiceTimeLoading: document.querySelector("#practiceTimeLoading"),
  practiceTimeError: document.querySelector("#practiceTimeError"),
  practiceTimeErrorText: document.querySelector("#practiceTimeErrorText"),
  practiceTimeRetry: document.querySelector("#practiceTimeRetry"),
  practiceTimeEmpty: document.querySelector("#practiceTimeEmpty"),
  practiceTimeContent: document.querySelector("#practiceTimeContent"),
  totalPracticeTime: document.querySelector("#totalPracticeTime"),
  practiceSessionCount: document.querySelector("#practiceSessionCount"),
  lastPracticedTime: document.querySelector("#lastPracticedTime"),
  practiceTimeCount: document.querySelector("#practiceTimeCount"),
  practiceTimeList: document.querySelector("#practiceTimeList")
};

const state = {
  sessionId: "",
  receipt: "",
  expiresAt: "",
  busy: false
};

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showView(name) {
  Object.entries(views).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function safeStorageRead() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed?.sessionId || !parsed?.receipt) return null;
    if (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return {
      sessionId: String(parsed.sessionId),
      receipt: String(parsed.receipt),
      expiresAt: String(parsed.expiresAt || "")
    };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function saveSession() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    sessionId: state.sessionId,
    receipt: state.receipt,
    expiresAt: state.expiresAt
  }));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
  state.sessionId = "";
  state.receipt = "";
  state.expiresAt = "";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.message || "學習 InBody 服務暫時無法使用。");
    error.code = payload.error || "request_failed";
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formatDate(value, { includeTime = false } = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間待確認";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {})
  }).format(date);
}

function formatLoginDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間待確認";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).format(date);
}

function formatPracticeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "時間待確認";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function nonNegativeInteger(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function formatPracticeDuration(value) {
  const seconds = nonNegativeInteger(value);
  if (seconds < 60) return "不到 1 分鐘";
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours} 小時 ${minutes} 分鐘`;
}

function practiceKindLabel(value) {
  const labels = {
    lesson: "課次練習",
    cat: "N5 CAT 診斷",
    weekly_assessment: "週測評量"
  };
  return labels[String(value || "").trim().toLowerCase()] || "其他練習";
}

function practiceStatusLabel(value) {
  const labels = {
    in_progress: "進行中",
    completed: "已完成"
  };
  return labels[String(value || "").trim().toLowerCase()] || "狀態待確認";
}

function summarizeUserAgent(value) {
  const userAgent = String(value || "");
  if (!userAgent) return "未知裝置・未知瀏覽器";

  let device = "其他裝置";
  if (/iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent))) device = "iPad";
  else if (/iPhone/i.test(userAgent)) device = "iPhone";
  else if (/Android/i.test(userAgent)) device = /Mobile/i.test(userAgent) ? "Android 手機" : "Android 平板";
  else if (/Windows/i.test(userAgent)) device = "Windows 電腦";
  else if (/Macintosh|Mac OS X/i.test(userAgent)) device = "Mac 電腦";
  else if (/Linux/i.test(userAgent)) device = "Linux 電腦";

  let browser = "未知瀏覽器";
  if (/Edg\//i.test(userAgent)) browser = "Microsoft Edge";
  else if (/OPR\//i.test(userAgent)) browser = "Opera";
  else if (/CriOS\//i.test(userAgent)) browser = "Chrome";
  else if (/FxiOS\//i.test(userAgent)) browser = "Firefox";
  else if (/Chrome\//i.test(userAgent)) browser = "Chrome";
  else if (/Firefox\//i.test(userAgent)) browser = "Firefox";
  else if (/Safari\//i.test(userAgent) && /Version\//i.test(userAgent)) browser = "Safari";

  return `${device}・${browser}`;
}

function loginMethodLabel(value) {
  const method = String(value || "").trim().toLowerCase();
  const labels = {
    password: "帳號密碼",
    initial_password: "初始密碼",
    one_time_password: "一次性密碼",
    "one-time-password": "一次性密碼",
    otp: "一次性密碼",
    recovery: "一次性密碼"
  };
  return labels[method] || "一般登入";
}

function setLoginHistoryView(name) {
  const states = {
    loading: elements.loginHistoryLoading,
    error: elements.loginHistoryError,
    empty: elements.loginHistoryEmpty,
    content: elements.loginHistoryContent
  };
  Object.entries(states).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
  elements.loginHistoryPanel.setAttribute("aria-busy", name === "loading" ? "true" : "false");
}

function renderLoginHistory(records = [], total = records.length) {
  const rows = Array.isArray(records)
    ? records.slice().sort((left, right) => {
      const rightTime = Date.parse(right?.occurredAt || "");
      const leftTime = Date.parse(left?.occurredAt || "");
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    })
    : [];

  elements.loginHistoryList.replaceChildren();
  if (!rows.length) {
    setLoginHistoryView("empty");
    return;
  }

  const latest = rows[0];
  const latestDevice = summarizeUserAgent(latest.userAgent);
  const latestIp = String(latest.ipAddress || "無法判定");
  elements.latestLoginTime.textContent = formatLoginDate(latest.occurredAt);
  elements.latestLoginSummary.textContent = `${latestDevice}・登入方式 ${loginMethodLabel(latest.method)}・IP ${latestIp}`;

  const safeTotal = Number.isInteger(Number(total)) && Number(total) >= rows.length ? Number(total) : rows.length;
  elements.loginHistoryCount.textContent = safeTotal === rows.length
    ? `共 ${safeTotal} 筆登入活動`
    : `共 ${safeTotal} 筆，顯示最近 ${rows.length} 筆`;

  for (const row of rows) {
    const item = make("li", "learner-login-record");
    const heading = make("div", "learner-login-record-heading");
    heading.append(
      make("time", "", formatLoginDate(row.occurredAt)),
      make("span", "learner-login-method", `登入方式・${loginMethodLabel(row.method)}`)
    );

    const details = make("dl", "learner-login-record-details");
    const fields = [
      ["裝置與瀏覽器", summarizeUserAgent(row.userAgent)],
      ["來源 IP", String(row.ipAddress || "無法判定")]
    ];
    for (const [label, value] of fields) {
      const field = make("div");
      field.append(make("dt", "", label), make("dd", "", value));
      details.append(field);
    }
    item.append(heading, details);
    elements.loginHistoryList.append(item);
  }
  setLoginHistoryView("content");
}

async function loadLoginHistory() {
  setLoginHistoryView("loading");
  try {
    const payload = await requestJson("/api/n5-auth/login-history", {
      credentials: "same-origin"
    });
    renderLoginHistory(payload.records, payload.total);
  } catch (error) {
    elements.loginHistoryErrorText.textContent = error.status === 401
      ? "登入狀態已失效，請重新登入後再查看。"
      : "系統暫時無法讀取紀錄，請稍後再試一次。";
    setLoginHistoryView("error");
  }
}

function setPracticeTimeView(name) {
  const states = {
    loading: elements.practiceTimeLoading,
    error: elements.practiceTimeError,
    empty: elements.practiceTimeEmpty,
    content: elements.practiceTimeContent
  };
  Object.entries(states).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
  elements.practiceTimePanel.setAttribute("aria-busy", name === "loading" ? "true" : "false");
}

function renderPracticeTime(payload = {}) {
  const rows = Array.isArray(payload.records)
    ? payload.records.slice().sort((left, right) => {
      const rightTime = Date.parse(right?.lastPracticedAt || right?.completedAt || right?.startedAt || "");
      const leftTime = Date.parse(left?.lastPracticedAt || left?.completedAt || left?.startedAt || "");
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    })
    : [];

  elements.practiceTimeList.replaceChildren();
  if (!rows.length) {
    setPracticeTimeView("empty");
    return;
  }

  const sessionCount = Math.max(nonNegativeInteger(payload.sessionCount), rows.length);
  const lastPracticedAt = payload.lastPracticedAt
    || rows[0].lastPracticedAt
    || rows[0].completedAt
    || rows[0].startedAt;
  elements.totalPracticeTime.textContent = formatPracticeDuration(payload.totalSeconds);
  elements.practiceSessionCount.textContent = `${sessionCount} 次`;
  elements.lastPracticedTime.textContent = formatPracticeDate(lastPracticedAt);
  elements.practiceTimeCount.textContent = sessionCount === rows.length
    ? `共 ${sessionCount} 次練習`
    : `共 ${sessionCount} 次，顯示最近 ${rows.length} 次`;

  for (const row of rows) {
    const item = make("li", "learner-practice-record");
    const heading = make("div", "learner-practice-record-heading");
    const title = make("h4", "", String(row?.label || "練習紀錄"));
    const badges = make("div", "learner-practice-record-badges");
    badges.append(
      make("span", "learner-practice-kind", practiceKindLabel(row?.kind)),
      make("span", `learner-practice-status ${row?.status === "completed" ? "is-completed" : "is-progress"}`, practiceStatusLabel(row?.status))
    );
    heading.append(title, badges);

    const details = make("dl", "learner-practice-record-details");
    const lastActivityAt = row?.lastPracticedAt || row?.completedAt || row?.startedAt;
    const fields = [
      ["有效練習", formatPracticeDuration(row?.activeSeconds)],
      ["作答題數", `${nonNegativeInteger(row?.answeredCount)} 題`],
      ["最後練習", formatPracticeDate(lastActivityAt)]
    ];
    for (const [label, value] of fields) {
      const field = make("div");
      field.append(make("dt", "", label), make("dd", "", value));
      details.append(field);
    }

    item.append(heading, details);
    elements.practiceTimeList.append(item);
  }
  setPracticeTimeView("content");
}

async function loadPracticeTime() {
  setPracticeTimeView("loading");
  try {
    const payload = await requestJson("/api/n5-auth/practice-time?limit=20", {
      credentials: "same-origin"
    });
    renderPracticeTime(payload);
  } catch (error) {
    elements.practiceTimeErrorText.textContent = error.status === 401
      ? "登入狀態已失效，請重新登入後再查看。"
      : "系統暫時無法讀取練習時數，請稍後再試一次。";
    setPracticeTimeView("error");
  }
}

function percent(value) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : "尚無證據";
}

function renderDimensions(rows = []) {
  elements.dimensionProfile.replaceChildren();
  for (const row of rows) {
    const article = make("article", `learner-dimension-row dimension-${String(row.code).toLowerCase()}`);
    const label = make("div", "learner-dimension-label");
    label.append(make("b", "", row.code), make("span", "", row.label));
    const meter = make("div", "learner-dimension-meter");
    const fill = make("i");
    const width = Number.isFinite(Number(row.accuracy)) ? Math.max(0, Math.min(100, Number(row.accuracy))) : 0;
    fill.style.width = `${width}%`;
    meter.append(fill);
    const result = make("div", "learner-dimension-result");
    result.append(
      make("strong", "", percent(row.accuracy)),
      make("small", "", row.evidenceLabel || "尚無證據")
    );
    article.append(label, meter, result);
    elements.dimensionProfile.append(article);
  }
}

function renderActions(rows = []) {
  elements.nextActions.replaceChildren();
  for (const row of rows) {
    const item = make("li");
    item.append(
      make("span", "", String(row.order || "")),
      make("div")
    );
    item.lastElementChild.append(make("b", "", row.title), make("p", "", row.detail));
    elements.nextActions.append(item);
  }
}

function renderLessonMap(rows = []) {
  elements.lessonBodyMap.replaceChildren();
  for (const row of rows) {
    const link = make("a", `learner-lesson-node ${row.status}`);
    link.href = `../lesson/?lesson=${row.lessonNumber}`;
    link.setAttribute("aria-label", `${row.label}：${row.status === "completed" ? `已有紀錄 ${percent(row.accuracy)}` : row.status === "next" ? "建議下一課" : "尚未開始"}`);
    link.append(make("b", "", row.label));
    if (row.status === "completed") {
      link.append(make("span", "", percent(row.accuracy)));
      if (row.synthetic) link.append(make("small", "", "示範"));
    } else if (row.status === "next") {
      link.append(make("span", "", "NEXT"));
    } else {
      link.append(make("span", "", "—"));
    }
    elements.lessonBodyMap.append(link);
  }
}

function renderActivity(rows = []) {
  elements.activityTimeline.replaceChildren();
  for (const row of rows) {
    const item = make("li", `learner-activity ${row.kind}`);
    const marker = make("span", "learner-activity-marker", row.kind === "cat" ? "CAT" : "課");
    const copy = make("div");
    const title = make("p");
    title.append(make("b", "", row.label));
    if (row.synthetic) title.append(make("em", "", "合成示範"));
    copy.append(title, make("span", "", row.summary));
    item.append(marker, copy, make("time", "", formatDate(row.occurredAt, { includeTime: true })));
    elements.activityTimeline.append(item);
  }
}

function renderMethods(rows = []) {
  elements.methodCards.replaceChildren();
  for (const row of rows) {
    const card = make("article", "learner-method-card");
    const meta = make("div", "learner-method-meta");
    meta.append(make("span", "", `${row.durationMinutes} 分鐘`), make("span", "", row.cadence));
    const rating = make("p", "learner-method-rating");
    rating.setAttribute("aria-label", `自評效果五分中 ${row.confidence} 分`);
    rating.textContent = `${"●".repeat(Number(row.confidence) || 0)}${"○".repeat(Math.max(0, 5 - (Number(row.confidence) || 0)))}`;
    card.append(
      make("span", "learner-demo-tag", "合成示範"),
      make("h3", "", row.title),
      make("p", "", row.summary),
      meta,
      rating,
      make("small", "", `最近使用 ${formatDate(row.lastUsedAt)}`)
    );
    elements.methodCards.append(card);
  }
}

function renderChat(chat = {}) {
  elements.chatTitle.textContent = chat.title || "合成對話";
  elements.chatMessages.replaceChildren();
  for (const row of chat.messages || []) {
    const message = make("article", `learner-chat-message ${row.role === "learner" ? "learner" : "coach"}`);
    const meta = make("p", "learner-chat-meta");
    meta.append(
      make("b", "", row.authorLabel || "示範角色"),
      make("time", "", formatDate(row.occurredAt, { includeTime: true })),
      make("span", "", "合成資料")
    );
    message.append(meta, make("p", "learner-chat-content", row.content || ""));
    elements.chatMessages.append(message);
  }
}

function renderDashboard(dashboard) {
  const identity = dashboard.identity || {};
  const provenance = dashboard.provenance || {};
  const snapshot = dashboard.snapshot || {};
  const privacy = dashboard.privacy || {};

  elements.avatarInitial.textContent = identity.avatarInitial || "學";
  elements.learnerName.textContent = identity.displayName || "合成學員";
  elements.learnerCohort.textContent = identity.cohort || "八週陪跑 N5";
  elements.provenanceLabel.textContent = provenance.label || "資料來源待確認";
  elements.provenanceWarning.textContent = provenance.warning || "此頁只供本機 QA。";
  elements.snapshotGenerated.textContent = `更新於 ${formatDate(dashboard.generatedAt, { includeTime: true })}`;
  elements.metricCoverage.textContent = `${snapshot.completedLessons ?? 0} / ${snapshot.totalLessons ?? 25}`;
  elements.metricCoverageNote.textContent = `課程覆蓋 ${snapshot.coveragePercent ?? 0}%`;
  elements.metricAccuracy.textContent = percent(snapshot.practiceAccuracy);
  elements.metricAccuracyNote.textContent = Number.isFinite(Number(snapshot.practiceAsked))
    ? `${snapshot.practiceCorrect ?? 0}／${snapshot.practiceAsked} 題` : "尚無課後練習";
  elements.metricRhythm.textContent = snapshot.weeklyRhythm || "尚無紀錄";
  elements.metricFocus.textContent = snapshot.focusLabel || "先建立學習基線";
  elements.privacyStorage.textContent = privacy.storage || "—";
  elements.privacyBrowser.textContent = privacy.browserStorage || "—";
  elements.privacyChat.textContent = privacy.chatPolicy || "—";

  renderDimensions(dashboard.dimensions);
  renderActions(dashboard.nextActions);
  renderLessonMap(dashboard.lessonMap);
  renderActivity(dashboard.activity);
  renderMethods(dashboard.methods);
  renderChat(dashboard.chat);
  showView("dashboard");
}

function localEvidenceSources() {
  const sources = [];
  for (let lessonNumber = 1; lessonNumber <= 25; lessonNumber += 1) {
    const key = `wkl_n5_8week_lesson_v1:L${lessonNumber}`;
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (value?.sessionId && value?.receipt && (!value.expiresAt || Date.parse(value.expiresAt) > Date.now())) {
        sources.push({ kind: "lesson", sessionId: String(value.sessionId), receipt: String(value.receipt) });
      }
    } catch {
      // A malformed or unrelated local value is ignored; it is never uploaded.
    }
  }
  try {
    const value = JSON.parse(localStorage.getItem("wkl_n5_8week_cat_v1:session") || "null");
    if (value?.sessionId && value?.receipt && (!value.expiresAt || Date.parse(value.expiresAt) > Date.now())) {
      sources.push({ kind: "cat", sessionId: String(value.sessionId), receipt: String(value.receipt) });
    }
  } catch {
    // Ignore a malformed CAT continuation value.
  }
  return sources;
}

async function syncLocalEvidence({ quiet = false } = {}) {
  if (!state.sessionId || state.busy) return;
  const sources = localEvidenceSources();
  if (!sources.length) {
    if (!quiet) elements.syncStatus.textContent = "這台裝置目前沒有仍在有效期內、可核對的已完成測驗。";
    return;
  }
  state.busy = true;
  elements.syncButton.disabled = true;
  if (!quiet) elements.syncStatus.textContent = "正在向本機評量服務核對完成結果…";
  try {
    const payload = await requestJson(`${API_ROOT}/sessions/${encodeURIComponent(state.sessionId)}/sync`, {
      method: "POST",
      headers: { "x-n5-learner-receipt": state.receipt },
      body: JSON.stringify({ sources })
    });
    renderDashboard(payload.dashboard);
    const result = payload.sync || {};
    elements.syncStatus.textContent = result.imported
      ? `已匯入 ${result.imported} 筆本機權威結果；${result.unchanged || 0} 筆已存在，${result.unavailable || 0} 筆尚未完成或已失效。`
      : `沒有新增結果；${result.unchanged || 0} 筆已同步，${result.unavailable || 0} 筆尚未完成或已失效。`;
  } catch (error) {
    if (!quiet) elements.syncStatus.textContent = error.message;
  } finally {
    state.busy = false;
    elements.syncButton.disabled = false;
  }
}

async function startDemo() {
  if (state.busy) return;
  state.busy = true;
  showView("loading");
  try {
    const payload = await requestJson(`${API_ROOT}/demo-sessions`, {
      method: "POST",
      body: "{}"
    });
    state.sessionId = String(payload.sessionId || "");
    state.receipt = String(payload.receipt || "");
    state.expiresAt = String(payload.expiresAt || "");
    saveSession();
    renderDashboard(payload.dashboard);
    state.busy = false;
    await syncLocalEvidence({ quiet: true });
  } catch (error) {
    clearSession();
    elements.errorText.textContent = error.message;
    showView("error");
  } finally {
    state.busy = false;
  }
}

async function resumeDemo(stored) {
  state.sessionId = stored.sessionId;
  state.receipt = stored.receipt;
  state.expiresAt = stored.expiresAt;
  showView("loading");
  try {
    const payload = await requestJson(`${API_ROOT}/sessions/${encodeURIComponent(state.sessionId)}`, {
      headers: { "x-n5-learner-receipt": state.receipt }
    });
    state.expiresAt = String(payload.expiresAt || state.expiresAt);
    saveSession();
    renderDashboard(payload.dashboard);
    await syncLocalEvidence({ quiet: true });
  } catch {
    clearSession();
    await startDemo();
  }
}
elements.retryButton.addEventListener("click", startDemo);
elements.syncButton.addEventListener("click", () => syncLocalEvidence());
elements.loginHistoryRetry.addEventListener("click", loadLoginHistory);
elements.practiceTimeRetry.addEventListener("click", loadPracticeTime);

const stored = safeStorageRead();
if (stored) resumeDemo(stored);
else startDemo();

loadLoginHistory();
loadPracticeTime();
