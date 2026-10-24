const MANIFEST_URL = "../data/lesson-assessments.json";
const API_ROOT = "../api/n5-lessons";

const STATUS_COPY = {
  released: {
    label: "完整課測",
    lead: "完整作答本課每個句型的知識、理解與應用題，完成後查看本次練習表現。"
  },
  mixed_pilot: {
    label: "含試行題",
    lead: "本課同時包含已核准題與試行題。完成後會將兩種練習證據分開呈現。"
  },
  trial_only: {
    label: "試行練習",
    lead: "本課目前全為試行題。你可以完整練習，但結果不代表正式精熟。"
  }
};

const views = {
  loading: document.querySelector("#loadingView"),
  error: document.querySelector("#errorView"),
  start: document.querySelector("#startView"),
  quiz: document.querySelector("#quizView"),
  result: document.querySelector("#resultView")
};

const elements = {
  headerLessonTitle: document.querySelector("#headerLessonTitle"),
  errorText: document.querySelector("#errorText"),
  retryButton: document.querySelector("#retryButton"),
  lessonStatus: document.querySelector("#lessonStatus"),
  lessonTitle: document.querySelector("#lessonTitle"),
  lessonLead: document.querySelector("#lessonLead"),
  trialOnlyNotice: document.querySelector("#trialOnlyNotice"),
  visualLessonLabel: document.querySelector("#visualLessonLabel"),
  patternLessonNumber: document.querySelector("#patternLessonNumber"),
  lessonPatternList: document.querySelector("#lessonPatternList"),
  startQuestionCount: document.querySelector("#startQuestionCount"),
  startPatternCount: document.querySelector("#startPatternCount"),
  startDuration: document.querySelector("#startDuration"),
  startCardTitle: document.querySelector("#startCardTitle"),
  startButton: document.querySelector("#startButton"),
  resumeButton: document.querySelector("#resumeButton"),
  quizLessonTitle: document.querySelector("#quizLessonTitle"),
  questionNumber: document.querySelector("#questionNumber"),
  questionTotal: document.querySelector("#questionTotal"),
  progressBar: document.querySelector("#progressBar"),
  progressCopy: document.querySelector("#progressCopy"),
  questionScope: document.querySelector("#questionScope"),
  questionInstruction: document.querySelector("#questionInstruction"),
  questionStem: document.querySelector("#questionStem"),
  questionContext: document.querySelector("#questionContext"),
  questionFrame: document.querySelector("#questionFrame"),
  optionGroup: document.querySelector("#optionGroup"),
  quizHint: document.querySelector("#quizHint"),
  answerButton: document.querySelector("#answerButton"),
  resultAccuracy: document.querySelector("#resultAccuracy"),
  resultTitle: document.querySelector("#resultTitle"),
  resultNotice: document.querySelector("#resultNotice"),
  resultAnnouncement: document.querySelector("#resultAnnouncement"),
  resultCorrect: document.querySelector("#resultCorrect"),
  resultAsked: document.querySelector("#resultAsked"),
  resultPatterns: document.querySelector("#resultPatterns"),
  dimensionKScore: document.querySelector("#dimensionKScore"),
  dimensionKDetail: document.querySelector("#dimensionKDetail"),
  dimensionUScore: document.querySelector("#dimensionUScore"),
  dimensionUDetail: document.querySelector("#dimensionUDetail"),
  dimensionAScore: document.querySelector("#dimensionAScore"),
  dimensionADetail: document.querySelector("#dimensionADetail"),
  overallEvidence: document.querySelector("#overallEvidence"),
  approvedEvidence: document.querySelector("#approvedEvidence"),
  approvedEvidenceNote: document.querySelector("#approvedEvidenceNote"),
  trialEvidence: document.querySelector("#trialEvidence"),
  trialEvidenceNote: document.querySelector("#trialEvidenceNote"),
  resultBoundaryTitle: document.querySelector("#resultBoundaryTitle"),
  resultBoundaryText: document.querySelector("#resultBoundaryText"),
  reviewSummary: document.querySelector("#reviewSummary"),
  reviewFilters: document.querySelector("#reviewFilters"),
  reviewWrongCount: document.querySelector("#reviewWrongCount"),
  reviewAllCount: document.querySelector("#reviewAllCount"),
  reviewCorrectCount: document.querySelector("#reviewCorrectCount"),
  reviewList: document.querySelector("#reviewList"),
  reviewEmpty: document.querySelector("#reviewEmpty"),
  restartButton: document.querySelector("#restartButton")
};

