#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const MathFormulaCore = require("../math-formula-core.js");

const DEFAULT_SECTION_MAP = new Map([
  ["math-s6-product", "math-v2-derivative-basics"],
  ["math-s6-second-product", "math-v2-derivative-basics"],
  ["math-s6-quotient", "math-v2-derivative-basics"],
  ["math-s6-order", "math-v2-derivative-construction"],
  ["math-s6-helper", "math-v2-derivative-construction"],
  ["math-s6-trigger", "math-v2-structure-reaction"],
  ["math-s6-integral", "math-v2-integral"],
  ["math-s6-translation", "math-v2-taylor"],
  ["math-s6-taylor", "math-v2-taylor"],
  ["math-s6-expansions", "math-v2-expansions"],
  // The old index section has no v2 equivalent. A user-created index card
  // becomes a normal method card in the construction chapter.
  ["math-s6-index", "math-v2-derivative-construction"]
]);

const BUILTIN_INDEX_IDS = new Set([
  "math-idx-derivative",
  "math-idx-integral",
  "math-idx-taylor"
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sourceObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function oldId(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function customSectionTitle(section, index) {
  return typeof section?.title === "string" && section.title.trim() ? section.title.trim() : `自定义章节 ${index + 1}`;
}

function migrateLibrary(input) {
  const source = sourceObject(input);
  const sourceSectionIds = Array.isArray(source.sections) ? source.sections.map((section) => String(section?.id || "")) : [];
  const hasLegacyDefaultSection = sourceSectionIds.some((id) => DEFAULT_SECTION_MAP.has(id));
  const hasV2DefaultSection = sourceSectionIds.some((id) => MathFormulaCore.LEGACY_DEFAULT_SECTION_IDS.has(id));
  if (Number(source.version) >= 2 && hasV2DefaultSection && !hasLegacyDefaultSection) {
    return MathFormulaCore.normalize(source);
  }

  const defaults = MathFormulaCore.legacyV2DefaultLibrary();
  const defaultSections = defaults.sections.map(clone);
  const oldSections = Array.isArray(source.sections) ? source.sections : [];
  const oldSectionById = new Map(oldSections.map((section, index) => [oldId(section?.id, `legacy-section-${index + 1}`), sourceObject(section)]));
  const sectionIdMap = new Map(DEFAULT_SECTION_MAP);
  MathFormulaCore.LEGACY_DEFAULT_SECTION_IDS.forEach((id) => sectionIdMap.set(id, id));

  DEFAULT_SECTION_MAP.forEach((newId, oldIdValue) => {
    const oldSection = oldSectionById.get(oldIdValue);
    if (oldSection?.archived) {
      const target = defaultSections.find((section) => section.id === newId);
      if (target) target.archived = true;
    }
  });

  const customSections = [];
  oldSections.forEach((rawSection, index) => {
    const section = sourceObject(rawSection);
    const id = oldId(section.id, `legacy-section-${index + 1}`);
    if (DEFAULT_SECTION_MAP.has(id) || MathFormulaCore.LEGACY_DEFAULT_SECTION_IDS.has(id)) return;
    let customId = id;
    while (defaultSections.some((item) => item.id === customId) || customSections.some((item) => item.id === customId)) customId = `${id}-${index + 1}`;
    sectionIdMap.set(id, customId);
    customSections.push({
      id: customId,
      subjectId: "math",
      title: customSectionTitle(section, index),
      color: MathFormulaCore.SECTION_COLORS[(defaultSections.length + customSections.length) % MathFormulaCore.SECTION_COLORS.length],
      order: defaultSections.length + customSections.length,
      archived: Boolean(section.archived)
    });
  });

  const rawCards = Array.isArray(source.cards) ? source.cards : [];
  const cards = [];
  const seenCardIds = new Set();
  rawCards.forEach((rawCard, index) => {
    const card = sourceObject(rawCard);
    const id = oldId(card.id, `math-card-${index + 1}`);
    if (BUILTIN_INDEX_IDS.has(id)) return;
    let cardId = id;
    while (seenCardIds.has(cardId)) cardId = `${id}-${index + 1}`;
    seenCardIds.add(cardId);
    const oldSectionId = oldId(card.sectionId, "");
    let sectionId = sectionIdMap.get(oldSectionId);
    if (!sectionId) {
      const unassignedId = "math-custom-unassigned";
      if (!customSections.some((section) => section.id === unassignedId)) {
        sectionIdMap.set(oldSectionId, unassignedId);
        customSections.push({
          id: unassignedId,
          subjectId: "math",
          title: "未归类公式",
          color: MathFormulaCore.SECTION_COLORS[(defaultSections.length + customSections.length) % MathFormulaCore.SECTION_COLORS.length],
          order: defaultSections.length + customSections.length,
          archived: false
        });
      }
      sectionId = unassignedId;
    }
    const kind = card.kind === "method" || card.kind === "index" ? "method" : "formula";
    cards.push({
      id: cardId,
      subjectId: "math",
      sectionId,
      kind,
      title: typeof card.title === "string" && card.title.trim() ? card.title.trim() : "未命名公式卡",
      prompt: typeof card.prompt === "string" ? card.prompt.trim() : "先回忆公式，再展开答案。",
      markdown: typeof card.markdown === "string" && card.markdown.trim() ? card.markdown.trim() : "暂无公式正文。",
      tags: Array.isArray(card.tags) ? card.tags : typeof card.tags === "string" ? card.tags : [],
      order: Number.isFinite(Number(card.order)) ? Number(card.order) : index,
      archived: Boolean(card.archived),
      checkable: true
    });
  });

  const validCardIds = new Set(cards.map((card) => card.id));
  const masteredCardIds = Array.from(new Set((Array.isArray(source.masteredCardIds) ? source.masteredCardIds : [])
    .map((id) => String(id || "").trim())
    .filter((id) => validCardIds.has(id))));
  const library = {
    version: 2,
    subjectId: "math",
    sections: [...defaultSections, ...customSections],
    cards,
    masteredCardIds
  };
  return MathFormulaCore.normalize(library);
}

function migrateState(input, options = {}) {
  const state = sourceObject(input);
  const next = clone(state);
  const existingLibrary = sourceObject(next.mathFormulaLibrary);
  const marker = sourceObject(next.migrations).mathFormulaLibraryV10 || {};
  const alreadyMigrated = Number(next.version) >= 10 && Number(existingLibrary.version) >= 2 && Number(marker.version) >= 10;
  if (!alreadyMigrated) next.mathFormulaLibrary = migrateLibrary(existingLibrary);
  else next.mathFormulaLibrary = MathFormulaCore.normalize(existingLibrary);
  next.migrations = sourceObject(next.migrations);
  if (Number(next.migrations.mathFormulaLibraryV10?.version || 0) < 10) {
    next.migrations.mathFormulaLibraryV10 = { appliedAt: options.appliedAt || new Date().toISOString(), version: 10 };
  }
  next.version = Math.max(10, Number(next.version) || 0);
  return next;
}

function run() {
  const root = path.resolve(__dirname, "..");
  const statePath = path.join(root, "data", "state.json");
  const backupDir = path.join(root, "data", "backups");
  const current = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const migrated = migrateState(current);
  if (JSON.stringify(current) === JSON.stringify(migrated)) {
    process.stdout.write(`${JSON.stringify({ changed: false, version: migrated.version })}\n`);
    return;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `state-before-v10-${stamp}.json`);
  fs.copyFileSync(statePath, backupPath);
  const tempPath = `${statePath}.v10.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(migrated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, statePath);
  process.stdout.write(`${JSON.stringify({ changed: true, version: migrated.version, backup: path.relative(root, backupPath) })}\n`);
}

if (require.main === module) run();
module.exports = { migrateLibrary, migrateState };
