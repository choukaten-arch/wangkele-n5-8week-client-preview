const elements = Object.fromEntries(
  [
    "loadingView", "errorView", "errorText", "retryButton", "startView", "startForm",
    "startButton", "resumeButton", "assessmentKind", "assessmentLabel", "assessmentScope",
    "questionCount", "durationMinutes", "patternCount", "quizView", "quizLabel", "quizScope",
    "timer", "progressBar", "sessionBoundary", "questionNumber", "questionInstruction",
    "questionPrompt", "questionContext", "questionFrame", "optionGroup", "quizHint",
    "questionDots", "prevButton", "nextButton", "submitButton", "resultView",
    "resultAccuracy", "resultTitle", "resultNotice", "resultCorrect", "resultAsked",
    "resultElapsed", "resultAnnouncement", "dimensionKScore", "dimensionKDetail",
    "dimensionUScore", "dimensionUDetail", "dimensionAScore", "dimensionADetail",
    "overallEvidence", "approvedEvidence", "approvedEvidenceNote", "candidateEvidence",
    "candidateEvidenceNote", "reviewSummary", "reviewFilters", "reviewWrongCount",
    "reviewAllCount", "reviewCorrectCount", "reviewList", "reviewEmpty",
    "resultBoundaryTitle", "resultBoundaryText", "restartButton", "submitDialog",
    "confirmSubmitButton"
  ].map(id => [id, document.querySelector(`#${id}`)])
);

const API_ROOT = "/api/n5-assessments";
const STORAGE_PREFIX = "wkl_n5_8week_assessment_v2:";
const LEGACY_STORAGE_PREFIX = "wkl_n5_8week_preview_v1:";
const ASSESSMENT_ID_PATTERN = /^n5w8_(?:week_0[1-8]|final)$/;
const OPAQUE_TOKEN_PATTERN = /^[A-Za-z0-9._~:-]{1,240}$/;
const PRACTICE_SESSION_URL = "/api/n5-auth/practice-sessions";
const PRACTICE_ACTION_HEADER = "X-N5-Learner-Action";
const DEFAULT_PRACTICE_HEARTBEAT_SECONDS = 30;
const PRACTICE_IDLE_AFTER_MS = 2 * 60 * 1000;

const state = {
  assessmentId: "",
  assessment: null,
  items: [],
  content: null,
  sessionId: "",
  receipt: "",
  expiresAt: "",
  responses: [],
  currentIndex: 0,
  remainingSeconds: 0,
  timedOut: false,
  startedAt: null,
  completedAt: null,
  practiceActivityId: "",
  practiceHeartbeatSeconds: DEFAULT_PRACTICE_HEARTBEAT_SECONDS,
  submitting: false,
  reviewFilter: "wrong"
};

let storageKey = "";
let timerHandle;
let practiceHeartbeatHandle;
let practiceSetup;
let practiceMutationQueue = Promise.resolve();
let lastPracticeInteractionAt = 0;
let practicePaused = true;
let practiceRunGeneration = 0;

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function showOnly(view) {
  for (const id of ["loadingView", "errorView", "startView", "quizView", "resultView"]) {
    elements[id].classList.toggle("hidden", elements[id] !== view);
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

function fail(error, fallback = "驗收測驗服務暫時無法使用，請稍後再試。") {
  const message = error?.message && !/^Failed to fetch$/i.test(error.message)
    ? error.message
    : fallback;
  elements.errorText.textContent = message;
  showOnly(elements.errorView);
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
    const error = new Error(payload?.message || payload?.error || `伺服器回應 ${response.status}`);
    error.status = response.status;
    error.code = payload?.error || "request_failed";
    throw error;
  }
  return payload;
}

function positiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

function safeOpaque(value) {
  const token = String(value || "");
  return OPAQUE_TOKEN_PATTERN.test(token) ? token : "";
}

function normalizeStoredResponses(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const responses = [];
  for (const entry of value.slice(0, 50)) {
    const itemToken = safeOpaque(entry?.itemToken);
    const optionToken = safeOpaque(entry?.optionToken);
    if (!itemToken || !optionToken || seen.has(itemToken)) continue;
    seen.add(itemToken);
    responses.push({ itemToken, optionToken });
  }
  return responses;
}

function safeReadProgress() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "null");
    const sessionId = safeOpaque(parsed?.sessionId);
    const receipt = safeOpaque(parsed?.receipt);
    const expiresAt = String(parsed?.expiresAt || "");
    if (!sessionId || !receipt || (expiresAt && Date.parse(expiresAt) <= Date.now())) {
      if (parsed) localStorage.removeItem(storageKey);
      return null;
    }
    const currentIndex = Number(parsed.currentIndex);
    const startedAt = Number(parsed.startedAt);
    return {
      sessionId,
      receipt,
      expiresAt,
      responses: normalizeStoredResponses(parsed.responses),
      currentIndex: Number.isInteger(currentIndex) && currentIndex >= 0 && currentIndex < 50
        ? currentIndex
        : 0,
      remainingSeconds: Math.max(0, Math.min(8 * 60 * 60, Number(parsed.remainingSeconds) || 0)),
      timedOut: Boolean(parsed.timedOut),
      startedAt: Number.isFinite(startedAt) && startedAt > 0 ? startedAt : Date.now(),
      completedAt: Number(parsed.completedAt) || null,
      practiceActivityId: safeOpaque(parsed.practiceActivityId),
      practiceHeartbeatSeconds: Math.max(10, Math.min(
        120,
        Number(parsed.practiceHeartbeatSeconds) || DEFAULT_PRACTICE_HEARTBEAT_SECONDS
      ))
    };
  } catch {
    localStorage.removeItem(storageKey);
    return null;
  }
}

