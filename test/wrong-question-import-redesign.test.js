const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const designDoc = fs.readFileSync(path.join(__dirname, "..", "docs", "WRONG_QUESTION_IMPORT_REDESIGN.md"), "utf8");

function loadDirectImportFunctions() {
  const start = html.indexOf("function wrongImportTextItems");
  const end = html.indexOf("async function addWrongQuestionFromForm", start);
  const source = html.slice(start, end);
  return new Function(`
    const state = { wrongQuestions: [] };
    let toast = "";
    let sequence = 0;
    const stripMarkdown = (value) => String(value || "").replace(/^#{1,6}\\s+/gm, "");
    const cleanText = (value, fallback) => typeof value === "string" && value.trim() ? value.trim() : fallback;
    const normalizeWrongQuestion = (value) => value;
    const createId = () => "wrong-" + (++sequence);
    const createWrongReview = (round, dueDate) => ({ round, dueDate });
    const findDuplicateWrongQuestion = () => null;
    const queueDuplicateWrongQuestionForReview = () => false;
    const saveState = () => {};
    const clearWrongQuestionForms = () => {};
    const render = () => {};
    const showToast = (value) => { toast = value; };
    ${source}
    return { state, wrongImportTextItems, importBasicWrongQuestions, getToast: () => toast };
  `)();
}

function renderQueueWithJobs(jobs) {
  const start = html.indexOf("function renderWrongImportQueue");
  const end = html.indexOf("function renderWrongImportJob", start);
  const source = html.slice(start, end);
  return new Function("jobs", `
    const wrongImportJobs = jobs;
    const wrongImportJobsLoaded = true;
    const wrongImportLastError = "";
    const wrongImportJobsSyncing = false;
    const escapeHtml = (value) => String(value);
    const renderWrongImportJob = (job) => '<li data-test-job="' + job.jobId + '">' + job.label + '</li>';
    ${source}
    return renderWrongImportQueue();
  `)(jobs);
}

function loadTextFileFunctions(initialValue = "", confirmResult = true) {
  const start = html.indexOf("function validateWrongImportTextFile");
  const end = html.indexOf("async function pasteWrongImportFromClipboard", start);
  const source = html.slice(start, end);
  return new Function("initialValue", "confirmResult", `
    const field = {
      value: initialValue,
      focused: false,
      dispatchEvent() {},
      focus() { this.focused = true; }
    };
    let toast = "";
    const document = { querySelector: (selector) => selector === "#wrongMarkdownField" ? field : null };
    const window = { confirm: () => confirmResult };
    const showToast = (value) => { toast = value; };
    const Event = class {};
    ${source}
    return {
      field,
      validateWrongImportTextFile,
      importWrongQuestionTextFile,
      getToast: () => toast
    };
  `)(initialValue, confirmResult);
}

test("wrong-question import is organized as a compact four-part workspace", () => {
  for (const heading of ["导入工作台", "后台队列", "大观园收藏", "导入去向", "更多功能"]) {
    assert.match(html, new RegExp(heading));
  }
  assert.match(html, /class="wrong-import-split"/);
  assert.match(html, /renderCxyOnlySyncPanel\(\)[\s\S]*renderWrongImportDestination\(\)/);
});

test("composer supports clipboard, local text files, clearing, live limits and batch separators", () => {
  assert.match(html, /data-action="paste-wrong-import"/);
  assert.match(html, /data-action="choose-wrong-import-file"/);
  assert.match(html, /data-action="clear-wrong-import"/);
  assert.match(html, /accept="\.txt,\.md,\.markdown,text\/plain,text\/markdown"/);
  assert.match(html, /function validateWrongImportTextFile\(file\)/);
  assert.match(html, /function importWrongQuestionTextFile\(file, input\)/);
  assert.match(html, /当前输入不为空，确认用文件内容替换吗/);
  assert.match(html, /文件未上传/);
  assert.match(html, /navigator\.clipboard\.readText/);
  assert.match(html, /当前输入已保留/);
  assert.match(html, /id="wrongImportCharacterCount"/);
  assert.match(html, /id="wrongImportQuestionCount"/);
  assert.match(html, /function wrongImportTextItems\(value\)/);
  assert.match(html, /split\(\/\\n\\s\*---\+\\s\*\\n\/g\)/);
  assert.match(html, /总文本最多 20,000 字符/);
  assert.match(html, /一次最多导入 30 道错题/);
});

test("local text file reading succeeds without uploading", async () => {
  const api = loadTextFileFunctions();
  const input = { value: "selected" };
  const result = await api.importWrongQuestionTextFile({
    name: "questions.md",
    text: async () => "第一题\n\n---\n\n第二题"
  }, input);
  assert.equal(result, true);
  assert.equal(api.field.value, "第一题\n\n---\n\n第二题");
  assert.equal(input.value, "");
  assert.match(api.getToast(), /文件未上传/);
});

