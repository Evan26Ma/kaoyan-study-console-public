#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const https = require("node:https");
const http = require("node:http");
const Manual45ContentCore = require("./manual45-content-core.js");

const DEFAULT_OUTPUT = path.join(__dirname, "manual45-content");
const imagePattern = /!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g;
const conceptPattern = /^#{0,6}\s*【概念\s*([0-9]+)】\s*(.*?)\s*$/;
const answerPattern = /^(?:#{1,6}\s*)?答\s*[:：]?\s*(.*)$/;
const shortAnswerPattern = /^#{0,6}\s*【简答\s*([0-9]+)\】\s*(.*?)\s*$/;
const lecturePattern = /^#{1,6}\s*(第\s*([0-9]+|[一二三四五六七八九十百]+)\s*讲.*?)\s*$/;

function ordinalNumber(value) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 百: 100 };
  if (value === "十") return 10;
  if (value.startsWith("十")) return 10 + (digits[value.slice(1)] || 0);
  if (value.endsWith("十")) return (digits[value[0]] || 0) * 10;
  if (value.includes("十")) return (digits[value[0]] || 0) * 10 + (digits[value.slice(2)] || 0);
  return digits[value] || null;
}

function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function clean(value, fallback = "") { const result = typeof value === "string" ? value.trim() : ""; return result || fallback; }
function warning(code, message, extra = {}) { return { code, message, ...extra }; }
function isUnitStart(line) { return conceptPattern.test(line) || shortAnswerPattern.test(line); }

function findAnswer(lines) {
  for (let index = 1; index < lines.length; index += 1) {
    const match = lines[index].match(answerPattern);
    if (match) return { index, inline: match[1] || "" };
  }
  return null;
}

function normalizeImagePath(url) {
  const parsed = new URL(url);
  const ext = path.extname(parsed.pathname).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  return `${sha256(url)}${ext.slice(0, 6)}`;
}

function parseMarkdown(markdown, sourcePath) {
  const lines = String(markdown || "").replace(/\r\n/g, "\n").split("\n");
  const units = [];
  const lectures = [];
  const warnings = [];
  const assets = new Map();
  let currentLecture = null;
  let pendingUnit = null;
  let preamble = [];

  function finalizeUnit(endLine) {
    if (!pendingUnit) return;
    const rawLines = lines.slice(pendingUnit.startIndex, endLine);
    const answer = findAnswer(rawLines);
    const promptLines = answer ? rawLines.slice(0, answer.index) : rawLines.slice(0, 1);
    const answerLines = answer ? [answer.inline, ...rawLines.slice(answer.index + 1)] : [];
    const unitWarnings = [];
    const promptMarkdown = promptLines.join("\n").trim();
    const answerMarkdown = answerLines.join("\n").trim();
    if (!promptMarkdown || !pendingUnit.title) unitWarnings.push("内容没有明确题干或标题");
    if (!answer) unitWarnings.push("未找到明确的答题分隔行，答案可能需要人工确认");
    const rawMarkdown = rawLines.join("\n").trim();
    const images = [...rawMarkdown.matchAll(imagePattern)].map((match) => {
      const alt = match[1] || "手册配图";
      const url = match[2];
      const assetId = sha256(url);
      const localFile = normalizeImagePath(url);
      assets.set(url, { id: assetId, sourceUrl: url, alt, localFile });
      return { id: assetId, sourceUrl: url, url, alt };
    });
    if (/<eq>|\uFFFD|由线|蹋系|图文/.test(rawMarkdown)) unitWarnings.push("疑似 OCR 公式或文字异常，原文已保留");
    const unit = {
      unitId: `manual45-${currentLecture ? `lecture-${currentLecture.number}` : "unassigned"}-${pendingUnit.type}-${pendingUnit.number || units.length + 1}`,
      lecture: currentLecture ? currentLecture.title : "未标注讲次",
      lectureNumber: currentLecture ? currentLecture.number : null,
      type: pendingUnit.type,
      number: pendingUnit.number,
      title: pendingUnit.title,
      promptMarkdown,
      answerMarkdown,
      rawMarkdown,
      images,
      warnings: unitWarnings,
      sourceLineStart: pendingUnit.startIndex + 1,
      sourceLineEnd: endLine
    };
    units.push(unit);
    if (currentLecture) currentLecture.unitIds.push(unit.unitId);
    unitWarnings.forEach((message) => warnings.push(warning("unit-quality", message, { unitId: unit.unitId, lecture: unit.lecture })));
    pendingUnit = null;
  }

  lines.forEach((line, index) => {
    const lecture = line.match(lecturePattern);
    if (lecture) {
      finalizeUnit(index);
      currentLecture = { number: ordinalNumber(lecture[2]), title: clean(lecture[1]), unitIds: [] };
      lectures.push(currentLecture);
      return;
    }
    if (isUnitStart(line)) {
      finalizeUnit(index);
      const concept = line.match(conceptPattern);
      const shortAnswer = line.match(shortAnswerPattern);
      pendingUnit = {
        startIndex: index,
        type: concept ? "concept" : "shortAnswer",
        number: Number((concept || shortAnswer)[1]),
        title: clean((concept || shortAnswer)[2], `${concept ? "概念" : "简答"}${(concept || shortAnswer)[1]}`)
      };
      return;
    }
    const structuralHeading = line.match(/^#{1,6}\s*(?:[一二三四五六七八九十]+、|【重要说明】)/);
    if (structuralHeading) {
      finalizeUnit(index);
      if (!currentLecture && line.trim()) preamble.push(line);
      return;
    }
    if (!currentLecture && !pendingUnit && line.trim()) preamble.push(line);
  });
  finalizeUnit(lines.length);

  if (preamble.join("\n").trim()) warnings.push(warning("unassigned-lecture", "文件开头存在未标注讲次的节选内容，无法可靠判断其所属讲次；原文已保留。"));

  const grouped = new Map();
  units.forEach((unit) => {
    const key = unit.lectureNumber || "unassigned";
    if (!grouped.has(key)) grouped.set(key, { concepts: [], answers: [] });
    grouped.get(key)[unit.type === "concept" ? "concepts" : "answers"].push(unit.number);
  });
  grouped.forEach((group, key) => {
    const check = (values, label) => {
      const sorted = values.filter(Number.isInteger).sort((a, b) => a - b);
      for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index] !== sorted[index - 1] + 1) {
          warnings.push(warning("number-gap", `${label}编号存在缺失或跳跃：${sorted[index - 1]} 后接 ${sorted[index]}。`, { lecture: String(key) }));
          break;
        }
      }
    };
    check(group.concepts, "概念题");
    check(group.answers, "简答题");
  });

  const localRoot = "/manual45-content/assets/images/";
  assets.forEach((asset) => {
    asset.localPath = `${localRoot}${asset.localFile}`;
  });
  const rewrite = (value) => String(value || "").replace(imagePattern, (_full, alt, url) => `![${alt || "手册配图"}](${localRoot}${assets.get(url).localFile})`);
  units.forEach((unit) => {
    unit.promptMarkdown = rewrite(unit.promptMarkdown);
    unit.answerMarkdown = rewrite(unit.answerMarkdown);
    unit.images = unit.images.map((image) => ({ ...image, url: `${localRoot}${assets.get(image.sourceUrl).localFile}` }));
  });
  return { units, lectures, warnings, assets: Array.from(assets.values()), preambleMarkdown: preamble.join("\n").trim(), sourcePath };
}

