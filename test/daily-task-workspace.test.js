const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const { compactAiAppState } = require("../server.js");

function loadDailyTaskNormalization() {
  const source = html.slice(html.indexOf("function normalizeDailyTask"), html.indexOf("function normalizeWrongQuestion"));
  return new Function(`
    const cleanText = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;
    const normalizeStudySubject = (value) => cleanText(value, "");
    const normalizeStudyMinutes = (task) => Number(task.studyMinutes) || (Number(task.studyHours) || 0) * 60;
    const textOrId = (value, prefix) => value || prefix + "-generated";
    const isDateKey = (value) => /^\\d{4}-\\d{2}-\\d{2}$/.test(value || "");
    const todayKey = () => "2026-07-29";
    const clampNumber = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.round(Number(value)))) : fallback;
    ${source}
    return { normalizeDailyTask, isValidDailyTaskTimeRange, dailyTaskTimeRangeMinutes };
  `)();
}

test("daily task workspace renders four statistics and three persistent quick actions", () => {
  assert.match(html, /class="daily-stats" aria-label="今日任务统计"/);
  ["今日任务", "已完成", "剩余时间", "实际学习"].forEach((label) => {
    assert.match(html, new RegExp(`renderDailyStatCard\\([^\\n]+, "${label}"`));
  });
  assert.match(html, /class="daily-quick-grid" aria-label="快捷操作"/);
  assert.match(html, /<h3>手动添加<\/h3>/);
  assert.match(html, /<h3>补记完成<\/h3>/);
  assert.match(html, /<h3 id="dailyAiTitle">AI 自动导入<\/h3>/);
  assert.match(html, /粘贴安排 → 生成预览 → 点击“导入每日任务”/);
});

test("daily task study metric prefers the confirmed daily closing total", () => {
  assert.match(html, /const focusedToday = getStudyMinutesForDate\(today\)/);
  assert.match(html, /dailyClosingForDate\(today\) \? "采用今日收尾确认时间"/);
});

test("quick add creates or reuses a complete planning hierarchy", () => {
  assert.match(html, /function ensureComprehensiveDailyPlan\(date\)/);
  assert.match(html, /function ensureDailyTaskPlan\(task\)/);
  assert.match(html, /plan\.type === "day".+plan\.title === "综合安排"/);
  assert.match(html, /title: "综合备考阶段"/);
  assert.match(html, /title: `\$\{formatDate\(weekStart\)\} 综合周计划`/);
  assert.match(html, /title: "综合安排"/);
  assert.match(html, /origin: "manual"/);
  assert.match(html, /linkedPlanId: plan\.id/);
});

test("manual, retro, and AI imported tasks automatically receive a daily plan", () => {
  assert.match(html, /所属每日计划（自动匹配）/);
  assert.match(html, /自动匹配或创建当天计划/);
  const retroFunction = html.slice(html.indexOf("function applyRetroComplete"), html.indexOf("function ensureComprehensiveDailyPlan"));
  assert.match(retroFunction, /ensureDailyTaskPlan\(task\)/);
  const manualFunction = html.slice(html.indexOf("function addDailyTaskFromForm"), html.indexOf("function openDailyTaskCompleteDialog"));
  assert.match(manualFunction, /ensureDailyTaskPlan\(\{ date: taskDate, subject, linkedPlanId: requestedPlanId \}\)/);
  const importFunction = html.slice(html.indexOf("function importAiDraft"), html.indexOf("function dailyTaskFromDraft"));
  assert.match(importFunction, /dailyTasks\.forEach\(\(task\) => ensureDailyTaskPlan\(task\)\)/);
  assert.doesNotMatch(importFunction, /待选择每日计划/);
});