function saveProgress() {
  if (!state.sessionId || !state.receipt) return;
  localStorage.setItem(storageKey, JSON.stringify({
    sessionId: state.sessionId,
    receipt: state.receipt,
    expiresAt: state.expiresAt,
    responses: state.responses.map(response => ({
      itemToken: response.itemToken,
      optionToken: response.optionToken
    })),
    currentIndex: state.currentIndex,
    remainingSeconds: state.remainingSeconds,
    timedOut: state.timedOut,
    startedAt: state.startedAt,
    completedAt: state.completedAt,
    practiceActivityId: state.practiceActivityId,
    practiceHeartbeatSeconds: state.practiceHeartbeatSeconds
  }));
}

function clearProgress() {
  localStorage.removeItem(storageKey);
  state.sessionId = "";
  state.receipt = "";
  state.expiresAt = "";
  state.items = [];
  state.content = null;
  state.responses = [];
  state.currentIndex = 0;
  state.remainingSeconds = 0;
  state.timedOut = false;
  state.startedAt = null;
  state.completedAt = null;
  state.practiceActivityId = "";
  state.practiceHeartbeatSeconds = DEFAULT_PRACTICE_HEARTBEAT_SECONDS;
  state.submitting = false;
}

function normalizeAssessment(metadata = {}) {
  const id = String(metadata.id || metadata.assessmentId || state.assessmentId || "");
  if (id !== state.assessmentId) throw new Error("測驗識別碼與本頁不一致。");
  const questionCount = positiveInteger(metadata.questionCount ?? metadata.question_count);
  const durationMinutes = positiveInteger(metadata.durationMinutes ?? metadata.duration_minutes);
  if (![20, 50].includes(questionCount) || !durationMinutes) {
    throw new Error("測驗規格不完整，請重新連線。");
  }
  return {
    id,
    kind: metadata.kind === "final" ? "final" : "weekly",
    label: String(metadata.label || (metadata.kind === "final" ? "期末測驗" : "週測")),
    lessonLabel: String(metadata.lessonLabel ?? metadata.lesson_label ?? "N5 八週範圍"),
    patternCount: positiveInteger(metadata.patternCount ?? metadata.pattern_count),
    questionCount,
    durationMinutes
  };
}

function applyAssessment(metadata) {
  state.assessment = normalizeAssessment(metadata);
  const assessment = state.assessment;
  elements.assessmentKind.textContent = assessment.kind === "final"
    ? "FINAL CUSTOMER TEST"
    : "WEEKLY CUSTOMER TEST";
  elements.assessmentLabel.textContent = assessment.label;
  elements.assessmentScope.textContent = assessment.lessonLabel;
  elements.questionCount.textContent = String(assessment.questionCount);
  elements.durationMinutes.textContent = String(assessment.durationMinutes);
  elements.patternCount.textContent = assessment.patternCount ? String(assessment.patternCount) : "—";
  document.title = `${assessment.label}客戶驗收｜八週陪跑 N5`;
}

function normalizeDisplay(display = {}) {
  if (display.kind === "choice") {
    return { kind: "choice", stem: String(display.stem || "") };
  }
  if (display.kind !== "jlpt_star") throw new Error("題目顯示格式不正確。");
  return {
    kind: "jlpt_star",
    contextJapanese: String(display.contextJapanese || ""),
    contextBefore: String(display.contextBefore || ""),
    contextAfter: String(display.contextAfter || ""),
    blankFrame: String(display.blankFrame || ""),
    leadingText: String(display.leadingText || ""),
    trailingText: String(display.trailingText || ""),
    starPosition: positiveInteger(display.starPosition)
  };
}

function normalizeItems(items, expectedCount) {
  if (!Array.isArray(items) || items.length !== expectedCount) {
    throw new Error(`本份測驗應有 ${expectedCount} 題，請重新抽題。`);
  }
  const seenItems = new Set();
  const normalized = items.map(item => {
    const itemToken = safeOpaque(item?.itemToken);
    const ordinal = positiveInteger(item?.ordinal);
    if (!itemToken || seenItems.has(itemToken) || !ordinal) {
      throw new Error("題目識別資料不完整。");
    }
    seenItems.add(itemToken);
    const seenOptions = new Set();
    const options = Array.isArray(item.options) ? item.options.map(option => {
      const optionToken = safeOpaque(option?.optionToken);
      if (!optionToken || seenOptions.has(optionToken)) {
        throw new Error("選項識別資料不完整。");
      }
      seenOptions.add(optionToken);
      return {
        optionToken,
        label: String(option.label || ""),
        text: String(option.text || "")
      };
    }) : [];
    if (options.length !== 4) throw new Error("每題必須有四個選項。");
    return {
      itemToken,
      itemType: String(item.itemType || ""),
      instruction: String(item.instruction || ""),
      ordinal,
      totalItems: positiveInteger(item.totalItems, expectedCount),
      options,
      display: normalizeDisplay(item.display)
    };
  }).sort((left, right) => left.ordinal - right.ordinal);
  if (normalized.some((item, index) => item.ordinal !== index + 1)) {
    throw new Error("題目順序不完整。");
  }
  return normalized;
}

