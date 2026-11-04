#!/usr/bin/env node
"use strict";

// 生成“答题卡”主题的配色映射层：themes/answer-sheet.remap.css
//
// index.html 的样式里有大量写死的靛蓝 / 紫色值。这个脚本逐条扫描样式规则，
// 把蓝紫色系换成答题卡的红色印刷色，把卡片圆角收成直角、去掉浮起阴影，
// 并把每条规则加上 html[data-theme="answer-sheet"] 前缀，只在主题开启时生效。
//
// 修改 index.html 或 manual45-reader.css 的样式后重新运行：
//   npm run build:theme

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const THEME_ATTR = 'html[data-theme="answer-sheet"]';
const OUTPUT = path.join(ROOT, "themes", "answer-sheet.remap.css");

// 按相对亮度把蓝紫色映射到答题卡色板（亮 → 暗）。
const INK_SCALE = [
  { minLuminance: 0.86, hex: "#F5F5F6" }, // 纸面浅灰
  { minLuminance: 0.70, hex: "#F9E3E5" }, // 极浅红底
  { minLuminance: 0.40, hex: "#EFB9BF" }, // 印刷细线
  { minLuminance: 0.20, hex: "#D8737F" }, // 中间红
  { minLuminance: 0.07, hex: "#C21F30" }, // 印刷红
  { minLuminance: 0, hex: "#8E1422" } // 深红
];

const COLOR_PROP = /(^--)|color|background|border|outline|fill|stroke|shadow|text-decoration|caret|column-rule/i;

function extractInlineStyle(html) {
  const start = html.indexOf("<style>");
  const end = html.indexOf("</style>", start);
  if (start < 0 || end < 0) throw new Error("index.html 中没有找到主样式块。");
  return html.slice(start + "<style>".length, end);
}

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// 极简 CSS 解析：只需要处理规则、@media/@supports 嵌套，跳过 @keyframes/@font-face。
function parse(css) {
  let i = 0;
  function parseBlock() {
    const nodes = [];
    while (i < css.length) {
      skipSpace();
      if (css[i] === "}") { i += 1; return nodes; }
      if (i >= css.length) break;
      const preludeStart = i;
      while (i < css.length && css[i] !== "{" && css[i] !== ";" && css[i] !== "}") i += 1;
      const prelude = css.slice(preludeStart, i).trim();
      if (css[i] === ";") { i += 1; continue; } // @import / @charset 之类
      if (css[i] === "}") continue;
      i += 1; // 跳过 {
      if (prelude.startsWith("@")) {
        if (/^@(media|supports|layer|container)\b/i.test(prelude)) {
          nodes.push({ type: "at", prelude, children: parseBlock() });
        } else {
          skipBlock();
        }
      } else {
        nodes.push({ type: "rule", selector: prelude, decls: parseDecls() });
      }
    }
    return nodes;
  }
  function parseDecls() {
    const start = i;
    let depth = 0;
    while (i < css.length) {
      const ch = css[i];
      if (ch === "(") depth += 1;
      else if (ch === ")") depth -= 1;
      else if (ch === "}" && depth <= 0) break;
      i += 1;
    }
    const body = css.slice(start, i);
    i += 1;
    return splitTopLevel(body, ";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const colon = part.indexOf(":");
        if (colon < 0) return null;
        let value = part.slice(colon + 1).trim();
        const important = /!important\s*$/i.test(value);
        if (important) value = value.replace(/\s*!important\s*$/i, "");
        return { prop: part.slice(0, colon).trim(), value, important };
      })
      .filter(Boolean);
  }
  function skipBlock() {
    let depth = 1;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") depth -= 1;
      i += 1;
    }
  }
  function skipSpace() {
    while (i < css.length && /\s/.test(css[i])) i += 1;
  }
  return parseBlock();
}

function splitTopLevel(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote && text[i - 1] !== "\\") quote = ""; continue; }
    if (ch === "\"" || ch === "'") quote = ch;
    else if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    else if (ch === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

function hexToRgb(hex) {
  let h = hex.slice(1);
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
}

function rgbToHsl([r, g, b]) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return [h, s, l];
}