const queryLesson = Number.parseInt(new URLSearchParams(location.search).get("lesson") || "", 10);
const state = {
  lessonNumber: Number.isInteger(queryLesson) && queryLesson >= 1 && queryLesson <= 25 ? queryLesson : null,
  lesson: null,
  sessionId: "",
  receipt: "",
  expiresAt: "",
  item: null,
  progress: null,
  selectedOptionToken: "",
  submitting: false,
  reviewFilter: "wrong"
};

function storageKey() {
  return `wkl_n5_8week_lesson_v1:L${state.lessonNumber}`;
}

function showView(name) {
  Object.entries(views).forEach(([key, node]) => node.classList.toggle("hidden", key !== name));
  window.scrollTo({ top: 0, behavior: "instant" });
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function safeStorageRead() {
  if (!state.lessonNumber) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) || "null");
    if (!parsed?.sessionId || !parsed?.receipt) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(storageKey());
      return null;
    }
    return {
      sessionId: String(parsed.sessionId),
      receipt: String(parsed.receipt),
      expiresAt: String(parsed.expiresAt || "")
    };
  } catch {
    localStorage.removeItem(storageKey());
    return null;
  }
}

function saveSession() {
  localStorage.setItem(storageKey(), JSON.stringify({
    sessionId: state.sessionId,
    receipt: state.receipt,
    expiresAt: state.expiresAt
  }));
}

function clearSession() {
  if (state.lessonNumber) localStorage.removeItem(storageKey());
  state.sessionId = "";
  state.receipt = "";
  state.expiresAt = "";
  state.item = null;
  state.progress = null;
  state.selectedOptionToken = "";
  state.submitting = false;
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
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || `伺服器回應 ${response.status}`);
    error.status = response.status;
    error.code = payload?.error || "";
    throw error;
  }
  return payload;
}

function showError(error, fallback) {
  const message = error?.message && !/^Failed to fetch$/i.test(error.message)
    ? error.message
    : fallback;
  elements.errorText.textContent = message || "課後測驗服務暫時無法使用，請稍後再試。";
  showView("error");
}

function percentText(evidence) {
  if (!evidence || !Number(evidence.asked)) return "無題目";
  const accuracy = Number(evidence.accuracy);
  return Number.isFinite(accuracy) ? `${Math.round(accuracy)}%` : "—";
}

function evidenceDetail(evidence) {
  if (!evidence || !Number(evidence.asked)) return "0 題";
  return `${evidence.correct} / ${evidence.asked} 題`;
}

function renderPatternPreview(patterns, expectedCount) {
  const normalized = Array.isArray(patterns)
    ? [...new Set(patterns.map(pattern => String(pattern || "").trim()).filter(Boolean))]
    : [];
  if (normalized.length !== Number(expectedCount)) {
    throw new Error("本課句型預覽與題庫範圍不一致，請重新連線。");
  }
  elements.patternLessonNumber.textContent = String(state.lessonNumber).padStart(2, "0");
  elements.lessonPatternList.replaceChildren(...normalized.map((pattern, index) => {
    const item = make("li", "lesson-pattern-item");
    const number = make("span", "lesson-pattern-index", String(index + 1).padStart(2, "0"));
    const label = make("span", "lesson-pattern-label", pattern);
    item.append(number, label);
    return item;
  }));
}

function applyLesson(lesson) {
  state.lesson = lesson;
  const status = STATUS_COPY[lesson.status] || STATUS_COPY.mixed_pilot;
  document.title = `${lesson.label} N5 課後測驗｜王可樂日語`;
  elements.headerLessonTitle.textContent = `${lesson.label} N5 課後測驗`;
  elements.lessonStatus.className = `lesson-status ${lesson.status}`;
  elements.lessonStatus.textContent = status.label;
  elements.lessonTitle.replaceChildren(
    document.createTextNode(lesson.label),
    document.createElement("br"),
    Object.assign(document.createElement("span"), { textContent: "課後測驗" })
  );
  elements.lessonLead.textContent = status.lead;
  elements.trialOnlyNotice.classList.toggle("hidden", lesson.status !== "trial_only");
  elements.visualLessonLabel.textContent = lesson.lesson_label;
  renderPatternPreview(lesson.pattern_previews, lesson.pattern_count);
  elements.startQuestionCount.textContent = `${lesson.question_count} 題`;
  elements.startPatternCount.textContent = `${lesson.pattern_count} 個`;
  elements.startDuration.textContent = `${lesson.duration_minutes} 分`;
  elements.startCardTitle.textContent = `開始${lesson.label}測驗`;
  elements.startButton.firstChild.textContent = `開始${lesson.label} `;
  elements.quizLessonTitle.textContent = `${lesson.label}測驗`;
  elements.questionScope.textContent = `${lesson.label}題目`;
}

