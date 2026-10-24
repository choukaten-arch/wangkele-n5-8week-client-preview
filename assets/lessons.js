const MANIFEST_URL = "../data/lesson-assessments.json";

const WEEK_GROUPS = [
  { week: 1, start: 1, end: 3 },
  { week: 2, start: 4, end: 6 },
  { week: 3, start: 7, end: 9 },
  { week: 4, start: 10, end: 12 },
  { week: 5, start: 13, end: 15 },
  { week: 6, start: 16, end: 18 },
  { week: 7, start: 19, end: 21 },
  { week: 8, start: 22, end: 25 }
];

const STATUS_COPY = {
  released: { label: "完整課測", note: "本課題目均在目前核准範圍" },
  mixed_pilot: { label: "含試行題", note: "結果會分開呈現已核准與試行題" },
  trial_only: { label: "試行練習", note: "全為試行題，不代表正式精熟" }
};

const lessonGroups = document.querySelector("#lessonGroups");
const errorBox = document.querySelector("#lessonIndexError");
const reloadButton = document.querySelector("#reloadLessons");

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderLessonCard(lesson) {
  const status = STATUS_COPY[lesson.status] || STATUS_COPY.mixed_pilot;
  const card = make("article", `lesson-card lesson-card-${lesson.status}`);
  const header = make("header", "lesson-card-header");
  header.append(
    make("span", "lesson-number", lesson.lesson_label),
    make("span", `lesson-status ${lesson.status}`, status.label)
  );

  const title = make("h3", "", lesson.label);
  const note = make("p", "lesson-card-note", status.note);
  const specs = make("dl", "lesson-card-specs");
  [
    [String(lesson.question_count), "題目"],
    [String(lesson.pattern_count), "句型"],
    [`${lesson.duration_minutes} 分`, "預估"]
  ].forEach(([value, label]) => {
    const item = document.createElement("div");
    item.append(make("dt", "", label), make("dd", "", value));
    specs.append(item);
  });

  const evidence = make("p", "lesson-card-evidence");
  if (lesson.status === "released") {
    evidence.textContent = `${lesson.released_question_count} 題已核准`;
  } else if (lesson.status === "trial_only") {
    evidence.textContent = `${lesson.trial_question_count} 題試行練習`;
  } else {
    evidence.textContent = `${lesson.released_question_count} 題已核准・${lesson.trial_question_count} 題試行`;
  }

  const link = make("a", "lesson-card-link");
  link.href = `../lesson/?lesson=${lesson.lesson_number}`;
  link.setAttribute("aria-label", `開始${lesson.label}測驗，${lesson.question_count} 題，約 ${lesson.duration_minutes} 分鐘`);
  link.append(make("span", "", "開始本課測驗"), make("i", "", "→"));

  card.append(header, title, note, specs, evidence, link);
  return card;
}

function renderManifest(manifest) {
  const lessons = Array.isArray(manifest.lessons) ? manifest.lessons : [];
  if (lessons.length !== 25) throw new Error("課次清單不完整");

  document.querySelector("#lessonTotal").textContent = String(manifest.totals?.lesson_count ?? 25);
  document.querySelector("#patternTotal").textContent = String(manifest.totals?.grammar_pattern_count ?? 97);
  document.querySelector("#questionTotal").textContent = String(manifest.totals?.question_count ?? 291);

  lessonGroups.replaceChildren(...WEEK_GROUPS.map(group => {
    const section = make("section", "lesson-week-group");
    const heading = make("header", "lesson-week-heading");
    const label = make("div");
    label.append(
      make("span", "lesson-week-index", `W${group.week}`),
      make("h2", "", `第 ${group.week} 週・L${group.start}–L${group.end}`)
    );
    heading.append(label, make("p", "", `本週 ${group.end - group.start + 1} 課逐課確認`));

    const grid = make("div", "lesson-card-grid");
    const matching = lessons.filter(lesson => (
      lesson.lesson_number >= group.start && lesson.lesson_number <= group.end
    ));
    grid.append(...matching.map(renderLessonCard));
    section.append(heading, grid);
    return section;
  }));
}

async function loadLessons() {
  lessonGroups.classList.remove("hidden");
  errorBox.classList.add("hidden");
  try {
    const response = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderManifest(await response.json());
  } catch {
    lessonGroups.classList.add("hidden");
    errorBox.classList.remove("hidden");
  }
}

reloadButton.addEventListener("click", loadLessons);
loadLessons();
