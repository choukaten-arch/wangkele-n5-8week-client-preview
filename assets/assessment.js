const elements = Object.fromEntries(
  [
    "loadingView", "errorView", "errorText", "startView", "startForm", "resumeButton",
    "assessmentKind", "assessmentLabel", "assessmentScope", "questionCount", "durationMinutes",
    "patternCount", "quizView", "quizLabel", "quizScope", "timer", "progressBar", "questionNumber",
    "questionPrompt", "questionBody", "optionGroup", "quizHint", "questionDots", "prevButton",
    "nextButton", "submitButton", "resultView", "completionText", "completedCount", "elapsedLabel",
    "restartButton", "submitDialog", "confirmSubmitButton"
  ].map(id => [id, document.querySelector(`#${id}`)])
);

const STORAGE_PREFIX = "wkl_n5_8week_preview_v1:";
const OPTION_LABELS = ["A", "B", "C", "D"];
const PRACTICE_SESSION_URL = "../api/n5-auth/practice-sessions";
const PRACTICE_ACTION_HEADER = "X-N5-Learner-Action";
const DEFAULT_PRACTICE_HEARTBEAT_SECONDS = 30;
const PRACTICE_IDLE_AFTER_MS = 2 * 60 * 1000;

let assessment;
let fixture;
let storageKey;
let state;
let timerHandle;
let practiceHeartbeatHandle;
let practiceSetup;
let practiceMutationQueue = Promise.resolve();
let lastPracticeInteractionAt = 0;
let practicePaused = true;
let practiceRunGeneration = 0;

function showOnly(view) {
  for (const id of ["loadingView", "errorView", "startView", "quizView", "resultView"]) {
    elements[id].classList.toggle("hidden", elements[id] !== view);
  }
  window.scrollTo(0, 0);
}

function fail(message) {
  elements.errorText.textContent = message;
  showOnly(elements.errorView);
}

function formatTemplate(template, number) {
  return String(template).replaceAll("{n}", String(number));
}

function safeReadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (
      !parsed
      || parsed.assessmentId !== assessment.id
      || !Array.isArray(parsed.responses)
      || parsed.responses.length !== assessment.question_count
      || !Number.isInteger(parsed.currentIndex)
      || parsed.currentIndex < 0
      || parsed.currentIndex >= assessment.question_count
    ) return null;
    parsed.remainingSeconds = Math.max(0, Math.min(
      assessment.duration_minutes * 60,
      Number(parsed.remainingSeconds) || 0
    ));
    if (Object.hasOwn(parsed, "qaAlias")) {
      delete parsed.qaAlias;
      localStorage.setItem(storageKey, JSON.stringify(parsed));
    }
    parsed.timedOut = Boolean(parsed.timedOut);
    parsed.completed = Boolean(parsed.completed);
    parsed.startedAt = Number(parsed.startedAt) || Date.now();
    parsed.completedAt = Number(parsed.completedAt) || null;
    parsed.practiceActivityId = /^[A-Za-z0-9._:-]{1,160}$/.test(parsed.practiceActivityId || "")
      ? parsed.practiceActivityId
      : "";
    parsed.practiceHeartbeatSeconds = Math.max(10, Math.min(
      120,
      Number(parsed.practiceHeartbeatSeconds) || DEFAULT_PRACTICE_HEARTBEAT_SECONDS
    ));
    return parsed;
  } catch {
    return null;
  }
}

function createFreshState() {
  return {
    version: 1,
    assessmentId: assessment.id,
    currentIndex: 0,
    responses: Array(assessment.question_count).fill(null),
    remainingSeconds: assessment.duration_minutes * 60,
    timedOut: false,
    completed: false,
    startedAt: Date.now(),
    completedAt: null,
    practiceActivityId: "",
    practiceHeartbeatSeconds: DEFAULT_PRACTICE_HEARTBEAT_SECONDS
  };
}

function saveProgress() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function setupStartView(saved) {
  stopPracticeHeartbeat();
  practicePaused = true;
  elements.assessmentKind.textContent = assessment.kind === "final" ? "FINAL ASSESSMENT" : "WEEKLY CHECK";
  elements.assessmentLabel.textContent = assessment.label;
  elements.assessmentScope.textContent = assessment.lesson_label;
  elements.questionCount.textContent = String(assessment.question_count);
  elements.durationMinutes.textContent = String(assessment.duration_minutes);
  elements.patternCount.textContent = String(assessment.pattern_count);
  elements.resumeButton.classList.toggle("hidden", !saved || saved.completed);
  showOnly(elements.startView);
}

