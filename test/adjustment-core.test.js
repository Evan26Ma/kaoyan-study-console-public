const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../adjustment-core.js");

function baseState() {
  return {
    profile: { defaultCapacityMinutes: 180, capacityOverrides: {}, durationDefaults: core.DEFAULT_DURATION_DEFAULTS },
    plans: [
      { id: "week", type: "week", startDate: "2026-07-27", endDate: "2026-08-02", goal: "完成所有任务", priority: 4 },
      { id: "day29", type: "day", parentId: "week", date: "2026-07-29", startDate: "2026-07-29" },
      { id: "day30", type: "day", parentId: "week", date: "2026-07-30", startDate: "2026-07-30" }
    ],
    dailyTasks: [], tasks: [], wrongQuestions: [], englishReading: { lexicalEntries: [] }
  };
}

test("task estimates prefer explicit value, then recent median, then type default", () => {
  const history = [30, 60, 90].map((studyMinutes, index) => ({ status: "done", subject: "英语", category: "刷题", studyMinutes, completedAt: `2026-07-2${index}` }));
  assert.deepEqual(core.estimateTaskMinutes({ estimatedMinutes: 45, subject: "英语", category: "刷题" }, history, {}), { minutes: 45, source: "explicit" });
  assert.deepEqual(core.estimateTaskMinutes({ subject: "英语", category: "刷题" }, history, {}), { minutes: 60, source: "history" });
  assert.deepEqual(core.estimateTaskMinutes({ subject: "政治", category: "刷题" }, history, {}), { minutes: 90, source: "default" });
});

test("estimated completion is excluded from historical duration samples", () => {
  const history = [
    { status: "done", subject: "英语", category: "刷题", studyMinutes: 240, studyMinutesSource: "estimated", completedAt: "2026-07-29" },
    { status: "done", subject: "英语", category: "刷题", studyMinutes: 30, studyMinutesSource: "actual", completedAt: "2026-07-28" },
    { status: "done", subject: "英语", category: "刷题", studyMinutes: 60, studyMinutesSource: "actual", completedAt: "2026-07-27" },
    { status: "done", subject: "英语", category: "刷题", studyMinutes: 90, studyMinutesSource: "actual", completedAt: "2026-07-26" }
  ];
  assert.deepEqual(core.estimateTaskMinutes({ subject: "英语", category: "刷题" }, history, {}), { minutes: 60, source: "history" });
});

test("capacity override wins and zero means rest day", () => {
  const profile = { defaultCapacityMinutes: 480, capacityOverrides: { "2026-07-29": 0, "2026-07-30": 240 } };
  assert.equal(core.capacityForDate(profile, "2026-07-29"), 0);
  assert.equal(core.capacityForDate(profile, "2026-07-30"), 240);
  assert.equal(core.capacityForDate(profile, "2026-07-31"), 480);
});

test("due reviews consume capacity and low priority work moves within the week", () => {
  const state = baseState();
  state.tasks.push({ status: "active", reviews: [{ dueDate: "2026-07-29", completedAt: null }] });
  state.dailyTasks.push(
    { id: "high", title: "高优先", subject: "英语", category: "学习", date: "2026-07-29", status: "planned", priority: 5, estimatedMinutes: 90, linkedPlanId: "day29", scheduleHistory: [] },
    { id: "low", title: "低优先", subject: "英语", category: "学习", date: "2026-07-29", status: "planned", priority: 1, estimatedMinutes: 90, linkedPlanId: "day29", scheduleHistory: [] }
  );
  const run = core.generateRun(state, { generatedFor: "2026-07-28", now: "2026-07-28T12:00:00Z" });
  assert.equal(run.capacity.fixedReviewMinutes, 30);
  const move = run.suggestions.find((item) => item.entityId === "low");
  assert.equal(move.type, "move-task");
  assert.equal(move.ruleValue.date, "2026-07-30");
  assert.equal(run.suggestions.some((item) => item.entityId === "high"), false);
});

test("two prior moves produce an editable split suggestion", () => {
  const state = baseState();
  state.profile.defaultCapacityMinutes = 60;
  state.dailyTasks.push({ id: "repeat", title: "大任务", subject: "英语", category: "学习", date: "2026-07-29", status: "planned", priority: 3, estimatedMinutes: 120, linkedPlanId: "day29", scheduleHistory: [
    { fromDate: "2026-07-27", toDate: "2026-07-28" }, { fromDate: "2026-07-28", toDate: "2026-07-29" }
  ] });
  const run = core.generateRun(state, { generatedFor: "2026-07-28" });
  const split = run.suggestions.find((item) => item.entityId === "repeat");
  assert.equal(split.type, "split-task");
  assert.ok(split.userValue.children.length >= 2);
  const result = core.applySuggestions(state, run, [split.id], { now: "2026-07-28T12:00:00Z" });
  assert.equal(result.applied.length, 1);
  assert.equal(state.dailyTasks[0].status, "planned");
  assert.match(state.dailyTasks[0].title, /（1\//);
  assert.ok(state.dailyTasks.length >= 2);
});

test("application reports stale conflicts and undo is field safe", () => {
  const state = baseState();
  state.dailyTasks.push({ id: "move", title: "任务", date: "2026-07-29", status: "planned", linkedPlanId: "day29", scheduleHistory: [] });
  const suggestion = { id: "s1", type: "move-task", entityType: "dailyTask", entityId: "move", original: { date: "2026-07-29", linkedPlanId: "day29" }, ruleValue: { date: "2026-07-30", linkedPlanId: "day30" }, userValue: { date: "2026-07-30", linkedPlanId: "day30" }, status: "pending" };
  const run = { id: "r1", generatedFor: "2026-07-28", status: "pending", suggestions: [suggestion] };
  let result = core.applySuggestions(state, run, ["s1"], { now: "2026-07-28T12:00:00Z" });
  assert.deepEqual(result.applied, ["s1"]);
  assert.equal(state.dailyTasks[0].date, "2026-07-30");
  state.dailyTasks[0].linkedPlanId = "manual-plan";
  result = core.undoSuggestion(state, run, "s1", { now: "2026-07-28T13:00:00Z" });
  assert.equal(result.undone, false);
  assert.equal(state.dailyTasks[0].date, "2026-07-29");
  assert.equal(state.dailyTasks[0].linkedPlanId, "manual-plan");

  suggestion.status = "pending"; suggestion.appliedAt = ""; suggestion.undoneAt = "";
  state.dailyTasks[0].date = "2026-07-31";
  result = core.applySuggestions(state, run, ["s1"]);
  assert.deepEqual(result.conflicts, ["s1"]);
  assert.equal(state.dailyTasks[0].date, "2026-07-31");
});