function luminance([r, g, b]) {
  const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function isAccentHue(rgb) {
  const [h, s] = rgbToHsl(rgb);
  return h >= 195 && h <= 295 && s >= 0.3;
}

// 绿色在原界面表示“完成”。答题卡里完成就是涂黑，所以绿色系换成石墨灰阶。
function isDoneGreen(rgb) {
  const [h, s] = rgbToHsl(rgb);
  return h >= 90 && h <= 170 && s >= 0.3;
}

const GRAPHITE_SCALE = [
  { minLuminance: 0.7, hex: "#F3F3F4" },
  { minLuminance: 0.5, hex: "#B9BBC0" },
  { minLuminance: 0, hex: "#24262B" }
];

function isMappable(rgb) {
  return isAccentHue(rgb) || isDoneGreen(rgb);
}

function mapHex(hex) {
  const rgb = hexToRgb(hex);
  if (isDoneGreen(rgb)) {
    const yg = luminance(rgb);
    return GRAPHITE_SCALE.find((step) => yg >= step.minLuminance).hex;
  }
  if (!isAccentHue(rgb)) return null;
  const y = luminance(rgb);
  // 接近黑色的藏青（正文墨色、遮罩层）是“墨”而不是强调色，换成石墨黑。
  if (y < 0.03) return "#24262B";
  return INK_SCALE.find((step) => y >= step.minLuminance).hex;
}

function remapColors(value) {
  let changed = false;
  let next = value.replace(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi, (hex) => {
    const mapped = mapHex(hex);
    if (!mapped) return hex;
    changed = true;
    return mapped;
  });
  next = next.replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/gi, (match, r, g, b, a) => {
    const rgb = [Number(r), Number(g), Number(b)];
    if (!isMappable(rgb)) return match;
    changed = true;
    const mapped = mapHex("#" + rgb.map((c) => c.toString(16).padStart(2, "0")).join(""));
    if (a === undefined) return mapped;
    const [mr, mg, mb] = hexToRgb(mapped);
    return `rgba(${mr}, ${mg}, ${mb}, ${a})`;
  });
  return changed ? next : null;
}