test("legacy, manual and AI task origins are normalized and persisted", () => {
  assert.match(html, /origin: \["manual", "ai", "legacy"\]\.includes\(task\.origin\) \? task\.origin : "legacy"/);
  assert.match(html, /origin: existing \? existing\.origin : "manual"/);
  assert.match(html, /function dailyTaskFromDraft[\s\S]+?origin: "ai"/);
  assert.match(html, /task\.origin === "ai" \? `<strong class="daily-imported-pill">AI 导入/);
});

test("time ranges validate, normalize and derive duration only when needed", () => {
  assert.match(html, /id="dailyTaskStartTimeField" type="time"/);
  assert.match(html, /id="dailyTaskEndTimeField" type="time"/);
  assert.match(html, /function isValidDailyTaskTimeRange\(startTime, endTime\)/);
  assert.match(html, /dailyTaskTimeRangeMinutes\(task\.startTime, task\.endTime\)/);
  assert.match(html, /explicitEstimatedMinutes \|\| \(hasValidTimeRange/);
  assert.match(html, /showToast\("开始和结束时间需同时填写，且结束时间必须晚于开始时间。"\)/);
  assert.match(server, /item 字段：title, subject, category, date, priority, studyHours, startTime, endTime/);
});

test("normalization executes legacy compatibility and time-range behavior", () => {
  const { normalizeDailyTask, isValidDailyTaskTimeRange } = loadDailyTaskNormalization();
  const legacy = normalizeDailyTask({ id: "old", title: "旧任务", date: "2026-07-29" });
  assert.equal(legacy.origin, "legacy");
  assert.equal(legacy.startTime, "");
  assert.equal(legacy.endTime, "");

  const timed = normalizeDailyTask({ title: "定时任务", date: "2026-07-29", startTime: "08:30", endTime: "10:00", origin: "manual" });
  assert.equal(timed.estimatedMinutes, 90);
  assert.equal(timed.origin, "manual");

  const explicit = normalizeDailyTask({ title: "明确预计", date: "2026-07-29", startTime: "08:30", endTime: "10:00", estimatedMinutes: 120 });
  assert.equal(explicit.estimatedMinutes, 120);

  const invalid = normalizeDailyTask({ title: "无效时间", date: "2026-07-29", startTime: "23:30", endTime: "00:30", origin: "ai" });
  assert.equal(invalid.startTime, "");
  assert.equal(invalid.endTime, "");
  assert.equal(invalid.estimatedMinutes, null);
  assert.equal(isValidDailyTaskTimeRange("09:00", ""), false);
});

test("retro completion updates an existing pending task with actual duration", () => {
  assert.match(html, /task\.status !== "done" && compareDate\(task\.date, date\) <= 0/);
  assert.match(html, /task\.studyMinutes = Math\.round\(hours \* 60\)/);
  assert.match(html, /task\.studyMinutesSource = "actual"/);
  assert.match(html, /task\.completedEstimateMinutes = 0/);
  const retroFunction = html.slice(html.indexOf("function applyRetroComplete"), html.indexOf("function ensureComprehensiveDailyPlan"));
  assert.doesNotMatch(retroFunction, /state\.dailyTasks\.push/);
});

test("completing a daily task confirms actual time with the estimate as default", () => {
  assert.match(html, /id="dailyTaskCompleteDialog"/);
  assert.match(html, /id="dailyTaskActualMinutesField"/);
  assert.match(html, /elements\.dailyTaskActualMinutesField\.value = String\(estimate\.minutes\)/);
  assert.match(html, /task\.studyMinutes = actualMinutes/);
  assert.match(html, /task\.studyMinutesSource = "actual"/);
  assert.match(html, /data-action="confirm-daily-task-complete"/);
  assert.match(html, /if \(action === "toggle-daily-task"\) openDailyTaskCompleteDialog/);
});

test("today completion report excludes wrong-question reviews", () => {
  const reportBuilder = html.slice(html.indexOf("function buildDailyCompletionReport"), html.indexOf("function renderDailyReportCard"));
  assert.doesNotMatch(reportBuilder, /getAllWrongReviewItems/);
  assert.doesNotMatch(reportBuilder, /completedWrongReviews|pendingWrongReviews|type: "wrong"/);
  const reportOutputs = html.slice(html.indexOf("function renderDailyReportCard"), html.indexOf("function buildDailyReportSvg"));
  assert.doesNotMatch(reportOutputs, /report\.completedWrongReviews|错题复盘完成|今日完成复盘/);
});

test("today completion preview adapts the green dashboard progress ring across exports", () => {
  const reportBuilder = html.slice(html.indexOf("function buildDailyCompletionReport"), html.indexOf("function renderDailyReportCard"));
  assert.match(reportBuilder, /const progressDone = dailyDone \+ doneScheduledRecites \+ doneScheduledManual/);
  assert.match(reportBuilder, /progressPercent: progressTotal \? Math\.round\(\(progressDone \/ progressTotal\) \* 100\) : 0/);
  assert.match(html, /class="daily-report-progress-ring" role="progressbar"[\s\S]*?aria-valuenow="\$\{report\.progressPercent\}"/);
  assert.match(html, /conic-gradient\(#16a34a var\(--daily-report-progress\), #dcfce7 0\)/);
  assert.match(html, /执行任务与背诵复习，不含错题/);
  const canvas = html.slice(html.indexOf("function layoutDailyReportCanvas"), html.indexOf("function buildDailyReportSvg"));
  assert.match(canvas, /drawText\("今日总进度"/);
  assert.match(canvas, /drawProgressRing\(textX \+ 72, y \+ 66, 43, report\.progressPercent\)/);
  assert.match(canvas, /context\.arc\(centerX, centerY, radius/);
  const svg = html.slice(html.indexOf("function buildDailyReportSvg"), html.indexOf("function mapDailyTaskForSvg"));
  assert.match(svg, /text\("今日总进度"/);
  assert.match(svg, /stroke="#16a34a"[\s\S]*?stroke-dasharray="\$\{report\.progressPercent\} 100"/);
});

test("three fixed task sections expose the requested actions", () => {
  assert.match(html, /renderDailyTaskFold\(restDay \? "休息日待安排" : "今日待办"/);
  assert.match(html, /renderDailyTaskFold\("已完成"/);
  assert.match(html, /renderDailyTaskFold\("稍后安排"[\s\S]*?false, "future"/);
  assert.match(html, /data-action="toggle-daily-task"/);
  assert.match(html, /data-action="adjust-daily-task-time"/);
  assert.match(html, /data-action="log-daily-task-duration"/);
  assert.match(html, /data-action="edit-daily-task"/);
  assert.match(html, /data-action="delete-daily-task"/);
  assert.match(html, /\.slice\(0, 8\)/);
  assert.match(html, /进入日历/);
});

test("AI import navigates, persists source, highlights and respects reduced motion", () => {
  assert.match(html, /recentlyImportedDailyTaskIds = new Set\(dailyTasks\.map\(\(task\) => task\.id\)\)/);
  assert.match(html, /activeView = "dailyTasks"/);
  assert.match(html, /dailyTaskFilter = "all"/);
  assert.match(html, /data-recently-imported=/);
  assert.match(html, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/);
  assert.match(html, /scrollIntoView\(\{ behavior: reduceMotion \? "auto" : "smooth"/);
});

test("parse-plan AI context excludes bulky private records before the request", () => {
  const huge = "x".repeat(10000);
  const compact = compactAiAppState({
    localContext: { today: "2026-08-14", currentTime: huge },
    profile: { examDate: "2026-12-20", durationDefaults: { study: 60 } },
    dailyTasks: [{ id: "daily-1", title: "英语阅读", date: "2026-08-14", notes: huge }],
    tasks: [{ id: "task-1", title: "知识点", reviews: [{ dueDate: "2026-08-14" }], notes: huge }],
    wrongQuestions: [{ id: "wrong-1", title: "错题", fullMarkdown: huge, reviews: [{ dueDate: "2026-08-14" }] }],
    plans: [{ id: "day-1", type: "day", title: "今日安排", date: "2026-08-14", goal: huge }],
    reflections: [{ id: "reflection-1", summary: huge }]
  }, "parsePlan");

  assert.equal(compact.tasks.length, 0);
  assert.equal(compact.wrongQuestions.length, 0);
  assert.equal(compact.reflections.length, 0);
  assert.equal(compact.dailyTasks[0].notes.length, 240);
  assert.equal(compact.plans[0].goal.length, 240);
  assert.ok(JSON.stringify(compact).length < 5000);
});

test("responsive layout and accessibility keep controls touch friendly", () => {
  assert.match(html, /\.daily-stats \{ display: grid; grid-template-columns: repeat\(4/);
  assert.match(html, /\.daily-quick-grid \{ display: grid; grid-template-columns: repeat\(3/);
  assert.match(html, /\.daily-ai-panel \{ grid-column: 1 \/ -1; \}/);
  assert.match(html, /\.daily-stats, \.daily-quick-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.daily-quick-card button, \.daily-filter-btn, \.daily-row-action \{ min-height: 44px; \}/);
  assert.match(html, /aria-label="\$\{restDay \? "今日休息状态" : "设置今日休息"\}"/);
  assert.match(html, /daily-rest-button/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)/);
});

test("iPad layout gives manual entry more space and keeps the AI panel operable", () => {
  assert.match(html, /@media \(max-width: 1100px\)[\s\S]*?\.daily-quick-grid \{ grid-template-columns: minmax\(0, 3fr\) minmax\(220px, 2fr\); \}/);
  assert.match(html, /@media \(max-width: 940px\)[\s\S]*?\.daily-quick-grid \{ grid-template-columns: minmax\(0, 3fr\) minmax\(220px, 2fr\); \}/);
  assert.match(html, /@media \(min-width: 621px\) and \(max-width: 940px\)[\s\S]*?\.daily-ai-grid \{ grid-template-columns: 1fr;/);
  assert.doesNotMatch(html, /\.daily-ai-grid > \.form-field:first-of-type \{ grid-column: 1; grid-row: 1 \/ 3; \}/);
  assert.match(html, /class="daily-ai-unlock"[\s\S]*?data-action="focus-access-token"/);
  assert.match(html, /\.daily-workspace \{ padding-bottom: calc\(88px \+ env\(safe-area-inset-bottom\)\); \}/);
});

test("iPad AI form and imported task actions avoid horizontal crowding", () => {
  const wideTabletRule = html.slice(html.indexOf("@media (max-width: 1100px)"), html.indexOf("@media (max-width: 1280px) and (min-width: 941px)"));
  const tabletRule = html.slice(html.indexOf("@media (max-width: 940px)"), html.indexOf("@media (min-width: 621px) and (max-width: 940px)"));
  const tabletOrientationRule = html.slice(html.indexOf("@media (min-width: 621px) and (max-width: 940px)"), html.indexOf("@media (max-width: 560px)"));
  assert.match(wideTabletRule, /\.daily-ai-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(tabletRule, /\.daily-task-row \{ grid-template-columns: 1fr; gap: 10px;/);
  assert.match(tabletRule, /\.daily-task-actions \{ width: 100%; display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(tabletOrientationRule, /\.daily-ai-grid \{ grid-template-columns: 1fr;/);
  assert.doesNotMatch(tabletOrientationRule, /\.daily-ai-grid > \.form-field:first-of-type \{ grid-column:/);
});

test("wide iPad desktop mode gives the AI importer a full row", () => {
  const wideTabletDesktopRule = html.slice(html.indexOf("@media (max-width: 1440px)"), html.indexOf("@media (max-width: 1100px)"));
  assert.match(wideTabletDesktopRule, /\.daily-quick-grid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  assert.match(wideTabletDesktopRule, /\.daily-ai-panel \{ grid-column: 1 \/ -1; \}/);
});