async function requestPracticeJson(url, { body = {}, keepalive = false } = {}) {
  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    keepalive,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      [PRACTICE_ACTION_HEADER]: "1"
    },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "練習時數暫時無法同步。");
    error.status = response.status;
    error.code = payload.error || "practice_sync_failed";
    throw error;
  }
  return payload;
}

function queuePracticeMutation(task) {
  const operation = practiceMutationQueue.then(task, task);
  practiceMutationQueue = operation.catch(() => undefined);
  return operation;
}

function stopPracticeHeartbeat() {
  window.clearInterval(practiceHeartbeatHandle);
  practiceHeartbeatHandle = undefined;
}

function practiceSyncWarning(error) {
  console.error("Practice-time sync failed without blocking the assessment", error);
  if (state && !state.completed && !elements.quizView.classList.contains("hidden")) {
    elements.quizHint.textContent = "練習時數暫時無法同步，作答仍可繼續。";
  }
}

function schedulePracticeHeartbeat() {
  stopPracticeHeartbeat();
  const seconds = Math.max(10, Math.min(
    120,
    Number(state?.practiceHeartbeatSeconds) || DEFAULT_PRACTICE_HEARTBEAT_SECONDS
  ));
  practiceHeartbeatHandle = window.setInterval(() => {
    const isIdle = Date.now() - lastPracticeInteractionAt >= PRACTICE_IDLE_AFTER_MS;
    if (isIdle) practicePaused = true;
    if (!state?.completed && document.visibilityState === "visible" && !practicePaused) {
      void syncPracticeActivity("heartbeat");
    }
  }, seconds * 1000);
}

function markPracticeInteraction() {
  if (!state || state.completed || elements.quizView.classList.contains("hidden")) return;
  const wasIdle = practicePaused
    || Date.now() - lastPracticeInteractionAt >= PRACTICE_IDLE_AFTER_MS;
  lastPracticeInteractionAt = Date.now();
  practicePaused = false;
  if (wasIdle && state.practiceActivityId) void syncPracticeActivity("resume");
}

async function startPracticeActivity(generation) {
  const payload = await requestPracticeJson(PRACTICE_SESSION_URL, {
    body: { referenceId: assessment.id }
  });
  const activityId = String(payload?.activity?.activityId || "");
  if (!/^[A-Za-z0-9._:-]{1,160}$/.test(activityId)) {
    throw new Error("練習識別碼格式不正確。");
  }
  if (generation !== practiceRunGeneration || !state) return;
  state.practiceActivityId = activityId;
  state.practiceHeartbeatSeconds = Math.max(10, Math.min(
    120,
    Number(payload?.policy?.recommendedHeartbeatSeconds) || DEFAULT_PRACTICE_HEARTBEAT_SECONDS
  ));
  saveProgress();
}

async function syncPracticeActivity(action, { keepalive = false } = {}) {
  const activityId = state?.practiceActivityId;
  if (!activityId) return;
  const reportedAnsweredCount = action === "resume" ? null : answeredCount();
  return queuePracticeMutation(async () => {
    await requestPracticeJson(
      `${PRACTICE_SESSION_URL}/${encodeURIComponent(activityId)}/${action}`,
      {
        body: action === "resume" ? {} : { answeredCount: reportedAnsweredCount },
        keepalive
      }
    );
  }).catch(practiceSyncWarning);
}

async function ensurePracticeTracking(generation = practiceRunGeneration) {
  if (!state || state.completed) return;
  if (practiceSetup?.generation === generation) return practiceSetup.promise;
  const setupRecord = { generation, promise: null };
  setupRecord.promise = (async () => {
    if (generation !== practiceRunGeneration || !state) return;
    if (state.practiceActivityId) {
      try {
        await queuePracticeMutation(() => requestPracticeJson(
          `${PRACTICE_SESSION_URL}/${encodeURIComponent(state.practiceActivityId)}/resume`
        ));
      } catch (error) {
        if (![404, 409].includes(error?.status)) throw error;
        state.practiceActivityId = "";
        saveProgress();
      }
    }
    if (!state.practiceActivityId) {
      await queuePracticeMutation(() => startPracticeActivity(generation));
    }
    if (generation === practiceRunGeneration && state && !state.completed) {
      schedulePracticeHeartbeat();
    }
  })().catch(practiceSyncWarning).finally(() => {
    if (practiceSetup === setupRecord) practiceSetup = undefined;
  });
  practiceSetup = setupRecord;
  return setupRecord.promise;
}