test("local text file reading preserves existing content on cancel, type, size and read errors", async () => {
  const cancelled = loadTextFileFunctions("原内容", false);
  assert.equal(await cancelled.importWrongQuestionTextFile({ name: "new.txt", text: async () => "新内容" }), false);
  assert.equal(cancelled.field.value, "原内容");

  for (const file of [
    { name: "questions.pdf", text: async () => "PDF" },
    { name: "too-large.md", text: async () => "x".repeat(20001) },
    { name: "broken.txt", text: async () => { throw new Error("磁盘读取失败"); } }
  ]) {
    const api = loadTextFileFunctions("保留我", true);
    assert.equal(await api.importWrongQuestionTextFile(file), false);
    assert.equal(api.field.value, "保留我");
    assert.match(api.getToast(), /当前输入已保留/);
  }
});

test("density selector defaults to 90 percent and persists the three supported levels", () => {
  assert.match(html, /uiState\.wrongImportScale = \[85, 90, 100\]\.includes\(Number\(uiState\.wrongImportScale\)\)[\s\S]*: 90/);
  assert.match(html, /\[85, 90, 100\]\.map/);
  assert.match(html, /data-import-scale="\$\{importScale\}"/);
  assert.match(html, /function setWrongImportScale\(value\)[\s\S]*uiState\.wrongImportScale = scale;[\s\S]*persistUiState\(\)/);
  assert.match(html, /--import-density: \.9/);
  assert.doesNotMatch(html, /\.wrong-import-page\s*\{[^}]*\b(?:zoom|transform)\s*:/);
});

