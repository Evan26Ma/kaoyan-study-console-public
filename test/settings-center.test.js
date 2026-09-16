const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "study-console-settings-"));
process.env.STUDY_DATA_DIR = dataDir;
process.env.STUDY_ENV_PATH = path.join(dataDir, ".env");
process.env.ACCESS_TOKEN = "settings-test-token";
process.env.DEEPSEEK_API_KEY = "sk-text-primary-secret";
process.env.DEEPSEEK_MODEL = "text-primary-model";
process.env.DEEPSEEK_BASE_URL = "https://text-primary.example/v1";
process.env.TEXT_API_PROVIDERS = JSON.stringify([
  { name: "文本备用", apiKey: "sk-text-backup-secret", model: "backup-model", baseUrl: "https://text-backup.example/v1", maxTokens: 4000 }
]);
process.env.IMAGE_API_KEY = "test-image-api-key";
process.env.IMAGE_MODEL = "image-primary-model";
process.env.IMAGE_BASE_URL = "https://image-primary.example/v1";

const { server } = require("../server.js");

function request(pathname, options = {}) {
  return fetch(`http://127.0.0.1:${server.address().port}${pathname}`, options).then(async (response) => ({
    status: response.status,
    body: await response.json()
  }));
}

test("settings center protects details and supports structured provider management", async (t) => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  const locked = await request("/api/settings");
  assert.equal(locked.status, 200);
  assert.equal(locked.body.locked, true);
  assert.equal(Object.hasOwn(locked.body, "baseUrl"), false);
  assert.equal(Object.hasOwn(locked.body, "apiProviders"), false);

  const headers = { "X-Study-Token": "settings-test-token" };
  const unlocked = await request("/api/settings", { headers });
  assert.equal(unlocked.body.locked, false);
  assert.equal(unlocked.body.apiProviders.length, 2);
  assert.equal(unlocked.body.apiProviders[0].role, "primary");
  assert.equal(unlocked.body.apiProviders[1].slot, "text:backup:0");
  assert.doesNotMatch(JSON.stringify(unlocked.body), /primary-secret|backup-secret/);

  const revealed = await request("/api/settings/secret", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "text", slot: "text:backup:0" })
  });
  assert.equal(revealed.body.apiKey, "sk-text-backup-secret");

  const saved = await request("/api/settings", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      section: "text",
      providers: [
        { ...unlocked.body.apiProviders[1], role: "primary", sourceSlot: "text:backup:0", enabled: true },
        { ...unlocked.body.apiProviders[0], role: "backup", sourceSlot: "text:primary", enabled: false }
      ]
    })
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.body.apiProviders[0].model, "backup-model");
  assert.equal(saved.body.apiProviders[1].enabled, false);
  assert.equal(saved.body.apiProviderCount, 1);
});

test("settings UI exposes mature sections and responsive navigation", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  for (const marker of ["设置总览", "学习规划", "时间估算", "AI 服务", "数据与备份", "系统与访问", "settings-provider-drawer"]) {
    assert.match(html, new RegExp(marker));
  }
  assert.match(html, /grid-template-columns:\s*224px minmax\(0,\s*1fr\)/);
  assert.match(html, /@media \(max-width: 1024px\)[\s\S]*?settings-mobile-back/);
  assert.match(html, /settingsSavebar\("save-settings-profile"/);
  assert.match(html, /settingsSavebar\("save-settings-providers"/);
  assert.match(html, /settingsImportPreview/);
});

test("settings can be restored as the initial view before the first render", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  const sectionsDeclaration = html.indexOf("const SETTINGS_SECTIONS");
  const initialRender = html.indexOf("    render();");
  assert.notEqual(sectionsDeclaration, -1);
  assert.notEqual(initialRender, -1);
  assert.ok(
    sectionsDeclaration < initialRender,
    "SETTINGS_SECTIONS must be initialized before render() restores settings as the active view"
  );
});
