const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../english-reading-core.js");

const options = { currentYear: 2026, now: "2026-07-26" };
const wrong = (questionNumber, overrides = {}) => ({
  questionNumber, selectedAnswer: "A", correctAnswer: "B", questionType: "细节",
  abilityReasons: ["定位"], distractors: ["偷换概念"], ...overrides
});
const attempt = (date, wrongAnswers = [], extra = {}) => ({ date, createdAt: `${date}T00:00:00Z`, wrongAnswers, ...extra });

test("v5 state can receive an idempotent empty v6 reading model", () => {
  const state = { version: 5, dailyTasks: [] };
  const migrate = value => ({ ...value, version: 6, englishReading: core.normalize(value.englishReading, options), migrations: { ...(value.migrations || {}), englishReadingV6: true } });
  assert.deepEqual(migrate(migrate(state)), migrate(state));
  assert.deepEqual(migrate(state).englishReading, core.empty());
});

test("legacy reading vocabulary migrates to v6 lexical senses idempotently", () => {
  const legacy = {
    version: 1,
    passages: [],
    vocabulary: [{
      id: "old-word",
      lemma: "Scope",
      forms: ["scoped"],
      meanings: ["范围", "作用域"],
      sources: [{ passageId: "p1", contextSentence: "The scope is narrow." }],
      stage: 2,
      status: "learning",
      nextReviewDate: "2026-08-02",
      reviewHistory: []
    }],
    ignoredLegacyTaskIds: ["task-1"]
  };
  const once = core.normalize(legacy, options);
  const twice = core.normalize(once, options);
  assert.deepEqual(twice, once);
  assert.equal(once.version, 6);
  assert.equal(once.lexicalEntries[0].normalizedKey, "scope");
  assert.equal(once.lexicalEntries[0].senses[0].meaningZh, "范围；作用域");
  assert.equal(once.lexicalEntries[0].senses[0].sources[0].sentence, "The scope is narrow.");
  assert.deepEqual(once.dismissedLegacyHintKeys, ["task-1"]);
});

