const test = require("node:test");
const assert = require("node:assert/strict");
const ScheduleCore = require("../schedule-core.js");
const { migrateState } = require("../scripts/migrate-v8.js");
const { migrateState: migrateRoutineState } = require("../scripts/migrate-routine-v2.js");

test("default routine contains the August study schedule and execution focus", () => {
  const routine = ScheduleCore.normalizeStudyRoutine({});
  assert.equal(routine.slots.length, 13);
  assert.deepEqual(
    routine.slots.map((slot) => [slot.id, slot.startTime, slot.endTime, slot.title]),
    [
      ["routine-start", "06:30", "07:30", "起床 + 早C + 时事新闻"],
      ["english-morning", "07:30", "08:00", "单词与知识点"],
      ["math-foundation", "08:00", "11:30", "上午数学主攻"],
      ["midday-rest", "11:30", "12:00", "午餐"],
      ["midday-exercise", "12:00", "13:00", "锻炼"],
      ["midday-break", "13:00", "13:30", "洗漱 / 回馆 / 休整"],
      ["midday-vocabulary", "13:30", "14:00", "单词 / 知识点"],
      ["major-afternoon-1", "14:00", "17:00", "下午专业课"],
      ["evening-rest", "17:00", "18:00", "晚餐 + 单词"],
      ["english-evening", "18:00", "20:00", "晚间英语"],
      ["wrong-review", "20:00", "22:00", "错题复盘 / 专业课补缺"],
      ["major-evening", "22:00", "23:00", "今日复盘"],
      ["night-rest", "23:00", "06:30", "睡眠"]
    ]
  );
  assert.equal(routine.slots[0].startTime, "06:30");
  assert.equal(routine.slots.at(-2).startTime, "22:00");
  assert.equal(routine.slots.at(-1).startTime, "23:00");
  assert.equal(routine.slots.at(-1).endTime, "06:30");
  assert.equal(routine.focusNotes.length, 4);
});

test("current slot and countdown handle boundaries and the overnight rest slot", () => {
  const routine = ScheduleCore.normalizeStudyRoutine({});
  assert.equal(ScheduleCore.getRoutineContext(routine, 6 * 60 + 30).current.id, "routine-start");
  assert.equal(ScheduleCore.getRoutineContext(routine, 11 * 60 + 30).current.id, "midday-rest");
  assert.equal(ScheduleCore.getRoutineContext(routine, 12 * 60).current.id, "midday-exercise");
  assert.equal(ScheduleCore.getRoutineContext(routine, 13 * 60).current.id, "midday-break");
  assert.equal(ScheduleCore.getRoutineContext(routine, 13 * 60 + 30).current.id, "midday-vocabulary");
  assert.equal(ScheduleCore.getRoutineContext(routine, 23 * 60).current.id, "night-rest");
  const overnight = ScheduleCore.getRoutineContext(routine, 2 * 60);
  assert.equal(overnight.current.id, "night-rest");
  assert.equal(overnight.remainingMinutes, 270);
  assert.equal(overnight.next.id, "routine-start");
});

test("task matching respects manual, time, keyword, and flexible priority", () => {
  const routine = ScheduleCore.normalizeStudyRoutine({});
  assert.equal(ScheduleCore.matchTaskToSlot({ scheduleSlotId: "english-evening", subject: "数学", title: "明确指定" }, routine).source, "manual");
  assert.equal(ScheduleCore.matchTaskToSlot({ startTime: "14:15", endTime: "15:00", subject: "英语", title: "时间优先" }, routine).slotId, "major-afternoon-1");
  assert.equal(ScheduleCore.matchTaskToSlot({ subject: "数学", title: "高数刷题" }, routine).slotId, "math-foundation");
  assert.equal(ScheduleCore.matchTaskToSlot({ subject: "英语", title: "背单词" }, routine).slotId, "midday-vocabulary");
  assert.equal(ScheduleCore.matchTaskToSlot({ subject: "", title: "临时事项" }, routine).source, "flexible");
});

