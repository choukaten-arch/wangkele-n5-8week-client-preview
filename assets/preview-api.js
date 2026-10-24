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
