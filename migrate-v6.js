#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const core = require("../english-reading-core.js");

function migrateState(input, options = {}) {
  const state = input && typeof input === "object" && !Array.isArray(input) ? JSON.parse(JSON.stringify(input)) : {};
  state.englishReading = core.normalize(state.englishReading, options);
  state.migrations = state.migrations && typeof state.migrations === "object" ? state.migrations : {};
  if (!state.migrations.englishReadingV6 || Number(state.migrations.englishReadingV6.englishReadingVersion) < 6) {
    state.migrations.englishReadingV6 = {
      appliedAt: options.appliedAt || new Date().toISOString(),
      englishReadingVersion: 6
    };
  }
  state.version = Math.max(6, Number(state.version) || 0);
  return state;
}

function run() {
  const root = path.resolve(__dirname, "..");
  const statePath = path.join(root, "data", "state.json");
  const backupDir = path.join(root, "data", "backups");
  const current = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const migrated = migrateState(current);
  const before = JSON.stringify(current);
  const after = JSON.stringify(migrated);
  if (before === after) {
    process.stdout.write(`${JSON.stringify({ changed: false, version: migrated.version })}\n`);
    return;
  }
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `state-before-v6-${stamp}.json`);
  fs.copyFileSync(statePath, backupPath);
  const tempPath = `${statePath}.v6.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(migrated, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, statePath);
  process.stdout.write(`${JSON.stringify({ changed: true, version: migrated.version, backup: path.relative(root, backupPath) })}\n`);
}

if (require.main === module) run();
module.exports = { migrateState };
