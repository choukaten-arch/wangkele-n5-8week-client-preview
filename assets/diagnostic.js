const STORAGE_KEY = "wkl_n5_8week_cat_v1:session";
const CONFIG_URL = "../data/cat-diagnostic.json";
const SESSION_URL = "../api/n5-cat/sessions";

const views = {
  loading: document.querySelector("#loadingView"),
  error: document.querySelector("#errorView"),
  start: document.querySelector("#startView"),
  quiz: document.querySelector("#quizView"),
  result: document.querySelector("#resultView")
};

const elements = {
  errorText: document.querySelector("#errorText"),
  retryButton: document.querySelector("#retryButton"),
  startForm: document.querySelector("#startForm"),
  resumeButton: document.querySelector("#resumeButton"),
  expectedCount: document.querySelector("#expectedCount"),
  questionNumber: document.querySelector("#questionNumber"),
  questionRange: document.querySelector("#questionRange"),
  progressBar: document.querySelector("#progressBar"),
  coverageText: document.querySelector("#coverageText"),
  coverageGrid: document.querySelector("#coverageGrid"),
  questionScope: document.querySelector("#questionScope"),
  questionDimension: document.querySelector("#questionDimension"),
  questionInstruction: document.querySelector("#questionInstruction"),
  questionStem: document.querySelector("#questionStem"),
  questionContext: document.querySelector("#questionContext"),
  questionFrame: document.querySelector("#questionFrame"),
  optionGroup: document.querySelector("#optionGroup"),
  quizHint: document.querySelector("#quizHint"),
  answerButton: document.querySelector("#answerButton"),
  scoreRing: document.querySelector(".cat-score-ring"),
  diagnosticScore: document.querySelector("#diagnosticScore"),
  levelName: document.querySelector("#levelName"),
  levelDescription: document.querySelector("#levelDescription"),
  confidenceLabel: document.querySelector("#confidenceLabel"),
  intervalLabel: document.querySelector("#intervalLabel"),
  testedPatternLabel: document.querySelector("#testedPatternLabel"),
  dimensionCards: document.querySelector("#dimensionCards"),
  weekProfiles: document.querySelector("#weekProfiles"),
  grammarEvidence: document.querySelector("#grammarEvidence"),
  recommendationText: document.querySelector("#recommendationText"),
  restartButton: document.querySelector("#restartButton")
};

const state = {
  config: null,
  sessionId: "",
  receipt: "",
  expiresAt: "",
  item: null,
  progress: null,
  selectedOptionToken: "",
  submitting: false
};

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

function normalizePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round((number <= 1 ? number * 100 : number));
}

function percentText(value, fallback = "證據不足") {
  const percent = normalizePercent(value);
  return percent === null ? fallback : `${percent}%`;
}

function formatNumber(value, fallback = "—") {
  return Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : fallback;
}

