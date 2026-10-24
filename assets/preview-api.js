(function installN5PreviewAdapter() {
  "use strict";

  const scriptUrl = new URL(document.currentScript.src, location.href);
  const assetMarker = "/assets/preview-api.js";
  const markerIndex = scriptUrl.pathname.indexOf(assetMarker);
  const appBase = markerIndex >= 0 ? scriptUrl.pathname.slice(0, markerIndex) : "";
  const nativeFetch = window.fetch.bind(window);
  const sessionKey = "wkl_n5_8week_preview_session_v1";
  const lessonStateKey = "wkl_n5_8week_preview_lesson_state_v1";
  const catStateKey = "wkl_n5_8week_preview_cat_state_v1";
  const assessmentStateKey = "wkl_n5_8week_preview_assessment_state_v1";
  const assessmentDefinitions = Object.freeze({
    n5w8_week_01: Object.freeze({ kind: "weekly", sequence: 1, label: "第 1 週", lessonLabel: "L1–L3", lessonStart: 1, lessonEnd: 3, patternCount: 15, questionCount: 20, durationMinutes: 20, currentCount: 20, reviewCount: 0, trialItemCount: 8 }),
    n5w8_week_02: Object.freeze({ kind: "weekly", sequence: 2, label: "第 2 週", lessonLabel: "L4–L6", lessonStart: 4, lessonEnd: 6, patternCount: 12, questionCount: 20, durationMinutes: 20, currentCount: 16, reviewCount: 4, trialItemCount: 0 }),
    n5w8_week_03: Object.freeze({ kind: "weekly", sequence: 3, label: "第 3 週", lessonLabel: "L7–L9", lessonStart: 7, lessonEnd: 9, patternCount: 15, questionCount: 20, durationMinutes: 20, currentCount: 16, reviewCount: 4, trialItemCount: 0 }),
    n5w8_week_04: Object.freeze({ kind: "weekly", sequence: 4, label: "第 4 週", lessonLabel: "L10–L12", lessonStart: 10, lessonEnd: 12, patternCount: 11, questionCount: 20, durationMinutes: 20, currentCount: 16, reviewCount: 4, trialItemCount: 0 }),
    n5w8_week_05: Object.freeze({ kind: "weekly", sequence: 5, label: "第 5 週", lessonLabel: "L13–L15", lessonStart: 13, lessonEnd: 15, patternCount: 10, questionCount: 20, durationMinutes: 20, currentCount: 15, reviewCount: 5, trialItemCount: 0 }),
    n5w8_week_06: Object.freeze({ kind: "weekly", sequence: 6, label: "第 6 週", lessonLabel: "L16–L18", lessonStart: 16, lessonEnd: 18, patternCount: 12, questionCount: 20, durationMinutes: 20, currentCount: 16, reviewCount: 4, trialItemCount: 0 }),
    n5w8_week_07: Object.freeze({ kind: "weekly", sequence: 7, label: "第 7 週", lessonLabel: "L19–L21", lessonStart: 19, lessonEnd: 21, patternCount: 10, questionCount: 20, durationMinutes: 20, currentCount: 15, reviewCount: 5, trialItemCount: 0 }),
    n5w8_week_08: Object.freeze({ kind: "weekly", sequence: 8, label: "第 8 週", lessonLabel: "L22–L25", lessonStart: 22, lessonEnd: 25, patternCount: 12, questionCount: 20, durationMinutes: 20, currentCount: 16, reviewCount: 4, trialItemCount: 0 }),
    n5w8_final: Object.freeze({ kind: "final", sequence: 9, label: "期末測驗", lessonLabel: "L1–L25 綜合", lessonStart: 1, lessonEnd: 25, patternCount: 97, questionCount: 50, durationMinutes: 50, currentCount: 50, reviewCount: 0, trialItemCount: 0 })
  });
  const assessmentLayers = Object.freeze([
    Object.freeze({ code: "K", label: "知識", itemType: "single_choice" }),
    Object.freeze({ code: "U", label: "理解", itemType: "cloze_choice" }),
    Object.freeze({ code: "A", label: "應用", itemType: "jlpt_star_choice" })
  ]);
  let assessmentSessionSequence = 0;
  const expiresAt = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const isoNow = () => new Date().toISOString();

  function appPath(path) {
    const value = String(path || "/");
    if (!value.startsWith("/") || value.startsWith("//")) return value;
    if (!appBase || value === appBase || value.startsWith(`${appBase}/`)) return value;
    return `${appBase}${value}`;
  }

  window.__N5_APP_BASE__ = appBase;
  window.__N5_APP_PATH__ = appPath;

  document.querySelectorAll('a[href^="/"]').forEach(link => {
    link.setAttribute("href", appPath(link.getAttribute("href")));
  });

  function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-n5-preview": "synthetic"
      }
    });
  }

  function readJson(value, fallback) {
    try {
      const parsed = JSON.parse(value || "null");
      return parsed && typeof parsed === "object" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }

  function requestBody(init) {
    return readJson(typeof init?.body === "string" ? init.body : "", {});
  }

  function currentSession() {
    return readJson(localStorage.getItem(sessionKey), null);
  }

  function signedInPayload() {
    const session = currentSession();
    if (!session) return null;
    return {
      authenticated: true,
      expiresAt: expiresAt(),
      passwordChangeRequired: session.passwordChangeRequired === true,
      learner: {
        learnerId: "DEMO-N5-008",
        displayName: "合成學員・小可",
        account: session.account || "demo@wangcola.test",
        passwordChangeRequired: session.passwordChangeRequired === true
      }
    };
  }

  function previewOptions(prefix = "示意選項") {
    return ["A", "B", "C", "D"].map(label => ({
      optionToken: `${prefix}-${label}`,
      label,
      text: `${prefix} ${label}`
    }));
  }

  function previewItem(kind, ordinal, total) {
    return {
      itemToken: `${kind}-item-${ordinal}`,
      itemType: "single_choice",
      instruction: "請選出最適合的答案。",
      ordinal,
      totalItems: total,
      display: {
        kind: "choice",
        stem: `合成介面測試題 ${ordinal}`
      },
      options: previewOptions("示意選項")
    };
  }

  function lessonNumberFromPath(pathname) {
    const direct = pathname.match(/\/api\/n5-lessons\/L(\d+)\/sessions$/);
    if (direct) return Number(direct[1]);
    const session = pathname.match(/\/api\/n5-lessons\/sessions\/preview-lesson-(\d+)/);
    return session ? Number(session[1]) : 1;
  }

  function readLessonState(lessonNumber) {
    const all = readJson(localStorage.getItem(lessonStateKey), {});
    return all[String(lessonNumber)] || { answered: 0 };
  }

  function writeLessonState(lessonNumber, next) {
    const all = readJson(localStorage.getItem(lessonStateKey), {});
    all[String(lessonNumber)] = next;
    localStorage.setItem(lessonStateKey, JSON.stringify(all));
  }

  function lessonEnvelope(lessonNumber, answered = 0) {
    const total = 3;
    return {
      sessionId: `preview-lesson-${lessonNumber}`,
      receipt: `preview-receipt-L${lessonNumber}`,
      expiresAt: expiresAt(),
      complete: answered >= total,
      progress: { answered, total },
      ...(answered < total ? { item: previewItem(`lesson-${lessonNumber}`, answered + 1, total) } : {})
    };
  }

  function lessonReviewItem(ordinal, isCorrect) {
    const options = previewOptions("示意選項").map((option, index) => ({
      label: option.label,
      text: option.text,
      isCorrect: index === 0,
      isSelected: isCorrect ? index === 0 : index === 1,
      explanation: index === 0
        ? "這是合成題的示意正解，用來確認錯題詳解版面。"
        : "這是合成干擾選項，僅供測試解析呈現。"
    }));
    return {
      ordinal,
      pattern: `句型預覽 ${String(ordinal).padStart(2, "0")}`,
      layerCode: ["K", "U", "A"][ordinal - 1] || "K",
      layerLabel: ["知識", "理解", "應用"][ordinal - 1] || "知識",
      itemType: "single_choice",
      reviewStatus: ordinal === 3 ? "trial" : "approved",
      isCorrect,
      instruction: "請選出最適合的答案。",
      display: { kind: "choice", stem: `合成介面測試題 ${ordinal}` },
      selectedAnswer: isCorrect ? options[0] : options[1],
      correctAnswer: options[0],
      correctFullSentence: "這是合成完整正解。",
      correctTranslationZh: "此內容只用來檢查詳解排版。",
      correctReason: "本題不使用正式教材內容或真實題庫答案。",
      options
    };
  }

  function lessonResult(lessonNumber) {
    const reviewItems = [lessonReviewItem(1, true), lessonReviewItem(2, false), lessonReviewItem(3, true)];
    return {
      lessonNumber,
      notice: "公開測試站使用合成題，僅驗證與地端相同的作答與詳解流程。",
      evidenceClass: "mixed_pilot",
      candidateOnly: false,
      overallPractice: { asked: 3, correct: 2, accuracy: 67 },
      approvedEvidence: { asked: 2, correct: 1, accuracy: 50 },
      candidateEvidence: { asked: 1, correct: 1, accuracy: 100 },
      coverage: { patternCount: 3 },
      dimensions: [
        { layerCode: "K", asked: 1, correct: 1, accuracy: 100 },
        { layerCode: "U", asked: 1, correct: 0, accuracy: 0 },
        { layerCode: "A", asked: 1, correct: 1, accuracy: 100 }
      ],
      wrongCount: 1,
      reviewItems
    };
  }

  function publicAssessment(assessmentId) {
    const definition = assessmentDefinitions[assessmentId];
    if (!definition) return null;
    return {
      id: assessmentId,
      kind: definition.kind,
      sequence: definition.sequence,
      label: definition.label,
      lessonLabel: definition.lessonLabel,
      lessonStart: definition.lessonStart,
      lessonEnd: definition.lessonEnd,
      patternCount: definition.patternCount,
      questionCount: definition.questionCount,
      durationMinutes: definition.durationMinutes,
      ...(definition.kind === "weekly"
        ? { currentCount: definition.currentCount, reviewCount: definition.reviewCount }
        : { weeklyAllocation: [8, 6, 8, 6, 5, 6, 5, 6] })
    };
  }

  function readAssessmentSessions() {
    const stored = readJson(localStorage.getItem(assessmentStateKey), {});
    return stored && !Array.isArray(stored) ? stored : {};
  }

  function writeAssessmentSessions(sessions) {
    localStorage.setItem(assessmentStateKey, JSON.stringify(sessions));
  }

  function pruneAssessmentSessions(sessions) {
    const now = Date.now();
    for (const [sessionId, session] of Object.entries(sessions)) {
      if (!session || Date.parse(session.expiresAt || "") <= now) delete sessions[sessionId];
    }
    const ordered = Object.values(sessions).sort((left, right) => (
      Number(right.createdAt) - Number(left.createdAt)
    ));
    for (const session of ordered.slice(12)) delete sessions[session.sessionId];
    return sessions;
  }

  function assessmentOptionToken(sessionId, ordinal, label) {
    return `${sessionId}.q${ordinal}.o${label}`;
  }

  function assessmentCorrectIndex(assessmentId, ordinal) {
    const definition = assessmentDefinitions[assessmentId];
    return (ordinal + definition.sequence - 2) % 4;
  }

  function assessmentLayer(ordinal) {
    return assessmentLayers[(ordinal - 1) % assessmentLayers.length];
  }

  function syntheticAssessmentOptions(session, ordinal) {
    return ["A", "B", "C", "D"].map((label, index) => ({
      optionToken: assessmentOptionToken(session.sessionId, ordinal, label),
      label,
      text: `合成示意選項 ${ordinal}-${index + 1}`
    }));
  }

  function syntheticAssessmentDisplay(ordinal, layer) {
    if (layer.code !== "A") {
      return {
        kind: "choice",
        stem: `合成${layer.label}題 ${String(ordinal).padStart(2, "0")}：請選出最適合的介面測試答案。`
      };
    }
    return {
      kind: "jlpt_star",
      contextJapanese: `合成排序題 ${String(ordinal).padStart(2, "0")}`,
      contextBefore: "これは",
      contextAfter: "表示テストです。",
      blankFrame: "──　──　★　──",
      leadingText: "合成",
      trailingText: "表示",
      starPosition: 3
    };
  }

  function syntheticAssessmentItem(session, ordinal) {
    const definition = assessmentDefinitions[session.assessmentId];
    const layer = assessmentLayer(ordinal);
    return {
      itemToken: `${session.sessionId}.q${ordinal}`,
      itemType: layer.itemType,
      instruction: layer.code === "A"
        ? "請選出最適合放在 ★ 位置的答案。"
        : "請選出最適合的答案。",
      ordinal,
      totalItems: definition.questionCount,
      display: syntheticAssessmentDisplay(ordinal, layer),
      options: syntheticAssessmentOptions(session, ordinal)
    };
  }

  function syntheticAssessmentItems(session) {
    const total = assessmentDefinitions[session.assessmentId].questionCount;
    return Array.from({ length: total }, (_, index) => (
      syntheticAssessmentItem(session, index + 1)
    ));
  }

  function assessmentContent(assessmentId) {
    const definition = assessmentDefinitions[assessmentId];
    return {
      contentStatus: definition.trialItemCount
        ? "testing_with_trial_items"
        : "testing_approved_content",
      approvedItemCount: definition.questionCount - definition.trialItemCount,
      trialItemCount: definition.trialItemCount,
      includesTrialItems: definition.trialItemCount > 0,
      testingOnly: true,
      synthetic: true
    };
  }

  function assessmentProgress(session) {
    const total = assessmentDefinitions[session.assessmentId].questionCount;
    const answered = session.complete ? total : 0;
    return { answered, total, remaining: total - answered, complete: session.complete === true };
  }

  function assessmentEnvelope(session, { includeReceipt = false, includeItems = false } = {}) {
    return {
      schemaVersion: "wkl-n5-weekly-preview-session-v1",
      sessionId: session.sessionId,
      assessmentId: session.assessmentId,
      assessment: publicAssessment(session.assessmentId),
      kind: assessmentDefinitions[session.assessmentId].kind,
      mode: "synthetic_public_preview",
      progress: assessmentProgress(session),
      complete: session.complete === true,
      expiresAt: session.expiresAt,
      ...(includeReceipt ? { receipt: session.receipt } : {}),
      ...(!session.complete && includeItems
        ? {
            content: assessmentContent(session.assessmentId),
            policy: {
              immediateFeedback: false,
              serverAuthoritativeScoring: false,
              submissionMode: "batch_once",
              totalItems: assessmentDefinitions[session.assessmentId].questionCount,
              formalAssessment: false,
              contributesToCat: false,
              synthetic: true
            },
            items: syntheticAssessmentItems(session)
          }
        : {}),
      ...(session.complete ? { result: syntheticAssessmentResult(session) } : {})
    };
  }

  function requestHeader(init, name) {
    const headers = init?.headers;
    if (!headers) return "";
    if (typeof headers.get === "function") return String(headers.get(name) || "");
    if (Array.isArray(headers)) {
      const match = headers.find(([key]) => String(key).toLowerCase() === name.toLowerCase());
      return String(match?.[1] || "");
    }
    const match = Object.entries(headers).find(([key]) => (
      key.toLowerCase() === name.toLowerCase()
    ));
    return String(match?.[1] || "");
  }

  function assessmentSession(sessionId, receipt) {
    const sessions = pruneAssessmentSessions(readAssessmentSessions());
    writeAssessmentSessions(sessions);
    const session = sessions[sessionId];
    if (!session) return { response: json({ error: "weekly_session_not_found", message: "找不到這次合成測驗，或測驗已逾時。" }, 404) };
    if (!receipt || receipt !== session.receipt) {
      return { response: json({ error: "invalid_weekly_receipt", message: "測驗續答憑證不正確。" }, 403) };
    }
    return { session, sessions };
  }

  function createAssessmentSession(assessmentId) {
    const definition = assessmentDefinitions[assessmentId];
    if (!definition) {
      return json({ error: "weekly_assessment_not_found", message: "找不到指定的週測或期末測驗。" }, 404);
    }
    assessmentSessionSequence += 1;
    const nonce = `${Date.now().toString(36)}-${assessmentSessionSequence.toString(36)}`;
    const session = {
      sessionId: `preview-assessment-${assessmentId}-${nonce}`,
      receipt: `preview-assessment-receipt-${nonce}`,
      assessmentId,
      createdAt: Date.now(),
      expiresAt: expiresAt(),
      complete: false,
      responses: []
    };
    const sessions = pruneAssessmentSessions(readAssessmentSessions());
    sessions[session.sessionId] = session;
    writeAssessmentSessions(sessions);
    return json(assessmentEnvelope(session, { includeReceipt: true, includeItems: true }), 201);
  }

  function assessmentEvidence(records, predicate) {
    const matching = records.filter(predicate);
    const correct = matching.filter(record => record.isCorrect).length;
    return {
      asked: matching.length,
      correct,
      accuracy: matching.length ? Math.round((correct / matching.length) * 100) : null,
      formalMastery: false,
      catEvidence: false
    };
  }

  function assessmentReviewRecord(session, item, response) {
    const definition = assessmentDefinitions[session.assessmentId];
    const layer = assessmentLayer(item.ordinal);
    const correctIndex = assessmentCorrectIndex(session.assessmentId, item.ordinal);
    const correctOption = item.options[correctIndex];
    const selectedOption = item.options.find(option => option.optionToken === response.optionToken);
    const isTrial = item.ordinal <= definition.trialItemCount;
    const options = item.options.map((option, index) => ({
      label: option.label,
      text: option.text,
      isSelected: option.optionToken === response.optionToken,
      isCorrect: index === correctIndex,
      ...(layer.code === "A" ? {} : {
        explanation: index === correctIndex
          ? "這是合成題的示意正解，用來確認詳解排版。"
          : "這是合成干擾選項，僅供測試錯項解析的呈現。"
      })
    }));
    const lessonSpan = Math.max(1, definition.lessonEnd - definition.lessonStart + 1);
    const lessonNumber = definition.lessonStart + ((item.ordinal - 1) % lessonSpan);
    return {
      ordinal: item.ordinal,
      lesson: `L${lessonNumber}`,
      lessonNumber,
      selectionScope: definition.kind === "final"
        ? `week_${String(((item.ordinal - 1) % 8) + 1).padStart(2, "0")}`
        : item.ordinal <= definition.currentCount ? "current" : "spiral_review",
      itemType: item.itemType,
      layerCode: layer.code,
      layerLabel: layer.label,
      pattern: `合成句型預覽 ${String(item.ordinal).padStart(2, "0")}`,
      contentStatus: isTrial ? "trial_qa_candidate" : "approved",
      testingOnly: true,
      isCorrect: selectedOption.optionToken === correctOption.optionToken,
      instruction: item.instruction,
      display: item.display,
      options,
      selectedAnswer: { label: selectedOption.label, text: selectedOption.text },
      correctAnswer: { label: correctOption.label, text: correctOption.text },
      correctFullSentence: `合成完整正解 ${String(item.ordinal).padStart(2, "0")}（僅供介面測試）。`,
      correctTranslationZh: "此內容是合成示意文，不來自正式題庫或教材。",
      correctReason: layer.code === "A"
        ? "依合成詞塊的示意順序排列，用來確認排序題詳解版面。"
        : "這是合成題的示意正解；內容只用來驗收結果與錯題詳解介面。",
      ...(layer.code === "A" ? {
        correctOrder: ["合成詞塊一", "合成詞塊二", "合成詞塊三", "合成詞塊四"]
      } : {})
    };
  }

  function syntheticAssessmentResult(session) {
    const items = syntheticAssessmentItems(session);
    const responseByItem = new Map(session.responses.map(response => [response.itemToken, response]));
    const records = items.map(item => assessmentReviewRecord(
      session,
      item,
      responseByItem.get(item.itemToken)
    ));
    const correct = records.filter(record => record.isCorrect).length;
    const approvedEvidence = assessmentEvidence(records, record => record.contentStatus === "approved");
    const trialEvidence = assessmentEvidence(records, record => record.contentStatus !== "approved");
    const dimensions = Object.fromEntries(assessmentLayers.map(layer => [
      layer.code,
      assessmentEvidence(records, record => record.layerCode === layer.code)
    ]));
    return {
      assessmentId: session.assessmentId,
      kind: assessmentDefinitions[session.assessmentId].kind,
      label: assessmentDefinitions[session.assessmentId].label,
      mode: "synthetic_public_preview",
      contentStatus: trialEvidence.asked ? "testing_with_trial_items" : "testing_approved_content",
      evidenceClass: trialEvidence.asked ? "mixed_testing" : "approved_content_testing",
      testingOnly: true,
      formalAssessment: false,
      formalMastery: false,
      catEvidence: false,
      score: {
        correct,
        total: records.length,
        percent: Math.round((correct / records.length) * 100)
      },
      overallPractice: {
        asked: records.length,
        correct,
        accuracy: Math.round((correct / records.length) * 100)
      },
      wrongCount: records.length - correct,
      approvedEvidence,
      trialEvidence,
      dimensions,
      reviewItems: records,
      notice: trialEvidence.asked
        ? `公開測試站的合成驗收卷含 ${trialEvidence.asked} 題示意候選題；所有內容皆為合成資料，不納入 CAT。`
        : "公開測試站使用合成題驗收作答、K／U／A 與詳解介面；不代表正式精熟。"
    };
  }

  function submitAssessmentSession(sessionId, init) {
    const body = requestBody(init);
    const found = assessmentSession(sessionId, String(body.receipt || ""));
    if (found.response) return found.response;
    const { session, sessions } = found;
    if (session.complete) {
      return json({ error: "weekly_session_complete", message: "這次測驗已完成，不能再次作答。" }, 409);
    }
    const items = syntheticAssessmentItems(session);
    const itemByToken = new Map(items.map(item => [item.itemToken, item]));
    if (!Array.isArray(body.responses) || body.responses.length !== items.length) {
      return json({ error: "incomplete_weekly_submission", message: `交卷時必須一次提交全部 ${items.length} 題作答。` }, 400);
    }
    const seen = new Set();
    const responses = [];
    for (const response of body.responses) {
      const item = itemByToken.get(String(response?.itemToken || ""));
      if (!item || seen.has(item.itemToken)) {
        return json({ error: "invalid_weekly_item", message: "交卷內容含有不正確或重複的合成題目憑證。" }, 400);
      }
      const optionToken = String(response?.optionToken || "");
      if (!item.options.some(option => option.optionToken === optionToken)) {
        return json({ error: "invalid_weekly_option", message: "交卷內容含有不正確的合成選項憑證。" }, 400);
      }
      seen.add(item.itemToken);
      responses.push({ itemToken: item.itemToken, optionToken });
    }
    session.responses = responses.sort((left, right) => (
      Number(left.itemToken.match(/\.q(\d+)$/)?.[1]) - Number(right.itemToken.match(/\.q(\d+)$/)?.[1])
    ));
    session.complete = true;
    sessions[sessionId] = session;
    writeAssessmentSessions(sessions);
    return json({ ...assessmentEnvelope(session), accepted: true });
  }

  function resumeAssessmentSession(sessionId, init, { resultOnly = false } = {}) {
    const receipt = requestHeader(init, "X-N5-Assessment-Receipt");
    const found = assessmentSession(sessionId, receipt);
    if (found.response) return found.response;
    if (resultOnly && !found.session.complete) {
      return json({ error: "weekly_result_not_ready", message: "完成整份測驗後才能查看結果與詳解。" }, 409);
    }
    return json(assessmentEnvelope(found.session, {
      includeItems: !resultOnly && !found.session.complete
    }));
  }

  function catState() {
    return readJson(localStorage.getItem(catStateKey), { answered: 0 });
  }

  function writeCatState(next) {
    localStorage.setItem(catStateKey, JSON.stringify(next));
  }

  function catEnvelope(answered = 0) {
    const total = 3;
    return {
      sessionId: "preview-cat-session",
      receipt: "preview-cat-receipt",
      expiresAt: expiresAt(),
      complete: answered >= total,
      progress: {
        answered,
        totalMinimum: 3,
        totalMaximum: 3,
        coveredBands: Array.from({ length: Math.min(8, answered * 3) }, (_, index) => index + 1)
      },
      ...(answered < total ? { item: previewItem("cat", answered + 1, total) } : {})
    };
  }

  function catResult() {
    return {
      answered: 3,
      correct: 2,
      accuracy: 67,
      diagnosticIndex: 72,
      readiness: {
        label: "N5 基礎已建立",
        description: "這是合成資料的介面示範；正式結果會依實際作答產生。"
      },
      confidenceLabel: "公開測試示意",
      interval: { low: 64, high: 78 },
      testedPatterns: 3,
      untestedPatterns: 94,
      dimensions: [
        { code: "K", asked: 1, correct: 1, accuracy: 100 },
        { code: "U", asked: 1, correct: 1, accuracy: 100 },
        { code: "A", asked: 1, correct: 0, accuracy: 0 }
      ],
      lessonBands: Array.from({ length: 8 }, (_, index) => ({
        id: `week_0${index + 1}`,
        asked: index < 3 ? 1 : 0,
        accuracy: index < 2 ? 100 : index === 2 ? 0 : null,
        status: index < 2 ? "stable_signal" : index === 2 ? "needs_support" : "not_tested"
      })),
      grammarEvidence: [
        { grammarLabel: "合成句型預覽 01", summary: "L1–L3・介面示意", asked: 1, status: "stable_signal" },
        { grammarLabel: "合成句型預覽 02", summary: "L7–L9・介面示意", asked: 1, status: "needs_support" }
      ],
      recommendations: [
        "先重做標示為優先補強的合成示意題。",
        "正式環境會依實際答題證據產生個人建議。",
        "未抽到的句型不視為已精熟。"
      ]
    };
  }

  function learnerDashboard() {
    const lessonMap = Array.from({ length: 25 }, (_, index) => ({
      lessonNumber: index + 1,
      label: `L${index + 1}`,
      status: index < 3 ? "completed" : index === 3 ? "next" : "not_started",
      accuracy: index < 3 ? [87, 67, 78][index] : null,
      synthetic: index < 3
    }));
    return {
      schemaVersion: "wkl-n5-learning-inbody-preview-v1",
      generatedAt: isoNow(),
      mode: "synthetic_public_preview",
      identity: {
        learnerId: "DEMO-N5-008",
        displayName: "合成學員・小可",
        avatarInitial: "可",
        cohort: "八週陪跑 N5・公開測試"
      },
      provenance: {
        label: "全為合成示範資料",
        warning: "公開測試站不含真實學員個資、題庫答案或正式學習紀錄。"
      },
      snapshot: {
        completedLessons: 3,
        totalLessons: 25,
        coveragePercent: 12,
        practiceAccuracy: 78,
        practiceAsked: 33,
        practiceCorrect: 26,
        weeklyRhythm: "每週 3 次・短回合",
        focusLabel: "應用層再多一次回想"
      },
      dimensions: [
        { code: "K", label: "知識", asked: 18, correct: 16, accuracy: 89, evidenceLabel: "已有多次證據" },
        { code: "U", label: "理解", asked: 18, correct: 14, accuracy: 78, evidenceLabel: "已有多次證據" },
        { code: "A", label: "應用", asked: 18, correct: 12, accuracy: 67, evidenceLabel: "已有多次證據" }
      ],
      nextActions: [
        { order: 1, title: "重做最近兩題錯題", detail: "先不看解析口說一次，再核對完整正解。" },
        { order: 2, title: "補一輪應用題", detail: "用同一句型換人物、時間或地點造句。" },
        { order: 3, title: "48 小時後再測", detail: "用間隔回想確認不是只記得答案。" }
      ],
      lessonMap,
      activity: [
        { activityId: "sample-cat", kind: "cat", label: "N5 CAT 診斷", occurredAt: "2026-10-14T13:30:00.000Z", summary: "完成 36 題，診斷指標 74", synthetic: true },
        { activityId: "sample-l3", kind: "lesson", label: "第 3 課課後測驗", occurredAt: "2026-10-12T10:45:00.000Z", summary: "答對 14／18 題（78%）", synthetic: true },
        { activityId: "sample-l2", kind: "lesson", label: "第 2 課課後測驗", occurredAt: "2026-10-09T12:10:00.000Z", summary: "答對 8／12 題（67%）", synthetic: true }
      ],
      methods: [
        { methodId: "sample-method-01", title: "20 分鐘短回合", summary: "先口說 3 次，再做 3 題；隔天只重做錯題。", cadence: "每週 3 次", durationMinutes: 20, confidence: 4, lastUsedAt: "2026-10-13T11:00:00.000Z" },
        { methodId: "sample-method-02", title: "錯題翻譯對照", summary: "先遮住中文說出日文，再用完整正解檢查助詞與時態。", cadence: "每次課後", durationMinutes: 15, confidence: 3, lastUsedAt: "2026-10-14T11:40:00.000Z" }
      ],
      chat: {
        title: "第 2 週學習回顧",
        messages: [
          { role: "learner", authorLabel: "合成學員", occurredAt: "2026-10-14T12:50:00.000Z", content: "我看得懂規則，但放進句子時常會猶豫。" },
          { role: "coach", authorLabel: "陪跑教練示範", occurredAt: "2026-10-14T13:02:00.000Z", content: "這週先分組整理錯題，再各造一句。" }
        ]
      },
      privacy: {
        storage: "公開測試站僅使用合成資料。",
        browserStorage: "瀏覽器只保存本裝置的短期測試狀態。",
        chatPolicy: "目前聊天全為合成介面資料。"
      }
    };
  }

  function loginHistory() {
    return {
      total: 3,
      records: [
        { occurredAt: isoNow(), method: "password", ipAddress: "測試環境不記錄", userAgent: navigator.userAgent },
        { occurredAt: "2026-10-22T02:20:00.000Z", method: "password", ipAddress: "測試環境不記錄", userAgent: "Safari on macOS（合成）" },
        { occurredAt: "2026-10-18T08:10:00.000Z", method: "one_time_password", ipAddress: "測試環境不記錄", userAgent: "Mobile Safari（合成）" }
      ]
    };
  }

  function practiceTime() {
    return {
      totalSeconds: 6840,
      sessionCount: 6,
      lastPracticedAt: isoNow(),
      records: [
        { label: "第 3 課課後測驗", kind: "lesson", status: "completed", activeSeconds: 1080, answeredCount: 18, startedAt: "2026-10-23T11:20:00.000Z", lastPracticedAt: "2026-10-23T11:38:00.000Z" },
        { label: "第 2 週測驗", kind: "weekly", status: "completed", activeSeconds: 1260, answeredCount: 20, startedAt: "2026-10-21T09:00:00.000Z", lastPracticedAt: "2026-10-21T09:21:00.000Z" },
        { label: "N5 CAT 診斷", kind: "cat", status: "completed", activeSeconds: 1980, answeredCount: 36, startedAt: "2026-10-19T04:00:00.000Z", lastPracticedAt: "2026-10-19T04:33:00.000Z" }
      ]
    };
  }

  async function handleApi(pathname, method, init) {
    const assessmentCreateMatch = pathname.match(/^\/api\/n5-assessments\/(n5w8_(?:week_0[1-8]|final))\/sessions$/);
    if (assessmentCreateMatch && method === "POST") {
      return createAssessmentSession(assessmentCreateMatch[1]);
    }

    const assessmentSubmitMatch = pathname.match(/^\/api\/n5-assessments\/sessions\/([^/]+)\/submit$/);
    if (assessmentSubmitMatch && method === "POST") {
      return submitAssessmentSession(decodeURIComponent(assessmentSubmitMatch[1]), init);
    }

    const assessmentResultMatch = pathname.match(/^\/api\/n5-assessments\/sessions\/([^/]+)\/result$/);
    if (assessmentResultMatch && method === "GET") {
      return resumeAssessmentSession(
        decodeURIComponent(assessmentResultMatch[1]),
        init,
        { resultOnly: true }
      );
    }

    const assessmentSessionMatch = pathname.match(/^\/api\/n5-assessments\/sessions\/([^/]+)$/);
    if (assessmentSessionMatch && method === "GET") {
      return resumeAssessmentSession(decodeURIComponent(assessmentSessionMatch[1]), init);
    }

    if (pathname === "/api/n5-auth/session") {
      if (method === "DELETE") {
        localStorage.removeItem(sessionKey);
        return json({ ended: true });
      }
      const session = signedInPayload();
      return session ? json(session) : json({ error: "authentication_required", message: "請先登入測試帳號。" }, 401);
    }

    if (pathname === "/api/n5-auth/login" && method === "POST") {
      const body = requestBody(init);
      const account = String(body.account || "").trim().toLowerCase();
      const password = String(body.password || "");
      const acceptedAccount = account === "cola" || account === "demo@wangcola.test";
      const oneTime = password === "COLA-ONCE";
      if (!acceptedAccount || (password !== "cola" && !oneTime)) {
        return json({ error: "invalid_credentials", message: "測試帳號或密碼不正確。" }, 401);
      }
      localStorage.setItem(sessionKey, JSON.stringify({
        account,
        passwordChangeRequired: oneTime
      }));
      return json(signedInPayload());
    }

    if (pathname === "/api/n5-auth/forgot-password" && method === "POST") {
      return json({
        message: "公開測試站已產生一次性密碼；不會寄送真實信件。",
        oneTimePassword: "COLA-ONCE"
      });
    }

    if (pathname === "/api/n5-auth/password" && method === "POST") {
      const session = currentSession();
      if (!session) return json({ message: "請先登入。" }, 401);
      localStorage.setItem(sessionKey, JSON.stringify({ ...session, passwordChangeRequired: false }));
      return json({ changed: true });
    }

    if (pathname === "/api/n5-auth/login-history" && method === "GET") return json(loginHistory());
    if (pathname === "/api/n5-auth/practice-time" && method === "GET") return json(practiceTime());

    if (pathname === "/api/n5-auth/practice-sessions" && method === "POST") {
      return json({
        activity: { activityId: `preview-activity-${Date.now()}`, status: "active", startedAt: isoNow() },
        policy: { recommendedHeartbeatSeconds: 30, maxIntervalSeconds: 120 }
      });
    }
    if (/^\/api\/n5-auth\/practice-sessions\//.test(pathname)) {
      return json({ activity: { activityId: pathname.split("/")[4] || "preview-activity", status: pathname.endsWith("/complete") ? "completed" : "active", lastPracticedAt: isoNow() } });
    }

    if (pathname === "/api/n5-lessons" && method === "GET") {
      const counts = [6, 5, 4, 4, 4, 4, 4, 6, 5, 5, 3, 3, 3, 3, 4, 5, 4, 3, 3, 4, 3, 4, 2, 4, 2];
      return json({
        lessons: counts.map((count, index) => ({
          lessonNumber: index + 1,
          patternPreviews: Array.from({ length: count }, (_, patternIndex) => `句型預覽 ${String(patternIndex + 1).padStart(2, "0")}（合成）`)
        }))
      });
    }

    if (/^\/api\/n5-lessons\/L\d+\/sessions$/.test(pathname) && method === "POST") {
      const lessonNumber = lessonNumberFromPath(pathname);
      writeLessonState(lessonNumber, { answered: 0 });
      return json(lessonEnvelope(lessonNumber, 0));
    }

    if (/^\/api\/n5-lessons\/sessions\/preview-lesson-\d+\/responses$/.test(pathname) && method === "POST") {
      const lessonNumber = lessonNumberFromPath(pathname);
      const next = Math.min(3, Number(readLessonState(lessonNumber).answered || 0) + 1);
      writeLessonState(lessonNumber, { answered: next });
      return next >= 3
        ? json({ ...lessonEnvelope(lessonNumber, next), result: lessonResult(lessonNumber) })
        : json(lessonEnvelope(lessonNumber, next));
    }

    if (/^\/api\/n5-lessons\/sessions\/preview-lesson-\d+\/result$/.test(pathname)) {
      return json({ result: lessonResult(lessonNumberFromPath(pathname)) });
    }

    if (/^\/api\/n5-lessons\/sessions\/preview-lesson-\d+$/.test(pathname)) {
      const lessonNumber = lessonNumberFromPath(pathname);
      const state = readLessonState(lessonNumber);
      return Number(state.answered) >= 3
        ? json({ ...lessonEnvelope(lessonNumber, 3), result: lessonResult(lessonNumber) })
        : json(lessonEnvelope(lessonNumber, Number(state.answered || 0)));
    }

    if (pathname === "/api/n5-cat/sessions" && method === "POST") {
      writeCatState({ answered: 0 });
      return json(catEnvelope(0));
    }

    if (pathname === "/api/n5-cat/sessions/preview-cat-session/responses" && method === "POST") {
      const answered = Math.min(3, Number(catState().answered || 0) + 1);
      writeCatState({ answered });
      return answered >= 3
        ? json({ ...catEnvelope(answered), result: catResult() })
        : json(catEnvelope(answered));
    }

    if (pathname === "/api/n5-cat/sessions/preview-cat-session") {
      const answered = Number(catState().answered || 0);
      return answered >= 3
        ? json({ ...catEnvelope(answered), result: catResult() })
        : json(catEnvelope(answered));
    }

    if (pathname === "/api/n5-learner/demo-sessions" && method === "POST") {
      return json({ sessionId: "preview-inbody-session", receipt: "preview-inbody-receipt", expiresAt: expiresAt(), dashboard: learnerDashboard() });
    }
    if (pathname === "/api/n5-learner/sessions/preview-inbody-session/sync" && method === "POST") {
      return json({ dashboard: learnerDashboard(), sync: { imported: 0, unchanged: 0, unavailable: 0 } });
    }
    if (pathname === "/api/n5-learner/sessions/preview-inbody-session") {
      return json({ expiresAt: expiresAt(), dashboard: learnerDashboard() });
    }

    return json({ error: "preview_endpoint_unavailable", message: "此公開測試站僅模擬學員端流程。" }, 404);
  }

  window.fetch = async function previewFetch(input, init = {}) {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url, location.href);
    let pathname = url.pathname;
    if (appBase && pathname.startsWith(`${appBase}/`)) pathname = pathname.slice(appBase.length);
    if (!pathname.startsWith("/api/")) return nativeFetch(input, init);
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    return handleApi(pathname, method, init);
  };
})();
