const hasDocument = typeof document !== "undefined";
const grid = hasDocument ? document.querySelector("#assessmentGrid") : null;
const menuToggle = hasDocument ? document.querySelector(".menu-toggle") : null;
const primaryNav = hasDocument ? document.querySelector("#primaryNav") : null;

function makeElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function statusText(status) {
  const labels = {
    preview: "可預覽",
    planned: "規劃中",
    customer_testing: "客戶驗收",
    customer_testing_with_trial_items: "含試行題"
  };
  return labels[status] || "狀態未明";
}

export function organizeAssessments(assessments) {
  if (!Array.isArray(assessments) || assessments.length !== 9) {
    throw new Error("program manifest must contain nine assessments");
  }

  const ids = assessments.map(item => item?.id);
  if (ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) {
    throw new Error("program manifest assessment ids must be present and unique");
  }
  if (assessments.some(item => ![
    "preview",
    "planned",
    "customer_testing",
    "customer_testing_with_trial_items"
  ].includes(item?.status))) {
    throw new Error("program manifest contains an unsupported assessment status");
  }

  const weekly = assessments
    .filter(item => item.kind === "weekly")
    .sort((left, right) => left.sequence - right.sequence);
  const finals = assessments.filter(item => item.kind === "final");
  const expectedWeeklySequence = Array.from({ length: 8 }, (_, index) => index + 1);

  if (
    weekly.length !== 8
    || finals.length !== 1
    || weekly.some((item, index) => item.sequence !== expectedWeeklySequence[index])
    || finals[0].sequence !== 9
  ) {
    throw new Error("program manifest must contain W01–W08 followed by one final");
  }

  return Object.freeze({
    firstHalf: Object.freeze(weekly.slice(0, 4)),
    secondHalf: Object.freeze(weekly.slice(4, 8)),
    final: finals[0]
  });
}

function createAssessmentCard(item) {
  const card = makeElement("article", `week-card${item.kind === "final" ? " final-card" : ""}`);

  const index = makeElement("div", "week-index");
  index.append(
    makeElement("b", "", item.kind === "final" ? "FINAL" : `W${String(item.sequence).padStart(2, "0")}`),
    makeElement("span", `status-pill ${item.status}`, statusText(item.status))
  );

  const heading = makeElement("h4", "", item.label);
  heading.append(makeElement("span", "", item.lesson_label));

  const details = makeElement("div", "week-details");
  const detailLabels = item.kind === "final"
    ? [`${item.question_count} 題`, `${item.duration_minutes} 分鐘`, "核准母題庫抽題版"]
    : [
        `${item.question_count} 題`,
        `${item.pattern_count} 文型`,
        item.status === "customer_testing_with_trial_items"
          ? "含 8 題待審試行題"
          : item.review_count
            ? `${item.review_count} 題螺旋複習`
            : "本週內容起點"
      ];
  for (const label of detailLabels) details.append(makeElement("span", "", label));

  const link = makeElement("a", "week-link");
  link.href = `./assessment/?id=${encodeURIComponent(item.id)}`;
  link.append(
    document.createTextNode(item.kind === "final" ? "開始期末驗收" : "開始測驗"),
    makeElement("span", "", "→")
  );
  link.setAttribute("aria-label", `${item.label} ${item.lesson_label} 客戶驗收測驗`);

  card.append(index, heading, details, link);
  return card;
}

function createPhase({ id, kicker, title, items, final = false }) {
  const phase = makeElement("section", `assessment-phase${final ? " assessment-final-phase" : ""}`);
  const headingId = `${id}-title`;
  phase.setAttribute("aria-labelledby", headingId);

  const phaseHeading = makeElement("div", "assessment-phase-heading");
  phaseHeading.append(
    makeElement("span", "", kicker),
    makeElement("h3", "", title)
  );

  const phaseGrid = makeElement("div", `assessment-phase-grid${final ? " assessment-final-grid" : ""}`);
  phaseGrid.append(...items.map(createAssessmentCard));
  phaseHeading.querySelector("h3").id = headingId;
  phase.append(phaseHeading, phaseGrid);
  return phase;
}

async function loadProgram() {
  grid.setAttribute("aria-busy", "true");
  try {
    const url = new URL("../data/program.json", import.meta.url);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const program = await response.json();
    const groups = organizeAssessments(program.assessments);

    grid.replaceChildren(
      createPhase({
        id: "weekly-first-half",
        kicker: "前半",
        title: "W01–W04・L1–L12",
        items: groups.firstHalf
      }),
      createPhase({
        id: "weekly-second-half",
        kicker: "後半",
        title: "W05–W08・L13–L25",
        items: groups.secondHalf
      }),
      createPhase({
        id: "weekly-final",
        kicker: "總整",
        title: "FINAL・L1–L25",
        items: [groups.final],
        final: true
      })
    );
    grid.setAttribute("aria-busy", "false");
  } catch (error) {
    const state = makeElement("p", "loading-state", "八週安排載入失敗，請確認本機預覽伺服器已啟動。");
    state.setAttribute("role", "alert");
    grid.replaceChildren(state);
    grid.setAttribute("aria-busy", "false");
    console.error("Failed to load N5 eight-week program", error);
  }
}

function setupNavigation() {
  if (!menuToggle || !primaryNav) return;
  const disclosures = [...primaryNav.querySelectorAll("details")];
  const mobileMenu = window.matchMedia("(max-width: 980px)");

  const closeDisclosures = exception => {
    for (const disclosure of disclosures) {
      if (disclosure !== exception) disclosure.removeAttribute("open");
    }
  };

  const closeMobileMenu = () => {
    primaryNav.classList.remove("is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    closeDisclosures();
  };

  menuToggle.addEventListener("click", () => {
    const nextOpen = !primaryNav.classList.contains("is-open");
    primaryNav.classList.toggle("is-open", nextOpen);
    menuToggle.setAttribute("aria-expanded", String(nextOpen));
    if (!nextOpen) closeDisclosures();
  });

  for (const disclosure of disclosures) {
    disclosure.addEventListener("toggle", () => {
      if (disclosure.open) closeDisclosures(disclosure);
    });
  }

  primaryNav.addEventListener("click", event => {
    if (event.target.closest("a") && mobileMenu.matches) closeMobileMenu();
  });

  document.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    closeDisclosures();
    if (mobileMenu.matches) closeMobileMenu();
    menuToggle.focus();
  });

  mobileMenu.addEventListener("change", event => {
    if (!event.matches) closeMobileMenu();
  });
}

if (grid) loadProgram();
if (hasDocument) setupNavigation();
