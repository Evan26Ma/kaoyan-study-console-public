#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const MathFormulaCore = require("../math-formula-core.js");

function migrateState(input, options = {}) {
  const state = input && typeof input === "object" && !Array.isArray(input) ? JSON.parse(JSON.stringify(input)) : {};
  state.mathFormulaLibrary = MathFormulaCore.normalize(state.mathFormulaLibrary);
  state.migrations = state.migrations && typeof state.migrations === "object" ? state.migrations : {};
  if (!state.migrations.mathFormulaLibraryV9 || Number(state.migrations.mathFormulaLibraryV9.version) < 9) {
    state.migrations.mathFormulaLibraryV9 = { appliedAt: options.appliedAt || new Date().toISOString(), version: 9 };
  }
  state.version = Math.max(9, Number(state.version) || 0);
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
  const backupPath = path.join(backupDir, `state-before-v9-${stamp}.json`);
  fs.copyFileSync(statePath, backupPath);
  const tempPath = `${statePath}.v9.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(migrated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, statePath);
  process.stdout.write(`${JSON.stringify({ changed: true, version: migrated.version, backup: path.relative(root, backupPath) })}\n`);
}

if (require.main === module) run();
module.exports = { migrateState };
