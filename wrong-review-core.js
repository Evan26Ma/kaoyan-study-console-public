(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.WrongReviewCore = api;
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const SESSION_SIZE = 20;

  function fisherYates(items, random = Math.random) {
    const shuffled = Array.isArray(items) ? [...items] : [];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const value = Number(random());
      const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999999) : 0;
      const swapIndex = Math.floor(safeValue * (index + 1));
      [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
  }

  function completedToday(question, studyDay) {
    return (question.reviews || []).some((review) => review.completedAt === studyDay);
  }

  function consecutivePerfectCount(question) {
    const scores = (question.reviews || [])
      .filter((review) => review.completedAt && typeof review.score === "number")
      .sort((a, b) => Number(a.round || 0) - Number(b.round || 0))
      .map((review) => review.score);
    let count = 0;
    for (let index = scores.length - 1; index >= 0 && scores[index] === 5; index -= 1) count += 1;
    return count;
  }

  function nextPendingReview(question) {
    return (question.reviews || [])
      .filter((review) => !review.completedAt)
      .sort((a, b) => String(a.dueDate || "").localeCompare(String(b.dueDate || "")) || Number(a.round || 0) - Number(b.round || 0))[0] || null;
  }

  function isEligible(question) {
    return Boolean(
      question
      && question.status !== "archived"
      && consecutivePerfectCount(question) < 2
      && nextPendingReview(question)
    );
  }

  function candidateIds(questions, studyDay) {
    return (Array.isArray(questions) ? questions : [])
      .filter((question) => isEligible(question) && !completedToday(question, studyDay))
      .map((question) => question.id)
      .filter(Boolean);
  }

  function drawSessionIds(questions, studyDay, options = {}) {
    const size = Math.max(0, Number(options.size) || SESSION_SIZE);
    const currentIds = new Set(Array.isArray(options.currentIds) ? options.currentIds : []);
    const candidates = candidateIds(questions, studyDay);
    const fresh = fisherYates(candidates.filter((id) => !currentIds.has(id)), options.random);
    if (!options.refillCurrent || fresh.length >= size) return fresh.slice(0, size);
    const refill = fisherYates(candidates.filter((id) => currentIds.has(id)), options.random);
    return [...fresh, ...refill].slice(0, size);
  }

  function createSession(questions, studyDay, previous = {}, options = {}) {
    const questionIds = drawSessionIds(questions, studyDay, options);
    const requestedCurrent = typeof previous.currentQuestionId === "string" ? previous.currentQuestionId : "";
    return {
      studyDay,
      questionIds,
      currentQuestionId: questionIds.includes(requestedCurrent) ? requestedCurrent : (questionIds[0] || ""),
      filters: {
        status: ["all", "overdue", "today", "early"].includes(previous.filters?.status) ? previous.filters.status : "all",
        subject: typeof previous.filters?.subject === "string" ? previous.filters.subject : "all",
        priority: ["all", "1", "2", "3", "4", "5"].includes(String(previous.filters?.priority)) ? String(previous.filters.priority) : "all",
        sort: ["due", "priority"].includes(previous.filters?.sort) ? previous.filters.sort : "due"
      },
      viewMode: previous.viewMode === "cards" ? "cards" : "list",
      detailTab: ["question", "analysis", "image"].includes(previous.detailTab) ? previous.detailTab : "question"
    };
  }

  function dueStatus(dueDate, studyDay) {
    if (String(dueDate || "") < String(studyDay || "")) return "overdue";
    if (String(dueDate || "") === String(studyDay || "")) return "today";
    return "early";
  }

  function filterSessionItems(items, studyDay, filters = {}) {
    const rows = (Array.isArray(items) ? items : []).filter((item) => {
      if (!item || !item.question || !item.review) return false;
      if (filters.status && filters.status !== "all" && dueStatus(item.review.dueDate, studyDay) !== filters.status) return false;
      if (filters.subject && filters.subject !== "all" && item.question.subject !== filters.subject) return false;
      if (filters.priority && filters.priority !== "all" && String(item.question.priority) !== String(filters.priority)) return false;
      return true;
    });
    return rows.sort((a, b) => {
      if (filters.sort === "priority") {
        const priority = Number(b.question.priority || 0) - Number(a.question.priority || 0);
        if (priority) return priority;
      }
      return String(a.review.dueDate || "").localeCompare(String(b.review.dueDate || ""))
        || Number(b.question.priority || 0) - Number(a.question.priority || 0)
        || String(a.question.title || "").localeCompare(String(b.question.title || ""), "zh-CN");
    });
  }

  function cleanSession(session, questions, studyDay) {
    if (!session || session.studyDay !== studyDay) return createSession(questions, studyDay, session || {});
    const eligibleIds = new Set(candidateIds(questions, studyDay));
    const questionIds = [...new Set(session.questionIds || [])].filter((id) => eligibleIds.has(id)).slice(0, SESSION_SIZE);
    const normalized = createSession([], studyDay, session);
    normalized.questionIds = questionIds;
    normalized.currentQuestionId = questionIds.includes(session.currentQuestionId) ? session.currentQuestionId : (questionIds[0] || "");
    return normalized;
  }

  return {
    SESSION_SIZE,
    fisherYates,
    completedToday,
    consecutivePerfectCount,
    nextPendingReview,
    isEligible,
    candidateIds,
    drawSessionIds,
    createSession,
    cleanSession,
    dueStatus,
    filterSessionItems
  };
}));
