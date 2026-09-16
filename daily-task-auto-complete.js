const AdjustmentCore = require("./adjustment-core.js");

const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
const SHANGHAI_UTC_OFFSET_MINUTES = 8 * 60;
const AUTOMATIC_COMPLETION_HOUR = 22;

function shanghaiDateTimeParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(now).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  const hour = Number(parts.hour);
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number.isFinite(hour) ? hour % 24 : 0,
    minute: Number(parts.minute) || 0,
    second: Number(parts.second) || 0,
    date: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function nextAutomaticCompletionAt(now = new Date()) {
  const parts = shanghaiDateTimeParts(now);
  let target = Date.UTC(parts.year, parts.month - 1, parts.day, AUTOMATIC_COMPLETION_HOUR) - SHANGHAI_UTC_OFFSET_MINUTES * 60 * 1000;
  if (target <= now.getTime()) {
    target = Date.UTC(parts.year, parts.month - 1, parts.day + 1, AUTOMATIC_COMPLETION_HOUR) - SHANGHAI_UTC_OFFSET_MINUTES * 60 * 1000;
  }
  return new Date(target);
}

function estimateDailyTaskMinutes(task, state) {
  const source = state && typeof state === "object" ? state : {};
  const estimate = AdjustmentCore.estimateTaskMinutes(
    task,
    Array.isArray(source.dailyTasks) ? source.dailyTasks : [],
    source.profile && source.profile.durationDefaults
  );
  return Math.max(1, Math.round(Number(estimate && estimate.minutes) || 60));
}

function completeDailyTasksForDate(state, date) {
  if (!state || typeof state !== "object" || !Array.isArray(state.dailyTasks)) {
    return { date, completedCount: 0, taskIds: [] };
  }

  const tasksForEstimate = state.dailyTasks.map((task) => task && typeof task === "object" ? { ...task } : task);
  const completed = [];
  state.dailyTasks.forEach((task) => {
    if (!task || task.date !== date || task.status === "done" || task.status === "archived") return;
    const minutes = estimateDailyTaskMinutes(task, { ...state, dailyTasks: tasksForEstimate });
    task.status = "done";
    task.completedAt = date;
    task.studyMinutes = minutes;
    task.studyMinutesSource = "actual";
    task.completedEstimateMinutes = minutes;
    completed.push({ id: String(task.id || ""), title: String(task.title || ""), minutes });
  });
  return { date, completedCount: completed.length, taskIds: completed.map((task) => task.id), tasks: completed };
}

module.exports = {
  AUTOMATIC_COMPLETION_HOUR,
  shanghaiDateTimeParts,
  nextAutomaticCompletionAt,
  estimateDailyTaskMinutes,
  completeDailyTasksForDate
};
