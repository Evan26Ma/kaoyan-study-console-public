const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAdjustmentExplanationResults } = require("../server.js");

test("adjustment explanations require exact known IDs and clamp fields", () => {
  const ids = new Set(["a", "b"]);
  const result = normalizeAdjustmentExplanationResults({ results: [
    { id: "a", explanation: "x".repeat(600), splitTitles: ["一", "二", "三", "四"] },
    { id: "b", weekGoal: "本周目标" }
  ] }, ids);
  assert.equal(result[0].explanation.length, 500);
  assert.deepEqual(result[0].splitTitles, ["一", "二", "三"]);
  assert.throws(() => normalizeAdjustmentExplanationResults({ results: [{ id: "unknown" }] }, new Set(["a"])), /未知/);
  assert.throws(() => normalizeAdjustmentExplanationResults({ results: [{ id: "a" }] }, new Set(["a", "b"])), /全部/);
  assert.throws(() => normalizeAdjustmentExplanationResults({ results: [{ id: "a" }, { id: "a" }] }, new Set(["a"])), /重复/);
});