async function completePracticeTracking(generation) {
  if (practiceSetup?.generation === generation) await practiceSetup.promise;
  if (generation !== practiceRunGeneration || !state) return;
  await syncPracticeActivity("complete", { keepalive: true });
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function answeredCount() {
  return state.responses.filter(value => Number.isInteger(value)).length;
}

function updateTimer() {
  elements.timer.textContent = formatTime(state.remainingSeconds);
  const warning = state.remainingSeconds <= 300;
  elements.timer.closest(".timer").classList.toggle("warning", warning);
  if (state.timedOut) {
    elements.quizHint.textContent = "預覽時間已到；系統不會自動交卷，請自行檢查後完成。";
  }
}

function startTimer() {
  clearInterval(timerHandle);
  updateTimer();
  timerHandle = window.setInterval(() => {
    if (!state || state.completed) return;
    if (state.remainingSeconds > 0) {
      state.remainingSeconds -= 1;
      if (state.remainingSeconds === 0) state.timedOut = true;
      saveProgress();
      updateTimer();
    }
  }, 1000);
}

function createOption(option, optionIndex) {
  const label = document.createElement("label");
  label.className = "option";

  const input = document.createElement("input");
  input.type = "radio";
  input.name = `question-${state.currentIndex + 1}`;
  input.value = String(optionIndex);
  input.checked = state.responses[state.currentIndex] === optionIndex;
  input.addEventListener("change", () => {
    state.responses[state.currentIndex] = optionIndex;
    elements.quizHint.textContent = state.timedOut
      ? "預覽時間已到；系統不會自動交卷，請自行檢查後完成。"
      : "";
    saveProgress();
    renderQuiz();
  });

  const index = document.createElement("span");
  index.className = "option-index";
  index.textContent = OPTION_LABELS[optionIndex];

  const text = document.createElement("span");
  text.textContent = option;
  label.append(input, index, text);
  return label;
}

function createDot(index) {
  const dot = document.createElement("button");
  dot.type = "button";
  dot.className = "question-dot";
  dot.textContent = String(index + 1);
  if (Number.isInteger(state.responses[index])) dot.classList.add("done");
  if (index === state.currentIndex) dot.classList.add("current");
  const status = Number.isInteger(state.responses[index]) ? "已作答" : "未作答";
  dot.setAttribute("aria-label", `前往第 ${index + 1} 題，${status}`);
  dot.setAttribute("aria-current", index === state.currentIndex ? "step" : "false");
  dot.addEventListener("click", () => {
    state.currentIndex = index;
    saveProgress();
    renderQuiz();
    window.scrollTo(0, 0);
    elements.questionPrompt.focus({ preventScroll: true });
  });
  return dot;
}

function renderQuiz() {
  const number = state.currentIndex + 1;
  const total = assessment.question_count;

  elements.quizLabel.textContent = assessment.label;
  elements.quizScope.textContent = assessment.lesson_label;
  elements.questionNumber.textContent = `第 ${number} / ${total} 題`;
  elements.questionPrompt.textContent = formatTemplate(fixture.prompt_template, number);
  elements.questionPrompt.tabIndex = -1;
  elements.questionBody.textContent = formatTemplate(fixture.body_template, number);
  elements.optionGroup.replaceChildren(...fixture.options.map(createOption));
  elements.questionDots.replaceChildren(...Array.from({ length: total }, (_, index) => createDot(index)));
  elements.progressBar.style.width = `${(answeredCount() / total) * 100}%`;
  elements.prevButton.disabled = state.currentIndex === 0;
  elements.nextButton.classList.toggle("hidden", state.currentIndex === total - 1);
  elements.submitButton.classList.toggle("hidden", state.currentIndex !== total - 1);
  if (!state.timedOut) elements.quizHint.textContent = "";
  updateTimer();
}

function enterQuiz(progress) {
  state = progress;
  practiceRunGeneration += 1;
  const generation = practiceRunGeneration;
  lastPracticeInteractionAt = Date.now();
  practicePaused = false;
  saveProgress();
  showOnly(elements.quizView);
  renderQuiz();
  startTimer();
  void ensurePracticeTracking(generation);
}

function goToQuestion(index) {
  state.currentIndex = Math.max(0, Math.min(assessment.question_count - 1, index));
  saveProgress();
  renderQuiz();
  window.scrollTo(0, 0);
}

function requestSubmit() {
  const firstMissing = state.responses.findIndex(value => !Number.isInteger(value));
  if (firstMissing !== -1) {
    goToQuestion(firstMissing);
    elements.quizHint.textContent = `還有 ${assessment.question_count - answeredCount()} 題未完成，已帶你前往第一題未作答題目。`;
    elements.optionGroup.querySelector("input")?.focus();
    return;
  }
  elements.submitDialog.showModal();
}

function formatElapsed(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes} 分 ${remaining} 秒`;
}

function showResult() {
  clearInterval(timerHandle);
  stopPracticeHeartbeat();
  const totalSeconds = assessment.duration_minutes * 60;
  const elapsed = Math.max(0, totalSeconds - state.remainingSeconds);
  elements.completedCount.textContent = `${answeredCount()} / ${assessment.question_count}`;
  elements.elapsedLabel.textContent = formatElapsed(elapsed);
  elements.completionText.textContent = `${assessment.label}（${assessment.lesson_label}）的介面流程已完成；作答進度保留在這台裝置，練習時數同步至學習紀錄，本頁不計算分數。`;
  showOnly(elements.resultView);
}

function completePreview() {
  const generation = practiceRunGeneration;
  state.completed = true;
  state.completedAt = Date.now();
  saveProgress();
  void completePracticeTracking(generation);
  showResult();
}

function bindEvents() {
  elements.startForm.addEventListener("submit", event => {
    event.preventDefault();
    enterQuiz(createFreshState());
  });

  elements.resumeButton.addEventListener("click", () => {
    const saved = safeReadProgress();
    if (saved && !saved.completed) enterQuiz(saved);
  });

  elements.prevButton.addEventListener("click", () => goToQuestion(state.currentIndex - 1));
  elements.nextButton.addEventListener("click", () => {
    if (!Number.isInteger(state.responses[state.currentIndex])) {
      elements.quizHint.textContent = "請先選擇一個示意選項，再前往下一題。";
      elements.optionGroup.querySelector("input")?.focus();
      return;
    }
    goToQuestion(state.currentIndex + 1);
  });
  elements.submitButton.addEventListener("click", requestSubmit);
  elements.submitDialog.addEventListener("close", () => {
    if (elements.submitDialog.returnValue === "confirm") completePreview();
  });
  elements.restartButton.addEventListener("click", () => {
    clearInterval(timerHandle);
    stopPracticeHeartbeat();
    practiceRunGeneration += 1;
    state = null;
    localStorage.removeItem(storageKey);
    setupStartView(null);
  });

  for (const eventName of ["pointerdown", "keydown", "touchstart"]) {
    document.addEventListener(eventName, markPracticeInteraction, { passive: true });
  }

  document.addEventListener("visibilitychange", () => {
    if (!state || state.completed || elements.quizView.classList.contains("hidden")) return;
    if (document.visibilityState === "hidden") {
      if (!practicePaused) void syncPracticeActivity("heartbeat", { keepalive: true });
      practicePaused = true;
    } else {
      lastPracticeInteractionAt = Date.now();
      practicePaused = false;
      void syncPracticeActivity("resume");
    }
  });

  window.addEventListener("pagehide", () => {
    if (state && !state.completed && !elements.quizView.classList.contains("hidden")) {
      if (!practicePaused) void syncPracticeActivity("heartbeat", { keepalive: true });
      practicePaused = true;
    }
  });
}

async function init() {
  try {
    const id = new URLSearchParams(window.location.search).get("id") || "n5w8_week_01";
    if (!/^n5w8_(?:week_0[1-8]|final)$/.test(id)) throw new Error("評量代碼不在安全清單中。");

    const [programResponse, fixtureResponse] = await Promise.all([
      fetch(new URL("../data/program.json", import.meta.url), { cache: "no-store" }),
      fetch(new URL("../data/demo-assessment.json", import.meta.url), { cache: "no-store" })
    ]);
    if (!programResponse.ok || !fixtureResponse.ok) throw new Error("本機預覽資料載入失敗。");

    const [program, loadedFixture] = await Promise.all([
      programResponse.json(),
      fixtureResponse.json()
    ]);
    assessment = program.assessments.find(item => item.id === id);
    if (!assessment) throw new Error("找不到指定的評量規劃。");
    fixture = loadedFixture;
    if (!Array.isArray(fixture.options) || fixture.options.length !== 4) {
      throw new Error("合成預覽資料格式不正確。");
    }

    storageKey = `${STORAGE_PREFIX}${assessment.id}`;
    document.title = `${assessment.label}流程預覽｜八週陪跑 N5`;
    bindEvents();
    const saved = safeReadProgress();
    if (saved?.completed) {
      state = saved;
      showResult();
    } else {
      setupStartView(saved);
    }
  } catch (error) {
    console.error("Failed to initialize assessment preview", error);
    fail(error instanceof Error ? error.message : "未知錯誤");
  }
}

init();
