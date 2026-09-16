const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeReadingSelectionRequest,
  normalizeReadingSelectionResults,
  readingSelectionCacheKey
} = require("../server.js");

const selection = {
  id: "a1",
  selectedText: "derive from",
  sentence: "The conclusion derives from two observations.",
  paragraphContext: "The conclusion derives from two observations.",
  existingSenses: [{ id: "sense-1", meaningZh: "源自", partOfSpeech: "短语" }]
};

test("reading selection request enforces count, lengths and deep-mode cardinality", () => {
  assert.throws(() => normalizeReadingSelectionRequest({ selections: [] }), /1–20/);
  assert.throws(() => normalizeReadingSelectionRequest({ selections: Array.from({ length: 21 }, () => selection) }), /1–20/);
  assert.throws(() => normalizeReadingSelectionRequest({ selections: [{ ...selection, selectedText: "x".repeat(121) }] }), /120/);
  assert.throws(() => normalizeReadingSelectionRequest({ selections: [{ ...selection, sentence: "x".repeat(2001) }] }), /2,000/);
  assert.throws(() => normalizeReadingSelectionRequest({ selections: [{ ...selection, paragraphContext: "x".repeat(6001) }] }), /6,000/);
  assert.throws(() => normalizeReadingSelectionRequest({ selections: [selection, { ...selection, id: "a2" }], mode: "deep" }), /一个选区/);
  assert.equal(normalizeReadingSelectionRequest({ selections: [selection], mode: "deep" }).mode, "deep");
});

test("AI selection results are sanitized and may only reference supplied senses", () => {
  const request = normalizeReadingSelectionRequest({ selections: [selection] });
  const parsed = normalizeReadingSelectionResults({ results: [{
    id: "a1",
    normalizedKey: "  Derive   From ",
    meaningZh: "源自",
    matchedSenseId: "sense-1",
    collocation: "derive A from B"
  }] }, request.selections, request.mode);
  assert.equal(parsed.results[0].normalizedKey, "derive from");
  assert.equal(parsed.results[0].classification, "existing");
  assert.throws(() => normalizeReadingSelectionResults({ results: [{
    id: "a1", meaningZh: "源自", matchedSenseId: "invented"
  }] }, request.selections, request.mode), /未知已有义项/);
});

test("missing or partial AI results return explicit failures", () => {
  const request = normalizeReadingSelectionRequest({ selections: [selection] });
  assert.deepEqual(normalizeReadingSelectionResults({ results: [] }, request.selections, "context").failures, [
    { id: "a1", error: "AI 未返回这个选区的解释。" }
  ]);
});

test("duplicate explicit result ids do not get assigned to another selection", () => {
  const second = { ...selection, id: "a2", selectedText: "observation" };
  const request = normalizeReadingSelectionRequest({ selections: [selection, second] });
  const output = normalizeReadingSelectionResults({ results: [
    { id: "a1", meaningZh: "源自" },
    { id: "a1", meaningZh: "重复结果" }
  ] }, request.selections, "context");
  assert.equal(output.results.length, 1);
  assert.deepEqual(output.failures, [{ id: "a2", error: "AI 未返回这个选区的解释。" }]);
});

test("cache key is stable for the same selected text and sentence", () => {
  assert.equal(readingSelectionCacheKey(selection, "context"), readingSelectionCacheKey({ ...selection, id: "other" }, "context"));
  assert.notEqual(readingSelectionCacheKey(selection, "context"), readingSelectionCacheKey(selection, "deep"));
});
