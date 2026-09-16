(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.AdjustmentCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_DURATION_DEFAULTS = Object.freeze({
    practice: 90,
    study: 60,
    organize: 30,
    recite: 30,
    wrongPerItem: 15,
    vocabularyPerItem: 2
  });

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
  }

  function dateKey(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  }

  function addDays(value, days) {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + Number(days || 0)));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  }

  function compareDate(left, right) {
    return String(left).localeCompare(String(right));
  }

  function normalizeDurationDefaults(value) {
    const source = value && typeof value === "object" ? value : {};
    const output = {};
    Object.entries(DEFAULT_DURATION_DEFAULTS).forEach(([key, fallback]) => {
      output[key] = clamp(source[key], 1, key === "wrongPerItem" || key === "vocabularyPerItem" ? 120 : 480, fallback);
    });
    return output;
  }

  function categoryKey(task) {
    const text = `${task && task.category || ""} ${task && task.title || ""}`.toLowerCase();
    if (/(刷题|练习|真题|套卷|practice|exercise)/i.test(text)) return "practice";
    if (/(整理|复盘|总结|错题)/i.test(text)) return "organize";
    if (/(背诵|记忆|单词|词汇|recite|vocab)/i.test(text)) return "recite";
    return "study";
  }

  function median(values) {
    const sorted = values.filter((value) => Number(value) > 0).map(Number).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  }

  function estimateTaskMinutes(task, completedTasks, defaults) {
    const explicit = Number(task && task.estimatedMinutes);
    if (Number.isFinite(explicit) && explicit > 0) return { minutes: clamp(explicit, 1, 960, 60), source: "explicit" };
    const type = categoryKey(task);
    const samples = (Array.isArray(completedTasks) ? completedTasks : [])
      .filter((candidate) => candidate && candidate.status === "done" && (candidate.studyMinutesSource || "actual") === "actual" && candidate.subject === task.subject && categoryKey(candidate) === type && Number(candidate.studyMinutes) > 0)
      .sort((a, b) => String(b.completedAt || b.date || "").localeCompare(String(a.completedAt || a.date || "")))
      .slice(0, 20)
      .map((candidate) => Number(candidate.studyMinutes));
    if (samples.length >= 3) return { minutes: median(samples), source: "history" };
    const normalized = normalizeDurationDefaults(defaults);
    return { minutes: normalized[type], source: "default" };
  }

  function capacityForDate(profile, date) {
    const source = profile && typeof profile === "object" ? profile : {};
    const overrides = source.capacityOverrides && typeof source.capacityOverrides === "object" ? source.capacityOverrides : {};
    if (Object.prototype.hasOwnProperty.call(overrides, date)) return clamp(overrides[date], 0, 960, 0);
    const fallback = Number(source.dailyCapacity) > 0 ? Number(source.dailyCapacity) * 60 : 480;
    return clamp(source.defaultCapacityMinutes, 60, 960, clamp(fallback, 60, 960, 480));
  }

  function dueReviewLoad(state, date, defaults) {
    const config = normalizeDurationDefaults(defaults);
    const recites = (state.tasks || []).reduce((count, task) => count + (task.status === "archived" ? 0 : (task.reviews || []).filter((review) => !review.completedAt && compareDate(review.dueDate, date) <= 0).length), 0);
    const wrong = (state.wrongQuestions || []).reduce((count, question) => count + (question.status === "archived" ? 0 : (question.reviews || []).filter((review) => !review.completedAt && compareDate(review.dueDate, date) <= 0).length), 0);
    let vocabulary = 0;
    const entries = state.englishReading && Array.isArray(state.englishReading.lexicalEntries) ? state.englishReading.lexicalEntries : [];
    entries.forEach((entry) => (entry.senses || []).forEach((sense) => {
      if (!sense.archived && dateKey(sense.nextReviewDate || sense.dueDate) && compareDate(sense.nextReviewDate || sense.dueDate, date) <= 0) vocabulary += 1;
    }));
    const minutes = recites * config.recite + wrong * config.wrongPerItem + vocabulary * config.vocabularyPerItem;
    return { recites, wrong, vocabulary, minutes };
  }

  function taskRescheduleCount(task) {
    return (Array.isArray(task && task.scheduleHistory) ? task.scheduleHistory : []).filter((item) => item && item.fromDate !== item.toDate).length;
  }

  function weekForTask(state, task) {
    const byId = new Map((state.plans || []).map((plan) => [plan.id, plan]));
    const day = byId.get(task.linkedPlanId);
    return day && day.type === "day" ? byId.get(day.parentId) : null;
  }

  function dayPlanForDate(state, weekId, date, subject) {
    const plans = state.plans || [];
    return plans.find((plan) => plan.type === "day" && plan.parentId === weekId && (plan.date || plan.startDate) === date && (!subject || !plan.subject || plan.subject === subject))
      || plans.find((plan) => plan.type === "day" && plan.parentId === weekId && (plan.date || plan.startDate) === date)
      || null;
  }

  function localExplanation(type, details) {
    if (type === "split-task") return `该任务已改期 ${details.moves} 次，继续整体顺延容易再次积压，建议拆成可独立完成的小任务并重新估时。`;
    if (type === "reduce-week-goal") return `本周剩余任务约 ${details.workload} 分钟，超过剩余容量 ${details.capacity} 分钟，建议收窄目标并单独确认。`;
    return `次日固定复习占用 ${details.fixed} 分钟；为保留高优先级任务，建议把本项移至本周最近的有余量日期。`;
  }

  function generateRun(state, options) {
    const input = state && typeof state === "object" ? state : {};
    const generatedFor = dateKey(options && options.generatedFor) || new Date().toISOString().slice(0, 10);
    const tomorrow = addDays(generatedFor, 1);
    const defaults = normalizeDurationDefaults(input.profile && input.profile.durationDefaults);
    const fixed = dueReviewLoad(input, tomorrow, defaults);
    const capacity = capacityForDate(input.profile, tomorrow);
    const available = Math.max(0, capacity - fixed.minutes);
    const completed = (input.dailyTasks || []).filter((task) => task.status === "done");
    const candidates = (input.dailyTasks || []).filter((task) => task.status !== "done" && compareDate(task.date, tomorrow) <= 0).map((task) => {
      const estimate = estimateTaskMinutes(task, completed, defaults);
      const week = weekForTask(input, task);
      return { task, estimate, week, moves: taskRescheduleCount(task) };
    }).sort((left, right) => Number(right.task.priority || 3) - Number(left.task.priority || 3)
      || compareDate(left.task.date, right.task.date)
      || Number(right.week && right.week.priority || 3) - Number(left.week && left.week.priority || 3)
      || left.moves - right.moves);

    const usedByDate = new Map([[tomorrow, fixed.minutes]]);
    let usedTasks = 0;
    const suggestions = [];
    const makeId = (type, entityId, index) => `adj-${generatedFor}-${type}-${entityId}-${index}`.replace(/[^A-Za-z0-9_.:-]/g, "-");
    candidates.forEach(({ task, estimate, week, moves }, index) => {
      if (usedTasks + estimate.minutes <= available) {
        usedTasks += estimate.minutes;
        usedByDate.set(tomorrow, fixed.minutes + usedTasks);
        return;
      }
      if (moves >= 2) {
        const parts = estimate.minutes >= 90 ? 3 : 2;
        const perPart = Math.max(15, Math.ceil(estimate.minutes / parts / 5) * 5);
        const availableDates = week ? (input.plans || []).filter((plan) => plan.type === "day" && plan.parentId === week.id && compareDate(plan.date || plan.startDate, tomorrow) >= 0 && compareDate(plan.date || plan.startDate, week.endDate) <= 0).map((plan) => plan.date || plan.startDate).sort() : [task.date];
        const children = Array.from({ length: parts }, (_, partIndex) => ({
          title: `${task.title}（${partIndex + 1}/${parts}）`,
          date: availableDates[Math.min(partIndex, availableDates.length - 1)] || task.date,
          estimatedMinutes: perPart,
          priority: Number(task.priority) || 3
        }));
        suggestions.push({
          id: makeId("split", task.id, index), type: "split-task", entityType: "dailyTask", entityId: task.id,
          original: { title: task.title, date: task.date, linkedPlanId: task.linkedPlanId, estimatedMinutes: task.estimatedMinutes || null, priority: Number(task.priority) || 3, status: task.status },
          ruleValue: { children }, userValue: { children }, status: "pending", appliedAt: "", undoneAt: "",
          basis: { estimateMinutes: estimate.minutes, estimateSource: estimate.source, rescheduleCount: moves },
          explanation: localExplanation("split-task", { moves })
        });
        return;
      }
      if (!week || !dateKey(week.endDate)) return;
      let targetDate = addDays(tomorrow, 1);
      let targetPlan = null;
      while (compareDate(targetDate, week.endDate) <= 0) {
        const dayCapacity = capacityForDate(input.profile, targetDate);
        const reserved = usedByDate.has(targetDate) ? usedByDate.get(targetDate) : dueReviewLoad(input, targetDate, defaults).minutes;
        const plan = dayPlanForDate(input, week.id, targetDate, task.subject);
        if (plan && reserved + estimate.minutes <= dayCapacity) { targetPlan = plan; break; }
        targetDate = addDays(targetDate, 1);
      }
      if (!targetPlan || targetDate === task.date) return;
      usedByDate.set(targetDate, (usedByDate.get(targetDate) || dueReviewLoad(input, targetDate, defaults).minutes) + estimate.minutes);
      suggestions.push({
        id: makeId("move", task.id, index), type: "move-task", entityType: "dailyTask", entityId: task.id,
        original: { title: task.title, date: task.date, linkedPlanId: task.linkedPlanId, estimatedMinutes: task.estimatedMinutes || null, priority: Number(task.priority) || 3 },
        ruleValue: { title: task.title, date: targetDate, linkedPlanId: targetPlan.id, estimatedMinutes: task.estimatedMinutes || estimate.minutes, priority: Number(task.priority) || 3 },
        userValue: { title: task.title, date: targetDate, linkedPlanId: targetPlan.id, estimatedMinutes: task.estimatedMinutes || estimate.minutes, priority: Number(task.priority) || 3 },
        status: "pending", appliedAt: "", undoneAt: "", basis: { estimateMinutes: estimate.minutes, estimateSource: estimate.source, priority: task.priority, rescheduleCount: moves },
        explanation: localExplanation("move-task", { fixed: fixed.minutes })
      });
    });

    const activeWeek = (input.plans || []).find((plan) => plan.type === "week" && compareDate(plan.startDate, tomorrow) <= 0 && compareDate(plan.endDate, tomorrow) >= 0);
    if (activeWeek) {
      const remainingTasks = (input.dailyTasks || []).filter((task) => task.status !== "done" && compareDate(task.date, tomorrow) >= 0 && compareDate(task.date, activeWeek.endDate) <= 0);
      const workload = remainingTasks.reduce((sum, task) => sum + estimateTaskMinutes(task, completed, defaults).minutes, 0);
      let weekCapacity = 0;
      for (let date = tomorrow; compareDate(date, activeWeek.endDate) <= 0; date = addDays(date, 1)) weekCapacity += Math.max(0, capacityForDate(input.profile, date) - dueReviewLoad(input, date, defaults).minutes);
      if (workload > weekCapacity * 1.15 && activeWeek.goal) {
        const suggestedGoal = `优先完成 ${remainingTasks.sort((a, b) => Number(b.priority || 3) - Number(a.priority || 3)).slice(0, Math.max(1, Math.floor(remainingTasks.length * weekCapacity / Math.max(workload, 1)))).map((task) => task.title).join("、")}`.slice(0, 400);
        suggestions.push({
          id: makeId("week", activeWeek.id, suggestions.length), type: "reduce-week-goal", entityType: "plan", entityId: activeWeek.id,
          original: { goal: activeWeek.goal }, ruleValue: { goal: suggestedGoal }, userValue: { goal: suggestedGoal }, status: "pending", appliedAt: "", undoneAt: "",
          basis: { workloadMinutes: workload, remainingCapacityMinutes: weekCapacity }, explanation: localExplanation("reduce-week-goal", { workload, capacity: weekCapacity })
        });
      }
    }
    return {
      id: `adjustment-${generatedFor}-${Date.now()}`, generatedFor, generatedAt: options && options.now || new Date().toISOString(), version: 1, status: suggestions.length ? "pending" : "complete",
      inputSummary: { dailyTaskCount: (input.dailyTasks || []).length, planCount: (input.plans || []).length, reflectionId: options && options.reflectionId || "" },
      capacity: { date: tomorrow, totalMinutes: capacity, fixedReviewMinutes: fixed.minutes, taskMinutes: available, fixed }, suggestions
    };
  }

  function getEntity(state, suggestion) {
    const list = suggestion.entityType === "plan" ? state.plans : state.dailyTasks;
    return (list || []).find((item) => item.id === suggestion.entityId) || null;
  }

  function matchesSnapshot(entity, original) {
    return entity && Object.entries(original || {}).every(([key, value]) => JSON.stringify(entity[key] === undefined ? null : entity[key]) === JSON.stringify(value));
  }

  function applySuggestions(state, run, ids, options) {
    const now = options && options.now || new Date().toISOString();
    const selected = new Set(ids || []);
    const conflicts = [];
    const applied = [];
    (run.suggestions || []).forEach((suggestion) => {
      if (!selected.has(suggestion.id) || suggestion.status === "accepted") return;
      const entity = getEntity(state, suggestion);
      if (!matchesSnapshot(entity, suggestion.original)) {
        suggestion.status = "conflict";
        conflicts.push(suggestion.id);
        return;
      }
      const value = suggestion.userValue || suggestion.ruleValue || {};
      suggestion.appliedChanges = [];
      if (suggestion.type === "split-task") {
        const children = Array.isArray(value.children) ? value.children : [];
        const first = children[0];
        if (!first) return;
        const firstDay = dayPlanForDate(state, weekForTask(state, entity)?.id, first.date, entity.subject);
        const firstValue = { title: first.title, date: first.date, estimatedMinutes: first.estimatedMinutes, priority: first.priority, linkedPlanId: firstDay ? firstDay.id : entity.linkedPlanId };
        Object.entries(firstValue).forEach(([field, after]) => {
          const before = entity[field] === undefined ? null : entity[field];
          if (JSON.stringify(before) === JSON.stringify(after)) return;
          entity[field] = after;
          suggestion.appliedChanges.push({ entityType: "dailyTask", entityId: entity.id, field, before, after });
        });
        if (suggestion.original.date !== first.date) {
          entity.scheduleHistory = Array.isArray(entity.scheduleHistory) ? entity.scheduleHistory : [];
          entity.scheduleHistory.push({ fromDate: suggestion.original.date, toDate: first.date, source: "adjustment", changedAt: now, suggestionRunId: run.id });
        }
        children.slice(1).forEach((child, childIndex) => {
          const index = childIndex + 1;
          const day = dayPlanForDate(state, weekForTask(state, entity)?.id, child.date, entity.subject);
          const created = { ...entity, ...child, id: `${entity.id}-split-${Date.now()}-${index + 1}`, status: "planned", completedAt: "", studyMinutes: 0, linkedPlanId: day ? day.id : entity.linkedPlanId, scheduleHistory: [] };
          state.dailyTasks.push(created);
          suggestion.appliedChanges.push({ entityType: "dailyTask", entityId: created.id, field: "__created", before: null, after: created });
        });
      } else {
        Object.entries(value).forEach(([field, after]) => {
          const before = entity[field] === undefined ? null : entity[field];
          if (JSON.stringify(before) === JSON.stringify(after)) return;
          entity[field] = after;
          suggestion.appliedChanges.push({ entityType: suggestion.entityType, entityId: entity.id, field, before, after });
        });
        if (suggestion.type === "move-task") {
          entity.scheduleHistory = Array.isArray(entity.scheduleHistory) ? entity.scheduleHistory : [];
          entity.scheduleHistory.push({ fromDate: suggestion.original.date, toDate: value.date, source: "adjustment", changedAt: now, suggestionRunId: run.id });
        }
      }
      suggestion.status = "accepted";
      suggestion.appliedAt = now;
      applied.push(suggestion.id);
    });
    run.status = (run.suggestions || []).some((item) => item.status === "pending") ? "pending" : "reviewed";
    return { state, run, applied, conflicts };
  }

  function undoSuggestion(state, run, suggestionId, options) {
    const suggestion = (run.suggestions || []).find((item) => item.id === suggestionId);
    if (!suggestion || suggestion.status !== "accepted" || suggestion.undoneAt) return { undone: false, conflicts: [] };
    const conflicts = [];
    [...(suggestion.appliedChanges || [])].reverse().forEach((change) => {
      const list = change.entityType === "plan" ? state.plans : state.dailyTasks;
      const index = (list || []).findIndex((item) => item.id === change.entityId);
      if (change.field === "__created") {
        if (index >= 0 && JSON.stringify(list[index]) === JSON.stringify(change.after)) list.splice(index, 1);
        else conflicts.push(change.entityId);
        return;
      }
      const entity = index >= 0 ? list[index] : null;
      if (!entity || JSON.stringify(entity[change.field] === undefined ? null : entity[change.field]) !== JSON.stringify(change.after)) { conflicts.push(`${change.entityId}:${change.field}`); return; }
      if (change.before === null) delete entity[change.field]; else entity[change.field] = change.before;
    });
    if (!conflicts.length) {
      suggestion.undoneAt = options && options.now || new Date().toISOString();
      suggestion.status = "undone";
    }
    return { undone: !conflicts.length, conflicts };
  }

  function rescheduleMetrics(tasks, days, today) {
    const start = addDays(today, -(days - 1));
    const histories = (tasks || []).flatMap((task) => (task.scheduleHistory || []).map((item) => ({ task, item }))).filter(({ item }) => dateKey(String(item.changedAt || "").slice(0, 10)) && compareDate(String(item.changedAt).slice(0, 10), start) >= 0 && compareDate(String(item.changedAt).slice(0, 10), today) <= 0);
    const repeated = new Set(histories.filter(({ task }) => taskRescheduleCount(task) >= 2).map(({ task }) => task.id));
    return { moves: histories.length, repeatedTasks: repeated.size, repeatRate: histories.length ? Math.round(histories.filter(({ task }) => taskRescheduleCount(task) >= 2).length / histories.length * 100) : 0 };
  }

  return { DEFAULT_DURATION_DEFAULTS, normalizeDurationDefaults, estimateTaskMinutes, capacityForDate, dueReviewLoad, taskRescheduleCount, generateRun, applySuggestions, undoSuggestion, rescheduleMetrics, addDays };
});
