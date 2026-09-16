const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parseMarkdown } = require("../import-manual45.js");
const Core = require("../manual45-content-core.js");

const sourcePath = path.join(__dirname, "fixtures/manual45-sample.md");

test("手册导入识别匿名示例中的内容单元和讲次", () => {
  const parsed = parseMarkdown(fs.readFileSync(sourcePath, "utf8"), sourcePath);
  assert.equal(parsed.units.length, 2);
  assert.equal(parsed.units.filter((unit) => unit.type === "concept").length, 1);
  assert.equal(parsed.units.filter((unit) => unit.type === "shortAnswer").length, 1);
  assert.equal(parsed.assets.length, 0);
  assert.equal(parsed.lectures.length, 1);
  assert.equal(parsed.lectures[0].number, 1);
  assert.ok(parsed.units.some((unit) => unit.title === "示例概念"));
  assert.ok(parsed.units.every((unit) => unit.answerMarkdown));
});

test("45天内容核心只按绑定关系生成内容复习行", () => {
  const pkg = Core.normalizePackage(JSON.parse(fs.readFileSync(path.join(__dirname, "../examples/manual45-content/content.json"), "utf8")));
  let content = Core.emptyState(pkg);
  const firstUnits = pkg.units.slice(0, 2).map((unit) => unit.unitId);
  assert.deepEqual(Core.scheduleForDay(1), { day: 1, new: [1, 2], review: [] });
  assert.deepEqual(Core.scheduleForDay(2), { day: 2, new: [3, 4], review: [1, 2] });
  assert.equal(Core.unitsForSchedule(content, 1).length, 0);
  content = Core.bindUnits(content, firstUnits, 1);
  assert.equal(Core.unitsForSchedule(content, 1).length, 2);
  assert.equal(Core.unitsForSchedule(content, 2).length, 2);
  content = Core.setProgress(content, firstUnits[0], 1, { answerExpanded: true });
  content = Core.setProgress(content, firstUnits[0], 1, { score: 2, completedAt: "2026-08-17" });
  assert.equal(Core.progressFor(content, firstUnits[0], 1).answerExpanded, true);
  assert.equal(Core.scheduleProgress(content, 1).completed, 1);
  assert.equal(Core.stats(content, { completedDays: {}, restDates: [] }, "2026-08-17").needsReinforcement, 0);
  content = Core.setMemorized(content, firstUnits[0], true, "2026-08-17T10:00:00.000Z");
  assert.equal(Core.isMemorized(content, firstUnits[0]), true);
  assert.equal(Core.stats(content, { completedDays: {}, restDates: [] }, "2026-08-17").memorized, 1);
  content = Core.setMemorized(content, firstUnits[0], false, "2026-08-18T10:00:00.000Z");
  assert.equal(Core.isMemorized(content, firstUnits[0]), false);
});

test("旧状态可以在不创建普通背诵任务的情况下补上手册状态", () => {
  const normalized = Core.normalizeState({ version: 12, tasks: [{ id: "ordinary" }] });
  assert.equal(normalized.tasks, undefined);
  assert.deepEqual(normalized.bindings, {});
  assert.deepEqual(normalized.progress, {});
  assert.equal(normalized.package.units.length, 0);
});

test("AI 默写评测结果和历史记录会被限制并持久化", () => {
  let state = Core.emptyState({ units: [] });
  state = Core.setRecitationReview(state, "unit-1", "第一次复述", {
    score: 8.56,
    maxScore: 99,
    summary: "结构完整",
    shortcomings: ["缺少边界条件"],
    reinforcementPoints: ["强化前提"],
    memoryTechnique: "针对当前知识点的口诀"
  }, "2026-08-17T10:00:00.000Z");
  assert.equal(state.recitationReviews["unit-1"].lastResult.score, 8.6);
  assert.equal(state.recitationReviews["unit-1"].lastResult.maxScore, 10);
  assert.equal(Core.recitationReviewFor(state, "unit-1").history.length, 1);
  const normalized = Core.normalizeState({ recitationReviews: { "unit-1": { lastAttempt: "复述", lastResult: { score: 18 } } } });
  assert.equal(normalized.recitationReviews["unit-1"].lastResult.score, 10);
});

