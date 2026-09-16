#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ScheduleCore = require("../schedule-core.js");

const LEGACY_ROUTINE_V2_SIGNATURE = [
  ["routine-start", "06:30", "07:00"],
  ["english-morning", "07:00", "08:00"],
  ["math-foundation", "08:00", "09:30"],
  ["math-practice", "09:30", "11:30"],
  ["midday-rest", "11:30", "12:00"],
  ["midday-exercise", "12:00", "13:00"],
  ["midday-break", "13:00", "13:30"],
  ["midday-vocabulary", "13:30", "14:00"],
  ["major-afternoon-1", "14:00", "15:30"],
  ["major-afternoon-2", "15:30", "17:30"],
  ["evening-rest", "17:30", "19:00"],
  ["major-evening", "19:00", "20:30"],
  ["english-evening", "20:30", "21:30"],
  ["wrong-review", "21:30", "23:00"],
  ["night-rest", "23:00", "06:30"]
];

function isLegacyRoutine(value) {
  const slots = value && typeof value === "object" && Array.isArray(value.slots) ? value.slots : [];
  return slots.length === LEGACY_ROUTINE_V2_SIGNATURE.length && slots.every((slot, index) => {
    const [id, startTime, endTime] = LEGACY_ROUTINE_V2_SIGNATURE[index];
    return slot && slot.id === id && slot.startTime === startTime && slot.endTime === endTime;
  });
}

function migrateState(input, options = {}) {
  const state = input && typeof input === "object" && !Array.isArray(input) ? JSON.parse(JSON.stringify(input)) : {};
  if (!isLegacyRoutine(state.studyRoutine)) return state;
  const defaults = ScheduleCore.normalizeStudyRoutine({});
  state.studyRoutine = { ...state.studyRoutine, version: 3, slots: defaults.slots, focusNotes: defaults.focusNotes };
  const slotMap = { "math-practice": "math-foundation", "major-afternoon-2": "major-afternoon-1" };
  if (Array.isArray(state.dailyTasks)) {
    state.dailyTasks.forEach((task) => {
      if (task && slotMap[task.scheduleSlotId]) task.scheduleSlotId = slotMap[task.scheduleSlotId];
    });
  }
  state.migrations = state.migrations && typeof state.migrations === "object" ? state.migrations : {};
  if (!state.migrations.studyRoutineAugustV3) {
    state.migrations.studyRoutineAugustV3 = { appliedAt: options.appliedAt || new Date().toISOString(), version: 3 };
  }
  return state;
}

function run() {
  const root = path.resolve(__dirname, "..");
  const statePath = path.join(root, "data", "state.json");
  const backupDir = path.join(root, "data", "backups");
  const current = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const migrated = migrateState(current);
  if (JSON.stringify(current) === JSON.stringify(migrated)) {
    process.stdout.write(`${JSON.stringify({ changed: false, slots: migrated.studyRoutine?.slots?.length || 0 })}\n`);
    return;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `state-before-routine-v3-${stamp}.json`);
  fs.copyFileSync(statePath, backupPath);
  const tempPath = `${statePath}.routine-v3.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(migrated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, statePath);
  fs.chmodSync(statePath, 0o600);
  process.stdout.write(`${JSON.stringify({ changed: true, backup: path.relative(root, backupPath), slots: migrated.studyRoutine.slots.length })}\n`);
}

if (require.main === module) run();
module.exports = { isLegacyRoutine, migrateState };