// 红色只用于印刷线条和文字；实心填充一律是 2B 铅笔的石墨黑。
const GRAPHITE = "#24262B";
function solidFill(value) {
  return value
    .replace(/#C21F30\b/gi, GRAPHITE)
    .replace(/#8E1422\b/gi, "#000000")
    .replace(/rgba\(194, 31, 48, (0?\.[5-9]\d*|1(?:\.0+)?)\)/gi, (m, a) => `rgba(36, 38, 43, ${a})`);
}

// 答题卡是平涂的：带蓝紫色的渐变压成纯色。深色渐变（上面压白字）变石墨黑，浅色渐变取第一个色标。
function flattenGradient(value) {
  if (!/(linear|radial)-gradient\(/i.test(value)) return value;
  if (/#C21F30|#8E1422|#D8737F|var\(--accent|rgba\(194, 31, 48, (?:0?\.[5-9]|1)/i.test(value)) return "#24262B";
  const firstStop = value.match(/#[0-9a-f]{3,6}\b|rgba?\([^)]*\)/i);
  return firstStop ? firstStop[0] : "var(--surface-soft)";
}

function remapRadius(value) {
  let changed = false;
  const next = value.replace(/(\d+(?:\.\d+)?)px/g, (match, num) => {
    const n = Number(num);
    if (n < 6) return match;
    changed = true;
    return "2px";
  });
  return changed ? next : null;
}

function transformDecl(decl, selector) {
  const prop = decl.prop.toLowerCase();
  if (prop === "box-shadow") {
    if (/inset/i.test(decl.value)) {
      const colors = remapColors(decl.value);
      return colors ? { ...decl, value: colors } : null;
    }
    if (decl.value.trim() === "none") return null;
    return { ...decl, value: "none" };
  }
  if (prop === "backdrop-filter") return { ...decl, value: "none" };
  if (prop === "text-transform" && /uppercase/i.test(decl.value)) return { ...decl, value: "none" };
  if (prop === "transform" && /:hover/.test(selector) && /translate/i.test(decl.value)) {
    return { ...decl, value: "none" };
  }
  if (/^border(-[a-z]+)*-radius$/.test(prop) || prop === "--radius-card" || prop === "--radius-btn" || prop === "--radius-sm") {
    const radius = remapRadius(decl.value);
    return radius ? { ...decl, value: radius } : null;
  }
  const isBackground = prop === "background" || prop === "background-color" || prop === "background-image";
  if (isBackground && /^var\(--accent(-dark)?\)$/.test(decl.value.trim())) {
    return { ...decl, value: GRAPHITE };
  }
  if (COLOR_PROP.test(prop)) {
    const colors = remapColors(decl.value);
    if (!colors) return null;
    if (isBackground) return { ...decl, value: solidFill(flattenGradient(colors)) };
    return { ...decl, value: colors };
  }
  return null;
}

function scopeSelector(selector) {
  return splitTopLevel(selector, ",")
    .map((sel) => sel.trim())
    .filter(Boolean)
    .map((sel) => {
      if (sel.startsWith(":root")) return THEME_ATTR + sel.slice(":root".length);
      if (/^html\b/.test(sel)) return THEME_ATTR + sel.slice(4);
      return `${THEME_ATTR} ${sel}`;
    })
    .join(",\n");
}

// emitted 记录已经在主题层里出现过的“选择器 + 属性”。原样式里后面的规则如果覆盖了同一个
// 选择器的同一属性，即使不含蓝紫色也要原样带进主题层，否则前面被提高优先级的规则会错误地胜出。
function render(nodes, indent, emitted = new Set()) {
  const out = [];
  for (const node of nodes) {
    if (node.type === "at") {
      if (/^@media\s+print/i.test(node.prelude)) continue;
      const inner = render(node.children, indent + "  ", emitted);
      if (inner.trim()) out.push(`${indent}${node.prelude} {\n${inner}${indent}}\n`);
      continue;
    }
    const selectors = splitTopLevel(node.selector, ",").map((sel) => sel.trim().replace(/\s+/g, " ")).filter(Boolean);
    const decls = node.decls
      .map((decl) => {
        const prop = decl.prop.toLowerCase().replace(/^(background|border(?:-(?:top|right|bottom|left))?|outline)-color$/, "$1");
        const keys = selectors.map((sel) => `${sel}|${prop}`);
        const transformed = transformDecl(decl, node.selector);
        if (transformed) {
          keys.forEach((key) => emitted.add(key));
          return transformed;
        }
        return keys.some((key) => emitted.has(key)) ? decl : null;
      })
      .filter(Boolean);
    if (!decls.length) continue;
    const body = decls
      .map((d) => `${indent}  ${d.prop}: ${d.value}${d.important ? " !important" : ""};`)
      .join("\n");
    const sel = scopeSelector(node.selector).split("\n").map((line) => indent + line).join("\n");
    out.push(`${sel} {\n${body}\n${indent}}\n`);
  }
  return out.join("");
}

function build() {
  const sources = [
    { name: "index.html", css: extractInlineStyle(fs.readFileSync(path.join(ROOT, "index.html"), "utf8")) },
    { name: "manual45-reader.css", css: fs.readFileSync(path.join(ROOT, "manual45-reader.css"), "utf8") }
  ];
  const sections = sources.map(({ name, css }) => {
    const body = render(parse(stripComments(css)), "");
    return `/* ---- 来自 ${name} ---- */\n${body}`;
  });
  const header = [
    "/* 本文件由 scripts/build-answer-sheet-theme.js 生成，请勿手改。",
    " * 手写的主题样式在 themes/answer-sheet.css。 */",
    ""
  ].join("\n");
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, header + sections.join("\n"));
  return OUTPUT;
}

if (require.main === module) {
  const file = build();
  const size = fs.statSync(file).size;
  console.log(`已生成 ${path.relative(ROOT, file)}（${(size / 1024).toFixed(1)} KB）`);
}

module.exports = { build, remapColors, remapRadius, scopeSelector, parse, mapHex };
