const test = require("node:test");
const assert = require("node:assert/strict");
const { migrateState } = require("../scripts/migrate-v6.js");

test("v6 migration is idempotent", () => {
  const source = { version: 5, dailyTasks: [], migrations: { existing: true } };
  const once = migrateState(source, { currentYear: 2026, appliedAt: "2026-07-26T00:00:00Z" });
  const twice = migrateState(once, { currentYear: 2026, appliedAt: "later" });
  assert.deepEqual(twice, once);
  assert.equal(once.version, 6);
  assert.deepEqual(once.englishReading, { version: 6, passages: [], lexicalEntries: [], lookupHistory: [], dismissedLegacyHintKeys: [] });
  assert.equal(once.migrations.existing, true);
  assert.equal(once.migrations.englishReadingV6.englishReadingVersion, 6);
});

test("v4 production state upgrades directly without changing record counts", () => {
  const source = {
    version: 4,
    manual45Progress: { completedDays: { "1": "2026-07-01" }, restDates: [] },
    dailyTasks: [{ id: "d1" }],
    wrongQuestions: [{ id: "w1" }],
    plans: [{ id: "p1" }, { id: "p2" }],
    migrations: {}
  };
  const result = migrateState(source, { currentYear: 2026, appliedAt: "2026-07-27T00:00:00Z" });
  assert.equal(result.version, 6);
  assert.equal(result.dailyTasks.length, 1);
  assert.equal(result.wrongQuestions.length, 1);
  assert.equal(result.plans.length, 2);
  assert.deepEqual(result.manual45Progress, source.manual45Progress);
});
