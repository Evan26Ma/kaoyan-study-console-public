const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../math-formula-core.js");
const { migrateState } = require("../scripts/migrate-v10.js");
const { migrateState: migrateCardsState } = require("../scripts/migrate-v11.js");
const { migrateState: migrateCatalogState } = require("../scripts/migrate-v12.js");

test("v3 default formula library covers the common postgraduate-exam catalog", () => {
  const library = core.defaultLibrary();
  assert.equal(library.version, 3);
  assert.equal(library.subjectId, "math");
  assert.equal(library.grouped, true);
  assert.deepEqual(library.sections.map((section) => section.title), [
    "高数 · 极限与连续", "高数 · 导数与微分", "高数 · 中值定理与泰勒", "高数 · 一元函数积分",
    "高数 · 多元函数微分", "高数 · 重积分", "高数 · 曲线与曲面积分", "高数 · 微分方程",
    "高数 · 无穷级数", "高数 · 空间解析几何", "线代 · 行列式与矩阵", "线代 · 向量与方程组",
    "线代 · 特征值与二次型", "概率 · 基本公式", "概率 · 随机变量与分布", "概率 · 多维随机变量",
    "概率 · 数字特征与极限定理", "统计 · 抽样分布与估计"
  ]);
  assert.equal(library.sections.length, 18);
  assert.equal(core.getCheckableCards(library).length, 55);
  assert.equal(library.cards.length, 55);
  assert.ok(library.sections.every((section) => section.subjectId === "math" && !Object.hasOwn(section, "description")));
  assert.ok(library.cards.every((card) => card.subjectId === "math" && card.kind !== "index" && card.checkable));
  assert.ok(library.sections.every((section) => library.cards.filter((card) => card.sectionId === section.id).length >= 2));
  assert.equal(new Set(library.sections.map((section) => section.id)).size, library.sections.length);
  assert.equal(new Set(library.cards.map((card) => card.id)).size, library.cards.length);
});