test("强化统计只看每个内容单元最新一次 AI 评测", () => {
  let state = Core.emptyState({ units: [{ unitId: "unit-1", title: "测试" }] });
  state = Core.bindUnits(state, ["unit-1"], 1);
  state = Core.setProgress(state, "unit-1", 1, { score: 2, completedAt: "2026-08-17", updatedAt: "2026-08-17T10:00:00.000Z" });
  state = Core.setProgress(state, "unit-1", 2, { score: 4, completedAt: "2026-08-18", updatedAt: "2026-08-18T10:00:00.000Z" });
  assert.equal(Core.stats(state, { completedDays: {}, restDates: [] }, "2026-08-18").needsReinforcement, 0);
});

test("评分和笔记使用独立 study 记录并兼容旧进度", () => {
  let state = Core.emptyState({ units: [{ unitId: "unit-1", title: "测试" }] });
  state = Core.bindUnits(state, ["unit-1"], 3);
  state = Core.setProgress(state, "unit-1", 1, { score: 2, note: "旧笔记", completedAt: "2026-08-17", updatedAt: "2026-08-17T10:00:00.000Z" });
  assert.deepEqual(Core.studyFor(state, "unit-1"), { score: 2, note: "旧笔记", updatedAt: "" });
  state = Core.setProgress(state, "unit-1", 2, { score: 5, note: "较新 Day 笔记", completedAt: "2026-08-18", updatedAt: "2026-08-18T10:00:00.000Z" });
  state = Core.setProgress(state, "unit-1", 3, { score: 3, note: "同一时间取高 Day", completedAt: "2026-08-18", updatedAt: "2026-08-18T10:00:00.000Z" });
  assert.deepEqual(Core.studyFor(state, "unit-1"), { score: 3, note: "同一时间取高 Day", updatedAt: "" });
  const next = Core.setStudy(state, "unit-1", { score: 4, note: "新笔记" }, "2026-08-18T10:00:00.000Z");
  assert.equal(next.study["unit-1"].score, 4);
  assert.equal(next.study["unit-1"].note, "新笔记");
  assert.equal(next.bindings["unit-1"].listId, 3);
  assert.equal(next.progress["unit-1"]["1"].score, 2);
  const cleared = Core.setStudy(next, "unit-1", { note: "" }, "2026-08-19T10:00:00.000Z");
  assert.equal(Core.studyFor(cleared, "unit-1").note, "");
  const importedEmpty = Core.normalizeState({ progress: state.progress, study: { "unit-1": { score: null, note: "", updatedAt: "" } } });
  assert.equal(Core.studyFor(importedEmpty, "unit-1").note, "");
});

test("需强化忽略历史自评，只采用最新 AI 分数", () => {
  let state = Core.emptyState({ units: [
    { unitId: "self-low", title: "自评较低" },
    { unitId: "self-high", title: "自评较高" },
    { unitId: "ai-low", title: "AI 较低" },
    { unitId: "ai-high", title: "AI 较高" }
  ] });
  state = Core.setStudy(state, "self-low", { score: 2 }, "2026-08-18T10:00:00.000Z");
  state = Core.setStudy(state, "self-high", { score: 4 }, "2026-08-18T10:00:00.000Z");
  state = Core.setRecitationReview(state, "ai-low", "复述", { score: 5.9 }, "2026-08-18T10:00:00.000Z");
  state = Core.setRecitationReview(state, "ai-high", "复述", { score: 6 }, "2026-08-18T10:00:00.000Z");
  assert.equal(Core.stats(state, { completedDays: {}, restDates: [] }, "2026-08-18").needsReinforcement, 1);
});

