const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AUTOMATIC_COMPLETION_HOUR,
  shanghaiDateTimeParts,
  nextAutomaticCompletionAt,
  estimateDailyTaskMinutes,
  completeDailyTasksForDate
} = require("../daily-task-auto-complete.js");

test("automatic completion uses Shanghai time and schedules the next 22:00", () => {
  const before = new Date("2026-08-20T13:59:59.000Z");
  const at = new Date("2026-08-20T14:00:00.000Z");
  assert.equal(AUTOMATIC_COMPLETION_HOUR, 22);
  assert.deepEqual(shanghaiDateTimeParts(before), {
    year: 2026, month: 8, day: 20, hour: 21, minute: 59, second: 59, date: "2026-08-20"
  });
  assert.equal(nextAutomaticCompletionAt(before).toISOString(), "2026-08-20T14:00:00.000Z");
  assert.equal(nextAutomaticCompletionAt(at).toISOString(), "2026-08-21T14:00:00.000Z");
});

test("automatic completion records the estimate as actual study time and is idempotent", () => {
  const state = {
    profile: { durationDefaults: { practice: 90, study: 60, organize: 30, recite: 30, wrongPerItem: 15, vocabularyPerItem: 2 } },
    dailyTasks: [
      { id: "explicit", title: "上午刷题", subject: "数学", category: "刷题", date: "2026-08-20", status: "planned", estimatedMinutes: 180, studyMinutes: 0 },
      { id: "fallback", title: "背单词", subject: "英语", category: "词汇", date: "2026-08-20", status: "planned", estimatedMinutes: null, studyMinutes: 0 },
      { id: "done", title: "已完成", subject: "数学", category: "刷题", date: "2026-08-20", status: "done", studyMinutes: 45, completedAt: "2026-08-20" },
      { id: "archived", title: "已归档", subject: "数学", category: "刷题", date: "2026-08-20", status: "archived", studyMinutes: 0 },
      { id: "tomorrow", title: "明日任务", subject: "数学", category: "刷题", date: "2026-08-21", status: "planned", estimatedMinutes: 120, studyMinutes: 0 }
    ]
  };

  assert.equal(estimateDailyTaskMinutes(state.dailyTasks[0], state), 180);
  const first = completeDailyTasksForDate(state, "2026-08-20");
  assert.equal(first.completedCount, 2);
  assert.deepEqual(first.taskIds, ["explicit", "fallback"]);
  assert.equal(state.dailyTasks[0].studyMinutes, 180);
  assert.equal(state.dailyTasks[0].completedEstimateMinutes, 180);
  assert.equal(state.dailyTasks[0].studyMinutesSource, "actual");
  assert.equal(state.dailyTasks[1].studyMinutes, 30);
  assert.equal(state.dailyTasks[1].completedAt, "2026-08-20");
  assert.equal(state.dailyTasks[4].status, "planned");

  const second = completeDailyTasksForDate(state, "2026-08-20");
  assert.equal(second.completedCount, 0);
});
