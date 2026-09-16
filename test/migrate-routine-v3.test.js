const test = require("node:test");
const assert = require("node:assert/strict");
const { migrateState } = require("../scripts/migrate-routine-v3.js");

test("legacy routine v2 migrates to the August schedule without losing manual slot intent", () => {
  const source = {
    version: 9,
    studyRoutine: {
      version: 2,
      slots: [
        ["routine-start", "06:30", "07:00"], ["english-morning", "07:00", "08:00"], ["math-foundation", "08:00", "09:30"], ["math-practice", "09:30", "11:30"],
        ["midday-rest", "11:30", "12:00"], ["midday-exercise", "12:00", "13:00"], ["midday-break", "13:00", "13:30"], ["midday-vocabulary", "13:30", "14:00"],
        ["major-afternoon-1", "14:00", "15:30"], ["major-afternoon-2", "15:30", "17:30"], ["evening-rest", "17:30", "19:00"], ["major-evening", "19:00", "20:30"],
        ["english-evening", "20:30", "21:30"], ["wrong-review", "21:30", "23:00"], ["night-rest", "23:00", "06:30"]
      ].map(([id, startTime, endTime]) => ({ id, startTime, endTime })),
      focusNotes: []
    },
    dailyTasks: [{ id: "math-task", scheduleSlotId: "math-practice" }, { id: "major-task", scheduleSlotId: "major-afternoon-2" }],
    migrations: {}
  };
  const once = migrateState(source, { appliedAt: "2026-08-08T00:00:00Z" });
  assert.equal(once.studyRoutine.slots.length, 13);
  assert.equal(once.studyRoutine.slots.find((slot) => slot.id === "math-foundation").endTime, "11:30");
  assert.deepEqual(once.dailyTasks.map((task) => task.scheduleSlotId), ["math-foundation", "major-afternoon-1"]);
  assert.equal(once.migrations.studyRoutineAugustV3.version, 3);
  assert.deepEqual(migrateState(once, { appliedAt: "later" }), once);
});

test("custom routine is not overwritten by the August routine migration", () => {
  const source = { version: 9, studyRoutine: { slots: [{ id: "custom", startTime: "09:00", endTime: "10:00", title: "自定义" }] } };
  assert.deepEqual(migrateState(source), source);
});
