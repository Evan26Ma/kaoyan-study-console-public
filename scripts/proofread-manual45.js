#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = process.env.STUDY_ROOT ? path.resolve(process.env.STUDY_ROOT) : path.resolve(__dirname, "..");
const CONTENT_PATH = process.env.MANUAL45_CONTENT_PATH || path.join(ROOT, "manual45-content", "content.json");
const SOURCE_PATH = process.env.MANUAL45_SOURCE_PATH || path.join(ROOT, "manual45-content", "source.md");
const REPORT_PATH = process.env.MANUAL45_REPORT_PATH || path.join(process.cwd(), "manual45-proofread-report.json");
const BATCH_SIZE = Number(process.env.MANUAL45_PROOFREAD_BATCH_SIZE || 3);
const CONCURRENCY = Number(process.env.MANUAL45_PROOFREAD_CONCURRENCY || 2);
const MODEL = process.env.MANUAL45_PROOFREAD_MODEL || "";

function parseArgs(argv) {
  const options = { apply: false, applyReport: [], limit: 0, offset: 0 };
  argv.forEach((arg) => {
    if (arg === "--apply") options.apply = true;
    if (arg.startsWith("--apply-report=")) {
      options.applyReport = arg.slice("--apply-report=".length).split(",").map((item) => item.trim()).filter(Boolean);
    }
    if (arg.startsWith("--limit=")) options.limit = Math.max(0, Number(arg.slice(8)) || 0);
    if (arg.startsWith("--offset=")) options.offset = Math.max(0, Number(arg.slice(9)) || 0);
  });
  return options;
}

function isAutoSafeCorrection(correction) {
  const category = String(correction?.category || "");
  return !/(formula|公式|编号)/i.test(category);
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const result = {};
  fs.readFileSync(filePath, "utf8").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (match) result[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  });
  return result;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function countOccurrences(text, find) {
  if (!find) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const index = text.indexOf(find, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + Math.max(find.length, 1);
  }
}

