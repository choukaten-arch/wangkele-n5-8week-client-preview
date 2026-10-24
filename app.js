const weeks = [
  { week: "01", lessons: "第 1–3 課", status: "起點建立", note: "課程預覽／週測 20 題" },
  { week: "02", lessons: "第 4–6 課", status: "概念穩定", note: "課程預覽／週測 20 題" },
  { week: "03", lessons: "第 7–9 課", status: "開始串聯", note: "課程預覽／週測 20 題" },
  { week: "04", lessons: "第 10–12 課", status: "中段回看", note: "課程預覽／週測 20 題" },
  { week: "05", lessons: "第 13–15 課", status: "應用加深", note: "課程預覽／週測 20 題" },
  { week: "06", lessons: "第 16–18 課", status: "弱點補強", note: "課程預覽／週測 20 題" },
  { week: "07", lessons: "第 19–21 課", status: "完整作答", note: "課程預覽／週測 20 題" },
  { week: "08", lessons: "第 22–25 課", status: "完成收束", note: "課程預覽／週測 20 題" },
];

const catProfiles = {
  steady: { score: 72, label: "合成結果／穩定前進", headline: "基礎已成形，保持當週練習節奏。", copy: "建議完成本週錯題回看，並依原進度進入下一週。本數值僅作 UI 驗收。" },
  review: { score: 51, label: "合成結果／需再複習", headline: "先縮小範圍，回到最需要的一組概念。", copy: "建議使用分課練習完成一次短回合，再重新診斷。本數值僅作 UI 驗收。" },
  ready: { score: 88, label: "合成結果／進階準備", headline: "N5 應用已穩定，可進入 N4 銜接建議。", copy: "建議先完成期末綜合測驗，再由能力分布確認進階路徑。本數值僅作 UI 驗收。" },
};

const weekGrid = document.querySelector("#week-grid");
weekGrid.innerHTML = weeks.map((item) => `
  <article class="week-card">
    <span class="week-no">${item.week}</span>
    <small>WEEK</small>
    <h3>${item.lessons}・${item.status}</h3>
    <p>${item.note}</p>
  </article>
`).join("");

const lessonGrid = document.querySelector("#lesson-grid");
lessonGrid.innerHTML = Array.from({ length: 25 }, (_, index) => {
  const lesson = String(index + 1).padStart(2, "0");
  return `
    <article class="lesson-card">
      <button type="button" aria-expanded="false" aria-controls="lesson-detail-${lesson}">
        <span class="lesson-no">${lesson}</span>
        <span><strong>第 ${index + 1} 課</strong><small>點擊預覽</small></span>
      </button>
      <div class="lesson-detail" id="lesson-detail-${lesson}">
        <p>本版不含真實教材內容。</p>
        <ul><li>合成句型標籤 A</li><li>合成句型標籤 B</li><li>合成句型標籤 C</li></ul>
      </div>
    </article>`;
}).join("");

lessonGrid.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  const card = button.closest(".lesson-card");
  const expanded = button.getAttribute("aria-expanded") === "true";
  lessonGrid.querySelectorAll(".lesson-card.is-open").forEach((openCard) => {
    openCard.classList.remove("is-open");
    openCard.querySelector("button").setAttribute("aria-expanded", "false");
  });
  if (!expanded) {
    card.classList.add("is-open");
    button.setAttribute("aria-expanded", "true");
  }
});

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector("#primary-nav");
menuToggle.addEventListener("click", () => {
  const open = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!open));
  nav.classList.toggle("is-open", !open);
});
nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) {
    menuToggle.setAttribute("aria-expanded", "false");
    nav.classList.remove("is-open");
  }
});

const quizInputs = document.querySelectorAll('input[name="demo-answer"]');
const quizButton = document.querySelector("#quiz-submit");
const quizFeedback = document.querySelector("#quiz-feedback");
quizInputs.forEach((input) => input.addEventListener("change", () => {
  quizButton.disabled = false;
  quizFeedback.textContent = `已選擇選項 ${input.value}，可確認作答。`;
}));
quizButton.addEventListener("click", () => {
  quizFeedback.textContent = "已記錄這次互動。本版不進行正誤判定，也不儲存資料。";
  quizButton.textContent = "已完成示意";
});

document.querySelectorAll(".cat-switch").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".cat-switch").forEach((item) => {
      item.classList.toggle("is-active", item === button);
      item.setAttribute("aria-pressed", String(item === button));
    });
    const profile = catProfiles[button.dataset.profile];
    document.querySelector("#cat-score").textContent = profile.score;
    document.querySelector("#cat-label").textContent = profile.label;
    document.querySelector("#cat-headline").textContent = profile.headline;
    document.querySelector("#cat-copy").textContent = profile.copy;
  });
});

const navLinks = [...document.querySelectorAll(".primary-nav a")];
const sections = navLinks.map((link) => document.querySelector(link.getAttribute("href"))).filter(Boolean);
const observer = new IntersectionObserver((entries) => {
  const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  navLinks.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === `#${visible.target.id}`));
}, { rootMargin: "-20% 0px -65%", threshold: [0, .15, .5] });
sections.forEach((section) => observer.observe(section));
