const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Review = require("../wrong-review-core.js");

function question(id, dueDate = "2026-07-29", reviews = []) {
  return {
    id,
    status: "active",
    priority: 3,
    reviews: [...reviews, { round: reviews.length, dueDate, completedAt: null, score: null }]
  };
}

test("Fisher–Yates returns a unique permutation without mutating input", () => {
  const source = ["a", "b", "c", "d"];
  const shuffled = Review.fisherYates(source, () => 0);
  assert.deepEqual(source, ["a", "b", "c", "d"]);
  assert.equal(new Set(shuffled).size, 4);
  assert.deepEqual([...shuffled].sort(), source);
});

test("eligible pool excludes archived, mastered, completed today, and missing plans", () => {
  const today = "2026-07-29";
  const eligible = question("eligible");
  const archived = { ...question("archived"), status: "archived" };
  const mastered = question("mastered", "2026-08-01", [
    { round: 0, dueDate: "2026-07-01", completedAt: "2026-07-01", score: 5 },
    { round: 1, dueDate: "2026-07-10", completedAt: "2026-07-10", score: 5 }
  ]);
  const scoredToday = question("today", "2026-08-01", [
    { round: 0, dueDate: today, completedAt: today, score: 3 }
  ]);
  const noPlan = { id: "none", status: "active", reviews: [] };
  assert.deepEqual(Review.candidateIds([eligible, archived, mastered, scoredToday, noPlan], today), ["eligible"]);
});

test("initial draw caps at 20 and handles a smaller pool", () => {
  const many = Array.from({ length: 27 }, (_, index) => question(`q${index}`));
  assert.equal(Review.drawSessionIds(many, "2026-07-29", { random: () => 0.5 }).length, 20);
  assert.equal(Review.drawSessionIds(many.slice(0, 7), "2026-07-29").length, 7);
});

test("redraw avoids current batch first then refills from its unscored questions", () => {
  const rows = Array.from({ length: 25 }, (_, index) => question(`q${index}`));
  const currentIds = rows.slice(0, 20).map((item) => item.id);
  const next = Review.drawSessionIds(rows, "2026-07-29", { currentIds, refillCurrent: true, random: () => 0 });
  assert.equal(next.length, 20);
  assert.deepEqual(new Set(next.slice(0, 5)), new Set(["q20", "q21", "q22", "q23", "q24"]));
  assert.equal(new Set(next).size, 20);
});

test("cross-day session rebuild preserves preferences but not the old batch", () => {
  const old = Review.createSession([question("old")], "2026-07-28", {
    filters: { status: "early", subject: "数学", priority: "5", sort: "priority" },
    viewMode: "cards"
  });
  const rebuilt = Review.cleanSession(old, [question("new")], "2026-07-29");
  assert.deepEqual(rebuilt.questionIds, ["new"]);
  assert.equal(rebuilt.viewMode, "cards");
  assert.equal(rebuilt.filters.status, "early");
  assert.equal(rebuilt.filters.subject, "数学");
});

test("drawing a session never rewrites review plans", () => {
  const rows = [question("q1", "2026-08-02"), question("q2", "2026-07-20")];
  const before = structuredClone(rows);
  Review.createSession(rows, "2026-07-29", {}, { random: () => 0.25 });
  assert.deepEqual(rows, before);
});

test("status, subject, priority, and due/priority sorting compose", () => {
  const item = (id, dueDate, subject, priority) => ({
    question: { id, title: id, subject, priority },
    review: { dueDate }
  });
  const rows = [
    item("overdue", "2026-07-28", "数学", 3),
    item("today-low", "2026-07-29", "英语", 2),
    item("today-high", "2026-07-29", "数学", 5),
    item("early", "2026-08-01", "数学", 4)
  ];
  assert.deepEqual(Review.filterSessionItems(rows, "2026-07-29", { status: "today" }).map((row) => row.question.id), ["today-high", "today-low"]);
  assert.deepEqual(Review.filterSessionItems(rows, "2026-07-29", { subject: "数学", priority: "4" }).map((row) => row.question.id), ["early"]);
  assert.deepEqual(Review.filterSessionItems(rows, "2026-07-29", { sort: "priority" }).map((row) => row.question.id), ["today-high", "early", "overdue", "today-low"]);
});

test("review workspace markup includes required controls and responsive landmarks", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for (const marker of [
    "wrong-review-stats",
    "重新抽 20 道",
    "提前复盘",
    "wrong-review-workspace",
    "先尝试回忆答案",
    "本轮复盘评分",
    "data-action=\"wrong-review-prev\"",
    "data-action=\"wrong-review-next\""
  ]) assert.match(html, new RegExp(marker));
  assert.match(html, /@media \(max-width: 768px\)/);
  assert.match(html, /grid-template-columns:\s*minmax\(0,\s*39fr\)\s+minmax\(0,\s*61fr\)/);
});

test("AI analysis rewrite starts directly without reopening the edit dialog", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /data-action="run-ai-rewrite-cxy-analysis"/);
  assert.match(html, /if \(action === "run-ai-rewrite-cxy-analysis"\) runCxyOnlyAnalysisRewrite\(wrongId, actionTarget\)/);
  assert.match(html, /function runCxyOnlyAnalysisRewrite\(wrongId, button\)[\s\S]*?direct: true/);
  assert.doesNotMatch(html, /if \(action === "open-ai-rewrite-cxy-analysis"\)/);
});