function requestBuffer(url, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("redirect limit exceeded"));
    const client = url.startsWith("https:") ? https : http;
    const request = client.get(url, { headers: { "User-Agent": "kaoyan-study-console manual importer" } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        requestBuffer(new URL(response.headers.location, url).toString(), redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`HTTP ${response.statusCode}`)); return; }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.setTimeout(30000, () => request.destroy(new Error("request timeout")));
    request.on("error", reject);
  });
}

async function cacheAssets(assets, outputDir) {
  const assetDir = path.join(outputDir, "assets", "images");
  fs.mkdirSync(assetDir, { recursive: true });
  for (const asset of assets) {
    const target = path.join(assetDir, asset.localFile);
    try {
      if (!fs.existsSync(target) || fs.statSync(target).size === 0) fs.writeFileSync(target, await requestBuffer(asset.sourceUrl));
      asset.status = "cached";
      asset.bytes = fs.statSync(target).size;
    } catch (error) {
      asset.status = "unavailable";
      asset.bytes = 0;
      asset.error = error.message;
      console.warn(`图片缓存失败：${asset.sourceUrl} · ${error.message}`);
    }
  }
}

async function main() {
  const sourceArg = String(process.argv[2] || "").trim();
  if (!sourceArg) throw new Error("用法：npm run import:manual45 -- <source.md> [output-dir]");
  const sourcePath = path.resolve(sourceArg);
  const outputDir = path.resolve(process.argv[3] || DEFAULT_OUTPUT);
  const markdown = fs.readFileSync(sourcePath, "utf8");
  const parsed = parseMarkdown(markdown, sourcePath);
  fs.mkdirSync(outputDir, { recursive: true });
  await cacheAssets(parsed.assets, outputDir);
  const sourceHash = sha256(markdown);
  const sourceTitle = path.basename(sourcePath, path.extname(sourcePath)).slice(0, 120) || "本地背诵手册";
  const packageValue = { version: 1, packageId: `local-manual-${sourceHash.slice(0, 12)}`, title: sourceTitle, subject: "专业课", sourcePath, sourceHash, importedAt: new Date().toISOString(), originalMarkdown: markdown, lectures: parsed.lectures, assets: parsed.assets, units: parsed.units, warnings: parsed.warnings, rawSections: parsed.preambleMarkdown ? [{ type: "preamble", markdown: parsed.preambleMarkdown }] : [] };
  const normalized = Manual45ContentCore.normalizePackage(packageValue);
  fs.writeFileSync(path.join(outputDir, "source.md"), markdown, "utf8");
  fs.writeFileSync(path.join(outputDir, "content.json"), JSON.stringify(normalized, null, 2), "utf8");
  fs.writeFileSync(path.join(outputDir, "manifest.json"), JSON.stringify({ version: 1, packageId: packageValue.packageId, title: packageValue.title, sourceHash, importedAt: packageValue.importedAt, unitCount: normalized.units.length, conceptCount: normalized.units.filter((unit) => unit.type === "concept").length, shortAnswerCount: normalized.units.filter((unit) => unit.type === "shortAnswer").length, imageCount: normalized.assets.length, warnings: normalized.warnings, sourcePath }, null, 2), "utf8");
  console.log(JSON.stringify({ outputDir, unitCount: normalized.units.length, conceptCount: normalized.units.filter((unit) => unit.type === "concept").length, shortAnswerCount: normalized.units.filter((unit) => unit.type === "shortAnswer").length, imageCount: normalized.assets.length, warningCount: normalized.warnings.length, sourceHash }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
module.exports = { main, parseMarkdown, cacheAssets, sha256 };