function renderStart() {
  const stored = safeStorageRead();
  elements.resumeButton.classList.toggle("hidden", !stored);
  showView("start");
}

function renderProgress(progress = {}, item = state.item) {
  const total = Number(item?.totalItems || progress.total || state.lesson?.question_count || 0);
  const answered = Number(progress.answered || 0);
  const ordinal = Number(item?.ordinal || Math.min(answered + 1, total));
  elements.questionNumber.textContent = `第 ${ordinal} 題`;
  elements.questionTotal.textContent = `共 ${total} 題`;
  elements.progressBar.style.width = `${Math.min(100, (answered / Math.max(total, 1)) * 100)}%`;
  elements.progressCopy.textContent = answered
    ? `已完成 ${answered} 題，還有 ${Math.max(0, total - answered)} 題`
    : `本課共 ${total} 題`;
}

function renderItem(item, progress = {}) {
  if (!item?.itemToken || !Array.isArray(item.options)) {
    throw new Error("題目資料不完整，請重新連線。");
  }
  state.item = item;
  state.progress = progress;
  state.selectedOptionToken = "";
  state.submitting = false;
  elements.answerButton.disabled = true;
  elements.answerButton.textContent = Number(item.ordinal) === Number(item.totalItems)
    ? "送出並查看結果"
    : "送出並前往下一題";
  elements.quizHint.textContent = "";
  elements.questionInstruction.textContent = item.instruction || "請選出最適合的答案。";

  const display = item.display || {};
  const isStar = display.kind === "jlpt_star";
  const stem = isStar
    ? (display.contextJapanese || "請選出最適合放在 ★ 位置的答案。")
    : (display.stem || "請選出最適合的答案。");
  elements.questionStem.textContent = stem;

  const contextParts = isStar
    ? (display.contextJapanese
      ? [display.contextAfter].filter(Boolean)
      : [display.contextBefore, display.contextAfter].filter(Boolean))
    : [];
  elements.questionContext.textContent = contextParts.join("　");
  elements.questionContext.classList.toggle("hidden", contextParts.length === 0);
  const frameParts = isStar
    ? [display.leadingText, display.blankFrame, display.trailingText].filter(Boolean)
    : [];
  elements.questionFrame.textContent = frameParts.join("　");
  elements.questionFrame.classList.toggle("hidden", frameParts.length === 0);

  elements.optionGroup.replaceChildren(...item.options.map(option => {
    const label = make("label", "option");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "lesson_option";
    input.value = option.optionToken;
    input.addEventListener("change", () => {
      state.selectedOptionToken = option.optionToken;
      elements.answerButton.disabled = false;
      elements.quizHint.textContent = "已選擇答案；送出後不能修改。";
    });
    label.append(
      input,
      make("span", "option-index", option.label || ""),
      make("span", "option-copy", option.text || "")
    );
    return label;
  }));

  renderProgress(progress, item);
  showView("quiz");
  elements.questionStem.focus({ preventScroll: true });
}

const REVIEW_TYPE_LABELS = Object.freeze({
  single_choice: "單選題",
  cloze_choice: "填空選擇題",
  jlpt_star_choice: "JLPT 星號排序題"
});

function renderDimensions(dimensions = []) {
  const byLayer = Array.isArray(dimensions)
    ? new Map(dimensions.map(dimension => [dimension.layerCode, dimension]))
    : new Map(Object.entries(dimensions || {}));
  for (const layerCode of ["K", "U", "A"]) {
    const dimension = byLayer.get(layerCode) || {};
    const scoreNode = elements[`dimension${layerCode}Score`];
    const detailNode = elements[`dimension${layerCode}Detail`];
    scoreNode.textContent = percentText(dimension);
    detailNode.textContent = Number(dimension.asked)
      ? `答對 ${dimension.correct}／${dimension.asked} 題`
      : "本課沒有此層題目";
  }
}