function parseModelJson(content) {
  const text = String(content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(text);
  return parsed && typeof parsed === "object" ? parsed : {};
}

function unitPayload(unit) {
  return {
    unitId: unit.unitId,
    title: unit.title,
    lecture: unit.lecture,
    type: unit.type,
    promptMarkdown: unit.promptMarkdown,
    answerMarkdown: unit.answerMarkdown
  };
}

function proofreadingPrompt(batch) {
  return [
    "你是严格的中文考研教材校对器。请检查下面每个内容单元中的文字。",
    "只处理高置信度的错别字、OCR误识别、明显重复字、明显残缺词语、明显标点错误和明显的中英文/公式包裹格式错误。",
    "不要润色文风，不要重写段落，不要修改经济学事实、推理结论或数学公式；公式、变量、上下标、正负号疑似有问题时只放入 review。",
    "标题中的明显 OCR 错误可以 correction。每条 correction 必须给出 unitId、field、find、replace、reason、confidence、category。",
    "field 只能是 title、promptMarkdown、answerMarkdown。find 必须是对应字段中连续且唯一的原文片段，尽量短（不超过 80 个字符），replace 只能修正错误，不得扩写。",
    "confidence 只有在 0.95 以上且无需依赖外部教材判断时才可以放进 corrections；其余全部放 review。",
    "review 每项给出 unitId、field、excerpt、reason、category，不要给替换文本。",
    "只返回合法 JSON object：{\"corrections\":[],\"review\":[]}。不要返回 Markdown。",
    "待校对内容：",
    JSON.stringify(batch)
  ].join("\n");
}

async function requestBatch(batch, batchIndex, env) {
  const baseUrl = String(env.DEEPSEEK_BASE_URL || "http://127.0.0.1:8317/v1").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.DEEPSEEK_API_KEY || ""}`
    },
    body: JSON.stringify({
      model: MODEL || env.DEEPSEEK_MODEL || "gpt-5.6-sol",
      messages: [
        { role: "system", content: "你是严格的中文教材校对器，只输出合法 JSON。" },
        { role: "user", content: proofreadingPrompt(batch) }
      ],
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 7000,
      stream: false
    }),
    signal: AbortSignal.timeout(180000)
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`批次 ${batchIndex + 1} 请求失败 HTTP ${response.status}: ${raw.slice(0, 300)}`);
  const payload = JSON.parse(raw);
  const content = payload.choices?.[0]?.message?.content || "{}";
  return { batchIndex, result: parseModelJson(content) };
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function runner() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      try {
        results[index] = await worker(items[index], index);
      } catch (error) {
        results[index] = { index, error: error.message || String(error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, limit) }, runner));
  return results;
}

function sourceSegment(lines, unit) {
  const start = Math.max(0, Number(unit.sourceLineStart) - 1);
  const end = Math.max(start, Number(unit.sourceLineEnd) - 1);
  return { start, end, text: lines.slice(start, end).join("\n") };
}

function validateCorrections(raw, batch, lines) {
  const byId = new Map(batch.map((unit) => [unit.unitId, unit]));
  const accepted = [];
  const rejected = [];
  const review = Array.isArray(raw.review) ? raw.review : [];
  const rows = Array.isArray(raw.corrections) ? raw.corrections : [];
  rows.forEach((row) => {
    const unit = byId.get(String(row?.unitId || ""));
    const field = String(row?.field || "");
    const find = typeof row?.find === "string" ? row.find : "";
    const replace = typeof row?.replace === "string" ? row.replace : "";
    const confidence = Number(row?.confidence);
    const category = String(row?.category || "").toLowerCase();
    const allowedField = ["title", "promptMarkdown", "answerMarkdown"].includes(field);
    const unsafeCategory = /(formula|fact|logic|concept|meaning)/i.test(category);
    const segment = unit ? sourceSegment(lines, unit).text : "";
    const occurrences = countOccurrences(segment, find);
    if (!unit || !allowedField || !find || find.length > 80 || occurrences !== 1 || !Number.isFinite(confidence) || confidence < 0.95 || unsafeCategory) {
      rejected.push({ row, reason: !unit ? "unknown-unit" : !allowedField ? "invalid-field" : !find ? "empty-find" : find.length > 80 ? "find-too-long" : occurrences !== 1 ? `find-occurrences-${occurrences}` : !Number.isFinite(confidence) ? "invalid-confidence" : confidence < 0.95 ? "low-confidence" : "unsafe-category" });
      return;
    }
    accepted.push({
      unitId: unit.unitId,
      title: unit.title,
      field,
      find,
      replace,
      reason: String(row.reason || "").slice(0, 300),
      confidence,
      category
    });
  });
  return { accepted, rejected, review };
}

function replaceOnce(text, find, replace) {
  if (countOccurrences(text, find) !== 1) throw new Error(`无法唯一替换：${find}`);
  return text.replace(find, replace);
}

function applyCorrections(packageValue, sourceText, corrections) {
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const unitById = new Map(packageValue.units.map((unit) => [unit.unitId, unit]));
  const grouped = new Map();
  corrections.forEach((correction) => {
    if (!grouped.has(correction.unitId)) grouped.set(correction.unitId, []);
    grouped.get(correction.unitId).push(correction);
  });
  [...grouped.entries()].sort((left, right) => {
    const leftUnit = unitById.get(left[0]);
    const rightUnit = unitById.get(right[0]);
    return Number(rightUnit?.sourceLineStart || 0) - Number(leftUnit?.sourceLineStart || 0);
  }).forEach(([unitId, items]) => {
    const unit = unitById.get(unitId);
    if (!unit) return;
    const segment = sourceSegment(lines, unit);
    let text = segment.text;
    const sourceReplacements = new Map();
    items.forEach((correction) => {
      if (!sourceReplacements.has(correction.find)) {
        text = replaceOnce(text, correction.find, correction.replace);
        sourceReplacements.set(correction.find, correction.replace);
      } else if (sourceReplacements.get(correction.find) !== correction.replace) {
        throw new Error(`同一源片段存在冲突替换：${correction.find}`);
      }
      if (typeof unit[correction.field] === "string" && countOccurrences(unit[correction.field], correction.find) === 1) {
        unit[correction.field] = unit[correction.field].replace(correction.find, correction.replace);
      }
      if (typeof unit.rawMarkdown === "string" && countOccurrences(unit.rawMarkdown, correction.find) === 1) {
        unit.rawMarkdown = unit.rawMarkdown.replace(correction.find, correction.replace);
      }
    });
    lines.splice(segment.start, segment.end - segment.start, ...text.split("\n"));
  });
  const nextSource = lines.join("\n");
  packageValue.originalMarkdown = nextSource;
  packageValue.sourceHash = sha256(nextSource);
  return nextSource;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = loadDotEnv(path.join(ROOT, ".env"));
  const packageValue = JSON.parse(fs.readFileSync(CONTENT_PATH, "utf8"));
  const sourceText = fs.readFileSync(SOURCE_PATH, "utf8");

  if (options.applyReport.length) {
    const sourceReports = options.applyReport.map((filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")));
    const retryUnitIds = new Set(sourceReports.slice(1).flatMap((report) => (report.results || []).flatMap((item) => item.unitIds || [])));
    const mergedResults = [];
    sourceReports[0].results.forEach((item) => {
      if (!item.error || !sourceReports.slice(1).length) mergedResults.push(item);
    });
    sourceReports.slice(1).forEach((report) => mergedResults.push(...(report.results || [])));
    const allAccepted = mergedResults.flatMap((item) => item.accepted || []);
    const safeCorrections = allAccepted.filter(isAutoSafeCorrection);
    const skippedUnsafe = allAccepted.filter((item) => !isAutoSafeCorrection(item));
    applyCorrections(packageValue, sourceText, safeCorrections);
    fs.writeFileSync(SOURCE_PATH, packageValue.originalMarkdown, "utf8");
    packageValue.importedAt = new Date().toISOString();
    fs.writeFileSync(CONTENT_PATH, JSON.stringify(packageValue, null, 2), "utf8");
    const manifestPath = path.join(path.dirname(CONTENT_PATH), "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.sourceHash = packageValue.sourceHash;
      manifest.importedAt = packageValue.importedAt;
      manifest.warnings = packageValue.warnings;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    }
    const appliedReport = {
      ...sourceReports[0],
      results: mergedResults,
      acceptedCount: allAccepted.length,
      reviewCount: mergedResults.reduce((sum, item) => sum + (item.review?.length || 0), 0),
      rejectedCount: mergedResults.reduce((sum, item) => sum + (item.rejected?.length || 0), 0),
      failed: mergedResults.filter((item) => item.error),
      appliedAt: packageValue.importedAt,
      appliedCount: safeCorrections.length,
      skippedUnsafeCount: skippedUnsafe.length,
      applied: safeCorrections,
      skippedUnsafe,
      sourceReports: options.applyReport
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(appliedReport, null, 2), "utf8");
    console.log(JSON.stringify({ unitCount: packageValue.units?.length || 0, accepted: allAccepted.length, applied: safeCorrections.length, skippedUnsafe: skippedUnsafe.length, review: appliedReport.reviewCount, rejected: appliedReport.rejectedCount, failed: appliedReport.failed.length, report: REPORT_PATH }, null, 2));
    return;
  }

  if (!env.DEEPSEEK_API_KEY) throw new Error("未找到文本模型 API key");
  const allUnits = packageValue.units || [];
  const selected = allUnits.slice(options.offset, options.limit ? options.offset + options.limit : undefined);
  const batches = [];
  for (let index = 0; index < selected.length; index += Math.max(1, BATCH_SIZE)) {
    batches.push(selected.slice(index, index + Math.max(1, BATCH_SIZE)));
  }
  const lines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const results = await mapLimit(batches, CONCURRENCY, async (batch, index) => {
    const result = await requestBatch(batch.map(unitPayload), index, env);
    const checked = validateCorrections(result.result, batch, lines);
    console.log(`batch ${index + 1}/${batches.length}: corrections=${checked.accepted.length} rejected=${checked.rejected.length} review=${checked.review.length}`);
    return { batchIndex: index, unitIds: batch.map((unit) => unit.unitId), ...checked };
  });
  const failed = results.filter((item) => item?.error);
  const accepted = results.flatMap((item) => item?.accepted || []);
  const report = {
    generatedAt: new Date().toISOString(),
    contentPath: CONTENT_PATH,
    sourcePath: SOURCE_PATH,
    model: MODEL || env.DEEPSEEK_MODEL || "gpt-5.6-sol",
    unitCount: selected.length,
    batchCount: batches.length,
    acceptedCount: accepted.length,
    reviewCount: results.reduce((sum, item) => sum + (item?.review?.length || 0), 0),
    rejectedCount: results.reduce((sum, item) => sum + (item?.rejected?.length || 0), 0),
    failed,
    results
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  if (options.apply && accepted.length) {
    applyCorrections(packageValue, sourceText, accepted);
    fs.writeFileSync(SOURCE_PATH, packageValue.originalMarkdown, "utf8");
    packageValue.importedAt = new Date().toISOString();
    fs.writeFileSync(CONTENT_PATH, JSON.stringify(packageValue, null, 2), "utf8");
    const manifestPath = path.join(path.dirname(CONTENT_PATH), "manifest.json");
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      manifest.sourceHash = packageValue.sourceHash;
      manifest.importedAt = packageValue.importedAt;
      manifest.warnings = packageValue.warnings;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
    }
    report.applied = accepted;
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
    console.log(`applied ${accepted.length} corrections`);
  }
  console.log(JSON.stringify({ unitCount: selected.length, batchCount: batches.length, accepted: accepted.length, review: report.reviewCount, rejected: report.rejectedCount, failed: failed.length, report: REPORT_PATH, applied: Boolean(options.apply) }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });

module.exports = { countOccurrences, parseModelJson, validateCorrections, applyCorrections };
