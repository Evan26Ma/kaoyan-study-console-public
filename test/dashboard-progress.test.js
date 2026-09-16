const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function extractFunction(source, name, nextName) {
  const start = source.indexOf(`function ${name}(`);
  const end = source.indexOf(`function ${nextName}(`, start);
  assert.notEqual(start, -1, `${name} must exist`);
  assert.notEqual(end, -1, `${nextName} must follow ${name}`);
  return source.slice(start, end);
}

function node() {
  return {
    textContent: "",
    style: {},
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

test("dashboard progress includes today's daily tasks", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const renderStatsSource = extractFunction(html, "renderStats", "renderSubjectBars");
  const nodes = new Proxy({}, { get: (target, key) => target[key] ||= node() });

  const context = {
    state: {
      profile: { dailyCapacity: 8, examDate: "", targetSchool: "", targetMajor: "" },
      reflections: []
    },
    elements: nodes,
    document: { querySelector: () => node() },
    todayKey: () => "2026-07-28",
    getAllReviewItems: () => [],
    isArchived: () => false,
    getManual45ScheduleForDate: () => null,
    manual45ItemsForSchedule: () => [],
    getAllWrongReviewItems: () => [],
    isWrongArchived: () => false,
    getDailyTasksForDate: () => [{ status: "done" }, { status: "planned" }],
    getPendingReviewItems: () => [],
    compareDate: () => 0,
    getWeekStats: () => ({ total: 0, done: 0, percent: 0 }),
    getCurrentPhase: () => null,
    getStudyDurationStats: () => ({ today: 0, week: 0, month: 0, phase: 0, weekStart: "2026-07-27" }),
    formatStudyHours: () => "0小时",
    formatDate: (value) => value,
    formatFullDate: (value) => value,
    renderSubjectBars: () => {},
    DEFAULT_PROFILE: { dailyCapacity: 8 }
  };

  vm.runInNewContext(`${renderStatsSource}; renderStats();`, context);

  assert.equal(nodes.progressPercent.textContent, "50%");
  assert.equal(nodes.progressTrack.attributes["aria-valuenow"], "50");
  assert.equal(nodes.progressBar.style.width, "50%");
});

test("dashboard progress excludes wrong-question reviews", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const renderStatsSource = extractFunction(html, "renderStats", "renderSubjectBars");
  const nodes = new Proxy({}, { get: (target, key) => target[key] ||= node() });

  const context = {
    state: {
      profile: { dailyCapacity: 8, examDate: "", targetSchool: "", targetMajor: "" },
      reflections: []
    },
    elements: nodes,
    document: { querySelector: () => node() },
    todayKey: () => "2026-07-29",
    getAllReviewItems: () => [],
    isArchived: () => false,
    getManual45ScheduleForDate: () => null,
    manual45ItemsForSchedule: () => [],
    getAllWrongReviewItems: () => [
      { question: {}, review: { dueDate: "2026-07-29", completedAt: "2026-07-29", score: 5 } },
      { question: {}, review: { dueDate: "2026-07-29", completedAt: "2026-07-29", score: 4 } }
    ],
    isWrongArchived: () => false,
    getDailyTasksForDate: () => [{ status: "done" }, { status: "planned" }],
    getPendingReviewItems: () => [],
    compareDate: () => 0,
    getWeekStats: () => ({ total: 0, done: 0, percent: 0 }),
    getCurrentPhase: () => null,
    getStudyDurationStats: () => ({ today: 0, week: 0, month: 0, phase: 0, weekStart: "2026-07-27" }),
    formatStudyHours: () => "0小时",
    formatDate: (value) => value,
    formatFullDate: (value) => value,
    renderSubjectBars: () => {},
    DEFAULT_PROFILE: { dailyCapacity: 8 }
  };

  vm.runInNewContext(`${renderStatsSource}; renderStats();`, context);

  assert.equal(nodes.progressPercent.textContent, "50%");
  assert.equal(nodes.progressTrack.attributes["aria-valuenow"], "50");
});
