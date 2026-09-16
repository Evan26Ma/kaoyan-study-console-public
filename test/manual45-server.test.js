const test = require("node:test");
const assert = require("node:assert/strict");
process.env.STUDY_ENV_PATH = "/tmp/manual45-server-test-missing.env";
process.env.STUDY_DATA_DIR = "/tmp/manual45-server-test-data";
const { normalizeManual45ContentState, normalizeRecitationEvaluation, redactPrivateState, requestChatProvider } = require("../server.js");

test("服务端状态标准化保留兼容数据与独立 study 且不依赖普通 tasks", () => {
  const state = normalizeManual45ContentState({
    packageId: "example-manual",
    sourceHash: "hash",
    bindings: { "unit-1": { listId: 3, boundAt: "2026-08-17T00:00:00.000Z" } },
    progress: { "unit-1": { "2": { completedAt: "2026-08-17", score: 2, answerExpanded: true, note: "再看一次" } } },
    memorized: { "unit-1": { memorizedAt: "2026-08-17T00:00:00.000Z" } },
    revisions: { "unit-1": { markdown: "修订版", updatedAt: "2026-08-17T00:00:00.000Z", sourceHash: "hash" } },
    study: { "unit-1": { score: 4, note: "独立笔记", updatedAt: "2026-08-18T00:00:00.000Z" } },
    issueReports: { "unit-1": { reason: "公式有误", updatedAt: "2026-09-09T00:00:00.000Z", sourceHash: "hash" } }
  });
  assert.equal(state.bindings["unit-1"].listId, 3);
  assert.equal(state.progress["unit-1"]["2"].score, 2);
  assert.equal(state.progress["unit-1"]["2"].answerExpanded, true);
  assert.equal(state.memorized["unit-1"].memorizedAt, "2026-08-17T00:00:00.000Z");
  assert.equal(state.revisions["unit-1"][0].markdown, "修订版");
  assert.equal(state.study["unit-1"].score, 4);
  assert.equal(state.study["unit-1"].note, "独立笔记");
  assert.equal(state.issueReports["unit-1"].reason, "公式有误");
  const redacted = redactPrivateState({ version: 12, manual45Content: state, tasks: [{ id: "ordinary" }] });
  assert.equal(redacted.manual45Content.bindings["unit-1"].listId, 3);
  assert.equal(redacted.manual45Content.memorized["unit-1"].memorizedAt, "2026-08-17T00:00:00.000Z");
  assert.deepEqual(redacted.tasks, [{ id: "ordinary" }]);
});

test("服务端评测结果固定为 10 分制并清理异常字段", () => {
  const result = normalizeRecitationEvaluation({ score: 12.34, maxScore: 3, summary: "准确", shortcomings: ["漏项", ""], reinforcementPoints: "invalid", memoryTechnique: "口诀" });
  assert.deepEqual(result, { score: 10, maxScore: 10, summary: "准确", shortcomings: ["漏项"], reinforcementPoints: [], memoryTechnique: "口诀" });
  assert.throws(() => normalizeRecitationEvaluation({ summary: "没有分数" }), /有效分数/);
});

test("API 错误响应保留 code 和 description，便于定位认证问题", async () => {
  await assert.rejects(
    requestChatProvider(
      { name: "本地测试 API", apiKey: "test-key", baseUrl: "http://127.0.0.1:1/v1", model: "test-model" },
      { model: "test-model", messages: [], max_tokens: 1 },
      "API 连通性测试",
      {
        fetchImpl: async () => new Response(JSON.stringify({ error: "invalid_grant", error_description: "Bad Request" }), {
          status: 400,
          statusText: "Bad Request",
          headers: { "Content-Type": "application/json" }
        })
      }
    ),
    (error) => error.status === 400 && error.message.includes("invalid_grant: Bad Request")
  );
});