test("validates text question ranges and answers and derives 0–10 scores", () => {
  let reading = core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-01", []) } }, options);
  assert.equal(core.score(reading.passages[0].attempts[0]), 10);
  reading = core.execute(reading, { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-02", [21,22,23,24,25].map(number => wrong(number))) } }, options);
  assert.equal(core.score(reading.passages[0].attempts[1]), 0);
  assert.throws(() => core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 2, attempt: attempt("2026-07-01", [wrong(25)]) } }, options), /26–30/);
  assert.throws(() => core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-01", [wrong(21, { selectedAnswer: "B" })]) } }, options), /相同/);
  assert.throws(() => core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-01", [wrong(21, { abilityReasons: [] })]) } }, options), /至少/);
});

test("all-correct attempts persist five explicit results and score 10", () => {
  const questionResults = [21, 22, 23, 24, 25].map(questionNumber => ({ questionNumber, status: "correct" }));
  const reading = core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-01", [], { questionResults }) } }, options);
  const saved = reading.passages[0].attempts[0];
  assert.deepEqual(saved.questionResults.map(item => item.status), ["correct", "correct", "correct", "correct", "correct"]);
  assert.equal(core.score(saved), 10);
});

test("mixed correct, wrong and unanswered results score only correct questions", () => {
  const questionResults = [
    { questionNumber: 21, status: "correct" },
    { questionNumber: 22, status: "wrong" },
    { questionNumber: 23, status: "unanswered" },
    { questionNumber: 24, status: "correct" },
    { questionNumber: 25, status: "wrong" }
  ];
  const reading = core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-01", [wrong(22), wrong(25)], { questionResults }) } }, options);
  assert.equal(core.score(reading.passages[0].attempts[0]), 4);
  assert.equal(core.project(reading, options).analysis.abilityReasons["定位"], 4);
});

test("legacy wrongAnswers migrate to wrong status and infer remaining questions as correct", () => {
  const reading = core.normalize({ passages: [{ year: 2010, textNumber: 1, passageText: "", attempts: [attempt("2026-07-01", [wrong(22)])] }] }, options);
  const saved = reading.passages[0].attempts[0];
  assert.deepEqual(saved.questionResults.map(item => item.status), ["correct", "wrong", "correct", "correct", "correct"]);
  assert.equal(saved.questionResults.filter(item => item.inferred).length, 4);
  assert.equal(core.score(saved), 8);
  assert.equal(saved.wrongAnswers.length, 1);
});

test("projects first/latest/improvement and only complete annual trends", () => {
  let reading = core.empty();
  for (let textNumber = 1; textNumber <= 4; textNumber += 1) {
    reading = core.execute(reading, { type: "addAttempt", payload: { year: 2010, textNumber, attempt: attempt(`2026-07-0${textNumber}`, [wrong(21 + (textNumber - 1) * 5)]) } }, options);
  }
  reading = core.execute(reading, { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-10", []) } }, options);
  reading = core.execute(reading, { type: "addAttempt", payload: { year: 2011, textNumber: 1, attempt: attempt("2026-07-11", []) } }, options);
  const projection = core.project(reading, options);
  const complete = projection.years.find(item => item.year === 2010);
  assert.equal(complete.firstTotal, 32);
  assert.equal(complete.texts[0].latestScore, 10);
  assert.equal(complete.texts[0].improvement, 2);
  assert.deepEqual(projection.trend, [{ year: 2010, score: 32 }]);
  assert.equal(projection.years.find(item => item.year === 2011).displayScore, "10/10 · 1/4篇");
});

test("analysis switches between first and all attempts", () => {
  let reading = core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-01", [wrong(21)]) } }, options);
  reading = core.execute(reading, { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-02", [wrong(22, { abilityReasons: ["词汇"] })]) } }, options);
  assert.equal(core.project(reading, options).analysis.abilityReasons["定位"], 2);
  assert.equal(core.project(reading, { ...options, scope: "all" }).analysis.abilityReasons["词汇"], 2);
});

test("dashboard projection exposes populated years, attempt trends and Text performance", () => {
  let reading = core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-01", [wrong(21)], { durationMinutes: 18 }) } }, options);
  reading = core.execute(reading, { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-07-02", [], { durationMinutes: 14 }) } }, options);
  reading = core.execute(reading, { type: "addAttempt", payload: { year: 2011, textNumber: 2, attempt: attempt("2026-07-03", [wrong(26), wrong(27)], { durationMinutes: 22 }) } }, options);
  const first = core.project(reading, options);
  assert.deepEqual(first.populatedYears.map(item => item.year), [2011, 2010]);
  assert.equal(first.attemptSeries.length, 2);
  assert.equal(first.textPerformance[0].averageScore, 8);
  assert.equal(first.textPerformance[1].averageScore, 6);
  assert.equal(first.stats.recentFiveAverage, 8);
  assert.equal(first.stats.averageImprovement, 2);
  assert.equal(first.scoreDistribution[8], 1);
  assert.equal(first.insights.strongestText.textNumber, 1);
  assert.equal(first.insights.weakestText.textNumber, 2);
  assert.deepEqual(first.insights.topAbilityReason, { label: "定位", lostPoints: 6 });

  const all = core.project(reading, { ...options, scope: "all", year: 2010 });
  assert.equal(all.attemptSeries.length, 2);
  assert.equal(all.textPerformance[0].averageScore, 9);
  assert.equal(all.analysis.year, 2010);
});

test("words and phrases normalize while contextual senses keep independent schedules", () => {
  let reading = core.execute(core.empty(), { type: "addLexicalSense", payload: {
    normalizedKey: "Derive", selectedText: "derived", meaningZh: "推导出", rating: "unknown",
    sentence: "The result was derived from observation.", source: { passageId: "p1", sentence: "The result was derived from observation." },
    explanation: { normalizedKey: "derive", headword: "derive", meaningZh: "推导出" }
  } }, options);
  reading = core.execute(reading, { type: "addLexicalSense", payload: {
    normalizedKey: "derive", selectedText: "derives", meaningZh: "获得", rating: "fuzzy", classification: "new",
    sentence: "It derives value from trust.", source: { passageId: "p2", sentence: "It derives value from trust." },
    explanation: { normalizedKey: "derive", headword: "derive", meaningZh: "获得" }
  } }, options);
  reading = core.execute(reading, { type: "addLexicalSense", payload: {
    normalizedKey: "  In   Light Of ", selectedText: "in light of", meaningZh: "鉴于", rating: "unknown",
    sentence: "In light of the evidence, they changed course.",
    explanation: { normalizedKey: "in light of", headword: "in light of", type: "phrase", meaningZh: "鉴于" }
  } }, options);
  assert.equal(reading.lexicalEntries.length, 2);
  assert.equal(reading.lexicalEntries[0].senses.length, 2);
  assert.deepEqual(reading.lexicalEntries[0].senses.map(item => item.nextReviewDate), ["2026-07-27", "2026-07-29"]);
  assert.equal(reading.lexicalEntries[1].type, "phrase");
  assert.equal(reading.lexicalEntries[1].normalizedKey, "in light of");
});

test("known/fuzzy/forgot ratings transform stages and dates", () => {
  let reading = core.execute(core.empty(), { type: "addLexicalSense", payload: { normalizedKey: "scope", meaningZh: "范围", rating: "unknown", explanation: { normalizedKey: "scope", meaningZh: "范围" } } }, options);
  const entry = reading.lexicalEntries[0], senseId = entry.senses[0].id;
  reading = core.execute(reading, { type: "reviewSense", payload: { entryId: entry.id, senseId, rating: "known" } }, options);
  assert.equal(reading.lexicalEntries[0].senses[0].stage, 1);
  assert.equal(reading.lexicalEntries[0].senses[0].nextReviewDate, "2026-07-29");
  reading = core.execute(reading, { type: "reviewSense", payload: { entryId: entry.id, senseId, rating: "fuzzy" } }, { ...options, now: "2026-07-29" });
  assert.equal(reading.lexicalEntries[0].senses[0].nextReviewDate, "2026-08-01");
  reading = core.execute(reading, { type: "reviewSense", payload: { entryId: entry.id, senseId, rating: "forgot" } }, { ...options, now: "2026-08-01" });
  assert.equal(reading.lexicalEntries[0].senses[0].stage, 0);
  assert.equal(reading.lexicalEntries[0].senses[0].nextReviewDate, "2026-08-02");
});

test("deleting an attempt tombstones vocabulary sources without cascading", () => {
  let reading = core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: { id: "a1", ...attempt("2026-07-01") } } }, options);
  reading = core.execute(reading, { type: "addLexicalSense", payload: { normalizedKey: "retain", meaningZh: "保留", explanation: { normalizedKey: "retain", meaningZh: "保留" }, source: { attemptId: "a1" } } }, options);
  reading = core.execute(reading, { type: "deleteAttempt", payload: { attemptId: "a1" } }, options);
  assert.equal(reading.lexicalEntries.length, 1);
  assert.equal(reading.lexicalEntries[0].senses[0].sources[0].deletedLabel, "原来源已删除");
});

test("third lookup warns without automatically adding a lexical entry", () => {
  let reading = core.empty();
  for (let count = 0; count < 3; count += 1) {
    reading = core.execute(reading, { type: "recordLookup", payload: { selectedText: "opaque", source: { passageId: `p${count}` } } }, options);
  }
  assert.equal(reading.lookupHistory[0].count, 3);
  assert.equal(reading.lexicalEntries.length, 0);
  assert.equal(reading.lookupHistory[0].sources.length, 3);
});

test("selection anchors become invalid after passage edits instead of silently moving", () => {
  let reading = core.execute(core.empty(), { type: "upsertPassage", payload: { year: 2012, textNumber: 1, passageText: "A durable result matters." } }, options);
  const passageId = reading.passages[0].id;
  reading = core.execute(reading, { type: "markSelection", payload: { passageId, selectedText: "durable", start: 2, end: 9, sentence: "A durable result matters." } }, options);
  assert.equal(reading.passages[0].annotations[0].anchorStatus, "valid");
  reading = core.execute(reading, { type: "upsertPassage", payload: { year: 2012, textNumber: 1, passageText: "A robust result matters." } }, options);
  assert.equal(reading.passages[0].annotations[0].anchorStatus, "needsRelocation");
});

test("legacy hints parse 2009/2010 single and multiple Text tasks", () => {
  const tasks = [
    { id: "a", title: "英语：09年真题Text 4精读复盘", date: "2026-01-01" },
    { id: "b", title: "英语：09年阅读Text 4及前三篇阅读复盘", date: "2026-01-02" },
    { id: "c", title: "英语10年真题Text 1、Text 2精读", date: "2026-01-03" }
  ];
  const hints = core.legacyHints(tasks, core.empty(), options);
  assert.deepEqual(hints.filter(item => item.taskId === "a").map(item => [item.year, item.textNumber]), [[2009, 4]]);
  assert.deepEqual(hints.filter(item => item.taskId === "b").map(item => item.textNumber), [1,2,3,4]);
  assert.deepEqual(hints.filter(item => item.taskId === "c").map(item => item.textNumber), [1,2]);
  const partial = core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: { ...attempt("2026-01-03"), sourceDailyTaskId: "c" } } }, options);
  assert.deepEqual(core.legacyHints(tasks, partial, options).filter(item => item.taskId === "c").map(item => item.textNumber), [2]);
});

test("legacy hint groups merge duplicate year and Text targets", () => {
  const tasks = [
    { id: "a", title: "英语10年真题Text 1精读", date: "2026-01-01" },
    { id: "b", title: "2010年英语阅读 Text 1", date: "2026-01-03" },
    { id: "c", title: "英语10年真题Text 2精读", date: "2026-01-02" }
  ];
  const groups = core.legacyHintGroups(tasks, core.empty(), options);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.find(item => item.textNumber === 1).taskIds, ["a", "b"]);
  assert.equal(groups.find(item => item.textNumber === 1).sourceCount, 2);
  assert.equal(groups.find(item => item.textNumber === 1).date, "2026-01-03");

  const ignored = core.execute(core.empty(), { type: "ignoreLegacyHints", payload: { taskIds: ["a", "b"] } }, options);
  assert.deepEqual(core.legacyHintGroups(tasks, ignored, options).map(item => item.textNumber), [2]);
});

test("legacy hints disappear when a Text already has any formal attempt", () => {
  const tasks = [
    { id: "broad", title: "英语10年真题Text 1、Text 2精读", date: "2026-01-01" },
    { id: "specific", title: "英语10年Text 2精读", date: "2026-01-02" }
  ];
  const reading = core.execute(core.empty(), { type: "addAttempt", payload: { year: 2010, textNumber: 1, attempt: attempt("2026-01-03") } }, options);
  assert.deepEqual(core.legacyHintGroups(tasks, reading, options).map(item => [item.year, item.textNumber]), [[2010, 2]]);
});