function validResponsesForItems(responses, items) {
  const allowed = new Map(items.map(item => [
    item.itemToken,
    new Set(item.options.map(option => option.optionToken))
  ]));
  return normalizeStoredResponses(responses).filter(response => (
    allowed.get(response.itemToken)?.has(response.optionToken)
  ));
}

function setSessionBoundary(content = {}) {
  const trialCount = Math.max(0, Number(content.trialItemCount ?? content.candidateItemCount) || 0);
  elements.sessionBoundary.textContent = trialCount
    ? `本份抽題含 ${trialCount} 題待審候選題；這些題只供客戶驗收與題庫 QA，不納入 CAT。`
    : "本份抽題使用目前已核准內容，但仍是客戶驗收抽題版，不是固定正式卷。";
  elements.sessionBoundary.classList.toggle("has-candidates", trialCount > 0);
}

function applySessionPayload(payload, { stored = null, requireReceipt = false } = {}) {
  applyAssessment(payload.assessment || {
    ...state.assessment,
    id: payload.assessmentId || state.assessmentId,
    kind: payload.kind || state.assessment?.kind
  });
  const sessionId = safeOpaque(payload.sessionId || stored?.sessionId || state.sessionId);
  const receipt = safeOpaque(payload.receipt || stored?.receipt || state.receipt);
  if (!sessionId || !receipt || (requireReceipt && !payload.receipt)) {
    throw new Error("伺服器未回傳完整的續作憑證。");
  }
  state.sessionId = sessionId;
  state.receipt = receipt;
  state.expiresAt = String(payload.expiresAt || stored?.expiresAt || state.expiresAt || "");
  state.content = payload.content || state.content || {};

  if (payload.complete && payload.result) {
    state.items = [];
    state.responses = [];
    state.completedAt = stored?.completedAt || state.completedAt || Date.now();
    state.startedAt = stored?.startedAt || state.startedAt || Date.now();
    state.remainingSeconds = stored?.remainingSeconds ?? state.remainingSeconds;
    state.practiceActivityId = stored?.practiceActivityId || state.practiceActivityId;
    state.practiceHeartbeatSeconds = stored?.practiceHeartbeatSeconds
      || state.practiceHeartbeatSeconds;
    saveProgress();
    return;
  }

  state.items = normalizeItems(payload.items, state.assessment.questionCount);
  const source = stored || {};
  state.responses = validResponsesForItems(source.responses || [], state.items);
  state.currentIndex = Math.min(
    Math.max(0, Number(source.currentIndex) || 0),
    state.items.length - 1
  );
  state.startedAt = source.startedAt || Date.now();
  const durationSeconds = state.assessment.durationMinutes * 60;
  const storedRemaining = source.remainingSeconds > 0 ? source.remainingSeconds : durationSeconds;
  const wallClockRemaining = Math.max(0, durationSeconds - Math.floor((Date.now() - state.startedAt) / 1000));
  state.remainingSeconds = Math.min(durationSeconds, storedRemaining, wallClockRemaining);
  state.timedOut = Boolean(source.timedOut || state.remainingSeconds === 0);
  state.completedAt = null;
  state.practiceActivityId = source.practiceActivityId || "";
  state.practiceHeartbeatSeconds = source.practiceHeartbeatSeconds
    || DEFAULT_PRACTICE_HEARTBEAT_SECONDS;
  setSessionBoundary(state.content);
  saveProgress();
}

function setupStartView(saved) {
  stopPracticeHeartbeat();
  practicePaused = true;
  elements.resumeButton.classList.toggle("hidden", !saved);
  elements.resumeButton.textContent = saved?.completedAt ? "檢視上次結果" : "繼續本機進度";
  showOnly(elements.startView);
}