test("catalog cards keep valid section links and balanced display-math delimiters", () => {
  const library = core.defaultLibrary();
  const sectionIds = new Set(library.sections.map((section) => section.id));
  library.cards.forEach((card) => {
    assert.ok(sectionIds.has(card.sectionId), `${card.id} points to a known section`);
    assert.ok(card.title && card.prompt && card.markdown && card.tags.length, `${card.id} is complete`);
    assert.equal((card.markdown.match(/\\\[/g) || []).length, (card.markdown.match(/\\\]/g) || []).length, `${card.id} has balanced display math`);
    assert.equal((card.markdown.match(/\\begin\{/g) || []).length, (card.markdown.match(/\\end\{/g) || []).length, `${card.id} has balanced environments`);
  });
});

test("catalog formulas stay compatible with the vendored single-file MathJax build", () => {
  const library = core.defaultLibrary();
  const bundledExtensions = path.join(__dirname, "..", "vendor", "mathjax", "input", "tex", "extensions");
  const markdown = library.cards.map((card) => card.markdown).join("\n");
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const hasBoldsymbolExtension = fs.existsSync(path.join(bundledExtensions, "boldsymbol.js"));
  const hasCoreCompatibleAlias = html.includes(String.raw`macros: { boldsymbol: ["\\mathbf{#1}", 1] }`);
  assert.ok(!/\\boldsymbol\b/.test(markdown) || hasBoldsymbolExtension || hasCoreCompatibleAlias,
    "\\boldsymbol must have a deployed extension or a core-compatible MathJax alias");
});

test("normalization is idempotent and removes legacy section metadata", () => {
  const source = {
    version: 2,
    subjectId: "english",
    sections: [{ id: "custom", title: "自定义章节", description: "旧说明", parentId: "nested", color: "invalid" }],
    cards: [{ id: "card-1", subjectId: "english", sectionId: "custom", kind: "index", title: "旧索引", markdown: "x", linkedCardIds: ["card-1"] }],
    masteredCardIds: ["card-1"]
  };
  const normalized = core.normalize(source);
  assert.deepEqual(core.normalize(normalized), normalized);
  assert.equal(normalized.subjectId, "math");
  assert.deepEqual(normalized.sections[0], { id: "custom", subjectId: "math", title: "自定义章节", color: "indigo", order: 0, archived: false });
  assert.equal(normalized.cards[0].kind, "formula");
  assert.equal(normalized.cards[0].checkable, true);
  assert.equal(Object.hasOwn(normalized.cards[0], "linkedCardIds"), false);
});

test("search reaches representative calculus, algebra, probability, and statistics formulas", () => {
  const library = core.defaultLibrary();
  assert.ok(core.filterCards(library, { query: "等价无穷小" }).some((card) => card.id === "math-v3-equivalent-infinitesimals"));
  assert.ok(core.filterCards(library, { query: "Green" }).some((card) => card.id === "math-v3-green-path"));
  assert.ok(core.filterCards(library, { query: "特征值" }).some((card) => card.id === "math-v3-eigenvalues"));
  assert.ok(core.filterCards(library, { query: "Bayes" }).some((card) => card.id === "math-v3-conditional-bayes"));
  assert.ok(core.filterCards(library, { query: "最大似然" }).some((card) => card.id === "math-v3-estimation"));
});

test("mastery and archive progress exclude archived cards but preserve their ids", () => {
  let library = core.defaultLibrary();
  library = core.toggleMastered(library, "math-v3-limit-core", true);
  library = core.archiveCard(library, "math-v3-limit-core", true);
  assert.deepEqual(core.progress(library), { mastered: 0, total: 54, remaining: 54, percent: 0 });
  assert.ok(library.masteredCardIds.includes("math-v3-limit-core"));
  library = core.toggleMastered(library, "math-v3-equivalent-infinitesimals", true);
  assert.equal(core.progress(library).mastered, 1);
  library = core.toggleMastered(library, "math-v3-equivalent-infinitesimals", false);
  assert.equal(core.progress(library).mastered, 0);
});

test("upsert and reorder keep stable ids and only allow formula or method cards", () => {
  let library = core.defaultLibrary();
  const original = library.cards.find((card) => card.id === "math-v3-derivative-rules");
  library = core.upsertCard(library, { id: original.id, title: "修改后的乘积公式", prompt: original.prompt, markdown: original.markdown, sectionId: original.sectionId, kind: "index", tags: ["修改"] });
  assert.equal(library.cards.length, 55);
  assert.equal(library.cards.find((card) => card.id === original.id).title, "修改后的乘积公式");
  assert.equal(library.cards.find((card) => card.id === original.id).kind, "formula");
  library = core.moveCard(library, original.id, 1);
  assert.equal(library.cards.find((card) => card.id === original.id).id, original.id);
  assert.ok(library.cards.every((card) => card.kind !== "index"));
});

test("v9 to v10 migration merges defaults, preserves custom data and mastery, and is idempotent", () => {
  const legacyLibrary = {
    version: 1,
    sections: [
      { id: "math-s6-product", title: "旧乘积", description: "旧说明" },
      { id: "math-s6-second-product", title: "旧二阶" },
      { id: "math-s6-quotient", title: "旧商" },
      { id: "math-s6-order", title: "旧构造" },
      { id: "math-s6-translation", title: "旧平移" },
      { id: "math-s6-helper", title: "旧辅助" },
      { id: "math-s6-trigger", title: "旧反应" },
      { id: "math-s6-integral", title: "旧积分" },
      { id: "math-s6-taylor", title: "旧泰勒" },
      { id: "math-s6-expansions", title: "旧展开" },
      { id: "math-s6-index", title: "核心组合索引" },
      { id: "custom-section", title: "我的补充", description: "自定义说明", archived: true }
    ],
    cards: [
      { id: "math-p-leibniz", sectionId: "math-s6-product", kind: "formula", title: "我的乘积公式", prompt: "我的提示", markdown: "我的正文", tags: ["我的"], order: 7 },
      { id: "math-i-ftc", sectionId: "math-s6-integral", kind: "formula", title: "基本定理", markdown: "积分正文", order: 8 },
      { id: "math-idx-derivative", sectionId: "math-s6-index", kind: "index", title: "内置导数索引", markdown: "不要保留" },
      { id: "custom-index", sectionId: "custom-section", kind: "index", title: "我的索引卡", prompt: "自定义索引", markdown: "自定义正文", linkedCardIds: ["math-p-leibniz"], order: 2 }
    ],
    masteredCardIds: ["math-p-leibniz", "math-idx-derivative"]
  };
  const source = { version: 9, tasks: [{ id: "task-1" }], mathFormulaLibrary: legacyLibrary, migrations: {} };
  const once = migrateState(source, { appliedAt: "2026-08-08T00:00:00Z" });
  const twice = migrateState(once, { appliedAt: "later" });
  assert.equal(once.version, 10);
  assert.equal(once.mathFormulaLibrary.version, 2);
  assert.equal(once.mathFormulaLibrary.sections.filter((section) => section.id.startsWith("math-v2-")).length, 6);
  assert.equal(once.mathFormulaLibrary.cards.length, 3);
  assert.equal(once.mathFormulaLibrary.cards.find((card) => card.id === "math-p-leibniz").sectionId, "math-v2-derivative-basics");
  assert.equal(once.mathFormulaLibrary.cards.find((card) => card.id === "math-i-ftc").sectionId, "math-v2-integral");
  assert.equal(once.mathFormulaLibrary.cards.find((card) => card.id === "custom-index").kind, "method");
  assert.equal(once.mathFormulaLibrary.cards.find((card) => card.id === "custom-index").title, "我的索引卡");
  assert.equal(once.mathFormulaLibrary.cards.some((card) => card.id === "math-idx-derivative"), false);
  assert.deepEqual(once.mathFormulaLibrary.masteredCardIds, ["math-p-leibniz"]);
  assert.equal(once.mathFormulaLibrary.sections.find((section) => section.id === "custom-section").archived, true);
  assert.equal(once.migrations.mathFormulaLibraryV10.version, 10);
  assert.deepEqual(once.tasks, source.tasks);
  assert.deepEqual(twice, once);
});

test("v10 to v11 migration groups related cards while preserving custom cards and mastery", () => {
  const base = core.legacyV2DefaultLibrary();
  const basics = base.sections.find((section) => section.id === "math-v2-derivative-basics");
  const custom = { id: "custom-card", subjectId: "math", sectionId: basics.id, kind: "method", title: "我的补充方法", prompt: "我的提示", markdown: "我的正文", tags: ["自定义"], order: 20, archived: false, checkable: true };
  const sourceCards = [
    { id: "math-p-leibniz", subjectId: "math", sectionId: basics.id, kind: "formula", title: "乘积求导公式", prompt: "旧提示", markdown: "旧正文一", tags: ["乘积"], order: 0, archived: false, checkable: true },
    { id: "math-p-inverse", subjectId: "math", sectionId: basics.id, kind: "formula", title: "乘积求导逆用", prompt: "旧提示二", markdown: "旧正文二", tags: ["逆用"], order: 1, archived: false, checkable: true },
    { id: "math-sp-second", subjectId: "math", sectionId: basics.id, kind: "formula", title: "二阶乘积", prompt: "旧提示三", markdown: "旧正文三", tags: ["二阶"], order: 2, archived: false, checkable: true },
    custom
  ];
  const source = { version: 10, mathFormulaLibrary: { ...base, grouped: false, cards: sourceCards, masteredCardIds: ["math-p-inverse", "custom-card"] }, migrations: {} };
  const once = migrateCardsState(source, { appliedAt: "2026-08-08T00:00:00Z" });
  const twice = migrateCardsState(once, { appliedAt: "later" });
  const grouped = once.mathFormulaLibrary.cards.find((card) => card.id === "math-p-leibniz");
  assert.equal(once.version, 11);
  assert.equal(once.migrations.mathFormulaLibraryV11.version, 11);
  assert.equal(once.mathFormulaLibrary.grouped, true);
  assert.equal(once.mathFormulaLibrary.cards.length, 2);
  assert.match(grouped.markdown, /旧正文一[\s\S]*旧正文二[\s\S]*旧正文三/);
  assert.deepEqual([...once.mathFormulaLibrary.masteredCardIds].sort(), ["custom-card", "math-p-leibniz"]);
  assert.equal(once.mathFormulaLibrary.cards.find((card) => card.id === "custom-card").markdown, "我的正文");
  assert.deepEqual(twice, once);
});

test("v11 to v12 migration installs the full catalog and preserves custom content and mastery", () => {
  const legacy = core.legacyV2DefaultLibrary();
  const customSection = { id: "custom-section", subjectId: "math", title: "我的补充", color: "cyan", order: 6, archived: false };
  const customCard = { id: "custom-card", subjectId: "math", sectionId: customSection.id, kind: "formula", title: "我的公式", prompt: "我的提示", markdown: "\\[x=1\\]", tags: ["自定义"], order: 0, archived: false, checkable: true };
  const source = {
    version: 11,
    mathFormulaLibrary: { ...legacy, sections: [...legacy.sections, customSection], cards: [...legacy.cards, customCard], masteredCardIds: ["math-p-leibniz", "custom-card"] },
    migrations: {}
  };
  const once = migrateCatalogState(source, { appliedAt: "2026-08-09T00:00:00Z" });
  const twice = migrateCatalogState(once, { appliedAt: "later" });
  assert.equal(once.version, 12);
  assert.equal(once.mathFormulaLibrary.version, 3);
  assert.equal(once.mathFormulaLibrary.sections.length, 19);
  assert.equal(once.mathFormulaLibrary.cards.length, 56);
  assert.ok(once.mathFormulaLibrary.cards.some((card) => card.id === "math-v3-green-path"));
  assert.equal(once.mathFormulaLibrary.cards.find((card) => card.id === "custom-card").markdown, "\\[x=1\\]");
  assert.deepEqual([...once.mathFormulaLibrary.masteredCardIds].sort(), ["custom-card", "math-v3-derivative-rules"]);
  assert.equal(once.migrations.mathFormulaLibraryV12.version, 12);
  assert.deepEqual(twice, once);
});

test("formula workspace uses a two-level math-only layout with always-visible formulas and local self-test", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /data-view="mathFormulas"[\s\S]*?数学公式/);
  assert.match(html, /<script src="math-formula-catalog\.js"><\/script>/);
  assert.match(html, /mathFormulas:\s*\["数学公式"/);
  assert.match(html, /id="mathFormulaSearch" data-readonly-control/);
  assert.doesNotMatch(html, /id="mathFormulaSectionFilter"/);
  assert.doesNotMatch(html, /id="mathFormulaStatusFilter"/);
  assert.doesNotMatch(html, /data-action="reveal-math-card"/);
  assert.match(html, /id="mathFormulaSelfTest"/);
  assert.match(html, /data-action="toggle-math-self-test"/);
  assert.match(html, /class="math-formula-section/);
  assert.match(html, /data-color="\$\{escapeHtml\(section\.color/);
  assert.match(html, /renderMarkdown\(card\.markdown\)/);
  assert.match(html, /math-formula-answer-content/);
  assert.doesNotMatch(html, /class="math-formula-kind"/);
  assert.match(html, /\.math-formula-card-copy h4[^}]*font-size: 1\.28rem[^}]*font-weight: 900/);
  assert.match(html, /\.math-formula-answer \.markdown-body[^}]*font-size: 1\.1rem[^}]*font-weight: 700/);
  assert.match(html, /\.math-formula-answer \.markdown-body mjx-container[^}]*font-size: 1\.24em/);
  assert.match(html, /grid-template-columns: minmax\(0, 1fr\)/);
  assert.doesNotMatch(html, /<option value="index">索引<\/option>/);
  assert.match(html, /version: Math\.max\(7, 8, 9, 10, 11, 12/);
});
