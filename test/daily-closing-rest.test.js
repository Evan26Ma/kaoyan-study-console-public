const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");

function extract(name, nextName) {
  const start = html.indexOf(`function ${name}(`);
  const end = html.indexOf(`function ${nextName}(`, start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return html.slice(start, end);
}

test("profile normalization is backward compatible and rest metadata forces zero capacity", () => {
  const source = extract("normalizeProfile", "normalizeStudySubject");
  const normalizeProfile = new Function(`
    const window = { AdjustmentCore: null };
    const DEFAULT_PROFILE = { dailyCapacity: 8, defaultCapacityMinutes: 480, durationDefaults: {}, subjectWeights: { 英语: 4 } };
    const isDateKey = value => /^\\d{4}-\\d{2}-\\d{2}$/.test(value || "");
    const cleanText = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;
    const clampNumber = (value, min, max, fallback) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.round(Number(value)))) : fallback;
    ${source}
    return normalizeProfile;
  `)();
  assert.deepEqual(normalizeProfile({}).restDays, {});
  const profile = normalizeProfile({
    capacityOverrides: { "2026-07-30": 300 },
    restDays: {
      "2026-07-30": {
        activatedAt: "2026-07-30T12:00:00.000Z",
        hadCapacityOverride: true,
        previousCapacityOverride: 300,
        manual45WasRest: true
      }
    }
  });
  assert.equal(profile.capacityOverrides["2026-07-30"], 0);
  assert.equal(profile.restDays["2026-07-30"].previousCapacityOverride, 300);
  assert.equal(profile.restDays["2026-07-30"].manual45WasRest, true);
});

test("daily closing stores one compatible closing payload without changing task minutes", () => {
  const save = html.slice(html.indexOf("function saveDailyClosing"), html.indexOf("function addDailyReflectionFromForm"));
  assert.match(save, /confirmedMinutes < 0 \|\| confirmedMinutes > 1440/);
  assert.match(save, /DAILY_CLOSING_REASONS\.includes\(reason\)/);
  assert.match(save, /remainingValue < 0 \|\| remainingValue > 960/);
  assert.match(save, /const existingReflection = dailyClosingForDate\(date\)/);
  assert.match(save, /existingReflection\?\.closing\?\.tomorrowFocus\?\.source === "new"/);
  assert.match(save, /taskMinutesSnapshot: getCompletedDailyTasksForDate\(date\)/);
  assert.match(html, /const snapshotPending = \(closing\?\.unfinishedTasks \|\| \[\]\)/);
  assert.match(save, /row\.dataset\.closingSnapshot === "true"/);
  assert.doesNotMatch(save, /task\.studyMinutes\s*=/);
});

test("today wrap-up keeps the three-step form compact and prevents competing focus inputs", () => {
  assert.match(html, /<div class="stack closing-page">/);
  assert.match(html, /max-width: 1040px/);
  assert.match(html, /class="closing-workspace-grid"/);
  assert.match(html, /aria-label="今日收尾摘要"/);
  assert.match(html, /class="closing-summary-metrics"/);
  assert.match(html, /class="closing-step-list"/);
  assert.match(html, /class="closing-focus-option"/);
  assert.match(html, /class="closing-note-disclosure"/);
  assert.match(html, /<details class="panel closing-history-panel">/);
  assert.match(html, /padding-bottom: calc\(92px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.closing-page \*/);
  assert.match(html, /id="closingMinutesHuman"/);
  assert.match(html, /event\.target\.id === "closingFocusNewField"[\s\S]*?existingTask\.value = ""/);
  assert.match(html, /event\.target\.id === "closingFocusTaskField"[\s\S]*?newTask\.value = ""/);
  assert.match(html, /今日收尾/);
  assert.doesNotMatch(html, /每日关账|已关账/);
});

test("tomorrow focus moves today's unfinished task with explicit schedule history", () => {
  const save = html.slice(html.indexOf("function saveDailyClosing"), html.indexOf("function addDailyReflectionFromForm"));
  assert.match(save, /if \(focusTask\.date === date\)/);
  assert.match(save, /focusTask\.date = tomorrow/);
  assert.match(save, /source: "daily-closing-focus"/);
  assert.match(html, /task\.id === tomorrowFocusForDate\(task\.date\)\?\.taskId/);
  assert.match(html, /今日最重要/);
});

test("whole-day rest preserves exact capacity and manual state and does not rewrite tasks", () => {
  const activation = html.slice(html.indexOf("async function activateWholeDayRest"), html.indexOf("function dailyClosingForDate"));
  assert.match(activation, /hadCapacityOverride/);
  assert.match(activation, /previousCapacityOverride/);
  assert.match(activation, /manual45WasRest/);
  assert.match(activation, /overrides\[date\] = 0/);
  assert.match(activation, /metadata\.hadCapacityOverride/);
  assert.match(activation, /state\.profile\.capacityOverrides\[date\] = metadata\.previousCapacityOverride/);
  assert.match(activation, /delete state\.profile\.restDays\[date\]/);
  assert.doesNotMatch(activation, /\.date\s*=\s*addDays/);
  assert.match(activation, /generateAdjustmentRun\(date\)/);
});

test("rest day UI is neutral and uses a confirmation card with touch sizing", () => {
  assert.match(html, /class="daily-rest-confirm"/);
  assert.match(html, /普通任务、背诵和错题到期日不改写/);
  assert.match(html, /休息日不计完成率/);
  assert.match(html, /任务保留可查看、编辑或手动完成，不显示为失败/);
  assert.match(html, /\.daily-rest-button \{ min-width: 172px; min-height: 48px/);
  assert.match(html, /renderDailyTaskFold\("稍后安排"[\s\S]*?false, "future"/);
});

test("reports and calendar prefer closing-confirmed time", () => {
  const study = html.slice(html.indexOf("function getTaskStudyMinutesForDate"), html.indexOf("function getStudyDurationStats"));
  assert.match(study, /const closing = dailyClosingForDate\(date\)/);
  assert.match(study, /closing \? closing\.closing\.confirmedMinutes : getTaskStudyMinutesForDate\(date\)/);
  assert.match(html, /function refreshReportsForDate\(date\)/);
  assert.match(html, /type: "weekly", start: startOfWeek\(date\), end: date/);
  assert.match(html, /type: "monthly", start: startOfMonth\(date\), end: date/);
  assert.match(html, /已收尾 · 实际/);
  assert.match(html, /calendar-status\$\{wholeRest/);
});

test("closing reminder follows Shanghai 20:00 and the 04:00 study-day boundary", () => {
  const reminder = html.slice(html.indexOf("function shouldShowClosingReminder"), html.indexOf("function renderClosingReminder"));
  assert.match(reminder, /timeZone: STUDY_DAY_TIME_ZONE/);
  assert.match(reminder, /hour >= 20 \|\| hour < STUDY_DAY_CUTOFF_HOUR/);
  assert.match(html, /renderDashboardView[\s\S]*?renderClosingReminder\(\)/);
  assert.match(html, /renderDailyTasksView[\s\S]*?renderClosingReminder\(\)/);
});

test("privacy redaction removes rest metadata together with closings", () => {
  assert.match(server, /delete profile\.restDays/);
  assert.match(server, /reflections: \[\]/);
  assert.match(html, /profile\.restDays = \{\}/);
  assert.match(html, /renderLockedPrivateView\("今日收尾"/);
});
