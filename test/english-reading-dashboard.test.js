const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("English reading opens on a four-part overview backed by existing projections", () => {
  assert.match(html, /let readingSection = "overview"/);
  assert.match(html, /function renderReadingDashboardOverview\(projection, groups\)/);
  assert.match(html, /总完成篇数/);
  assert.match(html, /平均正确率/);
  assert.match(html, /平均耗时/);
  assert.match(html, /累计生词/);
  assert.match(html, /projection\.stats\.completedPassages/);
  assert.match(html, /projection\.stats\.averageFirstScore\*10/);
  assert.match(html, /projection\.stats\.averageDuration/);
  assert.match(html, /projection\.reading\.lexicalEntries/);
});

test("overview keeps score, error, vocabulary, and shortcut interactions discoverable", () => {
  for (const label of [
    "按年份趋势",
    "按 Text 表现",
    "题型分析",
    "能力弱项",
    "干扰项",
    "新建词卡",
    "阅读原文库",
    "精读选词",
    "AI 拆句辨析",
    "补录历史成绩"
  ]) assert.match(html, new RegExp(label));

  for (const action of [
    "reading-overview-score-mode",
    "reading-overview-error-mode",
    "reading-overview-vocabulary-mode",
    "reading-open-vocabulary-add",
    "reading-open-latest-workspace",
    "reading-open-legacy"
  ]) assert.match(html, new RegExp(`data-action="${action}"`));
});

test("reading score modal is prominent, structured, and returns to refreshed overview", () => {
  assert.match(html, /<h2>录入阅读成绩<\/h2>/);
  assert.match(html, /<h3>基础信息<\/h3>/);
  assert.match(html, /<h3>阅读原文<\/h3>/);
  assert.match(html, /<h3>逐题作答状态与错因<\/h3>/);
  assert.match(html, /保存成绩并更新分析/);
  assert.match(html, /readingSection="overview";/);
  assert.match(html, /querySelector\(":invalid"\)/);
});

test("reading dashboard has desktop, tablet, and phone grid fallbacks without page overflow", () => {
  assert.match(html, /\.reading-overview-grid \{ display:grid; grid-template-columns:minmax\(0,1\.25fr\)/);
  assert.match(html, /@media \(max-width:1100px\)[\s\S]*?\.reading-overview-grid \{ grid-template-columns:repeat\(2,minmax\(0,1fr\)\); \}/);
  assert.match(html, /@media \(max-width:700px\)[\s\S]*?\.reading-overview-kpis,.reading-overview-grid,.reading-shortcuts \{ grid-template-columns:1fr; \}/);
  assert.match(html, /\.reading-recent-wrap \{ margin-top:12px; overflow:auto; \}/);
});
