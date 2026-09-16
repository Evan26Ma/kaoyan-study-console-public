const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("fluent root loads the shared core and preserves englishReading at v6", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /src="english-reading-core\.js"/);
  assert.match(html, /EnglishReadingCore\.normalize\(source\.englishReading\)/);
  assert.match(html, /version:\s*Math\.max\(7/);
  assert.match(html, /englishReading,\s*adjustmentRuns,\s*migrations/);
});

test("fluent console owns the contextual English reading navigation and interactions", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /<title>考研学习中控台 · 流畅版<\/title>/);
  assert.match(html, /data-view="englishReading"/);
  assert.doesNotMatch(html, /data-action="open-quick-add"/);
  assert.doesNotMatch(html, /id="quickAddDialog"/);
  assert.match(html, /function renderEnglishReadingView\(\)/);
  assert.match(html, /role="tablist" aria-label="英语阅读分区"/);
  assert.match(html, /scores:"年份成绩",analysis:"错因分析",vocabulary:"阅读词库"/);
  assert.match(html, /id="readingAttemptDialog"/);
  assert.match(html, /data-action="reading-save-attempt"/);
  assert.match(html, /readingQuestionStatus/);
  assert.match(html, /逐题作答状态/);
  assert.match(html, /questionResults/);
  assert.match(html, /data-action="reading-start-review"/);
  assert.match(html, /data-action="reading-explain-selection"/);
  assert.match(html, /data-action="reading-mark-selection"/);
  assert.match(html, /data-action="reading-explain-marked"/);
  assert.doesNotMatch(html, /AI 从所选篇目提词/);
  assert.match(html, /EnglishReadingCore\.legacyHintGroups/);
  assert.match(html, /EnglishReadingCore\.project\(state\.englishReading/);
});

test("fluent reading workspace exposes accessible chart alternatives", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /aria-label="阅读篇目成绩趋势，满分 10 分"/);
  assert.match(html, /<table class="reading-chart-table"/);
  assert.match(html, /readingYearOptions\(projection\.populatedYears/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
});

test("reading contextual cards keep passage, attempt and annotation source context", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /function readingSelectionSource/);
  assert.match(html, /passageId:passage\.id/);
  assert.match(html, /attemptId:latest\?\.id/);
  assert.match(html, /annotationId/);
});