function formatTime(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatElapsed(seconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(safeSeconds / 60)} 分 ${safeSeconds % 60} 秒`;
}

function responseFor(itemToken) {
  return state.responses.find(response => response.itemToken === itemToken) || null;
}

function answeredCount() {
  return state.responses.length;
}

function chooseResponse(itemToken, optionToken) {
  state.responses = state.responses.filter(response => response.itemToken !== itemToken);
  state.responses.push({ itemToken, optionToken });
  saveProgress();
}

function updateTimer() {
  elements.timer.textContent = formatTime(state.remainingSeconds);
  elements.timer.closest(".timer").classList.toggle("warning", state.remainingSeconds <= 300);
  if (state.timedOut) {
    elements.quizHint.textContent = "作答時間已到；系統不會自動交卷，請自行檢查後完成送出。";
  }
}

function startTimer() {
  window.clearInterval(timerHandle);
  updateTimer();
  timerHandle = window.setInterval(() => {
    if (!state.sessionId || state.completedAt || state.submitting) return;
    if (state.remainingSeconds > 0) {
      state.remainingSeconds -= 1;
      if (state.remainingSeconds === 0) state.timedOut = true;
      saveProgress();
      updateTimer();
    }
  }, 1000);
}

function createOption(item, option) {
  const label = make("label", "option");
  const input = document.createElement("input");
  input.type = "radio";
  input.name = "assessment-option";
  input.value = option.optionToken;
  input.checked = responseFor(item.itemToken)?.optionToken === option.optionToken;
  input.addEventListener("change", () => {
    chooseResponse(item.itemToken, option.optionToken);
    markPracticeInteraction();
    elements.quizHint.textContent = state.timedOut
      ? "作答時間已到；系統不會自動交卷，請自行檢查後完成送出。"
      : "已保存這題的選擇，交卷前都可修改。";
    renderQuiz();
  });
  label.append(
    input,
    make("span", "option-index", option.label),
    make("span", "option-copy", option.text)
  );
  return label;
}

function createDot(index) {
  const item = state.items[index];
  const dot = make("button", "question-dot", String(index + 1));
  dot.type = "button";
  const answered = Boolean(responseFor(item.itemToken));
  if (answered) dot.classList.add("done");
  if (index === state.currentIndex) dot.classList.add("current");
  dot.setAttribute("aria-label", `前往第 ${index + 1} 題，${answered ? "已作答" : "未作答"}`);
  dot.setAttribute("aria-current", index === state.currentIndex ? "step" : "false");
  dot.addEventListener("click", () => goToQuestion(index));
  return dot;
}

function renderQuestionDisplay(item) {
  elements.questionInstruction.textContent = item.instruction || "請選出最適合的答案。";
  const display = item.display;
  if (display.kind === "choice") {
    elements.questionPrompt.textContent = display.stem || "請選出最適合的答案。";
    elements.questionContext.textContent = "";
    elements.questionContext.classList.add("hidden");
    elements.questionFrame.textContent = "";
    elements.questionFrame.classList.add("hidden");
    return;
  }
  elements.questionPrompt.textContent = display.contextJapanese
    || "請選出最適合放在 ★ 位置的答案。";
  const contextParts = display.contextJapanese
    ? [display.contextAfter].filter(Boolean)
    : [display.contextBefore, display.contextAfter].filter(Boolean);
  elements.questionContext.textContent = contextParts.join("　");
  elements.questionContext.classList.toggle("hidden", contextParts.length === 0);
  const frameParts = [display.leadingText, display.blankFrame, display.trailingText].filter(Boolean);
  elements.questionFrame.textContent = frameParts.join("　");
  elements.questionFrame.classList.toggle("hidden", frameParts.length === 0);
  if (frameParts.length) {
    elements.questionFrame.setAttribute(
      "aria-label",
      `四格排列，星號位於第 ${display.starPosition || "—"} 格：${frameParts.join("　")}`
    );
  } else {
    elements.questionFrame.removeAttribute("aria-label");
  }
}

function renderQuiz() {
  const item = state.items[state.currentIndex];
  if (!item) throw new Error("找不到目前題目。");
  const total = state.items.length;
  elements.quizLabel.textContent = state.assessment.label;
  elements.quizScope.textContent = state.assessment.lessonLabel;
  elements.questionNumber.textContent = `第 ${state.currentIndex + 1} / ${total} 題`;
  renderQuestionDisplay(item);
  elements.optionGroup.replaceChildren(...item.options.map(option => createOption(item, option)));
  elements.questionDots.replaceChildren(...state.items.map((_, index) => createDot(index)));
  elements.progressBar.style.width = `${(answeredCount() / Math.max(total, 1)) * 100}%`;
  elements.prevButton.disabled = state.currentIndex === 0;
  elements.nextButton.classList.toggle("hidden", state.currentIndex === total - 1);
  elements.submitButton.classList.toggle("hidden", state.currentIndex !== total - 1);
  if (!state.timedOut && !elements.quizHint.textContent.includes("已保存")) {
    elements.quizHint.textContent = "";
  }
  updateTimer();
}

function enterQuiz() {
  practiceRunGeneration += 1;
  const generation = practiceRunGeneration;
  lastPracticeInteractionAt = Date.now();
  practicePaused = false;
  saveProgress();
  showOnly(elements.quizView);
  renderQuiz();
  startTimer();
  void ensurePracticeTracking(generation);
  requestAnimationFrame(() => elements.questionPrompt.focus({ preventScroll: true }));
}

function goToQuestion(index) {
  state.currentIndex = Math.max(0, Math.min(state.items.length - 1, index));
  saveProgress();
  renderQuiz();
  window.scrollTo({ top: 0, behavior: "instant" });
  elements.questionPrompt.focus({ preventScroll: true });
}

function requestSubmit() {
  const firstMissing = state.items.findIndex(item => !responseFor(item.itemToken));
  if (firstMissing !== -1) {
    goToQuestion(firstMissing);
    elements.quizHint.textContent = `還有 ${state.items.length - answeredCount()} 題未完成，已帶你前往第一題未作答題目。`;
    elements.optionGroup.querySelector("input")?.focus();
    return;
  }
  // `<dialog>` retains its previous returnValue. Reset it so cancelling a
  // later attempt can never reuse an earlier "confirm" result.
  elements.submitDialog.returnValue = "";
  elements.submitDialog.showModal();
}

function percentText(evidence) {
  if (!evidence || !Number(evidence.asked ?? evidence.total)) return "無題目";
  const accuracy = Number(evidence.accuracy ?? evidence.percent);
  return Number.isFinite(accuracy) ? `${Math.round(accuracy)}%` : "—";
}

function evidenceDetail(evidence) {
  const asked = Number(evidence?.asked ?? evidence?.total) || 0;
  const correct = Number(evidence?.correct) || 0;
  return `${correct} / ${asked} 題`;
}

function renderDimensions(dimensions = {}) {
  const byLayer = Array.isArray(dimensions)
    ? new Map(dimensions.map(dimension => [dimension.layerCode, dimension]))
    : new Map(Object.entries(dimensions || {}));
  for (const layerCode of ["K", "U", "A"]) {
    const dimension = byLayer.get(layerCode) || {};
    elements[`dimension${layerCode}Score`].textContent = percentText(dimension);
    elements[`dimension${layerCode}Detail`].textContent = Number(dimension.asked)
      ? `答對 ${dimension.correct}／${dimension.asked} 題`
      : "本份抽題沒有此層題目";
  }
}

const REVIEW_TYPE_LABELS = Object.freeze({
  single_choice: "單選題",
  cloze_choice: "填空選擇題",
  jlpt_star_choice: "JLPT 星號排序題"
});

function answerTextForReview(answer) {
  if (!answer || typeof answer !== "object") return "未作答";
  const label = String(answer.label || "").trim();
  const text = String(answer.text || "").trim();
  return [label ? `選項（${label}）` : "", text ? `「${text}」` : ""]
    .filter(Boolean)
    .join(" ") || "未作答";
}

function reviewQuestionBlock(item) {
  const block = make("div", "lesson-review-question");
  if (item.instruction) block.append(make("p", "lesson-review-instruction", item.instruction));
  const display = item.display || {};
  if (display.kind !== "jlpt_star") {
    const stem = make("p", "lesson-review-stem", display.stem || "題目內容未提供");
    stem.lang = "ja";
    block.append(stem);
    return block;
  }
  const primary = make("p", "lesson-review-stem", display.contextJapanese
    || "請選出最適合放在 ★ 位置的答案。");
  primary.lang = "ja";
  block.append(primary);
  const contextParts = display.contextJapanese
    ? [display.contextAfter].filter(Boolean)
    : [display.contextBefore, display.contextAfter].filter(Boolean);
  if (contextParts.length) {
    const context = make("p", "lesson-review-context", contextParts.join("　"));
    context.lang = "ja";
    block.append(context);
  }
  const frameParts = [display.leadingText, display.blankFrame, display.trailingText].filter(Boolean);
  if (frameParts.length) {
    const frame = make("p", "lesson-review-star-frame", frameParts.join("　"));
    frame.lang = "ja";
    frame.setAttribute("aria-label", `四格排列，星號位於第 ${display.starPosition || "—"} 格：${frameParts.join("　")}`);
    block.append(frame);
  }
  return block;
}

function reviewAnswerBox(label, answer, className = "") {
  const box = make("div", `lesson-review-answer ${className}`.trim());
  box.append(make("span", "", label));
  const value = make("strong", "", answerTextForReview(answer));
  value.lang = "ja";
  box.append(value);
  return box;
}

function reviewTranslationBlock(item) {
  const block = make("div", "lesson-review-translation");
  const sentence = make("span", "", item.correctFullSentence || "—");
  sentence.lang = "ja";
  block.append(
    make("strong", "", "完整正解："),
    sentence,
    make("strong", "", "正解中文翻譯："),
    make("span", "", item.correctTranslationZh || "—")
  );
  return block;
}

function reviewOptionAnalysis(item) {
  if (item.layerCode === "A") return null;
  const section = make("section", "lesson-review-option-analysis");
  section.append(make("h3", "", "選項解析"));
  for (const option of Array.isArray(item.options) ? item.options : []) {
    const row = make("article", [
      "lesson-review-option-row",
      option.isCorrect ? "correct" : "wrong",
      option.isSelected ? "selected" : ""
    ].filter(Boolean).join(" "));
    const top = make("div", "lesson-review-option-top");
    const title = make("strong", "", `${option.label}. ${option.text}`);
    title.lang = "ja";
    const badges = make("span", "lesson-review-option-badges");
    if (option.isCorrect) badges.append(make("i", "correct", "正解"));
    if (option.isSelected) badges.append(make("i", option.isCorrect ? "correct" : "selected", "你的選擇"));
    top.append(title, badges);
    row.append(top, make("p", "", option.explanation || item.correctReason || "此選項不符合本題的句型或語境。"));
    section.append(row);
  }
  return section;
}

function buildReviewCard(item) {
  const outcome = item.isCorrect ? "correct" : "wrong";
  const details = make("details", `lesson-review-item ${outcome}`);
  details.dataset.result = outcome;
  const summary = document.createElement("summary");
  const title = make("span", "lesson-review-title");
  const pattern = make("strong", "", item.pattern || "N5 句型");
  pattern.lang = "ja";
  title.append(
    pattern,
    make("span", "", `${item.layerCode || "—"} ${item.layerLabel || ""}・${REVIEW_TYPE_LABELS[item.itemType] || "選擇題"}`)
  );
  const statuses = make("span", "lesson-review-statuses");
  const approved = item.contentStatus === "approved";
  statuses.append(
    make("span", `lesson-review-outcome ${outcome}`, item.isCorrect ? "答對" : "答錯"),
    make("span", `lesson-review-evidence ${approved ? "approved" : "trial"}`, approved ? "目前已核准" : "待審候選")
  );
  summary.append(make("span", "lesson-review-number", `第 ${item.ordinal} 題`), title, statuses);

  const body = make("div", "lesson-review-body");
  body.append(reviewQuestionBlock(item));
  const answerPair = make("div", "lesson-review-answer-pair");
  answerPair.append(
    reviewAnswerBox("你的答案", item.selectedAnswer, item.isCorrect ? "selected-correct" : "selected-wrong"),
    reviewAnswerBox("正確答案", item.correctAnswer, "correct-answer")
  );
  body.append(answerPair);

  if (item.layerCode === "A") {
    const order = make("div", "lesson-review-order");
    const orderText = make("span", "", Array.isArray(item.correctOrder)
      ? item.correctOrder.join(" ／ ")
      : "—");
    orderText.lang = "ja";
    const grammar = make("span", "", item.pattern || "—");
    grammar.lang = "ja";
    order.append(make("strong", "", "正確排列："), orderText, make("strong", "", "使用句型："), grammar);
    body.append(order);
  }

  body.append(reviewTranslationBlock(item));
  const reason = make("div", "lesson-review-reason");
  reason.append(
    make("strong", "", item.layerCode === "A" ? "排序解析：" : "正解分析："),
    make("span", "", item.correctReason || "—")
  );
  body.append(reason);
  const optionAnalysis = reviewOptionAnalysis(item);
  if (optionAnalysis) body.append(optionAnalysis);
  if (!approved) {
    body.append(make("p", "lesson-review-trial-note", "本題為待審候選題；詳解僅供客戶驗收與題庫 QA，不納入 CAT 診斷。"));
  }
  details.append(summary, body);
  return details;
}

function applyReviewFilter(filter) {
  const allowed = new Set(["wrong", "all", "correct"]);
  state.reviewFilter = allowed.has(filter) ? filter : "all";
  for (const button of elements.reviewFilters.querySelectorAll("button[data-filter]")) {
    const active = button.dataset.filter === state.reviewFilter;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  let visible = 0;
  for (const card of elements.reviewList.querySelectorAll(".lesson-review-item")) {
    const show = state.reviewFilter === "all" || card.dataset.result === state.reviewFilter;
    card.classList.toggle("review-hidden", !show);
    if (show) visible += 1;
  }
  elements.reviewEmpty.classList.toggle("hidden", visible > 0);
  elements.reviewEmpty.textContent = state.reviewFilter === "wrong"
    ? "本次沒有錯題；可以切換到「全部題目」查看完整詳解。"
    : state.reviewFilter === "correct"
      ? "本次沒有答對題；可以切換到「全部題目」查看詳解。"
      : "這次結果沒有可顯示的逐題資料。";
}

function renderReview(result) {
  const reviewItems = Array.isArray(result?.reviewItems)
    ? [...result.reviewItems].sort((left, right) => Number(left.ordinal) - Number(right.ordinal))
    : [];
  const wrongCount = Number.isInteger(result?.wrongCount)
    ? result.wrongCount
    : reviewItems.filter(item => !item.isCorrect).length;
  const correctCount = reviewItems.length - wrongCount;
  elements.reviewWrongCount.textContent = String(wrongCount);
  elements.reviewAllCount.textContent = String(reviewItems.length);
  elements.reviewCorrectCount.textContent = String(correctCount);
  elements.reviewSummary.textContent = wrongCount
    ? `本次答錯 ${wrongCount} 題；預設先看錯題，也可切換查看全部詳解。`
    : `本次全對；已顯示全部 ${reviewItems.length} 題詳解。`;
  elements.reviewList.replaceChildren(...reviewItems.map(buildReviewCard));
  applyReviewFilter(wrongCount > 0 ? "wrong" : "all");
}

function renderResult(result) {
  window.clearInterval(timerHandle);
  stopPracticeHeartbeat();
  const score = result?.score || {};
  const overall = result?.overallPractice || {
    asked: score.total,
    correct: score.correct,
    accuracy: score.percent
  };
  const approved = result?.approvedEvidence || {};
  const candidate = result?.candidateEvidence || result?.trialEvidence || {};
  const accuracy = Number(overall.accuracy ?? score.percent);
  const rounded = Number.isFinite(accuracy) ? Math.round(accuracy) : 0;
  const elapsed = state.assessment
    ? Math.max(0, state.assessment.durationMinutes * 60 - state.remainingSeconds)
    : 0;

  document.querySelector(".lesson-score-ring").style.setProperty("--score", `${rounded}%`);
  elements.resultAccuracy.textContent = Number.isFinite(accuracy) ? `${rounded}%` : "—";
  elements.resultTitle.textContent = `${result?.label || state.assessment?.label || "驗收測驗"}作答完成`;
  elements.resultNotice.textContent = result?.notice
    || "這是客戶驗收抽題結果，不是固定正式卷或正式精熟證據。";
  elements.resultCorrect.textContent = `答對 ${overall.correct ?? "—"} 題`;
  elements.resultAsked.textContent = `共 ${overall.asked ?? "—"} 題`;
  elements.resultElapsed.textContent = `使用時間 ${formatElapsed(elapsed)}`;
  renderDimensions(result?.dimensions);
  elements.overallEvidence.textContent = `${percentText(overall)}・${evidenceDetail(overall)}`;
  elements.approvedEvidence.textContent = `${percentText(approved)}・${evidenceDetail(approved)}`;
  elements.candidateEvidence.textContent = `${percentText(candidate)}・${evidenceDetail(candidate)}`;
  elements.approvedEvidenceNote.textContent = Number(approved.asked)
    ? "目前已核准內容的本次作答"
    : "本份抽題沒有已核准題";
  elements.candidateEvidenceNote.textContent = Number(candidate.asked)
    ? "僅供客戶驗收與題庫 QA，不納入 CAT"
    : "本份抽題沒有待審候選題";
  const hasCandidates = Number(candidate.asked) > 0;
  elements.resultBoundaryTitle.textContent = hasCandidates
    ? "本次結果含待審候選題"
    : "這是客戶驗收抽題結果";
  elements.resultBoundaryText.textContent = hasCandidates
    ? "候選題只供客戶驗收與題庫 QA；整體分數不代表正式精熟，不納入 CAT，也不是 JLPT 或 N4 銜接判定。"
    : "雖然本份抽題使用目前已核准內容，它仍不是已核准固定正式卷；本次分數不代表正式精熟。";
  renderReview(result);
  showOnly(elements.resultView);
  elements.resultAnnouncement.textContent = `${result?.label || state.assessment?.label || "測驗"}完成，答對 ${overall.correct ?? 0}／${overall.asked ?? 0} 題。`;
  requestAnimationFrame(() => elements.resultTitle.focus({ preventScroll: true }));
}

async function startSession() {
  if (state.submitting) return;
  state.submitting = true;
  elements.startButton.disabled = true;
  elements.startButton.textContent = "正在從題庫抽題…";
  try {
    const payload = await requestJson(
      `${API_ROOT}/${encodeURIComponent(state.assessmentId)}/sessions`,
      { method: "POST", body: "{}" }
    );
    clearProgress();
    applySessionPayload(payload, { requireReceipt: true });
    enterQuiz();
  } catch (error) {
    fail(error, "無法建立這次驗收測驗，請稍後再試。");
  } finally {
    state.submitting = false;
    elements.startButton.disabled = false;
    const arrow = make("span", "", "→");
    arrow.setAttribute("aria-hidden", "true");
    elements.startButton.replaceChildren(document.createTextNode("開始驗收作答 "), arrow);
  }
}

async function resumeSession() {
  const stored = safeReadProgress();
  if (!stored) {
    setupStartView(null);
    return;
  }
  elements.resumeButton.disabled = true;
  elements.resumeButton.textContent = stored.completedAt ? "正在取得結果…" : "正在恢復作答…";
  try {
    const payload = await requestJson(
      `${API_ROOT}/sessions/${encodeURIComponent(stored.sessionId)}`,
      { headers: { "X-N5-Assessment-Receipt": stored.receipt } }
    );
    state.receipt = stored.receipt;
    applySessionPayload(payload, { stored });
    if (payload.complete && payload.result) await finishRecoveredResult(payload.result);
    else enterQuiz();
  } catch (error) {
    if ([403, 404].includes(error?.status)) clearProgress();
    fail(error, "無法恢復這次作答，請重新開始。");
  } finally {
    elements.resumeButton.disabled = false;
    elements.resumeButton.textContent = "繼續本機進度";
  }
}

async function finishRecoveredResult(result) {
  const finalAnsweredCount = Number(result?.score?.total) || 0;
  state.completedAt = state.completedAt || Date.now();
  await completePracticeTracking(practiceRunGeneration, finalAnsweredCount);
  state.responses = [];
  saveProgress();
  renderResult(result);
}

async function recoverCompletedResult() {
  const payload = await requestJson(
    `${API_ROOT}/sessions/${encodeURIComponent(state.sessionId)}`,
    { headers: { "X-N5-Assessment-Receipt": state.receipt } }
  );
  if (!payload.complete || !payload.result) throw new Error("已完成的結果尚未就緒。");
  applySessionPayload(payload, { stored: safeReadProgress() });
  await finishRecoveredResult(payload.result);
}

async function submitAssessment() {
  if (state.submitting) return;
  const responses = state.items.map(item => responseFor(item.itemToken));
  if (responses.some(response => !response)) {
    requestSubmit();
    return;
  }
  state.submitting = true;
  window.clearInterval(timerHandle);
  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "正在交卷…";
  elements.quizHint.textContent = "正在由伺服器評分，請不要關閉頁面。";
  const generation = practiceRunGeneration;
  try {
    const payload = await requestJson(
      `${API_ROOT}/sessions/${encodeURIComponent(state.sessionId)}/submit`,
      {
        method: "POST",
        body: JSON.stringify({ receipt: state.receipt, responses })
      }
    );
    if (!payload.complete || !payload.result) throw new Error("伺服器未回傳完整的評分結果。");
    if (payload.assessment) applyAssessment(payload.assessment);
    state.completedAt = Date.now();
    await completePracticeTracking(generation, responses.length);
    state.responses = [];
    saveProgress();
    renderResult(payload.result);
  } catch (error) {
    if (error?.code === "weekly_session_complete" || error?.code === "assessment_session_complete") {
      try {
        await recoverCompletedResult();
        return;
      } catch (recoveryError) {
        elements.quizHint.textContent = recoveryError.message;
      }
    } else {
      elements.quizHint.textContent = error?.message || "交卷失敗，請再試一次。";
    }
    startTimer();
  } finally {
    state.submitting = false;
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "確認交卷";
  }
}

async function requestPracticeJson(url, { body = {}, keepalive = false } = {}) {
  return requestJson(url, {
    method: "POST",
    keepalive,
    headers: { [PRACTICE_ACTION_HEADER]: "1" },
    body: JSON.stringify(body)
  });
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
  if (state.sessionId && !state.completedAt && !elements.quizView.classList.contains("hidden")) {
    elements.quizHint.textContent = "練習時數暫時無法同步，作答仍可繼續。";
  }
}

function schedulePracticeHeartbeat() {
  stopPracticeHeartbeat();
  const seconds = Math.max(10, Math.min(
    120,
    Number(state.practiceHeartbeatSeconds) || DEFAULT_PRACTICE_HEARTBEAT_SECONDS
  ));
  practiceHeartbeatHandle = window.setInterval(() => {
    const isIdle = Date.now() - lastPracticeInteractionAt >= PRACTICE_IDLE_AFTER_MS;
    if (isIdle) practicePaused = true;
    if (!state.completedAt && document.visibilityState === "visible" && !practicePaused) {
      void syncPracticeActivity("heartbeat");
    }
  }, seconds * 1000);
}

function markPracticeInteraction() {
  if (!state.sessionId || state.completedAt || elements.quizView.classList.contains("hidden")) return;
  const wasIdle = practicePaused || Date.now() - lastPracticeInteractionAt >= PRACTICE_IDLE_AFTER_MS;
  lastPracticeInteractionAt = Date.now();
  practicePaused = false;
  if (wasIdle && state.practiceActivityId) void syncPracticeActivity("resume");
}

async function startPracticeActivity(generation) {
  const payload = await requestPracticeJson(PRACTICE_SESSION_URL, {
    body: { referenceId: state.assessmentId }
  });
  const activityId = safeOpaque(payload?.activity?.activityId);
  if (!activityId) throw new Error("練習識別碼格式不正確。");
  if (generation !== practiceRunGeneration || !state.sessionId) return;
  state.practiceActivityId = activityId;
  state.practiceHeartbeatSeconds = Math.max(10, Math.min(
    120,
    Number(payload?.policy?.recommendedHeartbeatSeconds) || DEFAULT_PRACTICE_HEARTBEAT_SECONDS
  ));
  saveProgress();
}

async function syncPracticeActivity(action, { keepalive = false, answeredCountOverride } = {}) {
  const activityId = state.practiceActivityId;
  if (!activityId) return;
  const reportedAnsweredCount = action === "resume"
    ? null
    : (answeredCountOverride ?? answeredCount());
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
  if (!state.sessionId || state.completedAt) return;
  if (practiceSetup?.generation === generation) return practiceSetup.promise;
  const setupRecord = { generation, promise: null };
  setupRecord.promise = (async () => {
    if (generation !== practiceRunGeneration || !state.sessionId) return;
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
    if (generation === practiceRunGeneration && state.sessionId && !state.completedAt) {
      schedulePracticeHeartbeat();
    }
  })().catch(practiceSyncWarning).finally(() => {
    if (practiceSetup === setupRecord) practiceSetup = undefined;
  });
  practiceSetup = setupRecord;
  return setupRecord.promise;
}

async function completePracticeTracking(generation, finalAnsweredCount) {
  if (practiceSetup?.generation === generation) await practiceSetup.promise;
  if (generation !== practiceRunGeneration || !state.sessionId) return;
  await syncPracticeActivity("complete", {
    keepalive: true,
    answeredCountOverride: finalAnsweredCount
  });
}

function bindEvents() {
  elements.startForm.addEventListener("submit", event => {
    event.preventDefault();
    void startSession();
  });
  elements.resumeButton.addEventListener("click", () => void resumeSession());
  elements.retryButton.addEventListener("click", () => void initialize());
  elements.prevButton.addEventListener("click", () => goToQuestion(state.currentIndex - 1));
  elements.nextButton.addEventListener("click", () => {
    const item = state.items[state.currentIndex];
    if (!responseFor(item.itemToken)) {
      elements.quizHint.textContent = "請先選擇一個答案，再前往下一題。";
      elements.optionGroup.querySelector("input")?.focus();
      return;
    }
    goToQuestion(state.currentIndex + 1);
  });
  elements.submitButton.addEventListener("click", requestSubmit);
  elements.submitDialog.addEventListener("close", () => {
    if (elements.submitDialog.returnValue === "confirm") void submitAssessment();
  });
  elements.reviewFilters.addEventListener("click", event => {
    const button = event.target.closest("button[data-filter]");
    if (button) applyReviewFilter(button.dataset.filter);
  });
  elements.restartButton.addEventListener("click", () => {
    window.clearInterval(timerHandle);
    stopPracticeHeartbeat();
    practiceRunGeneration += 1;
    clearProgress();
    setupStartView(null);
  });

  for (const eventName of ["pointerdown", "keydown", "touchstart"]) {
    document.addEventListener(eventName, markPracticeInteraction, { passive: true });
  }
  document.addEventListener("visibilitychange", () => {
    if (!state.sessionId || state.completedAt || elements.quizView.classList.contains("hidden")) return;
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
    if (state.sessionId && !state.completedAt && !elements.quizView.classList.contains("hidden")) {
      if (!practicePaused) void syncPracticeActivity("heartbeat", { keepalive: true });
      practicePaused = true;
    }
  });
}

async function initialize() {
  showOnly(elements.loadingView);
  try {
    const id = new URLSearchParams(window.location.search).get("id") || "n5w8_week_01";
    if (!ASSESSMENT_ID_PATTERN.test(id)) throw new Error("測驗代碼不在安全清單中。");
    state.assessmentId = id;
    storageKey = `${STORAGE_PREFIX}${id}`;
    localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}${id}`);
    const program = await requestJson(new URL("../data/program.json", import.meta.url));
    const metadata = program.assessments?.find(item => item.id === id);
    if (!metadata) throw new Error("找不到指定的測驗規劃。");
    applyAssessment(metadata);
    setupStartView(safeReadProgress());
  } catch (error) {
    console.error("Failed to initialize customer assessment", error);
    fail(error);
  }
}

bindEvents();
void initialize();
