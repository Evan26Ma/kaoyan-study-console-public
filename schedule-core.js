(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ScheduleCore = factory();
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const DEFAULT_SCHEDULE_SLOTS = [
    { id: "routine-start", startTime: "06:30", endTime: "07:30", title: "起床 + 早C + 时事新闻", arrangement: "起床、早C和时事新闻，不进入高强度学习", type: "routine", subjectHints: [], keywordHints: ["准备", "早C", "新闻", "时事"] },
    { id: "english-morning", startTime: "07:30", endTime: "08:00", title: "单词与知识点", arrangement: "大纲词、真题词和知识点背记", type: "study", subjectHints: ["英语"], keywordHints: ["单词", "词汇", "知识点"] },
    { id: "math-foundation", startTime: "08:00", endTime: "11:30", title: "上午数学主攻", arrangement: "听课、做题、复盘错题和总结题型方法，固定保留整块脑力时间", type: "study", subjectHints: ["数学"], keywordHints: ["数学", "高数", "线代", "概率", "刷题", "订正", "强化", "复盘"] },
    { id: "midday-rest", startTime: "11:30", endTime: "12:00", title: "午餐", arrangement: "按时吃饭，短暂离开书桌", type: "break", subjectHints: [], keywordHints: ["午餐", "吃饭"] },
    { id: "midday-exercise", startTime: "12:00", endTime: "13:00", title: "锻炼", arrangement: "进行一小时锻炼，恢复下午学习状态", type: "break", subjectHints: [], keywordHints: ["锻炼", "运动", "健身"] },
    { id: "midday-break", startTime: "13:00", endTime: "13:30", title: "洗漱 / 回馆 / 休整", arrangement: "洗漱、回到图书馆、补水并恢复状态", type: "break", subjectHints: [], keywordHints: ["休整", "回馆", "休息"] },
    { id: "midday-vocabulary", startTime: "13:30", endTime: "14:00", title: "单词 / 知识点", arrangement: "单词和知识点背记，为下午专业课热身", type: "study", subjectHints: ["英语"], keywordHints: ["知识点", "单词", "词汇"] },
    { id: "major-afternoon-1", startTime: "14:00", endTime: "17:00", title: "下午专业课", arrangement: "固定推进专业课教材、章节框架、计算和综合训练", type: "study", subjectHints: ["专业课"], keywordHints: ["专业课", "微观", "宏观", "经济", "计算", "综合题", "训练"] },
    { id: "evening-rest", startTime: "17:00", endTime: "18:00", title: "晚餐 + 单词", arrangement: "吃饭并完成一轮轻量单词复习", type: "break", subjectHints: ["英语"], keywordHints: ["晚餐", "吃饭", "单词", "词汇"] },
    { id: "english-evening", startTime: "18:00", endTime: "20:00", title: "晚间英语", arrangement: "阅读、精读、作文或翻译，保持连续输入", type: "study", subjectHints: ["英语"], keywordHints: ["英语", "阅读", "精读", "作文", "翻译", "长难句"] },
    { id: "wrong-review", startTime: "20:00", endTime: "22:00", title: "错题复盘 / 专业课补缺", arrangement: "处理错题和专业课薄弱环节，避免白天学过就丢", type: "review", subjectHints: ["专业课"], keywordHints: ["错题", "复盘", "整理", "订正", "专业课", "补缺"] },
    { id: "major-evening", startTime: "22:00", endTime: "23:00", title: "今日复盘", arrangement: "确认完成情况、整理错题、写下明日计划，不再安排高强度新内容", type: "review", subjectHints: [], keywordHints: ["今日复盘", "完成情况", "明日计划", "错题整理", "总结"] },
    { id: "night-rest", startTime: "23:00", endTime: "06:30", title: "睡眠", arrangement: "结束学习，保证睡眠", type: "sleep", subjectHints: [], keywordHints: ["睡眠", "休息"] }
  ];

  const DEFAULT_FOCUS_NOTES = [
    { id: "focus-math", title: "上午数学", copy: "8:00–11:30 固定给数学，作为一天中最需要脑力的主攻时间。", slotIds: ["math-foundation"] },
    { id: "focus-major", title: "下午专业课", copy: "14:00–17:00 固定推进专业课，保持大块时间完成主线和训练。", slotIds: ["major-afternoon-1"] },
    { id: "focus-english", title: "晚间英语", copy: "18:00–20:00 学英语，优先完成阅读、精读、作文或翻译。", slotIds: ["english-morning", "english-evening"] },
    { id: "focus-review", title: "晚间收尾", copy: "20:00 后处理错题和专业课补缺，22:00 转入复盘与明日计划。", slotIds: ["wrong-review", "major-evening"] }
  ];

  const AUTO_RULES = [
    { name: "wrong-review", pattern: /错题|复盘|订正|整理错题|总结错题/, ids: ["wrong-review"] },
    { name: "vocabulary", pattern: /单词|词汇|知识点|语境词/, ids: ["midday-vocabulary", "english-morning"] },
    { name: "math", pattern: /数学|高数|线代|概率/, ids: ["math-foundation"] },
    { name: "major", pattern: /专业课|微观|宏观|西方经济学|经济学|计算题/, ids: ["major-afternoon-1"] },
    { name: "english", pattern: /英语|阅读|长难句|翻译|作文/, ids: ["english-morning", "english-evening"] }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function cleanText(value, fallback = "") {
    const text = typeof value === "string" ? value.trim() : "";
    return text || fallback;
  }

  function textList(value) {
    if (Array.isArray(value)) return value.map((item) => cleanText(item)).filter(Boolean);
    if (typeof value === "string") return value.split(/[,，、;；\n]/).map((item) => item.trim()).filter(Boolean);
    return [];
  }

  function timeToMinutes(value) {
    if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  }

  function minutesToTime(value) {
    const minutes = ((Math.round(Number(value) || 0) % 1440) + 1440) % 1440;
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  function isValidTime(value) {
    return timeToMinutes(value) !== null;
  }

  function timeRangeMinutes(startTime, endTime) {
    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    if (start === null || end === null || start === end) return 0;
    return end > start ? end - start : end + 1440 - start;
  }

  function normalizeSlot(value, index = 0) {
    if (!value || typeof value !== "object") return null;
    const startTime = isValidTime(value.startTime) ? value.startTime : isValidTime(value.start) ? value.start : "";
    const endTime = isValidTime(value.endTime) ? value.endTime : isValidTime(value.end) ? value.end : "";
    if (!startTime || !endTime || !timeRangeMinutes(startTime, endTime)) return null;
    const type = ["study", "break", "routine", "review", "sleep"].includes(value.type) ? value.type : "study";
    return {
      id: cleanText(value.id, `routine-slot-${index + 1}`),
      startTime,
      endTime,
      title: cleanText(value.title || value.name, "未命名时段"),
      arrangement: cleanText(value.arrangement || value.content || value.description, ""),
      type,
      subjectHints: textList(value.subjectHints),
      keywordHints: textList(value.keywordHints)
    };
  }

  function normalizeFocusNote(value, index = 0) {
    if (typeof value === "string") return { id: `focus-${index + 1}`, title: value.trim(), copy: "", slotIds: [] };
    if (!value || typeof value !== "object") return null;
    return {
      id: cleanText(value.id, `focus-${index + 1}`),
      title: cleanText(value.title, "执行重点"),
      copy: cleanText(value.copy || value.note || value.description, ""),
      slotIds: Array.from(new Set((Array.isArray(value.slotIds) ? value.slotIds : []).map((id) => cleanText(id)).filter(Boolean)))
    };
  }

  function normalizeStudyRoutine(value) {
    const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const rawSlots = Array.isArray(source.slots) ? source.slots : [];
    const seen = new Set();
    const slots = rawSlots.map(normalizeSlot).filter((slot) => {
      if (!slot || seen.has(slot.id)) return false;
      seen.add(slot.id);
      return true;
    });
    const normalizedSlots = (slots.length ? slots : DEFAULT_SCHEDULE_SLOTS.map(normalizeSlot))
      .sort((left, right) => timeToMinutes(left.startTime) - timeToMinutes(right.startTime));
    const focusSource = Array.isArray(source.focusNotes) ? source.focusNotes : DEFAULT_FOCUS_NOTES;
    const focusNotes = focusSource.map(normalizeFocusNote).filter(Boolean);
    return {
      version: Math.max(1, Number(source.version) || 1),
      slots: normalizedSlots,
      focusNotes: focusNotes.length ? focusNotes : clone(DEFAULT_FOCUS_NOTES)
    };
  }

  function slotBounds(slot) {
    const start = timeToMinutes(slot.startTime);
    const end = timeToMinutes(slot.endTime);
    return { start, end: end > start ? end : end + 1440 };
  }

  function containsClock(slot, minutes) {
    const { start, end } = slotBounds(slot);
    const value = ((minutes % 1440) + 1440) % 1440;
    return end <= 1440 ? value >= start && value < end : value >= start || value < end - 1440;
  }

  function getTimeZoneParts(value, timeZone) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    if (Number.isNaN(date.getTime())) return { hour: 0, minute: 0, second: 0 };
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone || "Asia/Shanghai",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return { hour: Number(values.hour) || 0, minute: Number(values.minute) || 0, second: Number(values.second) || 0 };
  }

  function currentMinutes(value, timeZone = "Asia/Shanghai") {
    if (typeof value === "number") return ((Math.floor(value) % 1440) + 1440) % 1440;
    if (value && typeof value === "object" && Number.isFinite(value.minutes)) return currentMinutes(value.minutes);
    const parts = getTimeZoneParts(value, timeZone);
    return parts.hour * 60 + parts.minute + parts.second / 60;
  }

  function distanceToStart(from, start) {
    return (start - from + 1440) % 1440;
  }

  function getRoutineContext(value, now = new Date(), timeZone = "Asia/Shanghai") {
    const routine = Array.isArray(value) ? { slots: value } : normalizeStudyRoutine(value);
    const slots = routine.slots;
    const minutes = currentMinutes(now, timeZone);
    const currentIndex = slots.findIndex((slot) => containsClock(slot, minutes));
    const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % slots.length : slots
      .map((slot, index) => ({ index, distance: distanceToStart(minutes, timeToMinutes(slot.startTime)) }))
      .sort((left, right) => left.distance - right.distance)[0]?.index || 0;
    const previousIndex = currentIndex >= 0 ? (currentIndex - 1 + slots.length) % slots.length : (nextIndex - 1 + slots.length) % slots.length;
    const current = currentIndex >= 0 ? slots[currentIndex] : null;
    const next = slots[nextIndex] || null;
    const previous = slots[previousIndex] || null;
    let remainingMinutes = next ? distanceToStart(minutes, timeToMinutes(next.startTime)) : 0;
    if (current) {
      const bounds = slotBounds(current);
      const effectiveNow = bounds.end > 1440 && minutes < bounds.end - 1440 ? minutes + 1440 : minutes;
      remainingMinutes = Math.max(0, bounds.end - effectiveNow);
    }
    return {
      nowMinutes: minutes,
      current,
      previous,
      next,
      currentIndex,
      nextIndex,
      previousIndex,
      remainingMinutes,
      isRest: Boolean(current && ["break", "sleep"].includes(current.type)),
      clock: minutesToTime(Math.floor(minutes))
    };
  }

  function taskText(task) {
    return [task && task.subject, task && task.title, task && task.category, task && task.notes, task && task.knowledgePoints]
      .flat().filter(Boolean).join(" ").toLowerCase();
  }

  function overlapMinutes(taskStart, taskEnd, slotStart, slotEnd) {
    const taskLength = timeRangeMinutes(minutesToTime(taskStart), minutesToTime(taskEnd));
    if (!taskLength) return 0;
    const taskEndAbsolute = taskStart + taskLength;
    let best = 0;
    for (const shift of [-1440, 0, 1440]) {
      best = Math.max(best, Math.max(0, Math.min(taskEndAbsolute, slotEnd + shift) - Math.max(taskStart, slotStart + shift)));
    }
    return best;
  }

  function matchTaskByTime(task, slots) {
    if (!task || !isValidTime(task.startTime) || !isValidTime(task.endTime) || !timeRangeMinutes(task.startTime, task.endTime)) return null;
    const start = timeToMinutes(task.startTime);
    const end = start + timeRangeMinutes(task.startTime, task.endTime);
    const candidates = slots.map((slot, index) => {
      const bounds = slotBounds(slot);
      return { slot, index, overlapMinutes: overlapMinutes(start, end, bounds.start, bounds.end) };
    }).filter((item) => item.overlapMinutes > 0)
      .sort((left, right) => right.overlapMinutes - left.overlapMinutes || left.index - right.index);
    return candidates[0] ? { ...candidates[0], source: "time", reason: "按起止时间重叠最长匹配" } : null;
  }

  function slotMatchesText(slot, text) {
    const hints = [...slot.subjectHints, ...slot.keywordHints, slot.title, slot.arrangement].filter(Boolean);
    return hints.some((hint) => text.includes(String(hint).toLowerCase()));
  }

  function matchTaskByKeywords(task, slots) {
    const text = taskText(task);
    if (!text) return null;
    const fallbackSlots = slots.filter((slot) => !["routine", "break", "sleep"].includes(slot.type));
    for (const rule of AUTO_RULES) {
      if (!rule.pattern.test(text)) continue;
      const candidates = rule.ids.map((id) => slots.find((slot) => slot.id === id)).filter(Boolean);
      const fallback = fallbackSlots.filter((slot) => slotMatchesText(slot, text));
      const slot = candidates[0] || fallback[0];
      if (slot) return { slot, source: "keyword", reason: `按${rule.name}提示规则匹配`, overlapMinutes: 0 };
    }
    const slot = fallbackSlots.find((item) => slotMatchesText(item, text));
    return slot ? { slot, source: "keyword", reason: "按时段提示词匹配", overlapMinutes: 0 } : null;
  }

  function matchTaskToSlot(task, routineOrSlots) {
    const routine = Array.isArray(routineOrSlots) ? { slots: routineOrSlots } : normalizeStudyRoutine(routineOrSlots);
    const slots = routine.slots;
    const manual = cleanText(task && task.scheduleSlotId, "");
    if (manual) {
      const slot = slots.find((item) => item.id === manual);
      if (slot) return { task, slot, slotId: slot.id, source: "manual", reason: "手动指定", overlapMinutes: 0 };
    }
    const byTime = matchTaskByTime(task, slots);
    if (byTime) return { task, slot: byTime.slot, slotId: byTime.slot.id, source: byTime.source, reason: byTime.reason, overlapMinutes: byTime.overlapMinutes };
    const byKeywords = matchTaskByKeywords(task, slots);
    if (byKeywords) return { task, slot: byKeywords.slot, slotId: byKeywords.slot.id, source: byKeywords.source, reason: byKeywords.reason, overlapMinutes: 0 };
    return { task, slot: null, slotId: "", source: "flexible", reason: "没有足够的时间或提示词", overlapMinutes: 0 };
  }

  function matchTasksToSlots(tasks, routineOrSlots) {
    const routine = Array.isArray(routineOrSlots) ? { slots: routineOrSlots } : normalizeStudyRoutine(routineOrSlots);
    const assignments = (Array.isArray(tasks) ? tasks : []).map((task) => matchTaskToSlot(task, routine));
    const groups = routine.slots.map((slot) => ({ slot, tasks: assignments.filter((item) => item.slotId === slot.id) }));
    return { routine, assignments, groups, flexibleTasks: assignments.filter((item) => !item.slotId).map((item) => item.task) };
  }

  function estimateTaskMinutes(task) {
    const values = [task && task.estimatedMinutes, task && task.studyMinutes, task && task.completedEstimateMinutes];
    const value = values.map(Number).find((item) => Number.isFinite(item) && item > 0);
    return value ? Math.round(value) : 0;
  }

  function getSlotProgress(tasks, slotId, routineOrSlots) {
    const matched = matchTasksToSlots(tasks, routineOrSlots);
    const items = matched.assignments.filter((item) => item.slotId === slotId);
    const totalMinutes = items.reduce((sum, item) => sum + estimateTaskMinutes(item.task), 0);
    const completedMinutes = items.filter((item) => item.task && item.task.status === "done").reduce((sum, item) => sum + estimateTaskMinutes(item.task), 0);
    return {
      total: items.length,
      done: items.filter((item) => item.task && item.task.status === "done").length,
      pending: items.filter((item) => !item.task || item.task.status !== "done").length,
      totalMinutes,
      completedMinutes,
      percent: items.length ? Math.round((items.filter((item) => item.task && item.task.status === "done").length / items.length) * 100) : 0,
      assignments: items
    };
  }

  function getAllSlotProgress(tasks, routineOrSlots) {
    const routine = Array.isArray(routineOrSlots) ? { slots: routineOrSlots } : normalizeStudyRoutine(routineOrSlots);
    return routine.slots.map((slot) => ({ slot, ...getSlotProgress(tasks, slot.id, routine) }));
  }

  return {
    DEFAULT_SCHEDULE_SLOTS: clone(DEFAULT_SCHEDULE_SLOTS),
    DEFAULT_FOCUS_NOTES: clone(DEFAULT_FOCUS_NOTES),
    normalizeStudyRoutine,
    normalizeSlot,
    normalizeFocusNote,
    timeToMinutes,
    minutesToTime,
    isValidTime,
    timeRangeMinutes,
    slotBounds,
    currentMinutes,
    getRoutineContext,
    overlapMinutes,
    matchTaskByTime,
    matchTaskByKeywords,
    matchTaskToSlot,
    matchTaskToRoutineSlot: matchTaskToSlot,
    matchTasksToSlots,
    matchTasksToRoutine: matchTasksToSlots,
    getSlotProgress,
    calculateSlotProgress: getSlotProgress,
    getAllSlotProgress
  };
}));