test("overlap matching selects the slot with the longest overlap and earlier slot on ties", () => {
  const routine = ScheduleCore.normalizeStudyRoutine({});
  const result = ScheduleCore.matchTaskToSlot({ startTime: "09:00", endTime: "10:30", title: "跨段数学" }, routine);
  assert.equal(result.slotId, "math-foundation");
  assert.equal(result.overlapMinutes, 90);
  const tieWithinMath = ScheduleCore.matchTaskToSlot({ startTime: "09:00", endTime: "10:00", title: "数学交界" }, routine);
  assert.equal(tieWithinMath.slotId, "math-foundation");
  const tie = ScheduleCore.matchTaskToSlot({ startTime: "10:30", endTime: "12:30", title: "跨午间" }, routine);
  assert.equal(tie.slotId, "math-foundation");
});

test("slot progress counts completed tasks without creating or cloning records", () => {
  const routine = ScheduleCore.normalizeStudyRoutine({});
  const tasks = [
    { id: "a", subject: "数学", title: "已完成", status: "done", linkedPlanId: "plan-a", estimatedMinutes: 60 },
    { id: "b", subject: "数学", title: "待完成", status: "planned", linkedPlanId: "plan-b", estimatedMinutes: 90 }
  ];
  const before = JSON.stringify(tasks);
  const progress = ScheduleCore.getSlotProgress(tasks, "math-foundation", routine);
  assert.equal(progress.total, 2);
  assert.equal(progress.done, 1);
  assert.equal(progress.percent, 50);
  assert.equal(JSON.stringify(tasks), before);
});

test("v7 migration adds a routine without changing task identity or plan links", () => {
  const source = { version: 7, dailyTasks: [{ id: "d1", linkedPlanId: "day-1", title: "数学" }] };
  const migrated = migrateState(source, { appliedAt: "2026-08-08T00:00:00Z" });
  assert.equal(migrated.version, 8);
  assert.equal(migrated.studyRoutine.slots.length, 13);
  assert.equal(migrated.dailyTasks[0].id, "d1");
  assert.equal(migrated.dailyTasks[0].linkedPlanId, "day-1");
  assert.equal(migrated.dailyTasks[0].scheduleSlotId, "");
  assert.deepEqual(migrateState(migrated, { appliedAt: "later" }), migrated);
});

test("routine v2 migration splits only the legacy default midday slot", () => {
  const legacy = [
    ["routine-start", "06:30", "07:00"], ["english-morning", "07:00", "08:00"], ["math-foundation", "08:00", "09:30"], ["math-practice", "09:30", "11:30"],
    ["midday-rest", "11:30", "14:00"], ["major-afternoon-1", "14:00", "15:30"], ["major-afternoon-2", "15:30", "17:30"], ["evening-rest", "17:30", "19:00"],
    ["major-evening", "19:00", "20:30"], ["english-evening", "20:30", "21:30"], ["wrong-review", "21:30", "23:00"], ["night-rest", "23:00", "06:30"]
  ].map(([id, startTime, endTime]) => ({ id, startTime, endTime, title: id, arrangement: "", type: "study", subjectHints: [], keywordHints: [] }));
  legacy[4] = {
    ...legacy[4],
    id: "midday-rest",
    startTime: "11:30",
    endTime: "14:00",
    title: "午餐与午休",
    arrangement: "吃饭、午休，避免把下午的精力透支",
    type: "break",
    subjectHints: [],
    keywordHints: ["午休", "午餐", "休息"]
  };
  const source = { version: 8, studyRoutine: { version: 1, slots: legacy }, dailyTasks: [{ id: "d1", scheduleSlotId: "midday-rest" }] };
  const migrated = migrateRoutineState(source, { appliedAt: "2026-08-08T00:00:00Z" });
  assert.equal(migrated.studyRoutine.slots.length, 13);
  assert.equal(migrated.studyRoutine.slots.find((slot) => slot.id === "midday-rest").endTime, "12:00");
  assert.equal(migrated.dailyTasks[0].scheduleSlotId, "midday-rest");
  assert.deepEqual(migrateRoutineState(migrated, { appliedAt: "later" }), migrated);
});
