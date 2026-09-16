const test = require("node:test");
const assert = require("node:assert/strict");
const { migrateState } = require("../scripts/migrate-v7.js");

test("v6 to v7 migration is idempotent and preserves existing records", () => {
  const source = {
    version: 6,
    profile: { dailyCapacity: 7 },
    dailyTasks: [{ id: "d1", studyMinutes: 75 }],
    plans: [{ id: "p1" }], reports: [{ id: "r1" }],
    migrations: { englishReadingV6: { englishReadingVersion: 6 } }
  };
  const once = migrateState(source, { appliedAt: "2026-07-28T00:00:00Z" });
  const twice = migrateState(once, { appliedAt: "later" });
  assert.deepEqual(twice, once);
  assert.equal(once.version, 7);
  assert.equal(once.profile.defaultCapacityMinutes, 420);
  assert.equal(once.dailyTasks[0].studyMinutes, 75);
  assert.equal(once.dailyTasks[0].estimatedMinutes, null);
  assert.deepEqual(once.dailyTasks[0].scheduleHistory, []);
  assert.equal(once.plans.length, 1);
  assert.equal(once.reports.length, 1);
});
