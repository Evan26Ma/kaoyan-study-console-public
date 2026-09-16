(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Manual45ContentCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;
  const TOTAL_DAYS = 45;
  const MAX_LIST = 63;
  const REVIEW_OFFSETS = [1, 2, 4, 7, 15, 30];
  const UNIT_TYPES = new Set(["concept", "shortAnswer"]);
  const MAX_RECITATION_ATTEMPT_LENGTH = 12000;
  const MAX_RECITATION_HISTORY = 20;
  const MAX_MEMORIZATION_HISTORY = 100;
  const MAX_ISSUE_REASON_LENGTH = 2000;

  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function text(value, fallback = "") {
    const result = typeof value === "string" ? value.trim() : "";
    return result || fallback;
  }

  function dateKey(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? value : "";
  }

  function number(value, fallback = 0) {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  }

  function clamp(value, min, max, fallback) {
    return Math.min(max, Math.max(min, Math.round(number(value, fallback))));
  }

  function makeProgressEntry(value) {
    const source = asObject(value);
    return {
      completedAt: dateKey(source.completedAt) || "",
      score: Number.isInteger(Number(source.score)) && Number(source.score) >= 1 && Number(source.score) <= 5 ? Number(source.score) : null,
      answerExpanded: Boolean(source.answerExpanded),
      note: text(source.note),
      updatedAt: text(source.updatedAt)
    };
  }

  function normalizeProgress(value) {
    const source = asObject(value);
    const result = {};
    Object.entries(source).forEach(([unitId, entries]) => {
      if (!text(unitId)) return;
      const normalizedEntries = {};
      if (Array.isArray(entries)) {
        entries.forEach((entry) => {
          const day = clamp(entry && (entry.day || entry.plannerDay), 1, TOTAL_DAYS, 0);
          if (day) normalizedEntries[String(day)] = makeProgressEntry(entry);
        });
      } else {
        Object.entries(asObject(entries)).forEach(([day, entry]) => {
          if (/^\d+$/.test(day) && Number(day) >= 1 && Number(day) <= TOTAL_DAYS) normalizedEntries[String(Number(day))] = makeProgressEntry(entry);
        });
      }
      result[unitId] = normalizedEntries;
    });
    return result;
  }

  function normalizeBindings(value) {
    const source = asObject(value);
    const result = {};
    Object.entries(source).forEach(([unitId, binding]) => {
      if (!text(unitId)) return;
      const item = asObject(binding);
      const listId = clamp(item.listId || item.list || item.value, 1, MAX_LIST, 0);
      if (!listId) return;
      result[unitId] = {
        listId,
        boundAt: text(item.boundAt),
        updatedAt: text(item.updatedAt)
      };
    });
    return result;
  }

  function normalizeRevision(value) {
    if (typeof value === "string") return { markdown: value, updatedAt: "", sourceHash: "" };
    const source = asObject(value);
    return {
      markdown: typeof source.markdown === "string" ? source.markdown : text(source.content),
      updatedAt: text(source.updatedAt),
      sourceHash: text(source.sourceHash)
    };
  }

  function normalizeRevisions(value) {
    const source = asObject(value);
    const result = {};
    Object.entries(source).forEach(([unitId, revision]) => {
      if (!text(unitId)) return;
      if (Array.isArray(revision)) result[unitId] = revision.map(normalizeRevision).filter((item) => item.markdown);
      else {
        const item = normalizeRevision(revision);
        result[unitId] = item.markdown ? [item] : [];
      }
    });
    return result;
  }

  function normalizeMemorized(value) {
    const source = asObject(value);
    const result = {};
    Object.entries(source).forEach(([unitId, entry]) => {
      if (!text(unitId) || entry === false || entry === null) return;
      const item = entry && typeof entry === "object" ? entry : { memorizedAt: entry };
      const legacy = text(item.memorizedAt);
      const history = (Array.isArray(item.history) ? item.history : []).map((value) => text(value)).filter(Boolean).slice(-MAX_MEMORIZATION_HISTORY);
      if (!history.length && legacy) history.push(legacy);
      const first = history[0] || legacy;
      if (!first) return;
      result[unitId] = { active: item.active === undefined ? true : Boolean(item.active), memorizedAt: first, updatedAt: text(item.updatedAt, history[history.length - 1] || first), history };
    });
    return result;
  }

  function normalizeRecitationResult(value) {
    const source = asObject(value);
    const scoreValue = Number(source.score);
    const score = Number.isFinite(scoreValue) ? Math.min(10, Math.max(0, Math.round(scoreValue * 10) / 10)) : null;
    const list = (item) => Array.isArray(item) ? item.map((entry) => text(entry).slice(0, 400)).filter(Boolean).slice(0, 12) : [];
    return {
      score,
      maxScore: 10,
      summary: text(source.summary).slice(0, 800),
      shortcomings: list(source.shortcomings),
      reinforcementPoints: list(source.reinforcementPoints),
      memoryTechnique: text(source.memoryTechnique).slice(0, 1200)
    };
  }

  function normalizeRecitationReviews(value) {
    const source = asObject(value);
    const result = {};
    Object.entries(source).forEach(([unitId, review]) => {
      if (!text(unitId)) return;
      const item = asObject(review);
      const rawHistory = Array.isArray(item.history) ? item.history.map((entry) => {
        const record = asObject(entry);
        const attempt = text(record.attempt || record.lastAttempt).slice(0, MAX_RECITATION_ATTEMPT_LENGTH);
        const resultValue = normalizeRecitationResult(record.result || record.lastResult);
        const attemptNumber = Math.max(0, Math.floor(number(record.attemptNumber, 0)));
        return attempt && resultValue.score !== null ? { attempt, result: resultValue, updatedAt: text(record.updatedAt), attemptNumber } : null;
      }).filter(Boolean) : [];
      const lastAttempt = text(item.lastAttempt).slice(0, MAX_RECITATION_ATTEMPT_LENGTH);
      const lastResult = normalizeRecitationResult(item.lastResult);
      if (!rawHistory.length && lastAttempt && lastResult.score !== null) rawHistory.push({ attempt: lastAttempt, result: lastResult, updatedAt: text(item.updatedAt), attemptNumber: 0 });
      const explicitTotal = Math.max(0, Math.floor(number(item.totalAttempts, 0)));
      const highestNumber = rawHistory.reduce((highest, record) => Math.max(highest, record.attemptNumber), 0);
      const totalAttempts = Math.max(explicitTotal, highestNumber, rawHistory.length);
      const firstNumber = Math.max(1, totalAttempts - rawHistory.length + 1);
      const validSequence = rawHistory.every((record, index) => record.attemptNumber > 0 && (!index || record.attemptNumber > rawHistory[index - 1].attemptNumber));
      const history = rawHistory.map((record, index) => ({ ...record, attemptNumber: validSequence ? record.attemptNumber : firstNumber + index })).slice(-MAX_RECITATION_HISTORY);
      if (lastAttempt && lastResult.score !== null) {
        result[unitId] = { lastAttempt, lastResult, history, totalAttempts: Math.max(totalAttempts, 1), updatedAt: text(item.updatedAt) };
      } else if (history.length) {
        const last = history[history.length - 1];
        result[unitId] = { lastAttempt: last.attempt, lastResult: last.result, history, totalAttempts: Math.max(totalAttempts, last.attemptNumber), updatedAt: last.updatedAt };
      }
    });
    return result;
  }

  function normalizeStudyEntry(value) {
    const source = asObject(value);
    const scoreValue = Number(source.score);
    return {
      score: Number.isInteger(scoreValue) && scoreValue >= 1 && scoreValue <= 5 ? scoreValue : null,
      note: typeof source.note === "string" ? source.note.slice(0, 6000) : text(source.note).slice(0, 6000),
      updatedAt: text(source.updatedAt)
    };
  }

  function normalizeStudy(value) {
    const source = asObject(value);
    const result = {};
    Object.entries(source).forEach(([unitId, entry]) => {
      if (!text(unitId)) return;
      const normalized = normalizeStudyEntry(entry);
      // 保留空的独立记录：它可能明确表示用户已清空旧兼容笔记，不能再次回退到旧 Day 数据。
      result[unitId] = normalized;
    });
    return result;
  }

  function normalizeIssueReport(value) {
    const source = asObject(value);
    return { reason: text(source.reason).slice(0, MAX_ISSUE_REASON_LENGTH), updatedAt: text(source.updatedAt), sourceHash: text(source.sourceHash).slice(0, 200) };
  }

  function normalizeIssueReports(value) {
    const result = {};
    Object.entries(asObject(value)).forEach(([unitId, report]) => {
      const id = text(unitId);
      const normalized = normalizeIssueReport(report);
      if (id && normalized.reason) result[id] = normalized;
    });
    return result;
  }

  function normalizeUnit(value, index = 0) {
    const source = asObject(value);
    const type = UNIT_TYPES.has(source.type) ? source.type : source.type === "short-answer" ? "shortAnswer" : "concept";
    const id = text(source.unitId || source.id, `manual45-unit-${index + 1}`);
    const images = Array.isArray(source.images) ? source.images.map((image) => {
      const item = asObject(image);
      return {
        id: text(item.id || item.assetId),
        sourceUrl: text(item.sourceUrl || item.url),
        url: text(item.url || item.localPath),
        alt: text(item.alt, "手册配图")
      };
    }).filter((item) => item.sourceUrl || item.url) : [];
    return {
      unitId: id,
      part: text(source.part),
      lecture: text(source.lecture, "未标注讲次"),
      lectureNumber: Number.isInteger(Number(source.lectureNumber)) ? Number(source.lectureNumber) : null,
      type,
      number: Number.isInteger(Number(source.number)) ? Number(source.number) : null,
      title: text(source.title, "未命名内容单元"),
      promptMarkdown: typeof source.promptMarkdown === "string" ? source.promptMarkdown.trim() : "",
      answerMarkdown: typeof source.answerMarkdown === "string" ? source.answerMarkdown.trim() : "",
      rawMarkdown: typeof source.rawMarkdown === "string" ? source.rawMarkdown : "",
      images,
      warnings: Array.isArray(source.warnings) ? source.warnings.map((item) => text(item)).filter(Boolean) : [],
      sourceLineStart: Number.isInteger(Number(source.sourceLineStart)) ? Number(source.sourceLineStart) : null,
      sourceLineEnd: Number.isInteger(Number(source.sourceLineEnd)) ? Number(source.sourceLineEnd) : null
    };
  }

  function normalizePackage(value) {
    const source = asObject(value);
    const units = Array.isArray(source.units) ? source.units.map(normalizeUnit) : [];
    const packageWarnings = Array.isArray(source.warnings) ? source.warnings.map((item) => {
      const warning = asObject(item);
      return typeof item === "string" ? { code: "import-warning", message: item } : { code: text(warning.code, "import-warning"), message: text(warning.message, "资料质量提示"), lecture: text(warning.lecture), unitId: text(warning.unitId) };
    }) : [];
    return {
      version: VERSION,
      packageId: text(source.packageId, "local-manual"),
      title: text(source.title, "本地背诵手册"),
      subject: text(source.subject, "专业课"),
      sourcePath: text(source.sourcePath),
      sourceHash: text(source.sourceHash),
      importedAt: text(source.importedAt),
      originalMarkdown: typeof source.originalMarkdown === "string" ? source.originalMarkdown : "",
      lectures: Array.isArray(source.lectures) ? source.lectures.map((lecture) => {
        const item = asObject(lecture);
        return { part: text(item.part), number: Number.isInteger(Number(item.number)) ? Number(item.number) : null, title: text(item.title, "未标注讲次"), unitIds: Array.isArray(item.unitIds) ? item.unitIds.map(String) : [] };
      }) : [],
      assets: Array.isArray(source.assets) ? source.assets.map((asset) => {
        const item = asObject(asset);
        return { id: text(item.id), sourceUrl: text(item.sourceUrl || item.url), localPath: text(item.localPath || item.url), status: text(item.status, "cached"), bytes: number(item.bytes, 0) };
      }).filter((item) => item.id || item.sourceUrl) : [],
      units,
      warnings: packageWarnings,
      rawSections: Array.isArray(source.rawSections) ? source.rawSections : []
    };
  }

  function normalizeState(value) {
    const source = asObject(value);
    const packageSource = source.package && typeof source.package === "object" ? source.package : source;
    return {
      package: normalizePackage(packageSource),
      bindings: normalizeBindings(source.bindings),
      progress: normalizeProgress(source.progress),
      revisions: normalizeRevisions(source.revisions),
      memorized: normalizeMemorized(source.memorized),
      recitationReviews: normalizeRecitationReviews(source.recitationReviews),
      study: normalizeStudy(source.study),
      issueReports: normalizeIssueReports(source.issueReports),
      updatedAt: text(source.updatedAt),
      revision: Math.max(0, Math.floor(number(source.revision, 0)))
    };
  }

  function emptyState(pkg) {
    const normalizedPackage = normalizePackage(pkg);
    return { package: normalizedPackage, bindings: {}, progress: {}, revisions: {}, memorized: {}, recitationReviews: {}, study: {}, issueReports: {}, updatedAt: "", revision: 0 };
  }

  function newDayForList(listId) {
    const value = Number(listId);
    return Number.isInteger(value) && value >= 1 && value <= MAX_LIST ? Math.ceil(value / 2) : null;
  }

  function scheduleForDay(day, maxList = MAX_LIST) {
    const value = Number(day);
    if (!Number.isInteger(value) || value < 1 || value > TOTAL_DAYS) return null;
    const first = value * 2 - 1;
    const newlyLearned = [first, first + 1].filter((id) => id <= maxList);
    const review = [];
    for (let listId = 1; listId <= maxList; listId += 1) {
      const newDay = newDayForList(listId);
      if (newDay && REVIEW_OFFSETS.some((offset) => newDay + offset === value)) review.push(listId);
    }
    return { day: value, new: newlyLearned, review };
  }

  function currentDay(manual45Progress) {
    const source = asObject(manual45Progress);
    const completed = asObject(source.completedDays);
    let day = 1;
    while (day <= TOTAL_DAYS && dateKey(completed[String(day)])) day += 1;
    return day;
  }

  function completedDayForDate(manual45Progress, date) {
    const completed = asObject(asObject(manual45Progress).completedDays);
    const match = Object.entries(completed).find(([, value]) => value === date);
    return match ? Number(match[0]) : null;
  }

  function unitsForList(state, listId) {
    const source = normalizeState(state);
    return source.package.units.filter((unit) => source.bindings[unit.unitId]?.listId === Number(listId));
  }

  function unitsForSchedule(state, day, options = {}) {
    const source = normalizeState(state);
    const schedule = scheduleForDay(day, options.maxList || MAX_LIST);
    if (!schedule) return [];
    const rows = [];
    schedule.new.forEach((listId) => unitsForList(source, listId).forEach((unit) => rows.push({ unit, listId, day: Number(day), kind: "new" })));
    schedule.review.forEach((listId) => unitsForList(source, listId).forEach((unit) => rows.push({ unit, listId, day: Number(day), kind: "review" })));
    return rows;
  }

  function progressFor(state, unitId, day) {
    const source = normalizeState(state);
    return makeProgressEntry(source.progress[unitId]?.[String(day)]);
  }

  function isCompleted(state, unitId, day) {
    return Boolean(progressFor(state, unitId, day).completedAt);
  }

  function isMemorized(state, unitId) {
    const source = normalizeState(state);
    return Boolean(source.memorized[text(unitId)]?.active);
  }

  function scheduleProgress(state, day) {
    const rows = unitsForSchedule(state, day);
    const completed = rows.filter((row) => isCompleted(state, row.unit.unitId, row.day)).length;
    return { total: rows.length, completed, pending: Math.max(0, rows.length - completed), percent: rows.length ? Math.round(completed / rows.length * 100) : 0 };
  }

  function setProgress(state, unitId, day, patch) {
    const source = normalizeState(state);
    const id = text(unitId);
    const dayKey = String(Number(day));
    if (!id || !/^([1-9]|[1-3]\d|4[0-5])$/.test(dayKey)) return source;
    if (!source.progress[id]) source.progress[id] = {};
    const current = makeProgressEntry(source.progress[id][dayKey]);
    const incoming = asObject(patch);
    source.progress[id][dayKey] = {
      ...current,
      ...(Object.prototype.hasOwnProperty.call(incoming, "completedAt") ? { completedAt: dateKey(incoming.completedAt) } : {}),
      ...(Object.prototype.hasOwnProperty.call(incoming, "score") ? { score: Number.isInteger(Number(incoming.score)) && Number(incoming.score) >= 1 && Number(incoming.score) <= 5 ? Number(incoming.score) : null } : {}),
      ...(Object.prototype.hasOwnProperty.call(incoming, "answerExpanded") ? { answerExpanded: Boolean(incoming.answerExpanded) } : {}),
      ...(Object.prototype.hasOwnProperty.call(incoming, "note") ? { note: text(incoming.note) } : {})
    };
    source.progress[id][dayKey].updatedAt = text(incoming.updatedAt, new Date().toISOString());
    source.updatedAt = source.progress[id][dayKey].updatedAt;
    source.revision += 1;
    return source;
  }

  function bindUnits(state, unitIds, listId, now = new Date().toISOString()) {
    const source = normalizeState(state);
    const id = clamp(listId, 1, MAX_LIST, 0);
    if (!id) return source;
    const allowed = new Set(Array.isArray(unitIds) ? unitIds.map(String) : []);
    source.package.units.forEach((unit) => {
      if (allowed.has(unit.unitId)) source.bindings[unit.unitId] = { listId: id, boundAt: source.bindings[unit.unitId]?.boundAt || now, updatedAt: now };
    });
    source.updatedAt = now;
    source.revision += 1;
    return source;
  }

  function unbindUnits(state, unitIds, now = new Date().toISOString()) {
    const source = normalizeState(state);
    (Array.isArray(unitIds) ? unitIds : []).map(String).forEach((id) => {
      if (source.bindings[id]) delete source.bindings[id];
    });
    source.updatedAt = now;
    source.revision += 1;
    return source;
  }

  function addRevision(state, unitId, markdown, sourceHash = "", now = new Date().toISOString()) {
    const source = normalizeState(state);
    const id = text(unitId);
    if (!id || typeof markdown !== "string" || !markdown.trim()) return source;
    if (!source.revisions[id]) source.revisions[id] = [];
    source.revisions[id].push({ markdown, updatedAt: now, sourceHash: text(sourceHash) });
    source.updatedAt = now;
    source.revision += 1;
    return source;
  }

  function setMemorized(state, unitId, memorized = true, now = new Date().toISOString()) {
    const source = normalizeState(state);
    const id = text(unitId);
    if (!id) return source;
    if (memorized) {
      const current = normalizeMemorizedEntry(source.memorized[id]);
      const history = [...current.history, now].slice(-MAX_MEMORIZATION_HISTORY);
      source.memorized[id] = {
        active: true,
        memorizedAt: history[0] || now,
        updatedAt: now,
        history
      };
    } else {
      const current = normalizeMemorizedEntry(source.memorized[id]);
      if (!current.history.length) return source;
      source.memorized[id] = { ...current, active: false, updatedAt: now };
    }
    source.updatedAt = now;
    source.revision += 1;
    return source;
  }

  function normalizeMemorizedEntry(value) {
    const source = value && typeof value === "object" ? value : {};
    const legacy = text(source.memorizedAt);
    const history = (Array.isArray(source.history) ? source.history : []).map((item) => text(item)).filter(Boolean).slice(-MAX_MEMORIZATION_HISTORY);
    if (!history.length && legacy) history.push(legacy);
    return { active: source.active === undefined ? Boolean(history.length) : Boolean(source.active), memorizedAt: history[0] || legacy, updatedAt: text(source.updatedAt, history[history.length - 1] || legacy), history };
  }

  function setRecitationReview(state, unitId, attempt, result, now = new Date().toISOString()) {
    const source = normalizeState(state);
    const id = text(unitId);
    const normalizedAttempt = text(attempt).slice(0, MAX_RECITATION_ATTEMPT_LENGTH);
    const normalizedResult = normalizeRecitationResult(result);
    if (!id || !normalizedAttempt || normalizedResult.score === null) return source;
    const current = source.recitationReviews[id] || { history: [], totalAttempts: 0 };
    const history = Array.isArray(current.history) ? current.history.slice(-MAX_RECITATION_HISTORY + 1) : [];
    const totalAttempts = Math.max(Number(current.totalAttempts) || 0, ...history.map((entry) => Number(entry.attemptNumber) || 0)) + 1;
    history.push({ attempt: normalizedAttempt, result: normalizedResult, updatedAt: now, attemptNumber: totalAttempts });
    source.recitationReviews[id] = { lastAttempt: normalizedAttempt, lastResult: normalizedResult, history, totalAttempts, updatedAt: now };
    source.updatedAt = now;
    source.revision += 1;
    return source;
  }

  function recitationReviewFor(state, unitId) {
    return normalizeState(state).recitationReviews[text(unitId)] || null;
  }

  function issueReportFor(state, unitId) {
    return normalizeIssueReport(normalizeState(state).issueReports[text(unitId)]);
  }

  function setIssueReport(state, unitId, reason, sourceHash = "", now = new Date().toISOString()) {
    const source = normalizeState(state);
    const id = text(unitId);
    const normalizedReason = text(reason).slice(0, MAX_ISSUE_REASON_LENGTH);
    if (!id || !normalizedReason) return source;
    source.issueReports[id] = { reason: normalizedReason, updatedAt: text(now, new Date().toISOString()), sourceHash: text(sourceHash).slice(0, 200) };
    source.updatedAt = source.issueReports[id].updatedAt;
    source.revision += 1;
    return source;
  }

  function latestProgressScore(state, unitId) {
    const source = asObject(state);
    const entries = Object.entries(asObject(source.progress)[text(unitId)] || {})
      .map(([day, entry]) => ({ day: Number(day), entry }))
      .filter(({ entry }) => Number.isInteger(entry.score))
      .sort((left, right) => String(right.entry.updatedAt || right.entry.completedAt).localeCompare(String(left.entry.updatedAt || left.entry.completedAt)) || right.day - left.day);
    return entries.length ? entries[0].entry.score : null;
  }

  function latestLegacyNote(state, unitId) {
    const source = normalizeState(state);
    const entries = Object.entries(asObject(source.progress)[text(unitId)] || {})
      .map(([day, entry]) => ({ day: Number(day), entry }))
      .filter(({ entry }) => text(entry.note))
      .sort((left, right) => String(right.entry.updatedAt || right.entry.completedAt).localeCompare(String(left.entry.updatedAt || left.entry.completedAt)) || right.day - left.day);
    return entries.length ? text(entries[0].entry.note) : "";
  }

  function studyFor(state, unitId) {
    const source = normalizeState(state);
    const id = text(unitId);
    const current = source.study[id];
    if (current) return current;
    const score = latestProgressScore(source, id);
    const note = latestLegacyNote(source, id);
    return { score, note, updatedAt: "" };
  }

  function setStudy(state, unitId, patch, now = new Date().toISOString()) {
    const source = normalizeState(state);
    const id = text(unitId);
    if (!id) return source;
    const current = studyFor(source, id);
    const incoming = asObject(patch);
    const scoreValue = Object.prototype.hasOwnProperty.call(incoming, "score") ? Number(incoming.score) : current.score;
    const score = Number.isInteger(scoreValue) && scoreValue >= 1 && scoreValue <= 5 ? scoreValue : null;
    const note = Object.prototype.hasOwnProperty.call(incoming, "note")
      ? (typeof incoming.note === "string" ? incoming.note.slice(0, 6000) : text(incoming.note).slice(0, 6000))
      : current.note;
    const updatedAt = text(incoming.updatedAt, now);
    source.study[id] = { score, note, updatedAt };
    source.updatedAt = updatedAt;
    source.revision += 1;
    return source;
  }

  function stats(state, manual45Progress, today = "") {
    const source = normalizeState(state);
    const current = currentDay(manual45Progress);
    const todaySchedule = today && completedDayForDate(manual45Progress, today) ? scheduleForDay(completedDayForDate(manual45Progress, today)) : scheduleForDay(current);
    const rows = todaySchedule ? unitsForSchedule(source, todaySchedule.day) : [];
    const completed = rows.filter((row) => isCompleted(source, row.unit.unitId, row.day)).length;
    const bound = Object.keys(source.bindings).length;
    const memorized = source.package.units.filter((unit) => isMemorized(source, unit.unitId)).length;
    const needsReinforcement = source.package.units.filter((unit) => {
      const review = source.recitationReviews[unit.unitId];
      return Boolean(review && review.lastResult && review.lastResult.score !== null && review.lastResult.score < 6);
    }).length;
    return { units: source.package.units.length, bound, unbound: Math.max(0, source.package.units.length - bound), memorized, unmemorized: Math.max(0, source.package.units.length - memorized), memorizedPercent: source.package.units.length ? Math.round(memorized / source.package.units.length * 100) : 0, currentDay: current, todayTotal: rows.length, todayCompleted: completed, todayPercent: rows.length ? Math.round(completed / rows.length * 100) : 0, needsReinforcement };
  }

  return {
    VERSION,
    TOTAL_DAYS,
    MAX_LIST,
    REVIEW_OFFSETS: REVIEW_OFFSETS.slice(),
    normalizeUnit,
    normalizePackage,
    normalizeState,
    emptyState,
    newDayForList,
    scheduleForDay,
    currentDay,
    completedDayForDate,
    unitsForList,
    unitsForSchedule,
    progressFor,
    isCompleted,
    isMemorized,
    scheduleProgress,
    setProgress,
    bindUnits,
    unbindUnits,
    addRevision,
    setMemorized,
    normalizeMemorizedEntry,
    MAX_MEMORIZATION_HISTORY,
    normalizeRecitationResult,
    normalizeRecitationReviews,
    normalizeStudyEntry,
    normalizeStudy,
    studyFor,
    setStudy,
    setRecitationReview,
    recitationReviewFor,
    normalizeIssueReport,
    normalizeIssueReports,
    issueReportFor,
    setIssueReport,
    MAX_RECITATION_HISTORY,
    MAX_ISSUE_REASON_LENGTH,
    stats
  };
});