function answerTextForReview(answer) {
  if (!answer || typeof answer !== "object") return "未作答";
  const label = String(answer.label || "").trim();
  const text = String(answer.text || "").trim();
  if (!label && !text) return "未作答";
  return [label ? `選項（${label}）` : "", text ? `「${text}」` : ""]
    .filter(Boolean)
    .join(" ");
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

  const primary = make(
    "p",
    "lesson-review-stem",
    display.contextJapanese || "請選出最適合放在 ★ 位置的答案。"
  );
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
    frame.setAttribute(
      "aria-label",
      `四格排列，星號位於第 ${Number(display.starPosition) || "—"} 格：${frameParts.join("　")}`
    );
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
  const sentenceLabel = make("strong", "", "完整正解：");
  const sentence = make("span", "", item.correctFullSentence || "—");
  sentence.lang = "ja";
  const translationLabel = make("strong", "", "正解中文翻譯：");
  const translation = make("span", "", item.correctTranslationZh || "—");
  block.append(sentenceLabel, sentence, translationLabel, translation);
  return block;
}

function reviewOptionAnalysis(item) {
  if (item.itemType === "jlpt_star_choice") return null;
  const section = make("section", "lesson-review-option-analysis");
  section.append(make("h3", "", "選項解析"));
  for (const option of Array.isArray(item.options) ? item.options : []) {
    const row = make(
      "article",
      [
        "lesson-review-option-row",
        option.isCorrect ? "correct" : "wrong",
        option.isSelected ? "selected" : ""
      ].filter(Boolean).join(" ")
    );
    const top = make("div", "lesson-review-option-top");
    const title = make("strong", "", `${option.label}. ${option.text}`);
    title.lang = "ja";
    const badges = make("span", "lesson-review-option-badges");
    if (option.isCorrect) badges.append(make("i", "correct", "正解"));
    if (option.isSelected) badges.append(make("i", option.isCorrect ? "correct" : "selected", "你的選擇"));
    top.append(title, badges);
    const explanation = option.explanation || item.correctReason;
    row.append(top, make("p", "", explanation || "此選項不符合本題的句型或語境。"));
    section.append(row);
  }
  return section;
}