test("AI 评测保留最近 20 次并维持连续总编号", () => {
  let state = Core.emptyState({ units: [{ unitId: "unit-1", title: "测试" }] });
  for (let attempt = 1; attempt <= 21; attempt += 1) state = Core.setRecitationReview(state, "unit-1", `复述 ${attempt}`, { score: 7 });
  const review = Core.recitationReviewFor(state, "unit-1");
  assert.equal(review.totalAttempts, 21);
  assert.equal(review.history.length, 20);
  assert.deepEqual(review.history.map((item) => item.attemptNumber), Array.from({ length: 20 }, (_, index) => index + 2));
  const legacy = Core.normalizeRecitationReviews({ "unit-1": { history: [{ attempt: "a", result: { score: 5 } }, { attempt: "b", result: { score: 6 } }] } });
  assert.deepEqual(legacy["unit-1"].history.map((item) => item.attemptNumber), [1, 2]);
});

test("内容报错按题覆盖并保存内容包哈希", () => {
  let state = Core.emptyState({ units: [{ unitId: "unit-1", title: "测试" }] });
  state = Core.setIssueReport(state, "unit-1", "首次原因", "hash-1", "2026-09-09T01:00:00.000Z");
  state = Core.setIssueReport(state, "unit-1", "覆盖原因", "hash-2", "2026-09-09T02:00:00.000Z");
  assert.deepEqual(Core.issueReportFor(state, "unit-1"), { reason: "覆盖原因", updatedAt: "2026-09-09T02:00:00.000Z", sourceHash: "hash-2" });
});

