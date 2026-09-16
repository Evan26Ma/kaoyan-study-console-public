const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "study-console-privacy-"));
process.env.STUDY_DATA_DIR = dataDir;
process.env.ACCESS_TOKEN = "privacy-test-token";

const state = {
  version: 6,
  profile: { targetSchool: "机密大学", targetMajor: "机密专业", examDate: "2030-12-25", dailyCapacity: 8, defaultCapacityMinutes: 480, capacityOverrides: { "2030-01-03": 0 }, restDays: { "2030-01-03": { activatedAt: "2030-01-03T12:00:00.000Z", hadCapacityOverride: false, manual45WasRest: false } }, durationDefaults: { study: 60 } },
  plans: [{ id: "plan-1", title: "机密阶段", startDate: "2030-01-01" }],
  reflections: [{ id: "reflection-1", date: "2030-01-02", content: "机密感想" }],
  reports: [{ id: "report-1", title: "机密日结", periodStart: "2030-01-02", periodEnd: "2030-01-02" }],
  dailyTasks: [{ id: "task-1", title: "可读每日任务", date: "2030-01-02" }],
  adjustmentRuns: [{ id: "private-adjustment", suggestions: [{ explanation: "规划隐私" }] }],
  tasks: [{ id: "recite-1", title: "可读背诵" }],
  wrongQuestions: [],
  englishReading: {},
  mathFormulaLibrary: { version: 1, sections: [{ id: "math-section", title: "公开公式", archived: false }], cards: [{ id: "math-card", sectionId: "math-section", kind: "formula", title: "公开卡", markdown: "\\[x\\]" }], masteredCardIds: [] },
  updatedAt: "2030-01-03T04:05:06.000Z",
  futurePrivateField: "未来字段不应匿名下发"
};
fs.writeFileSync(path.join(dataDir, "state.json"), JSON.stringify(state));

const { server } = require("../server.js");

function request(pathname, options = {}) {
  return fetch(`http://127.0.0.1:${server.address().port}${pathname}`, options).then(async (response) => ({
    status: response.status,
    body: await response.json()
  }));
}

test("state privacy protects private sections for anonymous reads and restores them for auth", async (t) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const anonymous = await request("/api/state");
  assert.equal(anonymous.status, 200);
  assert.equal(anonymous.body.privacy.mode, "locked");
  assert.deepEqual(anonymous.body.privacy.lockedSections, ["goals", "plans", "reflections", "reports", "adjustments"]);
  assert.equal(anonymous.body.state.profile.targetSchool, "");
  assert.equal(anonymous.body.state.profile.targetMajor, "");
  assert.equal(anonymous.body.state.profile.examDate, "");
  assert.deepEqual(anonymous.body.state.plans, []);
  assert.deepEqual(anonymous.body.state.reflections, []);
  assert.deepEqual(anonymous.body.state.reports, []);
  assert.deepEqual(anonymous.body.state.adjustmentRuns, []);
  assert.equal(anonymous.body.state.mathFormulaLibrary.cards[0].title, "公开卡");
  assert.equal(Object.hasOwn(anonymous.body.state.profile, "capacityOverrides"), false);
  assert.equal(Object.hasOwn(anonymous.body.state.profile, "restDays"), false);
  assert.equal(Object.hasOwn(anonymous.body.state.profile, "durationDefaults"), false);
  assert.equal(Object.hasOwn(anonymous.body.state, "updatedAt"), false);
  assert.equal(Object.hasOwn(anonymous.body.state, "futurePrivateField"), false);
  assert.doesNotMatch(JSON.stringify(anonymous.body), /机密/);

  const tokenRead = await request("/api/state", { headers: { "X-Study-Token": "privacy-test-token" } });
  assert.equal(tokenRead.status, 200);
  assert.equal(tokenRead.body.privacy.mode, "full");
  assert.equal(tokenRead.body.state.profile.targetSchool, "机密大学");
  assert.equal(tokenRead.body.state.plans[0].title, "机密阶段");
  assert.equal(tokenRead.body.state.adjustmentRuns[0].id, "private-adjustment");
  assert.equal(tokenRead.body.state.mathFormulaLibrary.cards[0].id, "math-card");

  const deviceId = "privacy-test-device-123456";
  const auth = await request("/api/auth/check", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Study-Token": "privacy-test-token", "X-Study-Device": deviceId },
    body: JSON.stringify({ deviceId })
  });
  assert.equal(auth.status, 200);
  const trustedRead = await request("/api/state", { headers: { "X-Study-Device": deviceId } });
  assert.equal(trustedRead.body.privacy.mode, "full");
  assert.equal(trustedRead.body.state.reports[0].title, "机密日结");
});

test("frontend keeps private content behind a lock and reloads after unlock", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(html, /privacyMode = "locked"/);
  assert.match(html, /state = sanitizePrivateState\(state\)/);
  assert.match(html, /fetch\("\/api\/state", \{ headers: authHeaders\(\) \}\)/);
  assert.match(html, /renderLockedPrivateView\("进度规划"/);
  assert.match(html, /renderLockedPrivateView\("今日收尾"/);
  assert.match(html, /renderLockedPrivateView\("日结周报"/);
  assert.match(html, /await loadServerState\(\)/);
  assert.match(html, /privacyMode === "full"\) state\.reports/);
});
