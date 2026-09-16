#!/usr/bin/env node
/* One-time state migration for comprehensive weekly plans and review throttling. */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const statePath = path.join(root, "data", "state.json");
const backupDir = path.join(root, "data", "backups");
const TODAY = "2026-07-20";
const DAILY_REVIEW_LIMIT = 50;

function isDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")); }
function addDays(date, days) { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function weekStart(date) { const value = new Date(`${date}T00:00:00Z`); const offset = (value.getUTCDay() + 6) % 7; return addDays(date, -offset); }
function weekEnd(date) { return addDays(weekStart(date), 6); }
function clean(value) { return String(value || "").trim(); }
function idForDay(date, subject) { return `plan-day-${date}-${subject.replace(/[^a-z0-9\u4e00-\u9fff]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "other"}`; }
function isManual45(task) { return /(背诵手册|专业背诵|专业课背诵|\blist\s*\d+)/i.test([task.title, task.category, task.notes, task.source].join(" ")); }
function importedAt(question) {
  if (question.createdAt && !Number.isNaN(Date.parse(question.createdAt))) return new Date(question.createdAt).toISOString();
  const match = String(question.id || "").match(/^wrong-(\d{10,})/);
  if (match) return new Date(Number(match[1])).toISOString();
  return `${question.reviewStartDate || question.date || TODAY}T00:00:00.000Z`;
}

function migrate(state) {
  const summary = { mergedWeeks: 0, createdDayPlans: 0, reviewSchedule: {}, throttledReviews: 0 };
  state.plans = Array.isArray(state.plans) ? state.plans : [];
  state.dailyTasks = Array.isArray(state.dailyTasks) ? state.dailyTasks : [];
  state.wrongQuestions = Array.isArray(state.wrongQuestions) ? state.wrongQuestions : [];
  state.migrations = state.migrations && typeof state.migrations === "object" ? state.migrations : {};

  if (!state.migrations.comprehensiveWeeksV5) {
    const phases = state.plans.filter((plan) => plan.type === "phase");
    const weeks = state.plans.filter((plan) => plan.type === "week");
    const groups = new Map();
    for (const week of weeks) {
      const start = weekStart(week.startDate || week.date || TODAY);
      const phase = week.parentId || (phases.find((item) => item.startDate <= start && item.endDate >= start) || {}).id || "";
      const key = `${phase}|${start}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(week);
    }
    const replacements = new Map();
    const comprehensive = [];
    for (const [key, items] of groups) {
      const [parentId, startDate] = key.split("|");
      const base = items.find((item) => !item.subject) || items[0];
      const subjectGoals = {};
      items.forEach((item) => { if (clean(item.subject) && clean(item.goal)) subjectGoals[clean(item.subject)] = clean(item.goal); });
      const plan = {
        ...base,
        type: "week",
        parentId,
        title: "综合周",
        subject: "",
        startDate,
        endDate: weekEnd(startDate),
        date: "",
        goal: clean(base.goal),
        subjectGoals
      };
      comprehensive.push(plan);
      items.forEach((item) => replacements.set(item.id, plan.id));
      summary.mergedWeeks += Math.max(0, items.length - 1);
    }
    state.plans = state.plans.filter((plan) => plan.type !== "week").concat(comprehensive);
    state.dailyTasks.forEach((task) => { if (replacements.has(task.linkedPlanId)) task.linkedPlanId = replacements.get(task.linkedPlanId); });
    state.tasks.forEach((task) => { if (replacements.has(task.linkedPlanId)) task.linkedPlanId = replacements.get(task.linkedPlanId); });

    const dayPlans = new Map(state.plans.filter((plan) => plan.type === "day").map((plan) => [`${plan.date || plan.startDate}|${plan.subject || ""}`, plan]));
    for (const task of state.dailyTasks) {
      if (isManual45(task)) continue;
      const subject = clean(task.subject) || "未分类";
      const date = task.date || TODAY;
      const key = `${date}|${subject}`;
      let dayPlan = dayPlans.get(key);
      if (!dayPlan) {
        dayPlan = { id: idForDay(date, subject), type: "day", parentId: "", title: `${date} ${subject}安排`, subject, startDate: date, endDate: date, date, goal: "", notes: "", status: "planned", priority: task.priority || 3, linkedTaskIds: [] };
        state.plans.push(dayPlan); dayPlans.set(key, dayPlan); summary.createdDayPlans += 1;
      }
      task.linkedPlanId = dayPlan.id;
    }
    state.migrations.comprehensiveWeeksV5 = { appliedAt: new Date().toISOString(), mergedWeeks: summary.mergedWeeks, createdDayPlans: summary.createdDayPlans };
  }

  if (!state.migrations.wrongReviewThrottleV5) {
    const occupancy = new Map();
    const candidates = [];
    for (const question of state.wrongQuestions) {
      if (question.status === "archived") continue;
      const pending = (question.reviews || []).filter((review) => !review.completedAt).sort((a, b) => Number(a.round) - Number(b.round))[0];
      if (!pending) continue;
      if (pending.dueDate > TODAY) occupancy.set(pending.dueDate, (occupancy.get(pending.dueDate) || 0) + 1);
      else candidates.push({ question, review: pending, importedAt: importedAt(question) });
    }
    candidates.sort((a, b) => a.importedAt.localeCompare(b.importedAt) || String(a.question.id).localeCompare(String(b.question.id)));
    let date = TODAY;
    for (const item of candidates) {
      while ((occupancy.get(date) || 0) >= DAILY_REVIEW_LIMIT) date = addDays(date, 1);
      item.review.dueDate = date;
      occupancy.set(date, (occupancy.get(date) || 0) + 1);
      summary.reviewSchedule[date] = (summary.reviewSchedule[date] || 0) + 1;
      summary.throttledReviews += 1;
    }
    state.migrations.wrongReviewThrottleV5 = { appliedAt: new Date().toISOString(), startDate: TODAY, dailyLimit: DAILY_REVIEW_LIMIT, movedReviews: summary.throttledReviews, schedule: summary.reviewSchedule };
  }
  state.version = 5;
  return summary;
}

const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const before = JSON.stringify(state);
const summary = migrate(state);
if (before !== JSON.stringify(state)) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(statePath, path.join(backupDir, `state-before-v5-${stamp}.json`));
  const temp = `${statePath}.v5.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(temp, statePath);
}
console.log(JSON.stringify({ changed: before !== JSON.stringify(state), ...summary }, null, 2));
