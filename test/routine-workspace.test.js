const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const core = fs.readFileSync(path.join(__dirname, "..", "schedule-core.js"), "utf8");

test("routine navigation and dashboard current-slot card are wired", () => {
  assert.match(html, /data-view="routine"/);
  assert.match(html, /id="dashboardRoutineCard"/);
  assert.match(html, /function renderDashboardRoutineCard\(\)/);
  assert.match(html, /function renderRoutineView\(\)/);
  assert.match(html, /routineRefreshTimer/);
  assert.match(html, /setInterval\(\(\) => \{/);
});

test("routine timeline exposes date controls, slot editing, task reassignment, and focus notes", () => {
  assert.match(html, /id="routineSlotDialog"/);
  assert.match(html, /data-action="restore-default-routine"/);
  assert.match(html, /data-routine-task-slot/);
  assert.match(html, /id="routineDateField"/);
  assert.match(html, /routine-focus-notes/);
  assert.match(html, /routine-flexible/);
});

test("daily task form persists optional routine slot without replacing planning linkage", () => {
  assert.match(html, /id="dailyTaskScheduleSlotField"/);
  assert.match(html, /scheduleSlotId: document\.querySelector\("#dailyTaskScheduleSlotField"\)\.value/);
  assert.match(html, /linkedPlanId,/);
  assert.match(html, /version: Math\.max\(7, 8/);
  assert.match(html, /studyRoutine = window\.ScheduleCore/);
});

test("routine core contains matching precedence and cross-midnight support", () => {
  assert.match(core, /const manual = cleanText\(task && task\.scheduleSlotId/);
  assert.match(core, /const byTime = matchTaskByTime/);
  assert.match(core, /const byKeywords = matchTaskByKeywords/);
  assert.match(core, /for \(const shift of \[-1440, 0, 1440\]\)/);
  assert.match(core, /night-rest/);
});