function buildReviewCard(item) {
  const outcome = item.isCorrect ? "correct" : "wrong";
  const details = make("details", `lesson-review-item ${outcome}`);
  details.dataset.result = outcome;

  const summary = document.createElement("summary");
  const number = make("span", "lesson-review-number", `第 ${item.ordinal} 題`);
  const title = make("span", "lesson-review-title");
  const pattern = make("strong", "", item.pattern || "N5 句型");
  pattern.lang = "ja";
  title.append(
    pattern,
    make(
      "span",
      "",
      `${item.layerCode || "—"} ${item.layerLabel || ""}・${REVIEW_TYPE_LABELS[item.itemType] || "選擇題"}`
    )
  );
  const statuses = make("span", "lesson-review-statuses");
  statuses.append(
    make("span", `lesson-review-outcome ${outcome}`, item.isCorrect ? "答對" : "答錯"),
    make(
      "span",
      `lesson-review-evidence ${item.reviewStatus === "approved" ? "approved" : "trial"}`,
      item.reviewStatus === "approved" ? "目前已核准" : "試行題"
    )
  );
  summary.append(number, title, statuses);

  const body = make("div", "lesson-review-body");
  body.append(reviewQuestionBlock(item));

  const answerPair = make("div", "lesson-review-answer-pair");
  answerPair.append(
    reviewAnswerBox("你的答案", item.selectedAnswer, item.isCorrect ? "selected-correct" : "selected-wrong"),
    reviewAnswerBox("正確答案", item.correctAnswer, "correct-answer")
  );
  body.append(answerPair);

  if (item.itemType === "jlpt_star_choice") {
    const order = make("div", "lesson-review-order");
    order.append(make("strong", "", "正確排列："));
    const orderText = make(
      "span",
      "",
      Array.isArray(item.correctOrder) ? item.correctOrder.join(" ／ ") : "—"
    );
    orderText.lang = "ja";
    order.append(orderText);
    order.append(make("strong", "", "使用句型："));
    const grammar = make("span", "", item.pattern || "—");
    grammar.lang = "ja";
    order.append(grammar);
    body.append(order);
  }

  body.append(reviewTranslationBlock(item));
  const reason = make("div", "lesson-review-reason");
  reason.append(make("strong", "", item.itemType === "jlpt_star_choice" ? "解析：" : "正解分析："));
  const correctOptionExplanation = item.options?.find(option => option.isCorrect)?.explanation;
  reason.append(make("span", "", correctOptionExplanation || item.correctReason || "—"));
  body.append(reason);

  const optionAnalysis = reviewOptionAnalysis(item);
  if (optionAnalysis) body.append(optionAnalysis);

  if (item.reviewStatus !== "approved") {
    body.append(make(
      "p",
      "lesson-review-trial-note",
      "本題為試行題；詳解僅供本機練習與題庫 QA，不納入 CAT 診斷。"
    ));
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
    ? "本課沒有錯題；可以切換到「全部題目」查看完整詳解。"
    : state.reviewFilter === "correct"
      ? "本課目前沒有答對的題目；可以切換到「全部題目」查看詳解。"
      : "這次結果沒有可顯示的逐題資料。";
}

function renderReview(result) {
  const reviewItems = Array.isArray(result?.reviewItems)
    ? [...result.reviewItems].sort((a, b) => Number(a.ordinal) - Number(b.ordinal))
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
    : `本課全對；已顯示全部 ${reviewItems.length} 題詳解。`;
  elements.reviewList.replaceChildren(...reviewItems.map(buildReviewCard));
  applyReviewFilter(wrongCount > 0 ? "wrong" : "all");
}

function renderResult(result) {
  const overall = result?.overallPractice || {};
  const approved = result?.approvedEvidence || {};
  const candidate = result?.candidateEvidence || {};
  const accuracy = Number(overall.accuracy);
  const score = Number.isFinite(accuracy) ? Math.round(accuracy) : 0;
  const candidateOnly = Boolean(result?.candidateOnly || result?.evidenceClass === "candidate_only");

  state.item = null;
  state.progress = null;
  state.selectedOptionToken = "";
  state.submitting = false;
  document.querySelector(".lesson-score-ring").style.setProperty("--score", `${score}%`);
  elements.resultAccuracy.textContent = Number.isFinite(accuracy) ? `${score}%` : "—";
  elements.resultTitle.textContent = `${state.lesson.label}作答完成`;
  elements.resultNotice.textContent = result?.notice || "這是本課的課後練習結果，不代表正式精熟。";
  elements.resultCorrect.textContent = `答對 ${overall.correct ?? "—"} 題`;
  elements.resultAsked.textContent = `共 ${overall.asked ?? "—"} 題`;
  elements.resultPatterns.textContent = `涵蓋 ${result?.coverage?.patternCount ?? state.lesson.pattern_count} 個句型`;
  renderDimensions(result?.dimensions);
  elements.overallEvidence.textContent = `${percentText(overall)}・${evidenceDetail(overall)}`;
  elements.approvedEvidence.textContent = `${percentText(approved)}・${evidenceDetail(approved)}`;
  elements.trialEvidence.textContent = `${percentText(candidate)}・${evidenceDetail(candidate)}`;
  elements.approvedEvidenceNote.textContent = Number(approved.asked)
    ? "目前已核准範圍的練習題"
    : "本課目前沒有已核准題";
  elements.trialEvidenceNote.textContent = Number(candidate.asked)
    ? "僅供練習與題庫 QA，不納入 CAT"
    : "本課沒有試行題";
  elements.resultBoundaryTitle.textContent = candidateOnly
    ? "本課全為試行練習"
    : "這是課後練習結果";
  elements.resultBoundaryText.textContent = candidateOnly
    ? "本結果僅供練習與題庫 QA，不代表正式精熟，不納入 CAT，也不是 JLPT 合格或 N4 銜接判定。"
    : "本課結果不代表正式精熟；如果內含試行題，該部分不納入 CAT。本結果也不是 JLPT 合格或 N4 銜接判定。";
  renderReview(result);
  showView("result");
  elements.resultAnnouncement.textContent = `${state.lesson.label}完成，答對 ${overall.correct ?? 0}／${overall.asked ?? 0} 題。`;
  requestAnimationFrame(() => elements.resultTitle.focus({ preventScroll: true }));
}

async function startSession() {
  elements.startButton.disabled = true;
  elements.startButton.textContent = "正在準備題目…";
  try {
    const payload = await requestJson(`${API_ROOT}/L${state.lessonNumber}/sessions`, {
      method: "POST",
      body: JSON.stringify({})
    });
    state.sessionId = payload.sessionId;
    state.receipt = payload.receipt;
    state.expiresAt = payload.expiresAt || "";
    saveSession();
    renderItem(payload.item, payload.progress);
  } catch (error) {
    showError(error, "無法連線到本課測驗服務，請稍後再試。");
  } finally {
    elements.startButton.disabled = false;
    elements.startButton.innerHTML = `開始${state.lesson.label} <span aria-hidden="true">→</span>`;
  }
}

async function getCompletedResult() {
  return requestJson(`${API_ROOT}/sessions/${encodeURIComponent(state.sessionId)}/result`, {
    headers: { "x-n5-lesson-receipt": state.receipt }
  });
}

async function resumeSession() {
  const stored = safeStorageRead();
  if (!stored) {
    renderStart();
    return;
  }
  state.sessionId = stored.sessionId;
  state.receipt = stored.receipt;
  state.expiresAt = stored.expiresAt;
  elements.resumeButton.disabled = true;
  elements.resumeButton.textContent = "正在恢復作答…";
  try {
    const payload = await requestJson(`${API_ROOT}/sessions/${encodeURIComponent(state.sessionId)}`, {
      headers: { "x-n5-lesson-receipt": state.receipt }
    });
    if (payload.complete && payload.result) renderResult(payload.result);
    else renderItem(payload.item, payload.progress);
  } catch (error) {
    if (error.code === "lesson_session_complete") {
      try {
        const payload = await getCompletedResult();
        renderResult(payload.result);
        return;
      } catch (resultError) {
        showError(resultError, "無法取得已完成的練習結果。");
        return;
      }
    }
    if (error.status === 404 || error.status === 403) clearSession();
    showError(error, "無法恢復這次作答，請重新開始。");
  } finally {
    elements.resumeButton.disabled = false;
    elements.resumeButton.textContent = "繼續本機作答";
  }
}

async function submitAnswer() {
  if (!state.selectedOptionToken || state.submitting) return;
  state.submitting = true;
  elements.answerButton.disabled = true;
  elements.answerButton.textContent = "正在送出…";
  elements.quizHint.textContent = "";
  try {
    const payload = await requestJson(
      `${API_ROOT}/sessions/${encodeURIComponent(state.sessionId)}/responses`,
      {
        method: "POST",
        body: JSON.stringify({
          receipt: state.receipt,
          itemToken: state.item.itemToken,
          optionToken: state.selectedOptionToken
        })
      }
    );
    if (payload.complete && payload.result) renderResult(payload.result);
    else renderItem(payload.item, payload.progress);
  } catch (error) {
    state.submitting = false;
    elements.answerButton.disabled = false;
    elements.answerButton.textContent = Number(state.item?.ordinal) === Number(state.item?.totalItems)
      ? "送出並查看結果"
      : "送出並前往下一題";
    elements.quizHint.textContent = error?.message || "送出失敗，請再試一次。";
  }
}

async function initialize() {
  if (!state.lessonNumber) {
    showError(new Error("請從 25 課清單選擇 L1 至 L25。"));
    return;
  }
  try {
    const [manifest, inventory] = await Promise.all([
      requestJson(MANIFEST_URL),
      requestJson(API_ROOT)
    ]);
    const lesson = manifest.lessons?.find(item => item.lesson_number === state.lessonNumber);
    if (!lesson) throw new Error("找不到指定課次。");
    const inventoryLesson = inventory.lessons?.find(item => item.lessonNumber === state.lessonNumber);
    if (!inventoryLesson) throw new Error("找不到本課句型預覽。");
    applyLesson({
      ...lesson,
      pattern_previews: inventoryLesson.patternPreviews
    });
    renderStart();
  } catch (error) {
    showError(error, "無法載入本課測驗資料。");
  }
}

elements.startButton.addEventListener("click", startSession);
elements.resumeButton.addEventListener("click", resumeSession);
elements.answerButton.addEventListener("click", submitAnswer);
elements.retryButton.addEventListener("click", initialize);
elements.reviewFilters.addEventListener("click", event => {
  const button = event.target.closest("button[data-filter]");
  if (button) applyReviewFilter(button.dataset.filter);
});
elements.restartButton.addEventListener("click", () => {
  clearSession();
  renderStart();
});

initialize();
