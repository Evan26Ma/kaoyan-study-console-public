"use strict";

(function attachMathFormulaCore(root, factory) {
  const catalog = typeof module !== "undefined" && module.exports
    ? require("./math-formula-catalog.js")
    : root?.MathFormulaCatalog;
  const api = factory(catalog);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MathFormulaCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createMathFormulaCore(formulaCatalog) {
  const CARD_KINDS = new Set(["formula", "method"]);
  const SECTION_COLORS = ["indigo", "teal", "orange", "rose", "violet", "cyan"];
  const LEGACY_V2_SECTIONS = [
    ["math-v2-derivative-basics", "导数基础"],
    ["math-v2-derivative-construction", "导数构造"],
    ["math-v2-structure-reaction", "结构反应"],
    ["math-v2-integral", "积分"],
    ["math-v2-taylor", "泰勒公式"],
    ["math-v2-expansions", "常用展开"]
  ];
  const DEFAULT_SECTIONS = Array.isArray(formulaCatalog?.SECTIONS) && formulaCatalog.SECTIONS.length
    ? formulaCatalog.SECTIONS.map((section) => [section.id, section.title])
    : LEGACY_V2_SECTIONS;
  const DEFAULT_SECTION_IDS = new Set(DEFAULT_SECTIONS.map(([id]) => id));
  const LEGACY_DEFAULT_SECTION_IDS = new Set(LEGACY_V2_SECTIONS.map(([id]) => id));
  const CATALOG_VERSION = Number(formulaCatalog?.VERSION) || 2;

  const rawCards = [
    ["p-leibniz", 0, "formula", "乘积求导公式", "看到两个函数相乘，优先想到 \(uv\) 的导数。", String.raw`\[ (uv)'=u'v+uv' \]\n\n两个因子分别求导，一次只对其中一个求导。`, ["乘积", "一阶导数"]],
    ["p-inverse", 0, "formula", "乘积求导的逆用", "看到 \(u'v+uv'\)，把它收回成一个整体的导数。", String.raw`\[ u'v+uv'=(uv)' \]`, ["逆用", "识别"]],
    ["p-weighted", 0, "formula", "带系数的乘积逆用", "看到 \(u'v+uv'\) 但顺序不同，先交换因子再合并。", String.raw`\[ au'v+auv'=a(uv)' \]`, ["系数", "乘积"]],
    ["p-power", 0, "formula", "幂函数乘积构造", "看到 \(x^n f'(x)+n x^{n-1}f(x)\)，考虑整体求导。", String.raw`\[ \bigl(x^n f(x)\bigr)'=n x^{n-1}f(x)+x^n f'(x) \]`, ["幂函数", "构造"]],

    ["sp-second", 0, "formula", "二阶乘积求导公式", "一阶乘积再求一次导，注意中间两项会出现两次。", String.raw`\[ (uv)''=u''v+2u'v'+uv'' \]`, ["二阶导数", "乘积"]],
    ["sp-inverse", 0, "formula", "二阶乘积逆用", "看到 \(u''v+2u'v'+uv''\)，直接合并为 \((uv)''\)。", String.raw`\[ u''v+2u'v'+uv''=(uv)'' \]`, ["逆用", "二阶"]],
    ["sp-binomial", 0, "formula", "高阶乘积的二项式结构", "二阶公式中的系数 1、2、1 是二项式系数。", String.raw`\[ (uv)^{(n)}=\sum_{k=0}^{n}\binom{n}{k}u^{(k)}v^{(n-k)} \]`, ["高阶", "二项式"]],

    ["q-rule", 0, "formula", "商求导公式", "分母平方，分子导乘分母减分子乘分母导。", String.raw`\[ \left(\frac{u}{v}\right)'=\frac{u'v-uv'}{v^2},\quad v\ne0 \]`, ["商", "一阶导数"]],
    ["q-inverse", 0, "formula", "商求导的逆用", "看到 \(u'v-uv'\)，考虑把它收回到 \(u/v\) 的导数。", String.raw`\[ u'v-uv'=v^2\left(\frac{u}{v}\right)' \]`, ["逆用", "商"]],
    ["q-log", 0, "formula", "对数导数构造", "看到 \(u'/u\)，把它识别为 \(\ln|u|\) 的导数。", String.raw`\[ \left(\ln|u|\right)'=\frac{u'}{u},\quad u\ne0 \]`, ["对数", "构造"]],

    ["o-raise", 1, "method", "乘积升阶", "想把一阶导数变成二阶导数时，构造一个乘积再求导。", String.raw`\[ (uv)''=u''v+2u'v'+uv'' \]\n\n适合处理含有 \(u'v'\) 的表达式；先看能否补出两端项。`, ["升阶", "二阶"]],
    ["o-lower", 1, "method", "乘积降阶", "看到二阶乘积结构，整体积分或反向识别为一次导数。", String.raw`\[ u''v+2u'v'+uv''=(u'v+uv')' \]`, ["降阶", "逆用"]],
    ["o-quotient", 1, "method", "商式升降阶", "分子出现差式，分母出现平方，先尝试还原商的导数。", String.raw`\[ u'v-uv'=v^2\left(\frac{u}{v}\right)' \]\n\n再根据题目需要继续求导或积分。`, ["商", "升降阶"]],
    ["o-linear", 1, "method", "线性微分组合", "含有 \(u'v+uv'\) 或 \(u'v-uv'\) 时，优先寻找整体结构。", String.raw`\[ u'v+uv'=(uv)',\qquad u'v-uv'=v^2\left(\frac{u}{v}\right)' \]`, ["线性组合", "识别"]],

    ["t-shift-first", 4, "formula", "平移型一阶公式", "函数中出现 \(x-a\)，令 \(t=x-a\) 后按同一变量求导。", String.raw`\[ \frac{d}{dx}f(x-a)=f'(x-a) \]`, ["平移", "自变量"]],
    ["t-shift-n", 4, "formula", "平移型高阶公式", "平移不改变导数阶数，只把自变量整体平移。", String.raw`\[ \frac{d^n}{dx^n}f(x-a)=f^{(n)}(x-a) \]`, ["平移", "高阶"]],
    ["t-center", 4, "method", "换中心再展开", "展开点不是 0 时，先把变量换成 \(t=x-a\)。", String.raw`\[ f(x)=f(a)+f'(a)(x-a)+\frac{f''(a)}{2!}(x-a)^2+\cdots \]`, ["展开点", "平移"]],

    ["h-product", 1, "method", "构造乘积辅助函数", "目标里有两个函数及其导数，先构造 \(F=uv\)。", String.raw`\[ F(x)=u(x)v(x)\quad\Longrightarrow\quad F'(x)=u'v+uv' \]`, ["辅助函数", "乘积"]],
    ["h-quotient", 1, "method", "构造商辅助函数", "目标里有差式 \(u'v-uv'\)，先构造 \(F=u/v\)。", String.raw`\[ F(x)=\frac{u(x)}{v(x)}\quad\Longrightarrow\quad F'(x)=\frac{u'v-uv'}{v^2} \]`, ["辅助函数", "商"]],
    ["h-log", 1, "method", "构造对数辅助函数", "目标里有 \(u'/u\)，优先构造 \(F=\ln|u|\)。", String.raw`\[ F(x)=\ln|u(x)|\quad\Longrightarrow\quad F'(x)=\frac{u'}{u} \]`, ["辅助函数", "对数"]],
    ["h-integral", 1, "method", "构造积分辅助函数", "看到一个函数和它的积分，令辅助函数等于该积分再求导。", String.raw`\[ F(x)=\int_{a}^{x}f(t)\,dt\quad\Longrightarrow\quad F'(x)=f(x) \]`, ["辅助函数", "积分"]],

    ["r-uv", 2, "formula", "看到两项相加的导数", "看到 \(u'v+uv'\)，立刻反应为乘积导数。", String.raw`\[ u'v+uv'\ \Rightarrow\ (uv)' \]`, ["反应", "乘积"]],
    ["r-difference", 2, "formula", "看到两项相减的导数", "看到 \(u'v-uv'\)，检查是否能除以 \(v^2\) 还原商导数。", String.raw`\[ u'v-uv'\ \Rightarrow\ v^2\left(\frac{u}{v}\right)' \]`, ["反应", "商"]],
    ["r-ratio", 2, "formula", "看到函数比值与相对变化率", "看到 \(u'/u\)，联想到对数导数；看到 \(u/v\)，检查商导数。", String.raw`\[ \frac{u'}{u}=\left(\ln|u|\right)',\qquad \left(\frac{u}{v}\right)'=\frac{u'v-uv'}{v^2} \]`, ["反应", "比值"]],
    ["r-second", 2, "formula", "看到 1-2-1 系数", "看到 \(u''v+2u'v'+uv''\)，反应为二阶乘积导数。", String.raw`\[ 1,2,1\ \Rightarrow\ (uv)'' \]`, ["反应", "二阶"]],

    ["i-ftc", 3, "formula", "微积分基本定理", "上限是变量时，积分求导直接得到被积函数。", String.raw`\[ \frac{d}{dx}\int_a^x f(t)\,dt=f(x) \]`, ["积分", "基本定理"]],
    ["i-variable-limit", 3, "formula", "复合上限积分求导", "上限是 \(g(x)\) 时，再乘上上限的导数。", String.raw`\[ \frac{d}{dx}\int_a^{g(x)}f(t)\,dt=f(g(x))g'(x) \]`, ["积分", "链式法则"]],
    ["i-leibniz", 3, "formula", "变上限变下限", "上下限都含变量时，分别代入端点并乘端点导数。", String.raw`\[ \frac{d}{dx}\int_{u(x)}^{v(x)}f(t)\,dt=f(v(x))v'(x)-f(u(x))u'(x) \]`, ["积分", "上下限"]],
    ["i-parameter", 3, "method", "含参积分求导", "积分区间固定、被积函数含参数时，对参数求导进入积分号。", String.raw`\[ \frac{d}{d\lambda}\int_a^b f(x,\lambda)\,dx=\int_a^b\frac{\partial f}{\partial\lambda}(x,\lambda)\,dx \]`, ["积分", "参数"]],
    ["i-by-parts", 3, "formula", "分部积分公式", "看到乘积且一部分易积分时，拆成 \(u\) 与 \(dv\)。", String.raw`\[ \int u\,dv=uv-\int v\,du \]`, ["积分", "分部积分"]],

    ["tay-formula", 4, "formula", "泰勒公式", "围绕展开点 \(a\)，按导数阶数写多项式。", String.raw`\[ f(x)=\sum_{k=0}^{n}\frac{f^{(k)}(a)}{k!}(x-a)^k+R_n(x) \]`, ["泰勒", "展开"]],
    ["tay-maclaurin", 4, "formula", "麦克劳林公式", "展开点为 0 的泰勒公式。", String.raw`\[ f(x)=\sum_{k=0}^{n}\frac{f^{(k)}(0)}{k!}x^k+R_n(x) \]`, ["麦克劳林", "展开"]],
    ["tay-lagrange", 4, "formula", "拉格朗日余项", "需要判断误差或收敛时，补上某个中间点的余项。", String.raw`\[ R_n(x)=\frac{f^{(n+1)}(\xi)}{(n+1)!}(x-a)^{n+1},\quad \xi\text{ 在 }a\text{ 与 }x\text{ 之间} \]`, ["泰勒", "余项"]],

    ["ex-exp", 5, "method", "指数函数展开", "指数函数各阶导数相同，系数最整齐。", String.raw`\[ e^x=1+x+\frac{x^2}{2!}+\frac{x^3}{3!}+\cdots \]\n\n更一般地，\(e^{x-a}\) 围绕 \(a\) 展开只需平移变量。`, ["展开", "指数"]],
    ["ex-trig", 5, "method", "三角函数展开", "正弦余弦导数循环，奇偶项分别出现。", String.raw`\[ \sin x=x-\frac{x^3}{3!}+\frac{x^5}{5!}-\cdots \]\n\n\[ \cos x=1-\frac{x^2}{2!}+\frac{x^4}{4!}-\cdots \]`, ["展开", "三角"]],
    ["ex-inverse-trig", 5, "method", "反三角函数展开", "先记导数，再按几何级数或积分得到展开。", String.raw`\[ \arctan x=x-\frac{x^3}{3}+\frac{x^5}{5}-\cdots\quad (|x|<1) \]`, ["展开", "反三角"]],
    ["ex-log", 5, "method", "对数函数展开", "先把 \(\ln(1+x)\) 的导数写成几何级数再积分。", String.raw`\[ \ln(1+x)=x-\frac{x^2}{2}+\frac{x^3}{3}-\frac{x^4}{4}+\cdots\quad (-1<x\le1) \]`, ["展开", "对数"]],
    ["ex-rational", 5, "method", "有理函数展开", "先拆成几何级数能识别的形式。", String.raw`\[ \frac{1}{1-x}=1+x+x^2+x^3+\cdots\quad (|x|<1) \]`, ["展开", "几何级数"]],
    ["ex-root", 5, "method", "根式展开", "把根式写成二项式幂，再用二项式系数展开。", String.raw`\[ (1+x)^\alpha=1+\alpha x+\frac{\alpha(\alpha-1)}{2!}x^2+\cdots \]`, ["展开", "根式"]],
    ["ex-compose", 5, "method", "复合函数展开", "先展开外层基本函数，再把内层小量代入。", String.raw`\[ f(a+h)=f(a)+f'(a)h+\frac{f''(a)}{2!}h^2+\cdots \]\n\n先确认 \(h\to0\)，再决定保留到几阶。`, ["展开", "复合"]]
  ];

  const GROUPED_CARD_DEFINITIONS = [
    { id: "math-p-leibniz", order: 0, title: "乘积求导", prompt: "看到乘积、二阶乘积或整体导数结构时，先回到这一组公式。", sourceIds: ["math-p-leibniz", "math-p-inverse", "math-p-weighted", "math-p-power", "math-sp-second", "math-sp-inverse", "math-sp-binomial"] },
    { id: "math-q-rule", order: 1, title: "商与对数导数", prompt: "看到分式差式或相对变化率时，检查商求导和对数导数。", sourceIds: ["math-q-rule", "math-q-inverse", "math-q-log"] },
    { id: "math-o-raise", order: 2, title: "升阶与降阶构造", prompt: "需要改变导数阶数时，先补出乘积、商式或线性微分结构。", sourceIds: ["math-o-raise", "math-o-lower", "math-o-quotient", "math-o-linear"] },
    { id: "math-h-product", order: 3, title: "辅助函数构造", prompt: "题目出现目标结构时，先构造一个能整体求导的辅助函数。", sourceIds: ["math-h-product", "math-h-quotient", "math-h-log", "math-h-integral"] },
    { id: "math-r-uv", order: 4, title: "结构反应", prompt: "先识别题面信号，再决定把它收回乘积、商或二阶导数。", sourceIds: ["math-r-uv", "math-r-difference", "math-r-ratio", "math-r-second"] },
    { id: "math-i-ftc", order: 5, title: "积分求导", prompt: "变上限、变下限或复合上限出现时，先定位积分求导规则。", sourceIds: ["math-i-ftc", "math-i-variable-limit", "math-i-leibniz"] },
    { id: "math-i-parameter", order: 6, title: "含参与分部积分", prompt: "区分参数进入积分号与乘积拆分两种常见积分方法。", sourceIds: ["math-i-parameter", "math-i-by-parts"] },
    { id: "math-t-shift-first", order: 7, title: "泰勒公式与余项", prompt: "先确定展开点和阶数，再使用平移、泰勒或余项公式。", sourceIds: ["math-t-shift-first", "math-t-shift-n", "math-t-center", "math-tay-formula", "math-tay-maclaurin", "math-tay-lagrange"] },
    { id: "math-ex-exp", order: 8, title: "常用展开总表", prompt: "指数、三角、对数、反三角、根式和复合函数统一放在这里回看。", sourceIds: ["math-ex-exp", "math-ex-trig", "math-ex-inverse-trig", "math-ex-log", "math-ex-rational", "math-ex-root", "math-ex-compose"] }
  ];
  const BUILTIN_CARD_IDS = new Set(rawCards.map(([id]) => `math-${id}`));
  const BUILTIN_INDEX_CARD_IDS = new Set(["math-idx-derivative", "math-idx-integral", "math-idx-taylor"]);
  const LEGACY_GROUPED_CARD_IDS = new Set(GROUPED_CARD_DEFINITIONS.map((definition) => definition.id));
  const LEGACY_BUILTIN_CARD_IDS = new Set([...BUILTIN_CARD_IDS, ...BUILTIN_INDEX_CARD_IDS, ...LEGACY_GROUPED_CARD_IDS]);
  const LEGACY_SECTION_TO_V3 = new Map([
    ["math-v2-derivative-basics", "math-v3-derivatives"],
    ["math-v2-derivative-construction", "math-v3-derivatives"],
    ["math-v2-structure-reaction", "math-v3-derivatives"],
    ["math-v2-integral", "math-v3-integrals"],
    ["math-v2-taylor", "math-v3-mean-value-taylor"],
    ["math-v2-expansions", "math-v3-mean-value-taylor"]
  ]);
  const LEGACY_GROUP_TO_V3 = new Map([
    ["math-p-leibniz", "math-v3-derivative-rules"],
    ["math-q-rule", "math-v3-derivative-rules"],
    ["math-o-raise", "math-v3-higher-geometry"],
    ["math-h-product", "math-v3-derivative-rules"],
    ["math-r-uv", "math-v3-derivative-rules"],
    ["math-i-ftc", "math-v3-definite-ftc"],
    ["math-i-parameter", "math-v3-integration-methods"],
    ["math-t-shift-first", "math-v3-taylor"],
    ["math-ex-exp", "math-v3-maclaurin"]
  ]);
  const LEGACY_CARD_TO_GROUP = new Map();
  GROUPED_CARD_DEFINITIONS.forEach((definition) => definition.sourceIds.forEach((id) => LEGACY_CARD_TO_GROUP.set(id, definition.id)));

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function buildCardRecord([id, sectionIndex, kind, title, prompt, markdown, tags], order, sections) {
    return {
      id: `math-${id}`,
      subjectId: "math",
      sectionId: sections[sectionIndex].id,
      kind,
      title,
      prompt,
      markdown,
      tags,
      order,
      archived: false,
      checkable: true
    };
  }

  function combineCardGroup(definition, sourceCards) {
    const cards = sourceCards.filter(Boolean).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    if (!cards.length) return null;
    const first = cards[0];
    const markdown = cards.length === 1
      ? first.markdown
      : cards.map((card) => `### ${card.title}\n\n${card.markdown}`).join("\n\n");
    return {
      id: definition.id,
      subjectId: "math",
      sectionId: first.sectionId,
      kind: cards.some((card) => card.kind === "formula") ? "formula" : "method",
      title: definition.title,
      prompt: definition.prompt,
      markdown,
      tags: Array.from(new Set(cards.flatMap((card) => card.tags || []))).slice(0, 12),
      order: definition.order,
      archived: cards.every((card) => card.archived),
      checkable: true
    };
  }

  function aggregateCards(library) {
    const normalized = normalize(library);
    if (normalized.grouped) return normalized;
    const sourceCards = normalized.cards;
    const byId = new Map(sourceCards.map((card) => [card.id, card]));
    const idMap = new Map();
    const groupedCards = GROUPED_CARD_DEFINITIONS.map((definition) => {
      definition.sourceIds.forEach((sourceId) => idMap.set(sourceId, definition.id));
      return combineCardGroup(definition, definition.sourceIds.map((id) => byId.get(id)));
    }).filter(Boolean);
    const customCards = sourceCards.filter((card) => !BUILTIN_CARD_IDS.has(card.id) && !BUILTIN_INDEX_CARD_IDS.has(card.id));
    const cards = [...groupedCards, ...customCards].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-CN"));
    const validIds = new Set(cards.map((card) => card.id));
    const masteredCardIds = Array.from(new Set(normalized.masteredCardIds
      .map((id) => idMap.get(id) || id)
      .filter((id) => validIds.has(id))));
    return normalize({ ...normalized, grouped: true, cards, masteredCardIds });
  }

  function legacyV2DefaultLibrary() {
    const sections = LEGACY_V2_SECTIONS.map(([id, title], order) => ({ id, subjectId: "math", title, color: SECTION_COLORS[order], order, archived: false }));
    const sourceCards = rawCards.map((card, order) => buildCardRecord(card, order, sections));
    return aggregateCards({ version: 2, subjectId: "math", sections, cards: sourceCards, masteredCardIds: [] });
  }

  function defaultLibrary() {
    if (!Array.isArray(formulaCatalog?.SECTIONS) || !Array.isArray(formulaCatalog?.CARDS) || !formulaCatalog.SECTIONS.length || !formulaCatalog.CARDS.length) {
      return legacyV2DefaultLibrary();
    }
    return clone({
      version: CATALOG_VERSION,
      subjectId: "math",
      grouped: true,
      sections: formulaCatalog.SECTIONS,
      cards: formulaCatalog.CARDS,
      masteredCardIds: []
    });
  }

  function normalizeSection(source, index) {
    const value = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    return {
      id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `math-section-${index + 1}`,
      subjectId: "math",
      title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : `公式章节 ${index + 1}`,
      color: SECTION_COLORS.includes(value.color) ? value.color : SECTION_COLORS[index % SECTION_COLORS.length],
      order: Number.isFinite(Number(value.order)) ? Number(value.order) : index,
      archived: Boolean(value.archived)
    };
  }

  function normalizeCard(source, index, sectionIds, cardIds) {
    const value = source && typeof source === "object" && !Array.isArray(source) ? source : {};
    let id = typeof value.id === "string" && value.id.trim() && !cardIds.has(value.id.trim()) ? value.id.trim() : `math-card-${index + 1}`;
    while (cardIds.has(id)) id = `math-card-${index + 1}-${cardIds.size + 1}`;
    cardIds.add(id);
    const sectionId = typeof value.sectionId === "string" && sectionIds.has(value.sectionId) ? value.sectionId : sectionIds.values().next().value;
    const kind = CARD_KINDS.has(value.kind) ? value.kind : "formula";
    return {
      id,
      subjectId: "math",
      sectionId,
      kind,
      title: typeof value.title === "string" && value.title.trim() ? value.title.trim() : "未命名公式卡",
      prompt: typeof value.prompt === "string" ? value.prompt.trim() : "先回忆公式，再展开答案。",
      markdown: typeof value.markdown === "string" && value.markdown.trim() ? value.markdown.trim() : "暂无公式正文。",
      tags: normalizeTags(value.tags),
      order: Number.isFinite(Number(value.order)) ? Number(value.order) : index,
      archived: Boolean(value.archived),
      checkable: value.checkable !== false
    };
  }

  function normalizeTags(value) {
    const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/[,，、;；\n]/) : [];
    return Array.from(new Set(list.map((item) => String(item || "").trim()).filter(Boolean))).slice(0, 12);
  }

  function normalize(input) {
    const source = input && typeof input === "object" && !Array.isArray(input) ? input : null;
    if (!source || !Array.isArray(source.sections) || !Array.isArray(source.cards) || !source.sections.length || !source.cards.length) return defaultLibrary();
    const sectionIds = new Set();
    const sections = source.sections.map(normalizeSection).filter((section) => {
      if (sectionIds.has(section.id)) return false;
      sectionIds.add(section.id);
      return true;
    });
    if (!sections.length) return defaultLibrary();
    const cardIds = new Set();
    const cards = source.cards.map((card, index) => normalizeCard(card, index, sectionIds, cardIds));
    const validIds = new Set(cards.map((card) => card.id));
    const masteredCardIds = Array.from(new Set((Array.isArray(source.masteredCardIds) ? source.masteredCardIds : []).map((id) => String(id || "").trim()).filter((id) => validIds.has(id))));
    return { version: Number(source.version) >= CATALOG_VERSION ? CATALOG_VERSION : 2, subjectId: "math", grouped: Boolean(source.grouped), sections, cards, masteredCardIds };
  }

  function legacyCardTarget(cardId) {
    const groupId = LEGACY_CARD_TO_GROUP.get(cardId) || cardId;
    return LEGACY_GROUP_TO_V3.get(groupId) || "";
  }

  function mergeCatalog(library) {
    const source = normalize(library);
    if (Number(source.version) >= CATALOG_VERSION && source.sections.some((section) => DEFAULT_SECTION_IDS.has(section.id))) return source;
    const defaults = defaultLibrary();
    const defaultSectionById = new Map(defaults.sections.map((section) => [section.id, { ...section }]));
    const sectionIdMap = new Map(defaults.sections.map((section) => [section.id, section.id]));
    const customSections = [];

    source.sections.forEach((section, index) => {
      if (DEFAULT_SECTION_IDS.has(section.id)) {
        const target = defaultSectionById.get(section.id);
        if (target) target.archived = Boolean(section.archived);
        return;
      }
      const mappedId = LEGACY_SECTION_TO_V3.get(section.id);
      if (mappedId) {
        sectionIdMap.set(section.id, mappedId);
        if (section.archived && defaultSectionById.has(mappedId)) defaultSectionById.get(mappedId).archived = true;
        return;
      }
      let id = section.id;
      while (defaultSectionById.has(id) || customSections.some((item) => item.id === id)) id = `${section.id}-${index + 1}`;
      sectionIdMap.set(section.id, id);
      customSections.push({ ...section, id, subjectId: "math", order: defaults.sections.length + customSections.length });
    });

    const defaultSections = defaults.sections.map((section) => defaultSectionById.get(section.id));
    const defaultCardIds = new Set(defaults.cards.map((card) => card.id));
    const defaultCounts = new Map(defaults.sections.map((section) => [section.id, defaults.cards.filter((card) => card.sectionId === section.id).length]));
    const customCards = [];
    source.cards.forEach((card, index) => {
      if (defaultCardIds.has(card.id) || LEGACY_BUILTIN_CARD_IDS.has(card.id)) return;
      const sectionId = sectionIdMap.get(card.sectionId) || defaults.sections[0].id;
      let id = card.id;
      while (defaultCardIds.has(id) || customCards.some((item) => item.id === id)) id = `${card.id}-${index + 1}`;
      const sectionOffset = defaultCounts.get(sectionId) || 0;
      customCards.push({ ...card, id, sectionId, subjectId: "math", order: sectionOffset + Number(card.order || 0) + customCards.length });
    });

    const validCustomIds = new Set(customCards.map((card) => card.id));
    const masteredCardIds = Array.from(new Set(source.masteredCardIds.map((id) => {
      if (validCustomIds.has(id) || defaultCardIds.has(id)) return id;
      return legacyCardTarget(id);
    }).filter((id) => defaultCardIds.has(id) || validCustomIds.has(id))));

    return normalize({
      version: CATALOG_VERSION,
      subjectId: "math",
      grouped: true,
      sections: [...defaultSections, ...customSections],
      cards: [...defaults.cards, ...customCards],
      masteredCardIds
    });
  }

  function sectionMap(library) {
    return new Map(normalize(library).sections.map((section) => [section.id, section]));
  }

  function isArchived(library, card) {
    const normalized = normalize(library);
    const section = normalized.sections.find((item) => item.id === card.sectionId);
    return Boolean(card.archived || section?.archived);
  }

  function isMastered(library, cardId) {
    const normalized = normalize(library);
    return normalized.masteredCardIds.includes(cardId);
  }

  function getCheckableCards(library, options = {}) {
    const normalized = normalize(library);
    return normalized.cards.filter((card) => card.checkable !== false && (options.includeArchived || !isArchived(normalized, card)));
  }

  function progress(library) {
    const cards = getCheckableCards(library);
    const mastered = cards.filter((card) => isMastered(library, card.id)).length;
    return { mastered, total: cards.length, remaining: Math.max(0, cards.length - mastered), percent: cards.length ? Math.round((mastered / cards.length) * 100) : 0 };
  }

  function sectionStats(library, sectionId) {
    const normalized = normalize(library);
    const cards = normalized.cards.filter((card) => card.sectionId === sectionId && card.checkable !== false && !isArchived(normalized, card));
    const mastered = cards.filter((card) => normalized.masteredCardIds.includes(card.id)).length;
    return { mastered, total: cards.length, percent: cards.length ? Math.round((mastered / cards.length) * 100) : 0 };
  }

  function filterCards(library, options = {}) {
    const normalized = normalize(library);
    const query = String(options.query || "").trim().toLocaleLowerCase();
    const status = ["all", "unmastered", "mastered", "archived"].includes(options.status) ? options.status : "all";
    return normalized.cards
      .filter((card) => options.sectionId && options.sectionId !== "all" ? card.sectionId === options.sectionId : true)
      .filter((card) => {
        const archived = isArchived(normalized, card);
        const mastered = normalized.masteredCardIds.includes(card.id);
        if (status === "archived") return archived;
        if (archived) return false;
        if (status === "mastered") return card.checkable !== false && mastered;
        if (status === "unmastered") return card.checkable !== false && !mastered;
        return true;
      })
      .filter((card) => {
        if (!query) return true;
        const section = normalized.sections.find((item) => item.id === card.sectionId);
        const text = [card.title, card.prompt, card.markdown, ...(card.tags || []), section?.title, section?.description].join(" ").toLocaleLowerCase();
        return text.includes(query);
      })
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "zh-CN"));
  }

  function toggleMastered(library, cardId, mastered) {
    const normalized = normalize(library);
    const card = normalized.cards.find((item) => item.id === cardId && item.checkable !== false);
    if (!card) return normalized;
    const ids = new Set(normalized.masteredCardIds);
    if (mastered === undefined ? !ids.has(cardId) : mastered) ids.add(cardId);
    else ids.delete(cardId);
    normalized.masteredCardIds = Array.from(ids);
    return normalized;
  }

  function upsertCard(library, input) {
    const normalized = normalize(library);
    const value = input && typeof input === "object" ? input : {};
    const existing = normalized.cards.find((card) => card.id === value.id);
    const kind = value.kind === "method" ? "method" : "formula";
    const next = {
      ...(existing || {}),
      ...value,
      id: existing?.id || value.id || `math-card-${Date.now()}`,
      subjectId: "math",
      kind,
      order: existing ? existing.order : normalized.cards.length,
      archived: existing ? Boolean(value.archived ?? existing.archived) : Boolean(value.archived),
      checkable: value.checkable !== false
    };
    delete next.linkedCardIds;
    const cards = existing ? normalized.cards.map((card) => card.id === existing.id ? next : card) : [...normalized.cards, next];
    return normalize({ ...normalized, cards });
  }

  function archiveCard(library, cardId, archived = true) {
    return normalize({ ...normalize(library), cards: normalize(library).cards.map((card) => card.id === cardId ? { ...card, archived } : card) });
  }

  function upsertSection(library, input) {
    const normalized = normalize(library);
    const value = input && typeof input === "object" ? input : {};
    const existing = normalized.sections.find((section) => section.id === value.id);
    const id = existing?.id || value.id || `math-section-${Date.now()}`;
    const next = {
      id,
      subjectId: "math",
      title: String(value.title || existing?.title || "未命名章节").trim() || "未命名章节",
      color: existing?.color || SECTION_COLORS[normalized.sections.length % SECTION_COLORS.length],
      order: existing ? existing.order : normalized.sections.length,
      archived: existing ? Boolean(value.archived ?? existing.archived) : Boolean(value.archived)
    };
    const sections = existing ? normalized.sections.map((section) => section.id === existing.id ? next : section) : [...normalized.sections, next];
    return normalize({ ...normalized, sections });
  }

  function archiveSection(library, sectionId, archived = true) {
    const normalized = normalize(library);
    return normalize({ ...normalized, sections: normalized.sections.map((section) => section.id === sectionId ? { ...section, archived } : section) });
  }

  function reorder(list, id, direction) {
    const items = [...list].sort((a, b) => a.order - b.order);
    const index = items.findIndex((item) => item.id === id);
    const target = direction < 0 ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= items.length) return items;
    [items[index], items[target]] = [items[target], items[index]];
    return items.map((item, order) => ({ ...item, order }));
  }

  function moveSection(library, sectionId, direction) {
    const normalized = normalize(library);
    return normalize({ ...normalized, sections: reorder(normalized.sections, sectionId, direction) });
  }

  function moveCard(library, cardId, direction) {
    const normalized = normalize(library);
    const card = normalized.cards.find((item) => item.id === cardId);
    if (!card) return normalized;
    const sameSection = normalized.cards.filter((item) => item.sectionId === card.sectionId);
    const reordered = reorder(sameSection, cardId, direction);
    const orders = new Map(reordered.map((item) => [item.id, item.order]));
    return normalize({ ...normalized, cards: normalized.cards.map((item) => orders.has(item.id) ? { ...item, order: orders.get(item.id) } : item) });
  }

  return {
    CARD_KINDS,
    CATALOG_VERSION,
    DEFAULT_SECTIONS,
    DEFAULT_SECTION_IDS,
    LEGACY_V2_SECTIONS,
    LEGACY_DEFAULT_SECTION_IDS,
    LEGACY_BUILTIN_CARD_IDS,
    GROUPED_CARD_DEFINITIONS,
    SECTION_COLORS,
    aggregateCards,
    defaultLibrary,
    legacyV2DefaultLibrary,
    mergeCatalog,
    normalize,
    sectionMap,
    isArchived,
    isMastered,
    getCheckableCards,
    progress,
    sectionStats,
    filterCards,
    toggleMastered,
    upsertCard,
    archiveCard,
    upsertSection,
    archiveSection,
    moveSection,
    moveCard
  };
});
