const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const theme = require("../scripts/build-answer-sheet-theme.js");

test("answer-sheet theme maps accent colors to the answer-sheet palette", () => {
  assert.equal(theme.mapHex("#4F46E5"), "#C21F30");
  assert.equal(theme.mapHex("#EEF2FF"), "#F5F5F6");
  assert.equal(theme.mapHex("#0F172A"), "#24262B");
  assert.equal(theme.mapHex("#16A34A"), "#24262B");
  assert.equal(theme.mapHex("#64748B"), null);
  assert.equal(theme.mapHex("#EF4444"), null);
  assert.equal(theme.remapColors("rgba(79,70,229,0.1)"), "rgba(194, 31, 48, 0.1)");
  assert.equal(theme.remapColors("rgba(238,242,255,.86)"), "rgba(245, 245, 246, .86)");
  assert.equal(theme.remapRadius("20px"), "2px");
  assert.equal(theme.remapRadius("50%"), null);
});

test("answer-sheet theme rules are scoped to the theme attribute", () => {
  assert.equal(theme.scopeSelector(":root"), 'html[data-theme="answer-sheet"]');
  assert.equal(theme.scopeSelector(".a, .b:not(.c, .d)"), 'html[data-theme="answer-sheet"] .a,\nhtml[data-theme="answer-sheet"] .b:not(.c, .d)');
  const remap = fs.readFileSync(path.join(root, "themes", "answer-sheet.remap.css"), "utf8");
  const selectors = remap.split("\n").filter((line) => /\{\s*$/.test(line) && !/^\s*@/.test(line));
  assert.ok(selectors.length > 100);
  for (const line of selectors) assert.match(line, /html\[data-theme="answer-sheet"\]/);
});

test("generated remap layer is up to date with index.html styles", () => {
  const committed = fs.readFileSync(path.join(root, "themes", "answer-sheet.remap.css"), "utf8");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "answer-sheet-"));
  const original = path.join(root, "themes", "answer-sheet.remap.css");
  const backup = path.join(tmp, "remap.css");
  fs.copyFileSync(original, backup);
  try {
    theme.build();
    const rebuilt = fs.readFileSync(original, "utf8");
    assert.equal(rebuilt, committed, "运行 npm run build:theme 更新 themes/answer-sheet.remap.css");
  } finally {
    fs.copyFileSync(backup, original);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("index.html loads the theme and exposes the appearance switch", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  assert.match(html, /href="themes\/answer-sheet\.remap\.css/);
  assert.match(html, /href="themes\/answer-sheet\.css/);
  assert.ok(html.indexOf("themes/answer-sheet.remap.css") < html.indexOf("themes/answer-sheet.css?"), "remap 层要先于手写层加载");
  assert.match(html, /localStorage\.getItem\("recitePlanner\.theme"\)/);
  assert.match(html, /data-action="set-theme"/);
  assert.match(html, /action === "set-theme"/);
});