function safeStorageRead() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!parsed?.sessionId || !parsed?.receipt) return null;
    if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const sanitized = {
      sessionId: String(parsed.sessionId),
      receipt: String(parsed.receipt),
      expiresAt: String(parsed.expiresAt || "")
    };
    if (Object.hasOwn(parsed, "alias")) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
    }
    return sanitized;
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
    const message = payload?.message || payload?.error || `伺服器回應 ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function applyConfig(config) {
  const counts = config.question_count;
  elements.expectedCount.textContent = `約 ${counts.typical}`;
  elements.questionRange.textContent = `約 ${counts.minimum}–${counts.maximum} 題`;
  renderCoverage(null);
}

function showError(error, fallback) {
  const detail = error?.message && !/^Failed to fetch$/i.test(error.message)
    ? error.message
    : fallback;
  elements.errorText.textContent = detail || "CAT 服務暫時無法使用，請稍後再試。";
  showView("error");
}

function renderCoverage(progress) {
  const groups = state.config?.week_groups || [];
  const covered = new Set(
    progress?.coveredBands || progress?.coveredLessonBands || progress?.bandCoverage || []
  );
  const anchorsComplete = Number(progress?.answered || 0) >= Number(progress?.anchorItems || 24);
  const knownCoverage = covered.size > 0;

  elements.coverageGrid.replaceChildren(...groups.map(group => {
    const keyCandidates = [group.week, String(group.week), `week_0${group.week}`, `week_${group.week}`];
    const active = anchorsComplete || (knownCoverage && keyCandidates.some(key => covered.has(key)));
    const chip = make("span", `cat-coverage-dot${active ? " covered" : Number(progress?.answered || 0) > 0 ? " started" : ""}`);
    chip.textContent = `W${group.week}`;
    chip.title = `${group.label}・${group.lesson_label}${active ? "：已有抽測證據" : "：等待核心取樣"}`;
    return chip;
  }));

  if (anchorsComplete) {
    elements.coverageText.textContent = "8 / 8 區段已有核心取樣";
  } else if (knownCoverage) {
    elements.coverageText.textContent = `${Math.min(covered.size, 8)} / 8 區段已有核心取樣`;
  } else {
    elements.coverageText.textContent = "正在建立八區段核心樣本";
  }
}

function renderProgress(progress = {}) {
  const minimum = Number(progress.totalMinimum || state.config.question_count.minimum);
  const maximum = Number(progress.totalMaximum || state.config.question_count.maximum);
  const answered = Number(progress.answered || 0);
  const ordinal = Number(state.item?.ordinal || answered + 1);
  elements.questionNumber.textContent = `第 ${ordinal} 題`;
  elements.questionRange.textContent = answered < minimum
    ? `至少 ${minimum} 題・最多 ${maximum} 題`
    : `正在確認診斷穩定度・最多 ${maximum} 題`;
  elements.progressBar.style.width = `${Math.min(100, (answered / Math.max(minimum, 1)) * 100)}%`;
  renderCoverage({ ...progress, anchorItems: 24 });
}

function renderItem(item, progress) {
  state.item = item;
  state.progress = progress || state.progress || {};
  state.selectedOptionToken = "";
  state.submitting = false;
  elements.answerButton.disabled = true;
  elements.answerButton.textContent = "送出並前往下一題";
  elements.quizHint.textContent = "";
  elements.questionScope.textContent = "自適應題目";
  elements.questionDimension.textContent = "CAT 選題中";
  elements.questionDimension.className = "dimension-chip";
  elements.questionInstruction.textContent = item.instruction || "請選出最適合的答案。";

  const display = item.display || {};
  const isStar = display.kind === "jlpt_star";
  const stem = isStar
    ? (display.contextJapanese || display.contextBefore || "請選出最適合放在 ★ 位置的答案。")
    : (display.stem || "請選出最適合的答案。");
  elements.questionStem.textContent = stem;

  const contextParts = isStar
    ? [display.leadingText, display.contextBefore, display.contextAfter, display.trailingText]
      .filter(Boolean)
    : [];
  elements.questionContext.textContent = contextParts.join("　");
  elements.questionContext.classList.toggle("hidden", contextParts.length === 0);
  elements.questionFrame.textContent = display.blankFrame || "";
  elements.questionFrame.classList.toggle("hidden", !display.blankFrame);

  const options = Array.isArray(item.options) ? item.options : [];
  elements.optionGroup.replaceChildren(...options.map(option => {
    const label = make("label", "option");
    const input = document.createElement("input");
    const marker = make("span", "option-index", option.label || "");
    const copy = make("span", "option-copy", option.text || "");
    input.type = "radio";
    input.name = "cat_option";
    input.value = option.optionToken;
    input.addEventListener("change", () => {
      state.selectedOptionToken = option.optionToken;
      elements.answerButton.disabled = false;
      elements.quizHint.textContent = "已選擇答案，送出後系統會選擇下一題。";
    });
    label.append(input, marker, copy);
    return label;
  }));

  renderProgress(state.progress);
  showView("quiz");
  elements.questionStem.focus({ preventScroll: true });
}

function statusDetails(status) {
  const table = {
    stable: ["本次穩定", "stable"],
    stable_signal: ["穩定訊號", "stable"],
    developing: ["發展中", "developing"],
    needs_support: ["優先補強", "review"],
    reinforce: ["優先補強", "review"],
    priority_review: ["優先補強", "review"],
    confirmed_reinforcement: ["確認需補強", "review"],
    application_practice: ["應用待加強", "developing"],
    observation: ["觀察訊號", "developing"],
    signal: ["觀察訊號", "developing"],
    mixed: ["混合證據", "developing"],
    observed_success: ["正向觀察", "developing"],
    insufficient: ["證據不足", "insufficient"],
    not_tested: ["尚未檢測", "insufficient"]
  };
  return table[status] || [status || "證據不足", "insufficient"];
}

function renderDimensions(dimensions = []) {
  const configByCode = new Map((state.config.dimensions || []).map(item => [item.code, item]));
  const resultByCode = new Map(dimensions.map(item => [item.code, item]));
  elements.dimensionCards.replaceChildren(...["K", "U", "A"].map(code => {
    const config = configByCode.get(code) || { label: code, description: "" };
    const item = resultByCode.get(code) || {};
    const card = make("article", `cat-dimension-card dimension-${code.toLowerCase()}`);
    const top = make("header");
    const meter = make("div", "cat-meter");
    const meterFill = make("i");
    const percent = normalizePercent(item.accuracy);
    meterFill.style.width = `${Math.max(0, Math.min(100, percent ?? 0))}%`;
    meter.append(meterFill);
    top.append(
      make("span", "cat-dimension-code", code),
      make("b", "", percentText(item.accuracy))
    );
    const meta = make("p", "", Number.isFinite(Number(item.asked))
      ? `本次 ${item.asked} 題${Number.isFinite(Number(item.correct)) ? `・答對 ${item.correct} 題` : ""}`
      : "本次證據不足");
    const description = make("p", "", config.description);
    card.append(top, make("h3", "", config.label), meter, meta, description);
    return card;
  }));
}

function renderWeekProfiles(bands = []) {
  const bandById = new Map(bands.map(item => [item.id, item]));
  elements.weekProfiles.replaceChildren(...state.config.week_groups.map(group => {
    const item = bandById.get(`week_0${group.week}`) || bandById.get(`week_${group.week}`) || bands[group.week - 1] || {};
    const [statusLabel, statusClass] = statusDetails(item.status);
    const card = make("article", `cat-week-card ${statusClass}`);
    const top = make("header");
    top.append(
      make("b", "", `W${group.week}・${group.lesson_label}`),
      make("span", "", percentText(item.accuracy))
    );
    card.append(
      top,
      make("strong", "", statusLabel),
      make("p", "", Number.isFinite(Number(item.asked)) ? `本次抽測 ${item.asked} 題` : "尚無足夠證據")
    );
    return card;
  }));
}

function renderGrammarEvidence(evidence = []) {
  if (!evidence.length) {
    const empty = make("div", "cat-evidence-empty");
    empty.append(
      make("b", "", "句型觀察仍在整理"),
      make("p", "", "先依三層能力與八個課程區段安排複習；未抽到的句型不視為已精熟或有弱點。")
    );
    elements.grammarEvidence.replaceChildren(empty);
    return;
  }

  elements.grammarEvidence.replaceChildren(...evidence.map(item => {
    const [statusLabel, statusClass] = statusDetails(item.status);
    const row = make("article", `cat-evidence-item status-${statusClass}`);
    row.append(
      make("b", "", item.grammarLabel || item.patternLabel || "本次抽測句型"),
      make("p", "", item.summary || `${item.lessonLabel || "課程範圍"}・本次 ${item.asked || 0} 題`),
      make("span", `evidence-status ${statusClass}`, statusLabel)
    );
    return row;
  }));
}

function renderRecommendations(result) {
  const supplied = Array.isArray(result.recommendations)
    ? result.recommendations.filter(Boolean)
    : [];
  const recommendations = supplied.length ? supplied : [
    "先從報告中標示為「優先補強」的課程區段開始複習。",
    "完成對應課程與練習後，再以週測或 50 題期末測驗交叉確認。",
    "未抽到的句型請依八週進度持續練習，不以本次結果推定精熟。"
  ];
  const list = make("ul");
  recommendations.forEach(copy => list.append(make("li", "", copy)));
  elements.recommendationText.replaceChildren(list);
}

function renderResult(result = {}) {
  const readiness = result.readiness || {};
  const score = result.diagnosticIndex ?? normalizePercent(result.accuracy);
  const interval = result.interval || {};
  const low = interval.low ?? result.intervalLow;
  const high = interval.high ?? result.intervalHigh;
  const intervalAvailable = Number.isFinite(Number(low)) && Number.isFinite(Number(high));

  elements.diagnosticScore.textContent = formatNumber(score);
  elements.scoreRing.style.setProperty("--score", `${Math.max(0, Math.min(100, Number(score) || 0))}%`);
  elements.levelName.textContent = readiness.label || result.levelLabel || "N5 學習診斷完成";
  elements.levelDescription.textContent = readiness.description
    || result.levelDescription
    || "本次抽測已建立初步學習地圖，請搭配下方課群與句型證據安排複習。";
  elements.confidenceLabel.textContent = `明確度：${result.confidenceLabel || "試行觀察"}`;
  elements.intervalLabel.textContent = intervalAvailable
    ? `參考區間：${Math.round(low)}–${Math.round(high)}`
    : "參考區間：尚待更多證據";
  const testedPatterns = formatNumber(result.testedPatterns, "0");
  const untestedPatterns = formatNumber(result.untestedPatterns, "—");
  elements.testedPatternLabel.textContent = `抽測句型：${testedPatterns}／97・未測 ${untestedPatterns}`;

  renderDimensions(result.dimensions || []);
  renderWeekProfiles(result.lessonBands || result.weekProfiles || []);
  renderGrammarEvidence(result.grammarEvidence || []);
  renderRecommendations(result);
  clearSession();
  showView("result");
}

async function startSession() {
  elements.startForm.querySelector("button[type=submit]").disabled = true;
  try {
    const payload = await requestJson(SESSION_URL, {
      method: "POST",
      body: JSON.stringify({ mode: state.config.mode })
    });
    state.sessionId = payload.sessionId;
    state.receipt = payload.receipt;
    state.expiresAt = payload.expiresAt;
    saveSession();
    renderItem(payload.item, payload.progress);
  } catch (error) {
    showError(error, "CAT 選題服務尚未啟動，請確認本機服務後再試。 ");
  } finally {
    elements.startForm.querySelector("button[type=submit]").disabled = false;
  }
}

async function resumeSession() {
  const saved = safeStorageRead();
  if (!saved) return initialize();
  Object.assign(state, saved);
  elements.resumeButton.disabled = true;
  try {
    const payload = await requestJson(`${SESSION_URL}/${encodeURIComponent(state.sessionId)}`, {
      headers: { "x-n5-cat-receipt": state.receipt }
    });
    if (payload.complete && payload.result) {
      renderResult(payload.result);
    } else {
      renderItem(payload.item, payload.progress);
    }
  } catch (error) {
    if ([401, 404, 410].includes(error.status)) clearSession();
    showError(error, "這次診斷已無法繼續，請重新開始。 ");
  } finally {
    elements.resumeButton.disabled = false;
  }
}

async function submitAnswer() {
  if (!state.selectedOptionToken || state.submitting || !state.item) return;
  state.submitting = true;
  elements.answerButton.disabled = true;
  elements.answerButton.textContent = "正在選擇下一題…";
  elements.optionGroup.querySelectorAll("input").forEach(input => { input.disabled = true; });

  try {
    const payload = await requestJson(`${SESSION_URL}/${encodeURIComponent(state.sessionId)}/responses`, {
      method: "POST",
      body: JSON.stringify({
        receipt: state.receipt,
        itemToken: state.item.itemToken,
        optionToken: state.selectedOptionToken
      })
    });
    if (payload.complete) {
      renderResult(payload.result);
    } else {
      renderItem(payload.item, payload.progress);
    }
  } catch (error) {
    try {
      const resumed = await requestJson(`${SESSION_URL}/${encodeURIComponent(state.sessionId)}`, {
        headers: { "x-n5-cat-receipt": state.receipt }
      });
      if (resumed.complete && resumed.result) {
        renderResult(resumed.result);
      } else if (resumed.item) {
        renderItem(resumed.item, resumed.progress);
        elements.quizHint.textContent = error?.status === 409
          ? "已同步到目前題目，請繼續作答。"
          : "連線已恢復；系統已確認目前題目。";
      }
      return;
    } catch {
      // Keep the current selection available when both submission and recovery fail.
    }
    state.submitting = false;
    elements.answerButton.disabled = false;
    elements.answerButton.textContent = "再次送出";
    elements.quizHint.textContent = error?.message || "答案尚未送達，請再試一次。";
    elements.optionGroup.querySelectorAll("input").forEach(input => { input.disabled = false; });
  }
}

function resetToStart() {
  clearSession();
  elements.resumeButton.classList.add("hidden");
  showView("start");
}

async function initialize() {
  showView("loading");
  try {
    state.config = await requestJson(CONFIG_URL);
    applyConfig(state.config);
    const saved = safeStorageRead();
    elements.resumeButton.classList.toggle("hidden", !saved);
    showView("start");
  } catch (error) {
    showError(error, "無法讀取 CAT 診斷設定，請確認本機服務後再試。 ");
  }
}

elements.startForm.addEventListener("submit", event => {
  event.preventDefault();
  startSession();
});
elements.resumeButton.addEventListener("click", resumeSession);
elements.answerButton.addEventListener("click", submitAnswer);
elements.restartButton.addEventListener("click", resetToStart);
elements.retryButton.addEventListener("click", initialize);

initialize();
