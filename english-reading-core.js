(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.EnglishReadingCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const QUESTION_TYPES = ["细节", "推理", "主旨", "词义", "态度", "例证", "其他"];
  const ABILITY_REASONS = ["词汇", "长难句", "定位", "逻辑", "题干理解", "选项辨析", "主旨", "粗心/时间", "其他"];
  const DISTRACTORS = ["偷换概念", "无中生有", "答非所问", "范围偏差", "因果倒置", "正反混淆", "过度推断", "以偏概全", "其他"];
  const REVIEW_INTERVALS = [1, 3, 7, 15, 30];
  const ANSWERS = ["A", "B", "C", "D"];
  const RATINGS = ["known", "fuzzy", "unknown"];
  const QUESTION_STATUSES = ["correct", "wrong", "unanswered"];

  const clone = value => JSON.parse(JSON.stringify(value));
  const text = value => String(value == null ? "" : value).trim();
  const collapse = value => text(value).replace(/\s+/g, " ");
  const identifier = prefix => {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };
  function assert(condition, message) {
    if (!condition) {
      const error = new Error(message);
      error.code = "ENGLISH_READING_VALIDATION";
      throw error;
    }
  }
  function dateKey(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
  }
  function addDays(value, days) {
    const date = new Date(`${dateKey(value)}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
  }
  function unique(values, allowed) {
    const list = Array.isArray(values) ? values.map(text).filter(Boolean) : [];
    return [...new Set(allowed ? list.filter(item => allowed.includes(item)) : list)];
  }
  function currentYearValue(options) {
    return Math.max(2005, Number(options && options.currentYear) || new Date().getFullYear());
  }
  function expressionType(value) {
    return collapse(value).split(" ").length > 1 ? "phrase" : "word";
  }
  function normalizeExpression(value, type) {
    let output = collapse(value).toLowerCase();
    if ((type || expressionType(output)) === "word") output = output.replace(/^[^a-z'-]+|[^a-z'-]+$/g, "");
    return output;
  }
  function questionRange(textNumber) {
    const value = Number(textNumber);
    assert(Number.isInteger(value) && value >= 1 && value <= 4, "篇号必须为 Text 1–4。");
    const start = 21 + (value - 1) * 5;
    return { start, end: start + 4 };
  }
  function normalizeWrongAnswer(item, textNumber) {
    const range = questionRange(textNumber);
    const questionNumber = Number(item && item.questionNumber);
    assert(Number.isInteger(questionNumber) && questionNumber >= range.start && questionNumber <= range.end, `Text ${textNumber} 题号必须在 ${range.start}–${range.end}。`);
    const selectedAnswer = text(item && item.selectedAnswer).toUpperCase() || "未作答";
    const correctAnswer = text(item && item.correctAnswer).toUpperCase();
    assert(ANSWERS.includes(correctAnswer), `第 ${questionNumber} 题正确答案必须为 A–D。`);
    assert(selectedAnswer === "未作答" || ANSWERS.includes(selectedAnswer), `第 ${questionNumber} 题作答必须为 A–D 或“未作答”。`);
    assert(selectedAnswer !== correctAnswer, `第 ${questionNumber} 题作答与正确答案相同，不能记为错题。`);
    const abilityReasons = unique(item && item.abilityReasons, ABILITY_REASONS);
    assert(abilityReasons.length, `第 ${questionNumber} 题至少选择一个能力原因。`);
    const notApplicable = Boolean(item && item.distractorNotApplicable) || item && item.distractors === "不适用";
    return {
      id: text(item && item.id) || identifier("reading-wrong"),
      questionNumber,
      selectedAnswer,
      correctAnswer,
      questionType: QUESTION_TYPES.includes(text(item && item.questionType)) ? text(item.questionType) : "其他",
      abilityReasons,
      distractors: notApplicable ? [] : unique(item && item.distractors, DISTRACTORS),
      distractorNotApplicable: notApplicable,
      notes: text(item && item.notes),
      linkedWrongQuestionId: text(item && item.linkedWrongQuestionId)
    };
  }
  function normalizeAttempt(item, textNumber) {
    const wrongAnswers = Array.isArray(item && item.wrongAnswers) ? item.wrongAnswers.map(value => normalizeWrongAnswer(value, textNumber)) : [];
    assert(wrongAnswers.length <= 5, "每篇最多记录 5 道错题。");
    assert(new Set(wrongAnswers.map(item => item.questionNumber)).size === wrongAnswers.length, "同一题号不能重复记录。");
    const range = questionRange(textNumber);
    const wrongByQuestion = new Map(wrongAnswers.map(value => [value.questionNumber, value]));
    const suppliedResults = Array.isArray(item && item.questionResults) ? item.questionResults : null;
    const resultByQuestion = new Map();
    (suppliedResults || []).forEach(value => {
      const questionNumber = Number(value && value.questionNumber);
      assert(Number.isInteger(questionNumber) && questionNumber >= range.start && questionNumber <= range.end, `Text ${textNumber} 题号必须在 ${range.start}–${range.end}。`);
      assert(!resultByQuestion.has(questionNumber), "同一题号不能重复记录。");
      const status = QUESTION_STATUSES.includes(value && value.status) ? value.status : "unanswered";
      resultByQuestion.set(questionNumber, { questionNumber, status, inferred: Boolean(value && value.inferred) });
    });
    const questionResults = [];
    for (let questionNumber = range.start; questionNumber <= range.end; questionNumber += 1) {
      const supplied = resultByQuestion.get(questionNumber);
      const wrong = wrongByQuestion.has(questionNumber);
      const status = supplied ? supplied.status : (wrong ? "wrong" : "correct");
      assert(!(status === "wrong") || wrong, `第 ${questionNumber} 题标记为答错时必须填写错题详情。`);
      assert(!(wrong && status !== "wrong"), `第 ${questionNumber} 题错题详情必须对应“答错”状态。`);
      questionResults.push({ questionNumber, status, inferred: supplied ? Boolean(supplied.inferred) : !wrong });
    }
    return {
      id: text(item && item.id) || identifier("reading-attempt"),
      date: /^\d{4}-\d{2}-\d{2}$/.test(text(item && item.date)) ? text(item.date) : dateKey(),
      durationMinutes: Math.max(0, Math.min(600, Number(item && item.durationMinutes) || 0)),
      timed: Boolean(item && item.timed),
      sourceDailyTaskId: text(item && item.sourceDailyTaskId),
      createdAt: text(item && item.createdAt) || new Date().toISOString(),
      wrongAnswers,
      questionResults
    };
  }
  function normalizeSource(source) {
    return {
      id: text(source && source.id) || identifier("reading-source"),
      passageId: text(source && source.passageId),
      attemptId: text(source && source.attemptId),
      annotationId: text(source && source.annotationId),
      year: Number(source && source.year) || 0,
      textNumber: Number(source && source.textNumber) || 0,
      sentence: text(source && (source.sentence || source.contextSentence)).slice(0, 2000),
      selectedText: text(source && source.selectedText).slice(0, 120),
      addedAt: text(source && source.addedAt) || new Date().toISOString(),
      deleted: Boolean(source && source.deleted),
      deletedLabel: text(source && source.deletedLabel)
    };
  }
  function anchorStatus(passageText, annotation) {
    const start = Number(annotation && annotation.start);
    const end = Number(annotation && annotation.end);
    const selectedText = String(annotation && annotation.selectedText || "");
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return "needsRelocation";
    return passageText.slice(start, end) === selectedText ? "valid" : "needsRelocation";
  }
  function normalizeAnnotation(item, passageText) {
    const selectedText = text(item && item.selectedText).slice(0, 120);
    assert(selectedText, "选区不能为空。");
    const annotation = {
      id: text(item && item.id) || identifier("reading-annotation"),
      start: Number(item && item.start),
      end: Number(item && item.end),
      selectedText,
      sentence: text(item && item.sentence).slice(0, 2000),
      paragraphContext: text(item && item.paragraphContext).slice(0, 6000),
      status: ["marked", "explained", "saved"].includes(item && item.status) ? item.status : "marked",
      anchorStatus: "valid",
      createdAt: text(item && item.createdAt) || new Date().toISOString(),
      explanation: item && item.explanation && typeof item.explanation === "object" ? sanitizeExplanation(item.explanation) : null
    };
    annotation.anchorStatus = anchorStatus(passageText, annotation);
    return annotation;
  }
  function normalizePassage(item, options) {
    const year = Number(item && item.year);
    const textNumber = Number(item && item.textNumber);
    assert(Number.isInteger(year) && year >= 2005 && year <= currentYearValue(options), `年份必须在 2005–${currentYearValue(options)}。`);
    questionRange(textNumber);
    const passageText = text(item && item.passageText).slice(0, 30000);
    return {
      id: text(item && item.id) || `reading-${year}-text-${textNumber}`,
      year,
      textNumber,
      passageText,
      attempts: Array.isArray(item && item.attempts) ? item.attempts.map(value => normalizeAttempt(value, textNumber)) : [],
      annotations: Array.isArray(item && item.annotations) ? item.annotations.map(value => normalizeAnnotation(value, passageText)) : []
    };
  }
  function sanitizeExplanation(item) {
    const normalizedKey = normalizeExpression(item && (item.normalizedKey || item.headword || item.selectedText), item && item.type);
    return {
      selectedText: text(item && item.selectedText).slice(0, 120),
      normalizedKey,
      headword: collapse(item && (item.headword || normalizedKey)).slice(0, 120),
      type: item && item.type === "phrase" ? "phrase" : expressionType(normalizedKey),
      meaningZh: text(item && item.meaningZh).slice(0, 500),
      partOfSpeech: text(item && item.partOfSpeech).slice(0, 80),
      collocation: text(item && item.collocation).slice(0, 500),
      rationale: text(item && item.rationale).slice(0, 1000),
      matchedSenseId: text(item && item.matchedSenseId),
      classification: item && item.classification === "existing" ? "existing" : "new",
      deepExplanation: text(item && item.deepExplanation).slice(0, 4000)
    };
  }
  function normalizeSense(item) {
    const stage = Math.max(0, Math.min(4, Number(item && item.stage) || 0));
    const status = item && item.status === "mastered" ? "mastered" : "learning";
    const sources = Array.isArray(item && item.sources)
      ? item.sources.map(normalizeSource)
      : item && item.source ? [normalizeSource(item.source)] : [];
    return {
      id: text(item && item.id) || identifier("reading-sense"),
      meaningZh: text(item && item.meaningZh).slice(0, 500),
      partOfSpeech: text(item && item.partOfSpeech).slice(0, 80),
      collocation: text(item && item.collocation).slice(0, 500),
      sentence: text(item && item.sentence).slice(0, 2000),
      sources,
      clozeAnchor: item && item.clozeAnchor && typeof item.clozeAnchor === "object" ? {
        selectedText: text(item.clozeAnchor.selectedText).slice(0, 120),
        start: Number.isInteger(Number(item.clozeAnchor.start)) ? Number(item.clozeAnchor.start) : -1,
        end: Number.isInteger(Number(item.clozeAnchor.end)) ? Number(item.clozeAnchor.end) : -1
      } : null,
      occurrenceCount: Math.max(1, Number(item && item.occurrenceCount) || sources.length || 1),
      stage,
      status,
      nextReviewDate: status === "mastered" ? "" : (/^\d{4}-\d{2}-\d{2}$/.test(text(item && item.nextReviewDate)) ? text(item.nextReviewDate) : addDays(dateKey(), REVIEW_INTERVALS[stage])),
      reviewHistory: Array.isArray(item && item.reviewHistory) ? item.reviewHistory.map(history => ({
        date: dateKey(history && history.date),
        rating: ["known", "fuzzy", "forgot"].includes(history && history.rating) ? history.rating : "fuzzy",
        fromStage: Math.max(0, Math.min(4, Number(history && history.fromStage) || 0)),
        toStage: Math.max(0, Math.min(4, Number(history && history.toStage) || 0))
      })) : []
    };
  }
  function normalizeLexicalEntry(item) {
    const type = item && item.type === "phrase" ? "phrase" : expressionType(item && (item.normalizedKey || item.headword));
    const normalizedKey = normalizeExpression(item && (item.normalizedKey || item.headword), type);
    assert(normalizedKey, "词元或短语不能为空。");
    return {
      id: text(item && item.id) || identifier("reading-entry"),
      type,
      normalizedKey,
      headword: collapse(item && (item.headword || normalizedKey)).slice(0, 120),
      forms: unique([...(Array.isArray(item && item.forms) ? item.forms : []), item && item.headword, normalizedKey].map(collapse)),
      senses: Array.isArray(item && item.senses) ? item.senses.map(normalizeSense) : []
    };
  }
  function legacyVocabularyToEntries(items) {
    return (Array.isArray(items) ? items : []).map(word => normalizeLexicalEntry({
      type: "word",
      normalizedKey: word && word.lemma,
      headword: word && word.lemma,
      forms: word && word.forms,
      senses: [{
        meaningZh: Array.isArray(word && word.meanings) ? word.meanings.join("；") : "",
        sentence: word && word.sources && word.sources[0] && word.sources[0].contextSentence,
        sources: word && word.sources,
        stage: word && word.stage,
        status: word && word.status,
        nextReviewDate: word && word.nextReviewDate,
        reviewHistory: word && word.reviewHistory
      }]
    }));
  }
  function normalizeLookup(item) {
    return {
      normalizedKey: normalizeExpression(item && (item.normalizedKey || item.expression)),
      count: Math.max(1, Number(item && item.count) || 1),
      lastLookupAt: text(item && item.lastLookupAt) || new Date().toISOString(),
      sources: (Array.isArray(item && item.sources) ? item.sources : []).slice(-5).map(normalizeSource)
    };
  }
  function empty() {
    return { version: 6, passages: [], lexicalEntries: [], lookupHistory: [], dismissedLegacyHintKeys: [] };
  }
  function normalize(input, options) {
    const source = input && typeof input === "object" ? input : {};
    const output = empty();
    output.passages = Array.isArray(source.passages) ? source.passages.map(value => normalizePassage(value, options)) : [];
    const rawEntries = Array.isArray(source.lexicalEntries) ? source.lexicalEntries : legacyVocabularyToEntries(source.vocabulary);
    const entryMap = new Map();
    rawEntries.map(normalizeLexicalEntry).forEach(entry => {
      const key = `${entry.type}:${entry.normalizedKey}`;
      const previous = entryMap.get(key);
      if (!previous) entryMap.set(key, entry);
      else {
        previous.forms = unique([...previous.forms, ...entry.forms]);
        previous.senses.push(...entry.senses);
      }
    });
    output.lexicalEntries = [...entryMap.values()];
    const lookupMap = new Map();
    (Array.isArray(source.lookupHistory) ? source.lookupHistory : []).map(normalizeLookup).filter(item => item.normalizedKey).forEach(item => {
      const previous = lookupMap.get(item.normalizedKey);
      if (!previous) lookupMap.set(item.normalizedKey, item);
      else {
        previous.count += item.count;
        previous.lastLookupAt = previous.lastLookupAt > item.lastLookupAt ? previous.lastLookupAt : item.lastLookupAt;
        previous.sources = [...previous.sources, ...item.sources].slice(-5);
      }
    });
    output.lookupHistory = [...lookupMap.values()].sort((a, b) => b.lastLookupAt.localeCompare(a.lastLookupAt)).slice(0, 1000);
    output.dismissedLegacyHintKeys = unique(source.dismissedLegacyHintKeys || source.ignoredLegacyTaskIds);
    return output;
  }
  function score(attempt) {
    const results = attempt && Array.isArray(attempt.questionResults) ? attempt.questionResults : null;
    if (results) return results.filter(item => item.status === "correct").length * 2;
    return Math.max(0, 10 - ((attempt && attempt.wrongAnswers) || []).length * 2);
  }
  function sourceMatches(a, b) {
    return a.passageId === b.passageId && a.attemptId === b.attemptId && a.annotationId === b.annotationId && a.sentence === b.sentence;
  }
  function initialStage(rating) {
    return rating === "fuzzy" ? 1 : 0;
  }
  function addOrUpdateSense(reading, payload, now) {
    const explanation = sanitizeExplanation(payload && (payload.explanation || payload));
    const type = payload && payload.type === "phrase" ? "phrase" : explanation.type;
    const normalizedKey = normalizeExpression(payload && (payload.normalizedKey || payload.headword) || explanation.normalizedKey, type);
    assert(normalizedKey, "词元或短语不能为空。");
    assert(explanation.meaningZh || text(payload && payload.meaningZh), "上下文义不能为空。");
    let entry = reading.lexicalEntries.find(item => item.type === type && item.normalizedKey === normalizedKey);
    if (!entry) {
      entry = normalizeLexicalEntry({ type, normalizedKey, headword: explanation.headword || normalizedKey, forms: [payload && payload.selectedText, explanation.selectedText], senses: [] });
      reading.lexicalEntries.push(entry);
    }
    entry.forms = unique([...entry.forms, payload && payload.selectedText, explanation.selectedText, explanation.headword].map(collapse));
    const requestedSenseId = text(payload && payload.senseId) || explanation.matchedSenseId;
    let sense = payload && payload.classification === "new" ? null : entry.senses.find(item => item.id === requestedSenseId);
    if (payload && payload.classification === "existing") assert(sense, "找不到选择的已有义项。");
    const source = normalizeSource(payload && payload.source);
    const rating = RATINGS.includes(payload && payload.rating) ? payload.rating : "unknown";
    if (sense) {
      sense.occurrenceCount += 1;
      if (!sense.sources.some(item => sourceMatches(item, source))) sense.sources.push(source);
      if (sense.status === "mastered" && rating !== "known") {
        sense.status = "learning";
        sense.stage = initialStage(rating);
        sense.nextReviewDate = addDays(now, REVIEW_INTERVALS[sense.stage]);
      }
      return { entry, sense, created: false };
    }
    sense = normalizeSense({
      meaningZh: explanation.meaningZh || payload.meaningZh,
      partOfSpeech: explanation.partOfSpeech || payload.partOfSpeech,
      collocation: explanation.collocation || payload.collocation,
      sentence: payload && payload.sentence || source.sentence,
      sources: [source],
      clozeAnchor: payload && payload.clozeAnchor || { selectedText: payload && payload.selectedText || explanation.selectedText, start: payload && payload.sentenceStart, end: payload && payload.sentenceEnd },
      stage: initialStage(rating),
      status: "learning",
      nextReviewDate: addDays(now, rating === "fuzzy" ? 3 : 1)
    });
    entry.senses.push(sense);
    return { entry, sense, created: true };
  }
  function recordLookup(reading, payload, now) {
    const normalizedKey = normalizeExpression(payload && (payload.normalizedKey || payload.selectedText || payload.expression), payload && payload.type);
    assert(normalizedKey, "查询表达不能为空。");
    let item = reading.lookupHistory.find(value => value.normalizedKey === normalizedKey);
    const source = normalizeSource(payload && payload.source);
    if (!item) {
      item = { normalizedKey, count: 0, lastLookupAt: "", sources: [] };
      reading.lookupHistory.push(item);
    }
    item.count += 1;
    item.lastLookupAt = text(payload && payload.at) || new Date(`${now}T00:00:00Z`).toISOString();
    if (source.passageId || source.sentence) {
      item.sources = item.sources.filter(value => !sourceMatches(value, source));
      item.sources.push(source);
      item.sources = item.sources.slice(-5);
    }
    reading.lookupHistory.sort((a, b) => b.lastLookupAt.localeCompare(a.lastLookupAt));
    reading.lookupHistory = reading.lookupHistory.slice(0, 1000);
    const inLibrary = reading.lexicalEntries.some(entry => entry.normalizedKey === normalizedKey);
    return { count: item.count, repeatedWarning: item.count >= 3 && !inLibrary };
  }
  function execute(input, command, options) {
    const reading = normalize(clone(input || empty()), options);
    const now = dateKey(options && options.now);
    const type = text(command && command.type);
    const payload = command && command.payload || {};
    if (type === "upsertPassage") {
      const normalized = normalizePassage({ ...payload, attempts: [], annotations: [] }, options);
      const found = reading.passages.find(item => item.year === normalized.year && item.textNumber === normalized.textNumber);
      if (found) {
        if (text(payload.passageText) || payload.passageText === "") found.passageText = normalized.passageText;
        found.annotations.forEach(item => { item.anchorStatus = anchorStatus(found.passageText, item); });
      } else reading.passages.push(normalized);
    } else if (type === "addAttempt") {
      const year = Number(payload.year), textNumber = Number(payload.textNumber);
      let passage = reading.passages.find(item => item.year === year && item.textNumber === textNumber);
      if (!passage) {
        passage = normalizePassage({ year, textNumber, passageText: payload.passageText, attempts: [], annotations: [] }, options);
        reading.passages.push(passage);
      } else if (text(payload.passageText)) {
        passage.passageText = text(payload.passageText).slice(0, 30000);
        passage.annotations.forEach(item => { item.anchorStatus = anchorStatus(passage.passageText, item); });
      }
      passage.attempts.push(normalizeAttempt(payload.attempt || payload, textNumber));
    } else if (type === "deleteAttempt") {
      const attemptId = text(payload.attemptId);
      let removed = false;
      reading.passages.forEach(passage => {
        const before = passage.attempts.length;
        passage.attempts = passage.attempts.filter(attempt => attempt.id !== attemptId);
        removed = removed || passage.attempts.length !== before;
      });
      assert(removed, "找不到要删除的作答。");
      reading.lexicalEntries.forEach(entry => entry.senses.forEach(sense => sense.sources.forEach(source => {
        if (source.attemptId === attemptId) {
          source.deleted = true;
          source.deletedLabel = "原来源已删除";
        }
      })));
    } else if (type === "markSelection") {
      const passage = reading.passages.find(item => item.id === payload.passageId);
      assert(passage, "找不到要标记的篇目。");
      passage.annotations.push(normalizeAnnotation({ ...payload, status: "marked" }, passage.passageText));
    } else if (type === "removeAnnotation") {
      const passage = reading.passages.find(item => item.id === payload.passageId);
      assert(passage, "找不到篇目。");
      const before = passage.annotations.length;
      passage.annotations = passage.annotations.filter(item => item.id !== payload.annotationId);
      assert(before !== passage.annotations.length, "找不到标记。");
    } else if (type === "saveExplanation") {
      const passage = reading.passages.find(item => item.id === payload.passageId);
      const annotation = passage && passage.annotations.find(item => item.id === payload.annotationId);
      assert(annotation, "找不到选区标记。");
      annotation.explanation = sanitizeExplanation(payload.explanation);
      annotation.status = "explained";
      recordLookup(reading, { ...annotation, normalizedKey: annotation.explanation.normalizedKey, source: { passageId: passage.id, annotationId: annotation.id, year: passage.year, textNumber: passage.textNumber, sentence: annotation.sentence, selectedText: annotation.selectedText } }, now);
    } else if (type === "recordLookup") {
      recordLookup(reading, payload, now);
    } else if (type === "classifySelection" || type === "addLexicalSense" || type === "addVocabulary") {
      if (type === "addVocabulary") {
        payload.normalizedKey = payload.lemma;
        payload.headword = payload.lemma;
        payload.meaningZh = payload.meaning;
        payload.explanation = { normalizedKey: payload.lemma, headword: payload.lemma, meaningZh: payload.meaning, selectedText: payload.surfaceForm };
        payload.source = { ...(payload.source || {}), sentence: payload.source && payload.source.contextSentence };
        payload.rating = "unknown";
      }
      if (payload.rating === "known" && type === "classifySelection") {
        const passage = reading.passages.find(item => item.id === payload.passageId);
        const annotation = passage && passage.annotations.find(item => item.id === payload.annotationId);
        if (annotation) annotation.status = "explained";
      } else {
        const result = addOrUpdateSense(reading, payload, now);
        const sourcePassageId = payload.source && payload.source.passageId;
        const passage = reading.passages.find(item => item.id === payload.passageId || item.id === sourcePassageId);
        const annotation = passage && passage.annotations.find(item => item.id === payload.annotationId);
        if (annotation) annotation.status = "saved";
        return Object.assign(reading, { lastResult: { entryId: result.entry.id, senseId: result.sense.id, created: result.created } });
      }
    } else if (type === "addVocabularyBatch") {
      (Array.isArray(payload.items) ? payload.items : []).forEach(item => addOrUpdateSense(reading, {
        ...item,
        normalizedKey: item.normalizedKey || item.lemma,
        meaningZh: item.meaningZh || item.meaning,
        explanation: { ...item, normalizedKey: item.normalizedKey || item.lemma, meaningZh: item.meaningZh || item.meaning },
        rating: item.rating || "unknown"
      }, now));
    } else if (type === "reviewSense" || type === "reviewVocabulary") {
      let entry, sense;
      if (type === "reviewVocabulary") {
        entry = reading.lexicalEntries.find(item => item.id === payload.id || item.normalizedKey === normalizeExpression(payload.lemma));
        sense = entry && entry.senses[0];
      } else {
        entry = reading.lexicalEntries.find(item => item.id === payload.entryId);
        sense = entry && entry.senses.find(item => item.id === payload.senseId);
      }
      assert(sense, "找不到要复习的语境卡。");
      const rating = text(payload.rating);
      assert(["known", "fuzzy", "forgot"].includes(rating), "复习结果无效。");
      const fromStage = sense.stage;
      if (rating === "known" && sense.stage === 4) {
        sense.status = "mastered";
        sense.nextReviewDate = "";
      } else if (rating === "known") {
        sense.stage += 1;
        sense.status = "learning";
        sense.nextReviewDate = addDays(now, REVIEW_INTERVALS[sense.stage]);
      } else if (rating === "fuzzy") {
        sense.status = "learning";
        sense.nextReviewDate = addDays(now, REVIEW_INTERVALS[sense.stage]);
      } else {
        sense.stage = 0;
        sense.status = "learning";
        sense.nextReviewDate = addDays(now, 1);
      }
      sense.reviewHistory.push({ date: now, rating, fromStage, toStage: sense.stage });
    } else if (type === "linkWrongQuestion") {
      const passage = reading.passages.find(item => item.id === payload.passageId);
      const attempt = passage && passage.attempts.find(item => item.id === payload.attemptId);
      const wrong = attempt && attempt.wrongAnswers.find(item => item.id === payload.wrongAnswerId);
      assert(wrong, "找不到要链接的阅读错题。");
      wrong.linkedWrongQuestionId = text(payload.wrongQuestionId);
    } else if (type === "dismissLegacyHint" || type === "ignoreLegacyHint") {
      reading.dismissedLegacyHintKeys = unique([...reading.dismissedLegacyHintKeys, text(payload.key || payload.taskId)]);
    } else if (type === "ignoreLegacyHints") {
      reading.dismissedLegacyHintKeys = unique([...reading.dismissedLegacyHintKeys, ...(Array.isArray(payload.taskIds) ? payload.taskIds : [])]);
    } else assert(false, "未知的英语阅读命令。");
    return reading;
  }
  function increment(bucket, key, amount) {
    if (key) bucket[key] = (bucket[key] || 0) + (amount == null ? 1 : amount);
  }
  function project(input, options) {
    const reading = normalize(input, options);
    const today = dateKey(options && options.now);
    const scope = options && options.scope === "all" ? "all" : "first";
    const yearFilter = Number(options && options.year) || 0;
    const textFilter = Number(options && options.textNumber) || 0;
    const years = [];
    for (let year = currentYearValue(options); year >= 2005; year -= 1) {
      const texts = [1, 2, 3, 4].map(textNumber => {
        const passage = reading.passages.find(item => item.year === year && item.textNumber === textNumber);
        const attempts = passage ? passage.attempts.slice().sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date))) : [];
        const first = attempts[0] || null, latest = attempts[attempts.length - 1] || null;
        return { textNumber, passage: passage || null, attempts, firstScore: first ? score(first) : null, latestScore: latest ? score(latest) : null, improvement: first && latest ? score(latest) - score(first) : null };
      });
      const completed = texts.filter(item => item.firstScore != null);
      const firstTotal = completed.reduce((sum, item) => sum + item.firstScore, 0);
      years.push({ year, examLabel: year < 2010 ? "统考英语" : "英语一", texts, completedTexts: completed.length, firstTotal, complete: completed.length === 4, displayScore: completed.length === 4 ? `${firstTotal}/40` : completed.length ? `${firstTotal}/${completed.length * 10} · ${completed.length}/4篇` : "未开始" });
    }
    const filteredPassages = reading.passages.filter(passage => (!yearFilter || passage.year === yearFilter) && (!textFilter || passage.textNumber === textFilter));
    const attempts = filteredPassages.flatMap(passage => {
      const sorted = passage.attempts.slice().sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date)));
      return (scope === "all" ? sorted : sorted.slice(0, 1)).map((attempt, index) => ({ passage, attempt, isFirst: index === 0 }));
    });
    const allAttempts = filteredPassages.flatMap(passage => {
      const sorted = passage.attempts.slice().sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date)));
      return sorted.map((attempt, index) => ({ passage, attempt, isFirst: index === 0 }));
    });
    const abilityReasons = {}, distractors = {}, questionTypes = {};
    attempts.forEach(({ attempt }) => attempt.wrongAnswers.forEach(wrong => {
      wrong.abilityReasons.forEach(reason => increment(abilityReasons, reason, 2));
      wrong.distractors.forEach(reason => increment(distractors, reason, 2));
      increment(questionTypes, wrong.questionType, 2);
    }));
    const dueSenses = reading.lexicalEntries.flatMap(entry => entry.senses.filter(sense => sense.status !== "mastered" && sense.nextReviewDate <= today).map(sense => ({ entry, sense })))
      .sort((a, b) => a.sense.nextReviewDate.localeCompare(b.sense.nextReviewDate) || a.entry.normalizedKey.localeCompare(b.entry.normalizedKey));
    const firstScores = filteredPassages.flatMap(passage => passage.attempts.length ? [score(passage.attempts.slice().sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date)))[0])] : []);
    const durations = allAttempts.map(item => item.attempt.durationMinutes).filter(Boolean);
    const attemptSeries = attempts.map(({ passage, attempt, isFirst }) => ({ passageId: passage.id, attemptId: attempt.id, year: passage.year, textNumber: passage.textNumber, date: attempt.date, createdAt: attempt.createdAt, score: score(attempt), durationMinutes: attempt.durationMinutes, timed: attempt.timed, isFirst }))
      .sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date)));
    const textPerformance = [1, 2, 3, 4].map(textNumber => {
      const entries = attemptSeries.filter(item => item.textNumber === textNumber);
      return { textNumber, attempts: entries.length, averageScore: entries.length ? entries.reduce((sum, item) => sum + item.score, 0) / entries.length : 0, averageDuration: entries.filter(item => item.durationMinutes).length ? entries.filter(item => item.durationMinutes).reduce((sum, item) => sum + item.durationMinutes, 0) / entries.filter(item => item.durationMinutes).length : 0 };
    });
    const scoreDistribution = { 0: 0, 2: 0, 4: 0, 6: 0, 8: 0, 10: 0 };
    attemptSeries.forEach(item => increment(scoreDistribution, item.score));
    const allSeries = allAttempts.map(({ passage, attempt, isFirst }) => ({
      passageId: passage.id, attemptId: attempt.id, year: passage.year, textNumber: passage.textNumber,
      date: attempt.date, createdAt: attempt.createdAt, score: score(attempt), durationMinutes: attempt.durationMinutes,
      timed: attempt.timed, isFirst
    })).sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date)));
    const recentFive = allSeries.slice(-5);
    const improvements = filteredPassages.filter(passage => passage.attempts.length > 1).map(passage => {
      const sorted = passage.attempts.slice().sort((a, b) => String(a.createdAt || a.date).localeCompare(String(b.createdAt || b.date)));
      return score(sorted[sorted.length - 1]) - score(sorted[0]);
    });
    const rankedTexts = textPerformance.filter(item => item.attempts).slice().sort((a, b) => b.averageScore - a.averageScore || a.textNumber - b.textNumber);
    const topReason = Object.entries(abilityReasons).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] || null;
    const selectedAverage = attemptSeries.length ? attemptSeries.reduce((sum, item) => sum + item.score, 0) / attemptSeries.length : 0;
    const recentFiveAverage = recentFive.length ? recentFive.reduce((sum, item) => sum + item.score, 0) / recentFive.length : 0;
    const populatedYears = years.filter(year => year.completedTexts);
    const vocabularyGroups = reading.lexicalEntries.map(entry => ({ ...entry, learningCount: entry.senses.filter(item => item.status === "learning").length, masteredCount: entry.senses.filter(item => item.status === "mastered").length }));
    return {
      reading,
      years,
      populatedYears,
      trend: years.filter(year => year.complete).slice().reverse().map(year => ({ year: year.year, score: year.firstTotal })),
      stats: {
        completedYears: years.filter(year => year.complete).length,
        completedPassages: years.reduce((sum, year) => sum + year.completedTexts, 0),
        averageFirstScore: firstScores.length ? firstScores.reduce((a, b) => a + b, 0) / firstScores.length : 0,
        averageDuration: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0,
        recentFiveAverage,
        averageImprovement: improvements.length ? improvements.reduce((sum, value) => sum + value, 0) / improvements.length : 0,
        dueVocabulary: dueSenses.length,
        dueSenses: dueSenses.length
      },
      attemptSeries,
      textPerformance,
      scoreDistribution,
      insights: {
        strongestText: rankedTexts[0] || null,
        weakestText: rankedTexts.length > 1 ? rankedTexts[rankedTexts.length - 1] : null,
        topAbilityReason: topReason ? { label: topReason[0], lostPoints: topReason[1] } : null,
        recentVsSelected: recentFive.length ? recentFiveAverage - selectedAverage : 0
      },
      dueSenses,
      dueVocabulary: dueSenses.map(item => ({ ...item.sense, lemma: item.entry.normalizedKey, meanings: [item.sense.meaningZh], forms: item.entry.forms, entryId: item.entry.id })),
      vocabularyGroups,
      analysis: { abilityReasons, distractors, questionTypes, scope, year: yearFilter, textNumber: textFilter }
    };
  }
  function parseYear(value) {
    const full = String(value).match(/\b(20(?:0[5-9]|1\d|2\d))\s*年?/);
    if (full) return Number(full[1]);
    const short = String(value).match(/(?:^|[^\d])(?:英语\s*)?(\d{2})\s*年/);
    return short && Number(short[1]) >= 5 ? 2000 + Number(short[1]) : 0;
  }
  function legacyHints(tasks, reading, options) {
    const normalized = normalize(reading, options);
    const dismissed = new Set(normalized.dismissedLegacyHintKeys);
    const existingTargets = new Set(normalized.passages
      .filter(passage => passage.attempts.length)
      .map(passage => `${passage.year}-${passage.textNumber}`));
    return (Array.isArray(tasks) ? tasks : []).flatMap(task => {
      const content = [task && task.title, task && task.category, task && task.notes].join(" ");
      if (!/英语/i.test(content) || !/(阅读|真题|text)/i.test(content)) return [];
      const year = parseYear(content);
      if (year < 2005 || year > currentYearValue(options)) return [];
      const numbers = new Set();
      for (const match of content.matchAll(/text\s*([1-4])/ig)) numbers.add(Number(match[1]));
      if (/前三篇/.test(content)) [1, 2, 3].forEach(value => numbers.add(value));
      return [...numbers].sort().flatMap(textNumber => {
        const key = `${text(task && task.id)}-${year}-${textNumber}`;
        if (dismissed.has(key) || dismissed.has(text(task && task.id)) || existingTargets.has(`${year}-${textNumber}`)) return [];
        const sourceDate = text(task && (task.completedAt || task.date));
        return [{ id: key, key, taskId: text(task && task.id), title: text(task && task.title), date: /^\d{4}-\d{2}-\d{2}/.test(sourceDate) ? sourceDate.slice(0, 10) : "", durationMinutes: Number(task && task.studyMinutes) || 0, year, textNumber }];
      });
    });
  }
  function legacyHintGroups(tasks, reading, options) {
    const groups = new Map();
    legacyHints(tasks, reading, options).forEach(hint => {
      const key = `${hint.year}-${hint.textNumber}`;
      const group = groups.get(key) || { id: key, key, year: hint.year, textNumber: hint.textNumber, taskIds: [], hintKeys: [], titles: [], dates: [], durationMinutes: 0 };
      group.taskIds.push(hint.taskId); group.hintKeys.push(hint.key); group.titles.push(hint.title);
      if (hint.date) group.dates.push(hint.date);
      group.durationMinutes = Math.max(group.durationMinutes, hint.durationMinutes);
      groups.set(key, group);
    });
    return [...groups.values()].map(group => ({ ...group, taskIds: unique(group.taskIds), hintKeys: unique(group.hintKeys), titles: unique(group.titles), sourceCount: unique(group.taskIds).length, date: group.dates.sort().pop() || "" }))
      .sort((a, b) => b.year - a.year || a.textNumber - b.textNumber);
  }
  function clozeSentence(sentence, selectedText) {
    const source = String(sentence || "");
    const selected = String(selectedText || "");
    const index = source.toLowerCase().indexOf(selected.toLowerCase());
    return index < 0 ? source : `${source.slice(0, index)}______${source.slice(index + selected.length)}`;
  }

  return {
    QUESTION_TYPES, ABILITY_REASONS, DISTRACTORS, REVIEW_INTERVALS, ANSWERS, RATINGS, QUESTION_STATUSES,
    empty, normalize, execute, project, legacyHints, legacyHintGroups, questionRange, score,
    addDays, normalizeExpression, expressionType, sanitizeExplanation, anchorStatus, clozeSentence
  };
});