test("专业手册阅读器使用单题筛选、答案版本和独立工具面板", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../manual45-reader.css"), "utf8");
  const rendererStart = html.indexOf("    function manual45ReaderQuestion(");
  const rendererEnd = html.indexOf("    function renderManual45ContentView(", rendererStart);
  const renderer = html.slice(rendererStart, rendererEnd);
  assert.match(html, /data-action="retry-server-sync"/);
  assert.match(html, /manual45-study/);
  assert.equal((html.match(/function manual45ReaderQuestion\(/g) || []).length, 1);
  assert.equal((renderer.match(/manual45-answer-content/g) || []).length, 1);
  assert.match(renderer, /manual45-answer-card/);
  assert.match(renderer, /manual45-ai-input-row/);
  assert.match(renderer, /const aiMarkup = `<section/);
  assert.doesNotMatch(html, /manual45-(?:answer-drawer|recitation-workbench)/);
  assert.match(css, /\.manual45-ai-input-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 136px/);
  assert.match(css, /\.manual45-reader-navigation > button\s*\{[\s\S]*min-width:\s*160px;[\s\S]*min-height:\s*52px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.manual45-ai-input-row\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 96px/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*\.manual45-reader-navigation > button\s*\{[\s\S]*min-height:\s*56px/);
  assert.match(css, /--manual-bg:\s*#F4F7FC/);
  assert.match(css, /--manual-primary:\s*#2563EB/);
  assert.match(css, /--manual-orange:\s*#F97316/);
  assert.match(css, /\.manual45-answer-toggle\s*\{[\s\S]*background:\s*var\(--manual-orange\)/);
  assert.match(css, /\.manual45-reader-question:not\(\.is-answer-open\) \.manual45-ai-panel\s*\{[\s\S]*margin-top:\s*16px[\s\S]*border-top:\s*0/);
  assert.doesNotMatch(css, /#3730a3|#c7d2fe|#e0e7ff|Noto Serif SC|var\(--manual-amber\)/i);
  assert.match(html, /manual45-reader\.css\?v=20260910-reader-layout/);
  assert.match(html, /@@MANUAL45-TABLE-\$\{index\}@@/);
  assert.doesNotMatch(html, /@@MANUAL45_TABLE_\$\{index\}@@/);
  assert.match(html, /data-action="manual45-answer-version"/);
  assert.match(html, /data-action="manual45-tool"/);
  assert.match(html, /data-action="manual45-save-note"/);
  assert.match(html, /data-action="manual45-save-issue"/);
  assert.match(html, /data-action="manual45-select-attempt"/);
  assert.doesNotMatch(renderer, /data-action="manual45-score"/);
  assert.doesNotMatch(renderer, /manual45-mastery/);
  assert.match(renderer, /type="text" data-manual-recitation/);
  assert.doesNotMatch(html, /data-action="manual45-bind-(?:unit|selected)"/);
  assert.doesNotMatch(html, /data-action="manual45-unbind-unit"/);
  assert.doesNotMatch(html, /id="manual45TodayFilter"/);
  assert.doesNotMatch(html, /id="manual45UnboundFilter"/);
});

function readerRendererForTest({ expanded = false, editing = false, revision = null, draft = "" } = {}) {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const rendererStart = html.indexOf("    function manual45ReaderQuestion(");
  const rendererEnd = html.indexOf("    function renderManual45ContentView(", rendererStart);
  const renderer = vm.runInNewContext(`(${html.slice(rendererStart, rendererEnd)})`, {
    window: { Manual45ContentCore: { studyFor: () => ({ score: null, note: "", updatedAt: "" }), issueReportFor: () => ({ reason: "", updatedAt: "", sourceHash: "" }) } },
    manual45ContentIsMemorized: () => false,
    manual45ReaderExpandedUnitIds: new Set(expanded ? ["unit-1"] : []),
    manual45RecitationReview: () => null,
    manual45ReaderSelectedAttempts: new Map(),
    manual45ReaderAnswerVersion: new Map(),
    manual45ReaderRevisionEditing: new Set(editing ? ["unit-1"] : []),
    manual45DisplayTitle: (unit) => unit.title,
    manual45PromptBody: (unit) => unit.promptMarkdown,
    manual45DisplayAnswer: (value) => value,
    renderManual45Markdown: (value) => `<p>${value}</p>`,
    escapeHtml: (value) => String(value),
    isUnlocked: () => true,
    accessChecking: false,
    manual45RecitationPending: new Set(),
    manual45RecitationLoading: false,
    manual45ReaderTool: new Map(),
    manual45ReadDraft: (_unitId, kind) => kind === "revision" ? draft : "",
    manual45ReviewScoreClass: () => "",
    formatDateTime: () => "刚刚"
  });
  const unit = { unitId: "unit-1", type: "concept", title: "测试题", promptMarkdown: "题干", answerMarkdown: "标准答案", rawMarkdown: "原始摘录" };
  const content = { revisions: revision ? { "unit-1": [revision] } : {}, memorized: {} };
  return renderer(unit, [unit], content);
}

test("专业手册阅读器收起和展开时生成正确的答案与 AI 结构", () => {
  const collapsed = readerRendererForTest();
  assert.doesNotMatch(collapsed, /manual45-answer-content|manual45-answer-versions|先独立回忆/);
  assert.match(collapsed, /data-manual-recitation/);
  assert.equal((collapsed.match(/manual45-ai-panel/g) || []).length, 1);

  const expanded = readerRendererForTest({ expanded: true });
  assert.equal((expanded.match(/manual45-answer-content/g) || []).length, 1);
  assert.equal((expanded.match(/manual45-answer-versions/g) || []).length, 1);
  assert.match(expanded, /标准答案/);
  assert.doesNotMatch(expanded, /我的修订/);
  assert.equal((expanded.match(/manual45-ai-panel/g) || []).length, 1);
});

test("专业手册阅读器折叠编辑态后保留草稿并在重新展开时恢复", () => {
  const collapsed = readerRendererForTest({ editing: true, draft: "我的未保存修订" });
  assert.doesNotMatch(collapsed, /manual45-answer-content|data-manual-revision/);

  const reopened = readerRendererForTest({ expanded: true, editing: true, draft: "我的未保存修订" });
  assert.equal((reopened.match(/manual45-answer-content/g) || []).length, 1);
  assert.match(reopened, /我的未保存修订/);
  assert.match(reopened, /data-manual-revision/);
});
