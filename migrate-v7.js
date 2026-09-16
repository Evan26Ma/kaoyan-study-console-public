#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const core = require("../adjustment-core.js");

function migrateState(input, options = {}) {
  const state = input && typeof input === "object" && !Array.isArray(input) ? JSON.parse(JSON.stringify(input)) : {};
  state.profile = state.profile && typeof state.profile === "object" ? state.profile : {};
  const legacyHours = Number(state.profile.dailyCapacity);
  state.profile.defaultCapacityMinutes = Math.min(960, Math.max(60, Math.round(Number(state.profile.defaultCapacityMinutes) || (Number.isFinite(legacyHours) && legacyHours > 0 ? legacyHours * 60 : 480))));
  state.profile.capacityOverrides = state.profile.capacityOverrides && typeof state.profile.capacityOverrides === "object" && !Array.isArray(state.profile.capacityOverrides) ? state.profile.capacityOverrides : {};
  state.profile.durationDefaults = core.normalizeDurationDefaults(state.profile.durationDefaults);
  state.dailyTasks = Array.isArray(state.dailyTasks) ? state.dailyTasks : [];
  state.dailyTasks.forEach((task) => {
    if (!Number.isFinite(Number(task.estimatedMinutes)) || Number(task.estimatedMinutes) <= 0) task.estimatedMinutes = null;
    else task.estimatedMinutes = Math.min(960, Math.max(1, Math.round(Number(task.estimatedMinutes))));
    task.scheduleHistory = Array.isArray(task.scheduleHistory) ? task.scheduleHistory : [];
  });
  state.adjustmentRuns = Array.isArray(state.adjustmentRuns) ? state.adjustmentRuns : [];
  state.migrations = state.migrations && typeof state.migrations === "object" ? state.migrations : {};
  if (!state.migrations.adjustmentsV7 || Number(state.migrations.adjustmentsV7.version) < 7) {
    state.migrations.adjustmentsV7 = { appliedAt: options.appliedAt || new Date().toISOString(), version: 7 };
  }
  state.version = Math.max(7, Number(state.version) || 0);
  return state;
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
  const backupPath = path.join(backupDir, `state-before-v7-${stamp}.json`);
  fs.copyFileSync(statePath, backupPath);
  const tempPath = `${statePath}.v7.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(migrated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, statePath);
  process.stdout.write(`${JSON.stringify({ changed: true, version: migrated.version, backup: path.relative(root, backupPath) })}\n`);
}

if (require.main === module) run();
module.exports = { migrateState };
