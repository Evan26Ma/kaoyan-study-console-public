const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");

test("public release excludes private runtime artifacts and retired integration code", () => {
  const source = ["index.html", "server.js", ".env.example"]
    .map((file) => fs.readFileSync(path.join(root, file), "utf8"))
    .join("\n");
  const retiredEnvPrefix = ["HE", "NU_SEAT"].join("");
  const retiredRoute = ["he", "nu-seat"].join("");

  assert.doesNotMatch(source, new RegExp(retiredEnvPrefix, "i"));
  assert.doesNotMatch(source, new RegExp(retiredRoute, "i"));
  assert.equal(fs.existsSync(path.join(root, "data", "state.json")), false);
  assert.equal(fs.existsSync(path.join(root, "deploy-backups")), false);
  assert.equal(fs.existsSync(path.join(root, "manual45-content", "content.json")), false);
  assert.equal(fs.existsSync(path.join(root, "examples", "manual45-content", "content.json")), true);
});
