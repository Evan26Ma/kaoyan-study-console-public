const test = require("node:test");
const assert = require("node:assert/strict");
const { requestChatProvider } = require("../server.js");

test("text API timeout also covers a response body that never finishes", async () => {
  const hangingFetch = async (url, { signal }) => ({
    text: () => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })
  });

  const result = await Promise.race([
    requestChatProvider({ name: "test", baseUrl: "https://example.test", apiKey: "key", model: "model" }, {}, "测试接口", {
      timeoutMs: 20,
      fetchImpl: hangingFetch
    }).then(() => ({ kind: "resolved" }), (error) => ({ kind: "error", message: error.message })),
    new Promise((resolve) => setTimeout(() => resolve({ kind: "hung" }), 200))
  ]);

  assert.equal(result.kind, "error");
  assert.match(result.message, /测试接口请求超时/);
});

test("text API network failures become actionable proxy errors", async () => {
  const networkFetch = async () => {
    const error = new Error("fetch failed");
    error.cause = { code: "ECONNREFUSED" };
    throw error;
  };

  await assert.rejects(
    requestChatProvider({ name: "test", baseUrl: "http://127.0.0.1:8317/v1", apiKey: "key", model: "model" }, {}, "测试接口", {
      fetchImpl: networkFetch
    }),
    (error) => {
      assert.equal(error.status, 503);
      assert.equal(error.aiNetworkError, true);
      assert.match(error.message, /无法连接 AI 服务（ECONNREFUSED）/);
      return true;
    }
  );
});
