const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const { redactPrivateState, preserveRedactedPrivateState } = require("../server.js");

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  let depth = 0;
  let seenBody = false;
  for (let index = source.indexOf("{", start); index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") { depth += 1; seenBody = true; }
    if (char === "}") depth -= 1;
    if (seenBody && depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`${name} has no closing brace`);
}

function loadExamPlanNormalizer() {
  const names = ["examPlanDefaultSubjects", "examPlanTiers", "normalizeExamPlan", "cleanText", "clampNumber", "isDateKey", "isDateKeyFormat", "parseDateKey", "toDateKey", "compareDate"];
  const context = {};
  vm.runInNewContext(`${names.map((name) => extractFunction(html, name)).join("\n")}\nthis.normalizeExamPlan = normalizeExamPlan;`, context);
  return context.normalizeExamPlan;
}

const samplePlan = {
  subjects: [{ name: "政治", full: 100, goal: 70 }, { name: "英语一", full: 100, goal: 70 }, { name: "数学一", full: 150, goal: 120 }, { name: "专业课", full: 150, goal: 120 }],
  schools: [{ tier: "稳", name: "示例大学", retestLine: 345, lines: [55, 55, 90, 90] }],
  mocks: [{ date: "2026-11-01", scores: [68, 62, 108, 112] }]
};

test("exam plan normalizes subjects, schools and mocks with safe bounds", () => {
  const normalizeExamPlan = loadExamPlanNormalizer();
  const empty = JSON.parse(JSON.stringify(normalizeExamPlan(undefined)));
  assert.deepEqual(empty.subjects.map((subject) => [subject.name, subject.full, subject.goal]), [["政治", 100, 0], ["英语一", 100, 0], ["数学一", 150, 0], ["专业课", 150, 0]]);
  assert.deepEqual([empty.schools.length, empty.mocks.length], [0, 0]);

  const plan = JSON.parse(JSON.stringify(normalizeExamPlan({
    subjects: [{ name: "政治", full: 100, goal: 999 }],
    schools: [{ name: "  " }, { tier: "冲", name: "A 大学", retestLine: 900, lines: [60, 60, 999, 95] }, { name: "B" }, { name: "C" }, { name: "D" }],
    mocks: [{ date: "2026-11-01", name: "第 3 次", scores: [68, 62, 108, 112] }, { date: "bad", scores: [1] }, { date: "2026-10-18", scores: [64, 58, 101, 105] }]
  })));
  assert.equal(plan.subjects[0].goal, 100, "目标分不超过满分");
  assert.deepEqual(plan.schools.map((school) => school.name), ["A 大学", "B"], "最多三所，空校名丢弃");
  assert.equal(plan.schools[0].retestLine, 500);
  assert.equal(plan.schools[0].lines[2], 150, "单科线不超过满分");
  assert.equal(plan.schools[1].tier, "稳", "缺省定位为稳");
  assert.deepEqual(plan.mocks.map((mock) => mock.date), ["2026-10-18", "2026-11-01"], "模考按日期排序并丢弃无效日期");
});

test("exam plan is private: hidden when locked and kept when a locked page saves", () => {
  const state = { profile: { targetSchool: "示例大学", examDate: "2026-12-19", examPlan: samplePlan }, dailyTasks: [] };
  const redacted = redactPrivateState(state);
  assert.equal(redacted.profile.examPlan, undefined);
  assert.ok(state.profile.examPlan, "不修改服务器上的原数据");

  const incoming = { profile: { targetSchool: "", examDate: "", examPlan: { subjects: samplePlan.subjects, schools: [], mocks: [] } }, dailyTasks: [] };
  const preserved = preserveRedactedPrivateState(state, incoming, false);
  assert.deepEqual(preserved.profile.examPlan, samplePlan);

  const unlockedSave = preserveRedactedPrivateState(state, incoming, true);
  assert.equal(unlockedSave.profile.examPlan.schools.length, 0, "解锁状态下允许清空");
});

test("dashboard renders the journey wall and target panel with their controls", () => {
  assert.match(html, /id="journeyPanel"/);
  assert.match(html, /id="targetPanel"/);
  assert.match(html, /id="targetPlanDialog"/);
  assert.match(html, /renderJourneyPanel\(\);\s*renderDashboardRoutineCard\(\);\s*renderTargetPanel\(\);/);
  assert.match(html, /data-action="set-journey-mode" data-mode="subject"/);
  assert.match(html, /WRITE_ACTIONS = new Set\(\[\s*"open-target-plan-dialog",\s*"save-target-plan",/);
  assert.match(html, /examPlan: normalizeExamPlan\(source\.examPlan\)/);
  assert.match(html, /profile\.examPlan = normalizeExamPlan\(\{\}\);/, "锁定时本地数据也清掉院校与模考");
  assert.match(html, /@media \(prefers-reduced-motion: reduce\) \{ \.jw-d\.is-today \{ animation: none; \}/);
});