test("top workspace follows the reference proportions and compact field grouping", () => {
  assert.match(html, /\.wrong-import-grid \{[^}]*grid-template-columns: minmax\(300px, 2fr\) minmax\(0, 3fr\)/);
  assert.match(html, /#wrongMarkdownField \{[^}]*min-height: 150px/);
  assert.match(html, /\.wrong-import-meta-grid \{[^}]*grid-template-columns: repeat\(3,/);
  assert.match(html, /class="wrong-import-priority-date"/);
  assert.match(html, /class="wrong-import-submit"/);
  assert.match(html, /id="wrongImportEstimate"/);
});

test("secondary import actions use purple theme states while danger remains red", () => {
  assert.match(html, /\.wrong-import-page \.secondary-btn,[\s\S]*?border: 1px solid #cfc7fb;[\s\S]*?background: #f5f2ff;[\s\S]*?color: #4d3fb3/);
  assert.match(html, /\.wrong-import-page \.secondary-btn:hover,[\s\S]*?background: #ede9fe/);
  assert.match(html, /\.wrong-import-page \.secondary-btn:disabled,[\s\S]*?cursor: not-allowed/);
  assert.match(html, /\.wrong-import-primary:focus-visible[\s\S]*?outline: 3px solid/);
  assert.match(html, /\.wrong-import-page \.danger-btn \{[^}]*color: #b91c1c/);
});

test("AI organizing defaults on and disabled AI takes the local basic-card path", () => {
  assert.match(html, /uiState\.aiOrganizeWrongImport !== false/);
  assert.match(html, /id="aiOrganizeWrongImportField"/);
  assert.match(html, /function importBasicWrongQuestions\(items, overrides\)/);
  assert.match(html, /if \(!aiOrganize\) \{[\s\S]*importBasicWrongQuestions\(items, overrides\)/);
  assert.match(html, /reviews: \[createWrongReview\(0, overrides\.reviewStartDate\)\]/);
  assert.match(html, /解析尚未整理。可在错题库使用 AI 编辑或重做解析补充。/);
  assert.match(html, /关闭开关直接导入/);
});

test("basic direct import executes batching and creates a first review per question", () => {
  const api = loadDirectImportFunctions();
  const items = api.wrongImportTextItems("第一题\n\n---\n\n第二题");
  assert.deepEqual(items, ["第一题", "第二题"]);
  api.importBasicWrongQuestions(items, {
    subject: "数学",
    title: "",
    source: "",
    reviewStartDate: "2026-07-30",
    priority: 3,
    knowledgePoints: ["极限"],
    mistakeReason: "审题"
  });
  assert.equal(api.state.wrongQuestions.length, 2);
  assert.deepEqual(api.state.wrongQuestions.map((question) => question.reviews[0].dueDate), ["2026-07-30", "2026-07-30"]);
  assert.match(api.state.wrongQuestions[0].detailMarkdown, /解析尚未整理/);
  assert.match(api.getToast(), /已直接导入 2 道基础错题/);
});

test("queue exposes all stages, recovery, cancellation and retry", () => {
  for (const stage of ["排队中", "AI 整理", "一图流生成", "写入错题库", "完成"]) {
    assert.match(html, new RegExp(stage));
  }
  assert.match(html, /function renderWrongImportStages\(job\)/);
  assert.match(html, /data-action="recover-wrong-import-service"/);
  assert.match(html, /await checkAiStatus\(false\)/);
  assert.match(html, /await syncWrongQuestionImportJobs\(\)/);
  assert.match(html, /data-action="cancel-wrong-import-job"/);
  assert.match(html, /data-action="retry-wrong-import-job"/);
});

test("completed imports leave the active queue while failures remain actionable", () => {
  const output = renderQueueWithJobs([
    { jobId: "completed-bilibili", label: "Bilibili 视频截图题", status: "done", importedAt: "2026-07-29T09:00:00Z" },
    { jobId: "cancelled-import", label: "取消题", status: "cancelled", importedAt: "" },
    { jobId: "failed-import", label: "失败题", status: "error", importedAt: "" }
  ]);
  assert.doesNotMatch(output, /Bilibili 视频截图题/);
  assert.doesNotMatch(output, /取消题/);
  assert.match(output, /失败题/);
  assert.match(html, /class="wrong-import-progress" role="progressbar"/);
});

test("destination metrics are derived from existing questions and reviews", () => {
  assert.match(html, /function wrongImportOverview\(\)/);
  assert.match(html, /getNextPendingWrongReview\(question\)/);
  assert.match(html, /question\.noteImages\.length > 0/);
  assert.match(html, /String\(question\.createdAt \|\| ""\)\.slice\(0, 7\) === month/);
  for (const label of ["今日到期", "已逾期", "明日到期", "未来 7 天", "错题总量", "本月新增", "一图流", "知识点"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /<h4>高频知识点<\/h4>/);
});

test("available follow-up features route to the existing library or review pages", () => {
  for (const label of ["AI 答疑", "AI 编辑", "重做解析", "公式修正", "生成排版图", "归档与删除", "导出错题", "开始复盘"]) {
    assert.match(html, new RegExp(label));
  }
  assert.doesNotMatch(html, /敬请期待|即将上线/);
});

test("responsive rules preserve internal stage scrolling and touch targets", () => {
  assert.match(html, /\.wrong-import-grid \{ display: grid; grid-template-columns:/);
  assert.match(html, /@media \(max-width: 1023px\)[\s\S]*?\.wrong-import-split \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /@media \(max-width: 767px\)[\s\S]*?\.wrong-import-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.wrong-import-more \{ display: grid; grid-template-columns: repeat\(8,/);
  assert.match(html, /@media \(max-width: 1023px\)[\s\S]*?\.wrong-import-more \{ grid-template-columns: repeat\(4,/);
  assert.match(html, /@media \(max-width: 767px\)[\s\S]*?\.wrong-import-more \{ grid-template-columns: repeat\(2,/);
  assert.match(html, /@media \(max-width: 480px\)[\s\S]*?\.wrong-import-priority-date \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.wrong-import-stages-wrap \{[^}]*overflow-x: auto/);
  assert.match(html, /\.wrong-import-page button, \.wrong-import-page a \{ min-height: 44px/);
  assert.match(html, /@media \(max-width: 767px\)[\s\S]*?#wrongMarkdownField \{[^}]*font-size: 16px/);
  assert.match(html, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.wrong-import-page/);
});

test("375, 768, 1024 and 1440 viewport contracts avoid page-level horizontal scrolling", () => {
  assert.deepEqual([375, 768, 1024, 1440], [375, 768, 1024, 1440]);
  assert.match(html, /\.wrong-import-page \{[\s\S]*?min-width: 0/);
  assert.match(html, /\.wrong-import-split > \* \{ min-width: 0; \}/);
  assert.match(html, /\.wrong-import-meta-grid input, \.wrong-import-meta-grid select \{[^}]*min-width: 0/);
  assert.match(html, /@media \(max-width: 940px\)[\s\S]*?\.content-shell \{ width: min\(100% - 28px, 1400px\); \}/);
  assert.match(html, /@media \(max-width: 560px\)[\s\S]*?\.content-shell \{ width: calc\(100% - 22px\); \}/);
  assert.match(html, /@media \(max-width: 767px\)[\s\S]*?\.wrong-import-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(html, /\.wrong-import-stages-wrap \{[^}]*overflow-x: auto/);
});

test("redesign documentation records scope, data and release boundaries", () => {
  assert.match(designDoc, /浏览器本地读取 `\.txt`、`\.md` 和 `\.markdown`/);
  assert.match(designDoc, /不支持 PDF\/Word 解析、图片 OCR/);
  assert.match(designDoc, /wrong-question-import-reference\.png/);
  assert.match(designDoc, /不新增数据版本或迁移历史错题/);
  assert.match(designDoc, /不重启 Node 进程/);
  assert.match(designDoc, /375、768、1024、1440px/);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "docs", "assets", "wrong-question-import-reference.png")));
});
