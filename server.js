const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const Manual45ContentCore = require("./manual45-content-core.js");
const DailyTaskAutoComplete = require("./daily-task-auto-complete.js");

const ROOT = __dirname;
const ENV_PATH = process.env.STUDY_ENV_PATH ? path.resolve(process.env.STUDY_ENV_PATH) : path.join(ROOT, ".env");
const DATA_DIR = process.env.STUDY_DATA_DIR ? path.resolve(process.env.STUDY_DATA_DIR) : path.join(ROOT, "data");
const STATE_PATH = path.join(DATA_DIR, "state.json");
const STATE_BACKUP_DIR = path.join(DATA_DIR, "backups");
const TRUSTED_DEVICES_PATH = path.join(DATA_DIR, "trusted-devices.json");
const GENERATED_NOTES_DIR = path.join(DATA_DIR, "generated-notes");
const WRONG_QUESTION_JOBS_PATH = path.join(DATA_DIR, "wrong-question-jobs.json");
const CXYONLY_INTEGRATION_PATH = path.join(DATA_DIR, "cxyonly-integration.json");
const EXTERNAL_QUESTION_ASSETS_DIR = path.join(DATA_DIR, "external-question-assets");
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_IMAGE_SIZE = "1024x1024";
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_BODY_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_STATE_BACKUPS = 200;
const MAX_TRUSTED_DEVICES = 50;
const WRONG_QUESTION_JOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_WRONG_QUESTION_JOBS = 200;
const MAX_WRONG_QUESTION_JOB_BATCH = 30;
const CXYONLY_COLLECTION_PAGE_SIZE = 200;
const CXYONLY_MAX_COLLECTION_PAGES = 50;
const CXYONLY_MAX_ASSET_REFS = 200;
const CXYONLY_MAX_ASSET_BYTES = 4 * 1024 * 1024;
const MANUAL45_TOTAL_DAYS = 45;
const TEXT_API_TIMEOUT_MS = Math.max(1000, Number(process.env.TEXT_API_TIMEOUT_MS) || 90 * 1000);
const API_CONNECTION_TEST_TIMEOUT_MS = Math.max(1000, Number(process.env.API_CONNECTION_TEST_TIMEOUT_MS) || 15 * 1000);
const IMAGE_API_TIMEOUT_MS = Math.max(1000, Number(process.env.IMAGE_API_TIMEOUT_MS) || 120 * 1000);
const TEXT_API_NETWORK_RETRY_DELAY_MS = 350;

const wrongQuestionJobs = new Map();
const readingExplanationCache = new Map();
let wrongQuestionWorkerRunning = false;
let wrongQuestionWorkerScheduled = false;
let automaticDailyTaskCompletionTimer = null;

loadDotEnv(ENV_PATH);

const ACCESS_TOKEN = String(process.env.ACCESS_TOKEN || "").trim();
const PORT = Number(process.env.PORT) || 8765;
const HOST = process.env.HOST || "127.0.0.1";
const CXYONLY_API_BASE_URL = String(process.env.CXYONLY_API_BASE_URL || "https://www.cxyonly.fans/api").replace(/\/+$/, "");
const CXYONLY_API_TIMEOUT_MS = Math.max(1000, Number(process.env.CXYONLY_API_TIMEOUT_MS) || 20 * 1000);
loadWrongQuestionJobs();
scheduleWrongQuestionJobProcessing();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "127.0.0.1"}`);

    if (req.method === "OPTIONS") {
      sendJson(res, 204, {});
      return;
    }

    if (url.pathname === "/api/auth/check") {
      if (req.method === "POST") {
        await handleAuthCheck(req, res);
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname === "/api/state") {
      await handleStateRequest(req, res);
      return;
    }

    if (url.pathname === "/api/wrong-questions/reader") {
      if (req.method === "POST") {
        if (!requireWriteAccess(req, res)) return;
        await handleReaderWrongQuestionRequest(req, res);
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname === "/api/manual45") {
      await handleManual45Request(req, res);
      return;
    }

    if (url.pathname === "/api/backups" && req.method === "GET") {
      if (!requireWriteAccess(req, res)) return;
      handleBackupListRequest(res, url);
      return;
    }

    if (url.pathname === "/api/backups/restore" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleBackupRestoreRequest(req, res);
      return;
    }

    if (url.pathname === "/api/settings/secret" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleSettingsSecretRequest(req, res);
      return;
    }

    if (url.pathname === "/api/settings") {
      if (req.method === "GET") {
        sendJson(res, 200, publicSettings("", hasReadAccess(req)));
        return;
      }
      if (req.method === "POST") {
        if (!requireWriteAccess(req, res)) return;
        await handleSettingsRequest(req, res);
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname === "/api/integrations/cxyonly/status") {
      if (!requireWriteAccess(req, res)) return;
      if (req.method === "GET") {
        sendJson(res, 200, publicCxyOnlyIntegration());
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname === "/api/integrations/cxyonly/connect") {
      if (!requireWriteAccess(req, res)) return;
      if (req.method === "POST") {
        await handleCxyOnlyConnectRequest(req, res);
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname === "/api/integrations/cxyonly/disconnect") {
      if (!requireWriteAccess(req, res)) return;
      if (req.method === "POST") {
        handleCxyOnlyDisconnectRequest(res);
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname === "/api/integrations/cxyonly/collections") {
      if (!requireWriteAccess(req, res)) return;
      if (req.method === "GET") {
        await handleCxyOnlyCollectionsRequest(res);
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname === "/api/integrations/cxyonly/assets/cache") {
      if (!requireWriteAccess(req, res)) return;
      if (req.method === "POST") {
        await handleCxyOnlyAssetCacheRequest(req, res);
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname === "/api/ai/status" && req.method === "GET") {
      const config = getAiConfig();
      const imageConfig = getImageConfig();
      const aiProviders = getAiProviders();
      const imageProviders = getImageProviders();
      sendJson(res, 200, {
        configured: aiProviders.length > 0,
        model: config.model,
        baseUrl: config.baseUrl,
        providerCount: aiProviders.length,
        imageConfigured: imageProviders.length > 0,
        imageModel: imageConfig.model,
        imageProviderCount: imageProviders.length,
        message: aiProviders.length ? `OpenAI 兼容 API 已配置 ${aiProviders.length} 组` : "未配置 API key"
      });
      return;
    }

    if (url.pathname === "/api/ai/test-connection" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleApiConnectionTest(req, res);
      return;
    }

    if (url.pathname === "/api/ai/generate-note-image" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleNoteImageRequest(req, res);
      return;
    }

    if (url.pathname === "/api/ai/organize-wrong-question" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleWrongQuestionOrganizeRequest(req, res);
      return;
    }

    if (url.pathname === "/api/ai/edit-wrong-question" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleWrongQuestionEditRequest(req, res);
      return;
    }

    if (url.pathname === "/api/ai/wrong-question-chat" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleWrongQuestionChatRequest(req, res);
      return;
    }

    if (url.pathname === "/api/ai/organize-record" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleRecordOrganizeRequest(req, res);
      return;
    }

    if (url.pathname === "/api/ai/explain-reading-selections" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleReadingSelectionExplanationRequest(req, res);
      return;
    }

    if (url.pathname === "/api/ai/explain-adjustment" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleAdjustmentExplanationRequest(req, res);
      return;
    }

    if (url.pathname === "/api/ai/evaluate-recitation" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleRecitationEvaluationRequest(req, res);
      return;
    }

    if (url.pathname === "/api/ai/wrong-question-jobs") {
      if (!requireWriteAccess(req, res)) return;
      if (req.method === "POST") {
        await handleWrongQuestionJobCreateRequest(req, res);
        return;
      }
      if (req.method === "GET") {
        handleWrongQuestionJobListRequest(res, url);
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname.startsWith("/api/ai/wrong-question-jobs/")) {
      if (!requireWriteAccess(req, res)) return;
      if (req.method === "GET") {
        handleWrongQuestionJobStatusRequest(res, url.pathname);
        return;
      }
      if (req.method === "POST") {
        await handleWrongQuestionJobActionRequest(req, res, url.pathname);
        return;
      }
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname === "/api/ai/generate-note-from-prompt" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleNotePromptImageRequest(req, res);
      return;
    }

    if (url.pathname === "/api/notes/save-rendered" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleRenderedNoteSaveRequest(req, res);
      return;
    }

    if (url.pathname === "/api/tasks/complete-today" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      handleCompleteTodayTasks(res);
      return;
    }

    if (url.pathname === "/api/tasks/today-summary" && req.method === "GET") {
      if (!requireWriteAccess(req, res)) return;
      handleTodaySummary(res, url);
      return;
    }

    if (url.pathname === "/api/ai/parse-plan-and-import" && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleParsePlanAndImport(req, res);
      return;
    }

    if (url.pathname.startsWith("/api/ai/") && req.method === "POST") {
      if (!requireWriteAccess(req, res)) return;
      await handleAiRequest(req, res, url.pathname);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      sendJson(res, 405, { error: "Method Not Allowed" });
      return;
    }

    if (url.pathname.startsWith("/generated-notes/")) {
      serveGeneratedNote(req, res, url.pathname);
      return;
    }

    if (url.pathname.startsWith("/external-question-assets/")) {
      serveExternalQuestionAsset(req, res, url.pathname);
      return;
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "服务器错误" });
  }
});

async function handleCxyOnlyConnectRequest(req, res) {
  const body = await readJsonBody(req);
  const verificationCode = String(body.verificationCode || "").trim();
  const nickname = String(body.nickname || "").trim();
  if (!/^[A-Za-z0-9_-]{4,20}$/.test(verificationCode)) {
    sendJson(res, 400, { error: "请输入有效的公众号登录码。" });
    return;
  }
  if (nickname.length > 50) {
    sendJson(res, 400, { error: "昵称不能超过 50 个字符。" });
    return;
  }

  try {
    const loginPayload = unwrapCxyOnlyPayload(await cxyOnlyJsonRequest("/auth/login", {
      method: "POST",
      body: {
        verification_code: verificationCode,
        login_mode: "new",
        nickname: nickname || null
      }
    }));
    const accessToken = String(loginPayload && loginPayload.access_token || "").trim();
    if (!accessToken) throw cxyOnlyError("对方网站没有返回访问令牌。", 502, "CXYONLY_TOKEN_MISSING");

    const remoteUser = unwrapCxyOnlyPayload(await cxyOnlyJsonRequest("/auth/me", { accessToken }));
    const now = new Date().toISOString();
    writeCxyOnlyIntegration({
      version: 1,
      accessToken,
      user: normalizeCxyOnlyUser(remoteUser),
      connectedAt: now,
      tokenExpiresAt: jwtExpiry(accessToken),
      lastSyncAt: ""
    });
    sendJson(res, 200, publicCxyOnlyIntegration("大观园账号已连接。"));
  } catch (error) {
    sendCxyOnlyError(res, error, "登录码无效、已过期，或大观园暂时不可用。");
  }
}

function handleCxyOnlyDisconnectRequest(res) {
  try {
    if (fs.existsSync(CXYONLY_INTEGRATION_PATH)) fs.unlinkSync(CXYONLY_INTEGRATION_PATH);
    sendJson(res, 200, publicCxyOnlyIntegration("已断开大观园账号，本地错题和已缓存图片不受影响。"));
  } catch (error) {
    sendJson(res, 500, { error: "断开账号失败。" });
  }
}

async function handleCxyOnlyCollectionsRequest(res) {
  const integration = readCxyOnlyIntegration();
  if (!integration || !integration.accessToken) {
    sendJson(res, 409, { error: "请先连接大观园账号。", code: "CXYONLY_NOT_CONNECTED" });
    return;
  }

  try {
    const items = [];
    const seenIds = new Set();
    let page = 1;
    let total = 0;
    let totalPages = 1;
    do {
      const query = new URLSearchParams({
        page: String(page),
        per_page: String(CXYONLY_COLLECTION_PAGE_SIZE),
        time_order: "desc"
      });
      const payload = normalizeCxyOnlyCollectionPage(await cxyOnlyJsonRequest(`/user/collections?${query}`, {
        accessToken: integration.accessToken
      }));
      total = Math.max(total, payload.total);
      totalPages = Math.max(1, payload.totalPages);
      for (const item of payload.items) {
        const id = Number(item && item.id);
        const key = Number.isInteger(id) ? String(id) : String(item && item.identity_hash || item && item.content_hash || "");
        if (!key || seenIds.has(key)) continue;
        seenIds.add(key);
        items.push(item);
      }
      page += 1;
    } while (page <= totalPages && page <= CXYONLY_MAX_COLLECTION_PAGES);

    const lastSyncAt = new Date().toISOString();
    writeCxyOnlyIntegration({ ...integration, lastSyncAt });
    sendJson(res, 200, {
      items,
      total: total || items.length,
      fetchedAt: lastSyncAt,
      truncated: totalPages > CXYONLY_MAX_COLLECTION_PAGES
    });
  } catch (error) {
    sendCxyOnlyError(res, error, "读取大观园收藏失败。" );
  }
}

async function handleCxyOnlyAssetCacheRequest(req, res) {
  const integration = readCxyOnlyIntegration();
  if (!integration || !integration.accessToken) {
    sendJson(res, 409, { error: "请先连接大观园账号。", code: "CXYONLY_NOT_CONNECTED" });
    return;
  }

  const body = await readJsonBody(req);
  const refs = Array.from(new Set((Array.isArray(body.refs) ? body.refs : [])
    .map((value) => String(value || "").trim().toLowerCase())
    .filter((value) => /^[a-f0-9]{64}$/.test(value))));
  if (!refs.length) {
    sendJson(res, 200, { items: [] });
    return;
  }
  if (refs.length > CXYONLY_MAX_ASSET_REFS) {
    sendJson(res, 400, { error: `一次最多缓存 ${CXYONLY_MAX_ASSET_REFS} 张题目图片。` });
    return;
  }

  ensureExternalQuestionAssetsDir();
  const items = await mapWithConcurrency(refs, 3, async (ref) => {
    try {
      const url = await cacheCxyOnlyAsset(ref, integration.accessToken);
      return { ref, ok: true, url };
    } catch (error) {
      return { ref, ok: false, error: publicCxyOnlyErrorMessage(error, "图片同步失败。") };
    }
  });
  sendJson(res, 200, { items });
}

async function cxyOnlyJsonRequest(pathname, options = {}) {
  const response = await cxyOnlyFetch(pathname, options);
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    throw cxyOnlyError("对方网站返回了无法解析的数据。", 502, "CXYONLY_INVALID_JSON");
  }
  if (!response.ok || Number(payload && payload.code) !== 0 && payload && Object.prototype.hasOwnProperty.call(payload, "code")) {
    const message = String(payload && (payload.message || payload.detail || payload.error) || "大观园请求失败。");
    throw cxyOnlyError(message, response.status === 401 ? 401 : 502, response.status === 401 ? "CXYONLY_AUTH_EXPIRED" : "CXYONLY_UPSTREAM_ERROR", response.status);
  }
  return payload;
}

async function cxyOnlyFetch(pathname, options = {}) {
  const pathText = String(pathname || "");
  if (!pathText.startsWith("/") || pathText.startsWith("//")) {
    throw cxyOnlyError("大观园接口路径无效。", 500, "CXYONLY_INVALID_PATH");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CXYONLY_API_TIMEOUT_MS);
  const headers = { Accept: options.accept || "application/json" };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  try {
    return await fetch(`${CXYONLY_API_BASE_URL}${pathText}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") throw cxyOnlyError("连接大观园超时。", 504, "CXYONLY_TIMEOUT");
    throw cxyOnlyError("无法连接大观园。", 502, "CXYONLY_NETWORK_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapCxyOnlyPayload(payload) {
  return payload && payload.data && typeof payload.data === "object" ? payload.data : payload;
}

function normalizeCxyOnlyCollectionPage(payload) {
  const source = unwrapCxyOnlyPayload(payload);
  if (Array.isArray(source)) return { items: source, total: source.length, totalPages: 1 };
  const items = Array.isArray(source && source.items)
    ? source.items
    : Array.isArray(source && source.questions)
      ? source.questions
      : [];
  const total = Math.max(items.length, Number(source && source.total) || 0);
  const totalPages = Math.max(1, Number(source && source.total_pages) || Math.ceil(total / CXYONLY_COLLECTION_PAGE_SIZE) || 1);
  return { items, total, totalPages };
}

function normalizeCxyOnlyUser(user) {
  const source = user && typeof user === "object" ? user : {};
  return {
    id: Number.isInteger(Number(source.id)) ? Number(source.id) : null,
    username: String(source.username || "").slice(0, 80),
    nickname: String(source.nickname || source.username || "").slice(0, 80)
  };
}

function readCxyOnlyIntegration() {
  if (!fs.existsSync(CXYONLY_INTEGRATION_PATH)) return null;
  try {
    const value = JSON.parse(fs.readFileSync(CXYONLY_INTEGRATION_PATH, "utf8"));
    if (!value || typeof value !== "object" || !String(value.accessToken || "").trim()) return null;
    const accessToken = String(value.accessToken).trim();
    return {
      version: 1,
      accessToken,
      user: normalizeCxyOnlyUser(value.user),
      connectedAt: String(value.connectedAt || ""),
      tokenExpiresAt: String(value.tokenExpiresAt || jwtExpiry(accessToken) || ""),
      lastSyncAt: String(value.lastSyncAt || "")
    };
  } catch (error) {
    return null;
  }
}

function writeCxyOnlyIntegration(value) {
  ensureDataDirs();
  const tempPath = `${CXYONLY_INTEGRATION_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, CXYONLY_INTEGRATION_PATH);
  fs.chmodSync(CXYONLY_INTEGRATION_PATH, 0o600);
}

function publicCxyOnlyIntegration(message) {
  const integration = readCxyOnlyIntegration();
  return {
    connected: Boolean(integration),
    user: integration ? integration.user : null,
    connectedAt: integration ? integration.connectedAt : "",
    tokenExpiresAt: integration ? integration.tokenExpiresAt : "",
    lastSyncAt: integration ? integration.lastSyncAt : "",
    message: message || (integration ? "大观园账号已连接。" : "尚未连接大观园账号。")
  };
}

function jwtExpiry(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length !== 3) return "";
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return Number(payload.exp) > 0 ? new Date(Number(payload.exp) * 1000).toISOString() : "";
  } catch (error) {
    return "";
  }
}

function cxyOnlyError(message, status, code, upstreamStatus) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.upstreamStatus = upstreamStatus || 0;
  return error;
}

function publicCxyOnlyErrorMessage(error, fallback) {
  if (error && error.code === "CXYONLY_AUTH_EXPIRED") return "大观园登录已失效，请重新连接。";
  if (error && error.code === "CXYONLY_TIMEOUT") return "连接大观园超时，请稍后重试。";
  if (/invalid verification code|验证码无效|verification code/i.test(String(error && error.message || ""))) return "登录码无效或已过期，请重新获取。";
  return String(error && error.message || fallback || "大观园请求失败。").slice(0, 240);
}

function sendCxyOnlyError(res, error, fallback) {
  const status = Number(error && error.status) || 502;
  sendJson(res, status, {
    error: publicCxyOnlyErrorMessage(error, fallback),
    code: String(error && error.code || "CXYONLY_ERROR")
  });
}

function ensureExternalQuestionAssetsDir() {
  ensureDataDirs();
  fs.mkdirSync(EXTERNAL_QUESTION_ASSETS_DIR, { recursive: true });
  fs.chmodSync(EXTERNAL_QUESTION_ASSETS_DIR, 0o700);
}

async function cacheCxyOnlyAsset(ref, accessToken) {
  const filePath = path.join(EXTERNAL_QUESTION_ASSETS_DIR, `${ref}.png`);
  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    if (stat.isFile() && stat.size > 0 && stat.size <= CXYONLY_MAX_ASSET_BYTES) return `/external-question-assets/${ref}.png`;
  }

  const response = await cxyOnlyFetch(`/v1/question-assets/${ref}`, { accessToken, accept: "image/png" });
  if (response.status === 401) throw cxyOnlyError("大观园登录已失效。", 401, "CXYONLY_AUTH_EXPIRED", 401);
  if (!response.ok) throw cxyOnlyError("题目图片读取失败。", 502, "CXYONLY_ASSET_UPSTREAM", response.status);
  const contentType = String(response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "image/png") throw cxyOnlyError("题目图片格式不是 PNG。", 502, "CXYONLY_ASSET_TYPE");
  const declaredSizeHeader = response.headers.get("content-length");
  const declaredSize = declaredSizeHeader === null ? null : Number(declaredSizeHeader);
  if (declaredSize !== null && Number.isFinite(declaredSize) && (declaredSize < 1 || declaredSize > CXYONLY_MAX_ASSET_BYTES)) {
    throw cxyOnlyError("题目图片大小无效。", 502, "CXYONLY_ASSET_SIZE");
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > CXYONLY_MAX_ASSET_BYTES) throw cxyOnlyError("题目图片大小无效。", 502, "CXYONLY_ASSET_SIZE");
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw cxyOnlyError("题目图片内容不是 PNG。", 502, "CXYONLY_ASSET_SIGNATURE");
  }
  const digest = crypto.createHash("sha256").update(buffer).digest("hex");
  if (digest !== ref) throw cxyOnlyError("题目图片校验失败。", 502, "CXYONLY_ASSET_DIGEST");

  ensureExternalQuestionAssetsDir();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, buffer, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
  fs.chmodSync(filePath, 0o600);
  return `/external-question-assets/${ref}.png`;
}

async function mapWithConcurrency(items, concurrency, worker) {
  const output = new Array(items.length);
  let nextIndex = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      output[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return output;
}

async function handleStateRequest(req, res) {
  if (req.method === "GET") {
    runAutomaticDailyTaskCompletion();
    const state = readStateFile();
    const deviceId = normalizeDeviceId(req.headers["x-study-device"]);
    const trustedDevice = deviceId && isTrustedDevice(req, deviceId);
    const fullAccess = trustedDevice || hasReadAccess(req);
    const responseState = compactStateForResponse(fullAccess ? state : redactPrivateState(state));
    sendJson(res, 200, {
      exists: Boolean(state),
      state: responseState || null,
      updatedAt: fullAccess && state && state.updatedAt ? state.updatedAt : "",
      backupCount: fullAccess ? countStateBackups() : 0,
      privacy: {
        mode: fullAccess ? "full" : "locked",
        lockedSections: fullAccess ? [] : ["goals", "plans", "reflections", "reports", "adjustments"]
      }
    }, trustedDevice ? { "Set-Cookie": trustedDeviceCookie(deviceId) } : {});
    return;
  }

  if (req.method === "POST") {
    if (!requireWriteAccess(req, res)) return;
    const body = await readJsonBody(req);
    const state = body && typeof body.state === "object" && body.state ? body.state : null;
    if (!state || Array.isArray(state)) {
      sendJson(res, 400, { error: "无效的学习数据。" });
      return;
    }
    const existingState = readStateFile();
    const existingUpdatedAt = Date.parse(existingState && existingState.updatedAt || "");
    const incomingUpdatedAt = Date.parse(state.updatedAt || "");
    if (Number.isFinite(existingUpdatedAt) && Number.isFinite(incomingUpdatedAt) && incomingUpdatedAt < existingUpdatedAt) {
      sendJson(res, 409, {
        error: "服务器数据已在其他页面更新，请刷新后再保存。",
        code: "STATE_STALE",
        updatedAt: existingState.updatedAt
      });
      return;
    }
    const saved = writeStateFile(preserveRedactedPrivateState(existingState, state, body.privateStateLoaded === true));
    sendJson(res, 200, {
      ok: true,
      updatedAt: saved.updatedAt,
      backupCount: countStateBackups()
    });
    return;
  }

  sendJson(res, 405, { error: "Method Not Allowed" });
}

async function handleManual45Request(req, res) {
  if (req.method === "GET") {
    const state = readStateFile() || {};
    sendJson(res, 200, { ok: true, progress: normalizeManual45Progress(state.manual45Progress) });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method Not Allowed" });
    return;
  }
  if (!requireWriteAccess(req, res)) return;

  const body = await readJsonBody(req);
  const action = String(body.action || "").trim();
  const state = readStateFile() || {};
  const current = normalizeManual45Progress(state.manual45Progress);
  const expectedRevision = Number(body.expectedRevision);
  if (!Number.isInteger(expectedRevision) || expectedRevision !== current.revision) {
    sendJson(res, 409, { error: "45 天进度已在其他设备更新，请刷新后重试。", progress: current });
    return;
  }

  const next = normalizeManual45Progress(current);
  const date = isServerDateKey(body.date) ? body.date : shanghaiStudyDayKey();
  if (action === "complete-current") {
    const day = manual45CurrentDay(next);
    if (day > MANUAL45_TOTAL_DAYS) {
      sendJson(res, 400, { error: "45 天计划已经全部完成。", progress: current });
      return;
    }
    next.completedDays[String(day)] = date;
    next.restDates = next.restDates.filter((item) => item !== date);
  } else if (action === "undo-latest") {
    const completed = manual45CompletedDayEntries(next);
    if (!completed.length) {
      sendJson(res, 400, { error: "还没有可撤销的完成记录。", progress: current });
      return;
    }
    delete next.completedDays[String(completed[completed.length - 1][0])];
  } else if (action === "toggle-rest") {
    if (Object.values(next.completedDays).includes(date)) {
      sendJson(res, 400, { error: "当天已经完成手册任务，不能再设为休息日。", progress: current });
      return;
    }
    next.restDates = next.restDates.includes(date)
      ? next.restDates.filter((item) => item !== date)
      : [...next.restDates, date].sort();
  } else if (action === "merge-local") {
    const local = normalizeManual45Progress({ completedDays: body.completedDays, restDates: body.restDates });
    const serverContinuous = manual45ContinuousCompletedCount(next);
    const localContinuous = manual45ContinuousCompletedCount(local);
    if (localContinuous > serverContinuous) {
      for (let day = 1; day <= localContinuous; day += 1) {
        if (!next.completedDays[String(day)]) next.completedDays[String(day)] = local.completedDays[String(day)] || date;
      }
    }
    next.restDates = Array.from(new Set([...next.restDates, ...local.restDates])).sort();
  } else {
    sendJson(res, 400, { error: "45 天进度操作无效。", progress: current });
    return;
  }

  next.revision = current.revision + 1;
  next.updatedAt = new Date().toISOString();
  const saved = writeStateFile({ ...state, manual45Progress: next }, { allowManual45Update: true });
  sendJson(res, 200, { ok: true, progress: normalizeManual45Progress(saved.manual45Progress), updatedAt: saved.updatedAt });
}

async function handleReaderWrongQuestionRequest(req, res) {
  const body = await readJsonBody(req);
  const readerSourceKey = String(body.readerSourceKey || "").trim().slice(0, 300);
  const questionMarkdown = String(body.questionMarkdown || "").trim().slice(0, 5000);
  if (!/^probability-reader:[\w\u4e00-\u9fff.:-]{1,260}$/u.test(readerSourceKey) || !questionMarkdown) {
    sendJson(res, 400, { error: "阅读站错题数据无效。" });
    return;
  }
  const state = readStateFile() || {};
  const existing = Array.isArray(state.wrongQuestions) ? state.wrongQuestions : [];
  const duplicate = existing.find((item) => item && item.readerSourceKey === readerSourceKey);
  if (duplicate) {
    sendJson(res, 200, { ok: true, outcome: "duplicate", wrongQuestionId: String(duplicate.id || "") });
    return;
  }

  const date = shanghaiStudyDayKey();
  const source = String(body.source || "概率统计阅读站").trim().slice(0, 200);
  const title = String(body.title || questionMarkdown.replace(/\s+/g, " ").slice(0, 100)).trim().slice(0, 300);
  const sourceUrl = String(body.sourceUrl || "").trim().slice(0, 1000);
  const knowledgePoints = Array.isArray(body.knowledgePoints)
    ? body.knowledgePoints.map((item) => String(item || "").trim().slice(0, 100)).filter(Boolean).slice(0, 20)
    : [];
  const wrongQuestion = {
    id: createId("wrong"),
    readerSourceKey,
    title,
    subject: String(body.subject || "数学").trim().slice(0, 80) || "数学",
    source,
    date,
    reviewStartDate: date,
    status: "active",
    priority: 3,
    knowledgePoints,
    mistakeReason: String(body.mistakeReason || "在概率统计阅读站标记为错题。").trim().slice(0, 500),
    questionMarkdown,
    detailMarkdown: String(body.detailMarkdown || (sourceUrl ? `原题链接：${sourceUrl}` : "")).trim().slice(0, 5000),
    fullMarkdown: String(body.fullMarkdown || questionMarkdown).trim().slice(0, 8000),
    origin: "reader",
    createdAt: new Date().toISOString(),
    reviews: []
  };
  state.wrongQuestions = [...existing, wrongQuestion];
  writeStateFile(state);
  sendJson(res, 201, { ok: true, outcome: "created", wrongQuestionId: wrongQuestion.id });
}

function handleBackupListRequest(res, url) {
  const limit = clampNumber(url.searchParams.get("limit"), 1, 100, 30);
  sendJson(res, 200, { backups: listStateBackups(limit), total: countStateBackups() });
}

async function handleBackupRestoreRequest(req, res) {
  const body = await readJsonBody(req);
  const name = String(body.name || "").trim();
  if (!/^state-[A-Za-z0-9._-]+\.json$/.test(name)) {
    sendJson(res, 400, { error: "备份文件名无效。" });
    return;
  }
  const backupPath = path.normalize(path.join(STATE_BACKUP_DIR, name));
  if (!backupPath.startsWith(`${STATE_BACKUP_DIR}${path.sep}`) || !fs.existsSync(backupPath)) {
    sendJson(res, 404, { error: "备份版本不存在。" });
    return;
  }
  let restored;
  try {
    restored = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  } catch (error) {
    sendJson(res, 400, { error: "备份文件无法解析，未执行恢复。" });
    return;
  }
  if (!restored || typeof restored !== "object" || Array.isArray(restored)) {
    sendJson(res, 400, { error: "备份数据格式无效，未执行恢复。" });
    return;
  }
  const saved = writeStateFile(restored);
  sendJson(res, 200, {
    ok: true,
    restoredFrom: name,
    state: saved,
    updatedAt: saved.updatedAt,
    backupCount: countStateBackups()
  });
}

async function handleAuthCheck(req, res) {
  const body = await readJsonBody(req);
  if (!ACCESS_TOKEN) {
    sendJson(res, 401, { error: "只读模式：服务端尚未配置 ACCESS_TOKEN。" });
    return;
  }

  const deviceId = normalizeDeviceId(body.deviceId || req.headers["x-study-device"]);
  if (deviceId && isTrustedDevice(req, deviceId)) {
    sendJson(res, 200, {
      ok: true,
      trustedDevice: true,
      device: publicDevice(readTrustedDevices().devices[deviceId])
    }, { "Set-Cookie": trustedDeviceCookie(deviceId) });
    return;
  }

  const token = String(req.headers["x-study-token"] || "").trim();
  if (token !== ACCESS_TOKEN) {
    sendJson(res, 401, { error: "只读模式：请输入正确 token 后再操作。" });
    return;
  }

  const device = deviceId ? trustDevice(req, deviceId, body.deviceInfo) : null;
  sendJson(res, 200, {
    ok: true,
    trustedDevice: Boolean(device),
    device: device ? publicDevice(device) : null
  }, device ? { "Set-Cookie": trustedDeviceCookie(deviceId) } : {});
}

function trustedDeviceCookie(deviceId) {
  return [
    `kaoyan_study_device=${encodeURIComponent(deviceId)}`,
    "Path=/",
    "Max-Age=31536000",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

if (require.main === module) {
  try {
    runAutomaticDailyTaskCompletion();
  } catch (error) {
    console.error("启动时执行每日任务自动收尾失败：", error);
  }
  scheduleAutomaticDailyTaskCompletion();
  server.listen(PORT, HOST, () => {
    const displayHost = HOST === "0.0.0.0" ? "服务器IP" : HOST;
    console.log(`考研背书中控台已启动：http://${displayHost}:${PORT}/`);
    if (!getAiConfig().apiKey) {
      console.log("提示：未配置 API key，AI 功能会显示配置提示。");
    }
  });
}

module.exports = {
  server,
  hasReadAccess,
  redactPrivateState,
  normalizeManual45ContentState,
  normalizeAdjustmentExplanationResults,
  normalizeReadingSelectionRequest,
  normalizeReadingSelectionResults,
  readingSelectionCacheKey,
  requestChatProvider,
  normalizeRecitationEvaluation,
  compactAiAppState,
  runAutomaticDailyTaskCompletion
};

async function handleSettingsRequest(req, res) {
  const body = await readJsonBody(req);
  const current = getAiConfig();
  const currentAiBackups = getAiBackupProviders();
  const currentImage = getImageConfig();
  const currentImageBackups = getImageBackupProviders();
  const nextAiBackups = body.clearApiProviders
    ? []
    : String(body.apiProvidersText || "").trim()
      ? parseProviderLines(body.apiProvidersText, "text", current)
      : currentAiBackups;
  const nextImageBackups = body.clearImageProviders
    ? []
    : String(body.imageProvidersText || "").trim()
      ? parseProviderLines(body.imageProvidersText, "image", currentImage)
      : currentImageBackups;
  if ((body.section === "text" || body.section === "image") && Array.isArray(body.providers)) {
    const kind = body.section;
    const currentAll = kind === "image" ? getAllImageProviders() : getAllAiProviders();
    const keyBySlot = new Map(currentAll.map((provider) => [provider.slot, provider.apiKey]));
    const normalized = body.providers.map((source, index) => normalizeProvider({
      ...source,
      apiKey: String(source.apiKey || "").trim() || keyBySlot.get(String(source.sourceSlot || source.slot || "")) || "",
      name: source.name || `${kind === "image" ? "生图" : "文本"} API ${index + 1}`
    }, kind)).filter(Boolean);
    if (!normalized.length) {
      sendJson(res, 400, { error: "至少需要一组包含地址、模型和密钥的提供商。" });
      return;
    }
    const requestedPrimary = Math.max(0, body.providers.findIndex((provider) => provider.role === "primary"));
    const primary = normalized[requestedPrimary] || normalized[0];
    const backups = normalized.filter((provider) => provider !== primary);
    const next = settingsEnvSnapshot();
    if (kind === "text") {
      Object.assign(next, {
        DEEPSEEK_API_KEY: primary.apiKey,
        DEEPSEEK_MODEL: primary.model,
        DEEPSEEK_BASE_URL: primary.baseUrl,
        DEEPSEEK_MAX_TOKENS: String(primary.maxTokens || 6000),
        TEXT_PRIMARY_ENABLED: primary.enabled === false ? "false" : "true",
        TEXT_API_PROVIDERS: JSON.stringify(backups)
      });
    } else {
      Object.assign(next, {
        IMAGE_API_KEY: primary.apiKey,
        IMAGE_MODEL: primary.model,
        IMAGE_BASE_URL: primary.baseUrl,
        IMAGE_SIZE: primary.size || DEFAULT_IMAGE_SIZE,
        IMAGE_PRIMARY_ENABLED: primary.enabled === false ? "false" : "true",
        IMAGE_API_PROVIDERS: JSON.stringify(backups)
      });
    }
    applySettingsEnv(next);
    sendJson(res, 200, publicSettings("配置已保存。", true));
    return;
  }

  const next = {
    DEEPSEEK_API_KEY: body.clearApiKey ? "" : String(body.apiKey || "").trim() || current.apiKey,
    DEEPSEEK_MODEL: stringOrDefault(body.model, current.model || DEFAULT_MODEL),
    DEEPSEEK_BASE_URL: stringOrDefault(body.baseUrl, current.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    DEEPSEEK_MAX_TOKENS: String(clampNumber(body.maxTokens, 512, 20000, current.maxTokens || 6000)),
    TEXT_API_PROVIDERS: JSON.stringify(nextAiBackups),
    TEXT_PRIMARY_ENABLED: process.env.TEXT_PRIMARY_ENABLED || "true",
    IMAGE_API_KEY: body.clearImageApiKey ? "" : String(body.imageApiKey || "").trim() || currentImage.apiKey,
    IMAGE_MODEL: stringOrDefault(body.imageModel, currentImage.model || DEFAULT_IMAGE_MODEL),
    IMAGE_BASE_URL: stringOrDefault(body.imageBaseUrl, currentImage.baseUrl || current.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    IMAGE_SIZE: stringOrDefault(body.imageSize, currentImage.size || DEFAULT_IMAGE_SIZE),
    IMAGE_API_PROVIDERS: JSON.stringify(nextImageBackups),
    IMAGE_PRIMARY_ENABLED: process.env.IMAGE_PRIMARY_ENABLED || "true",
    ACCESS_TOKEN,
    HOST,
    PORT: String(PORT)
  };

  applySettingsEnv(next);
  sendJson(res, 200, publicSettings("配置已保存。监听地址和端口变更需要重启服务。", true));
}

function settingsEnvSnapshot() {
  const current = getAiConfig();
  const image = getImageConfig();
  return {
    DEEPSEEK_API_KEY: current.apiKey,
    DEEPSEEK_MODEL: current.model,
    DEEPSEEK_BASE_URL: current.baseUrl,
    DEEPSEEK_MAX_TOKENS: String(current.maxTokens),
    TEXT_PRIMARY_ENABLED: process.env.TEXT_PRIMARY_ENABLED || "true",
    TEXT_API_PROVIDERS: process.env.TEXT_API_PROVIDERS || "[]",
    IMAGE_API_KEY: image.apiKey,
    IMAGE_MODEL: image.model,
    IMAGE_BASE_URL: image.baseUrl,
    IMAGE_SIZE: image.size,
    IMAGE_PRIMARY_ENABLED: process.env.IMAGE_PRIMARY_ENABLED || "true",
    IMAGE_API_PROVIDERS: process.env.IMAGE_API_PROVIDERS || "[]",
    ACCESS_TOKEN,
    HOST,
    PORT: String(PORT)
  };
}

function applySettingsEnv(next) {
  Object.entries(next).forEach(([key, value]) => { process.env[key] = String(value ?? ""); });
  writeDotEnv(ENV_PATH, next);
}

async function handleSettingsSecretRequest(req, res) {
  const body = await readJsonBody(req);
  const kind = body.kind === "image" ? "image" : "text";
  const providers = kind === "image" ? getAllImageProviders() : getAllAiProviders();
  const provider = providers.find((item) => item.slot === body.slot);
  if (!provider) {
    sendJson(res, 404, { error: "没有找到对应提供商。" });
    return;
  }
  sendJson(res, 200, { apiKey: provider.apiKey });
}

async function handleApiConnectionTest(req, res) {
  const body = await readJsonBody(req);
  const kind = body.kind === "image" ? "image" : "text";
  let providers = kind === "image" ? getImageProviders() : getAiProviders();
  if (body.provider && typeof body.provider === "object") {
    const all = kind === "image" ? getAllImageProviders() : getAllAiProviders();
    const key = String(body.provider.apiKey || "").trim()
      || all.find((item) => item.slot === body.provider.sourceSlot || item.slot === body.provider.slot)?.apiKey
      || "";
    const draft = normalizeProvider({ ...body.provider, apiKey: key }, kind);
    providers = draft ? [draft] : [];
  }
  if (!providers.length) {
    sendJson(res, 400, { error: kind === "image" ? "未配置生图 API。" : "未配置文本 API。" });
    return;
  }
  const results = await Promise.all(providers.map(async (provider) => {
    const startedAt = Date.now();
    try {
      if (kind === "image") await testImageProvider(provider);
      else await testTextProvider(provider);
      return {
        ok: true,
        name: provider.name,
        model: provider.model,
        baseUrl: provider.baseUrl,
        elapsedMs: Date.now() - startedAt,
        message: "连通"
      };
    } catch (error) {
      return {
        ok: false,
        name: provider.name,
        model: provider.model,
        baseUrl: provider.baseUrl,
        elapsedMs: Date.now() - startedAt,
        message: publicErrorMessage(error)
      };
    }
  }));
  sendJson(res, 200, {
    ok: results.some((item) => item.ok),
    kind,
    results
  });
}

async function testTextProvider(provider) {
  const requestBody = {
    model: provider.model,
    messages: [
      { role: "system", content: "只输出合法 JSON。" },
      { role: "user", content: "请返回 {\"ok\":true}。" }
    ],
    response_format: { type: "json_object" },
    stream: false,
    max_tokens: Math.min(provider.maxTokens || 6000, 64)
  };
  let payload;
  try {
    payload = await requestChatProvider(provider, requestBody, "API 连通性测试", { timeoutMs: API_CONNECTION_TEST_TIMEOUT_MS });
  } catch (error) {
    if (!isJsonModeUnsupported(error)) throw error;
    const compatibilityRequest = { ...requestBody };
    delete compatibilityRequest.response_format;
    payload = await requestChatProvider(provider, compatibilityRequest, "API 连通性测试（兼容模式）", { timeoutMs: API_CONNECTION_TEST_TIMEOUT_MS });
  }
  const content = payload.choices && payload.choices[0] && payload.choices[0].message
    ? payload.choices[0].message.content
    : "";
  parseJsonContent(content);
}

function isJsonModeUnsupported(error) {
  const status = Number(error && error.status) || 0;
  const detail = `${error && error.message ? error.message : ""} ${error && error.detail ? error.detail : ""}`.toLowerCase();
  return status === 400 && /response.?format|json.?object|structured.?output|unsupported.*(json|format)|invalid.*(json|format)/u.test(detail);
}

async function testImageProvider(provider) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_CONNECTION_TEST_TIMEOUT_MS);
  let response;
  let text;
  try {
    response = await fetch(`${provider.baseUrl}/models`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${provider.apiKey}` },
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw apiRequestError(`API 连通性测试超时（${Math.round(API_CONNECTION_TEST_TIMEOUT_MS / 1000)}秒）。`, 408, "timeout", provider);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (response.ok) return;
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    payload = {};
  }
  const detail = errorDetailFromPayload(payload, response.statusText);
  if (response.status === 404 || response.status === 405) {
    throw apiRequestError("生图轻量测试接口不可用，Base URL 可达但不能确认 Key/模型。", response.status, detail, provider);
  }
  throw apiRequestError(`生图 API 连通性测试失败：${detail}`, response.status, detail, provider);
}

async function handleNoteImageRequest(req, res) {
  const aiConfig = getAiConfig();
  if (!getAiProviders().length) {
    sendJson(res, 400, {
      error: "未配置文本 AI API key。请到设置页填写 OpenAI 兼容 API Key。"
    });
    return;
  }

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  const userText = String(body.userText || body.fullMarkdown || "").trim();
  if (!userText) {
    sendJson(res, 400, { error: "请先粘贴题目或完整解题流程。" });
    return;
  }

  const draft = await callWrongQuestionOrganizer(userText, {
    subject: body.subject,
    title: body.title,
    source: body.source,
    reviewStartDate: body.reviewStartDate,
    priority: body.priority,
    knowledgePoints: body.knowledgePoints,
    mistakeReason: body.mistakeReason,
    promptAddon: body.promptAddon,
    localContext: body.localContext
  });
  draft.notePrompt = userText;

  const warnings = Array.isArray(draft.warnings) ? draft.warnings.map(String) : [];
  const config = getImageConfig();
  if (!getImageProviders(config).length) {
    sendJson(res, 200, {
      ok: true,
      wrongQuestionDraft: draft,
      noteImage: null,
      imageError: "未配置生图 API key。错题已整理，但未生成一图流。",
      warnings
    });
    return;
  }
  if (!config.baseUrl) {
    sendJson(res, 200, {
      ok: true,
      wrongQuestionDraft: draft,
      noteImage: null,
      imageError: "未配置生图 Base URL。错题已整理，但未生成一图流。",
      warnings
    });
    return;
  }

  const size = stringOrDefault(body.size, config.size || DEFAULT_IMAGE_SIZE);
  const prompt = buildNoteImagePrompt(userText);
  let noteImage = null;
  let imageError = "";
  try {
    const imageData = await callImageGeneration(config, prompt, size);
    const imageUrl = await saveGeneratedImage(imageData, "note");
    noteImage = {
      url: imageUrl,
      prompt,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    imageError = error.message || "生图失败。";
  }

  sendJson(res, 200, {
    ok: true,
    wrongQuestionDraft: {
      ...draft,
      notePrompt: draft.notePrompt
    },
    noteImage,
    imageError,
    prompt,
    createdAt: noteImage ? noteImage.createdAt : new Date().toISOString(),
    warnings
  });
}

async function handleWrongQuestionOrganizeRequest(req, res) {
  if (!getAiProviders().length) {
    sendJson(res, 400, {
      error: "未配置文本 AI API key。请到设置页填写 OpenAI 兼容 API Key。"
    });
    return;
  }

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  const userText = String(body.userText || body.fullMarkdown || "").trim();
  if (!userText) {
    sendJson(res, 400, { error: "请先粘贴题目或完整解题流程。" });
    return;
  }

  const draft = await callWrongQuestionOrganizer(userText, {
    subject: body.subject,
    title: body.title,
    source: body.source,
    reviewStartDate: body.reviewStartDate,
    priority: body.priority,
    knowledgePoints: body.knowledgePoints,
    mistakeReason: body.mistakeReason,
    promptAddon: body.promptAddon,
    localContext: body.localContext
  });
  draft.notePrompt = userText;
  const prompt = buildNoteImagePrompt(userText);

  sendJson(res, 200, {
    ok: true,
    wrongQuestionDraft: draft,
    prompt,
    warnings: Array.isArray(draft.warnings) ? draft.warnings.map(String) : []
  });
}

async function handleWrongQuestionJobCreateRequest(req, res) {
  if (!getAiProviders().length) {
    sendJson(res, 400, {
      error: "未配置文本 AI API key。请到设置页填写 OpenAI 兼容 API Key。"
    });
    return;
  }

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  const rawItems = Array.isArray(body.items) ? body.items : [body];
  if (!rawItems.length) {
    sendJson(res, 400, { error: "导入队列不能为空。" });
    return;
  }
  if (rawItems.length > MAX_WRONG_QUESTION_JOB_BATCH) {
    sendJson(res, 400, { error: `一次最多导入 ${MAX_WRONG_QUESTION_JOB_BATCH} 道错题。` });
    return;
  }

  const requests = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const item = rawItems[index] && typeof rawItems[index] === "object" ? rawItems[index] : {};
    const request = normalizeWrongQuestionJobRequest({ ...body, ...item, items: undefined });
    if (!request.userText) {
      sendJson(res, 400, { error: `第 ${index + 1} 道错题没有可导入内容。` });
      return;
    }
    requests.push(request);
  }

  pruneWrongQuestionJobs(Math.max(0, MAX_WRONG_QUESTION_JOBS - requests.length));
  if (wrongQuestionJobs.size + requests.length > MAX_WRONG_QUESTION_JOBS) {
    sendJson(res, 409, { error: "后台导入队列已满，请先连接网页接收已完成结果后再试。" });
    return;
  }

  const batchId = requests.length > 1 ? `wqbatch-${Date.now()}-${randomSuffix()}` : "";
  const jobs = requests.map((request) => createWrongQuestionJob(request, batchId));
  jobs.forEach((job) => wrongQuestionJobs.set(job.id, job));
  persistWrongQuestionJobs();
  scheduleWrongQuestionJobProcessing();

  sendJson(res, 202, {
    ok: true,
    batchId,
    accepted: jobs.length,
    jobId: jobs[0].id,
    status: jobs[0].status,
    createdAt: jobs[0].createdAt,
    jobs: jobs.map((job) => publicWrongQuestionJob(job, false))
  });
}

function handleWrongQuestionJobListRequest(res, url) {
  pruneWrongQuestionJobs();
  const limit = clampNumber(url.searchParams.get("limit"), 1, MAX_WRONG_QUESTION_JOBS, 60);
  const queuePositions = wrongQuestionQueuePositions();
  const jobs = Array.from(wrongQuestionJobs.values())
    .sort((a, b) => Date.parse(b.createdAt || "") - Date.parse(a.createdAt || ""))
    .slice(0, limit)
    .map((job) => publicWrongQuestionJob(job, true, queuePositions));
  sendJson(res, 200, {
    ok: true,
    jobs,
    activeCount: jobs.filter((job) => job.status === "queued" || job.status === "running").length,
    pendingResultCount: jobs.filter((job) => job.status === "done" && !job.importedAt).length
  });
}

function handleWrongQuestionJobStatusRequest(res, pathname) {
  pruneWrongQuestionJobs();
  const prefix = "/api/ai/wrong-question-jobs/";
  const suffix = pathname.slice(prefix.length);
  if (!suffix || suffix.includes("/")) {
    sendJson(res, 404, { error: "错题整理任务不存在。" });
    return;
  }
  const jobId = decodeURIComponent(suffix);
  const job = wrongQuestionJobs.get(jobId);
  if (!job) {
    sendJson(res, 404, { error: "错题整理任务不存在或已过期，请重新导入。" });
    return;
  }

  sendJson(res, 200, publicWrongQuestionJob(job, true, wrongQuestionQueuePositions()));
}

async function handleWrongQuestionJobActionRequest(req, res, pathname) {
  const prefix = "/api/ai/wrong-question-jobs/";
  const parts = pathname.slice(prefix.length).split("/").filter(Boolean).map(decodeURIComponent);
  if (parts.length !== 2) {
    sendJson(res, 404, { error: "错题整理任务操作不存在。" });
    return;
  }
  const [jobId, action] = parts;
  const job = wrongQuestionJobs.get(jobId);
  if (!job) {
    sendJson(res, 404, { error: "错题整理任务不存在或已过期，请重新导入。" });
    return;
  }

  if (action === "retry") {
    if (job.status === "queued" || job.status === "running") {
      sendJson(res, 409, { error: "这道错题仍在后台处理中。" });
      return;
    }
    job.status = "queued";
    job.updatedAt = new Date().toISOString();
    job.result = null;
    job.error = "";
    job.importedAt = "";
    job.importedQuestionId = "";
    job.importOutcome = "";
    persistWrongQuestionJobs();
    scheduleWrongQuestionJobProcessing();
    sendJson(res, 202, publicWrongQuestionJob(job, false, wrongQuestionQueuePositions()));
    return;
  }

  if (action === "cancel") {
    if (job.status === "running") {
      sendJson(res, 409, { error: "这道错题已经开始整理，暂时不能取消。" });
      return;
    }
    if (job.status !== "queued") {
      sendJson(res, 409, { error: "只有排队中的错题可以取消。" });
      return;
    }
    job.status = "cancelled";
    job.updatedAt = new Date().toISOString();
    job.error = "已取消导入。";
    persistWrongQuestionJobs();
    sendJson(res, 200, publicWrongQuestionJob(job, false, wrongQuestionQueuePositions()));
    return;
  }

  if (action === "ack") {
    if (job.status !== "done" || !job.result) {
      sendJson(res, 409, { error: "这道错题还没有可接收的整理结果。" });
      return;
    }
    const body = await readJsonBody(req);
    job.importedAt = new Date().toISOString();
    job.updatedAt = job.importedAt;
    job.importedQuestionId = String(body.wrongQuestionId || "").slice(0, 160);
    job.importOutcome = body.outcome === "duplicate" ? "duplicate" : "created";
    persistWrongQuestionJobs();
    sendJson(res, 200, publicWrongQuestionJob(job, false, wrongQuestionQueuePositions()));
    return;
  }

  if (action === "resolve") {
    if (job.status !== "error") {
      sendJson(res, 409, { error: "只有失败的错题整理任务可以标记为已处理。" });
      return;
    }
    const body = await readJsonBody(req);
    const wrongQuestionId = String(body.wrongQuestionId || "").trim().slice(0, 160);
    if (!wrongQuestionId) {
      sendJson(res, 400, { error: "缺少已导入的错题 ID。" });
      return;
    }
    const now = new Date().toISOString();
    job.status = "cancelled";
    job.updatedAt = now;
    job.error = "AI 整理失败，已使用基础直导导入。";
    job.result = null;
    job.importedAt = now;
    job.importedQuestionId = wrongQuestionId;
    job.importOutcome = body.outcome === "duplicate" ? "duplicate" : "created";
    persistWrongQuestionJobs();
    sendJson(res, 200, publicWrongQuestionJob(job, false, wrongQuestionQueuePositions()));
    return;
  }

  sendJson(res, 404, { error: "错题整理任务操作不存在。" });
}

function createWrongQuestionJob(request, batchId) {
  const now = new Date().toISOString();
  return {
    id: `wqjob-${Date.now()}-${randomSuffix()}`,
    batchId: batchId || "",
    status: "queued",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    recoveryCount: 0,
    label: wrongQuestionJobLabel(request.userText),
    request,
    result: null,
    error: "",
    importedAt: "",
    importedQuestionId: "",
    importOutcome: ""
  };
}

function normalizeWrongQuestionJobRequest(source) {
  const body = source && typeof source === "object" ? source : {};
  return {
    userText: String(body.userText || body.fullMarkdown || "").trim(),
    subject: String(body.subject || "").trim(),
    title: String(body.title || "").trim(),
    source: String(body.source || "").trim(),
    reviewStartDate: String(body.reviewStartDate || "").trim(),
    priority: body.priority,
    knowledgePoints: Array.isArray(body.knowledgePoints) ? body.knowledgePoints.map(String).slice(0, 30) : [],
    mistakeReason: String(body.mistakeReason || "").trim(),
    promptAddon: String(body.promptAddon || "").trim(),
    localContext: body.localContext && typeof body.localContext === "object" ? body.localContext : {},
    autoGenerateImage: Boolean(body.autoGenerateImage)
  };
}

function wrongQuestionJobLabel(userText) {
  return String(userText || "").replace(/[#>*_`~\[\]]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "未命名错题";
}

function publicWrongQuestionJob(job, includeResult, queuePositions) {
  const positions = queuePositions || wrongQuestionQueuePositions();
  return {
    ok: job.status === "done",
    jobId: job.id,
    batchId: job.batchId,
    status: job.status,
    label: job.label,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    attempts: job.attempts,
    recoveryCount: job.recoveryCount,
    queuePosition: positions.get(job.id) || 0,
    autoGenerateImage: Boolean(job.request && job.request.autoGenerateImage),
    importedAt: job.importedAt,
    importedQuestionId: job.importedQuestionId,
    importOutcome: job.importOutcome,
    result: includeResult && job.status === "done" && !job.importedAt ? job.result : null,
    error: job.error
  };
}

function wrongQuestionQueuePositions() {
  const queued = Array.from(wrongQuestionJobs.values())
    .filter((job) => job.status === "queued")
    .sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""));
  return new Map(queued.map((job, index) => [job.id, index + 1]));
}

function scheduleWrongQuestionJobProcessing() {
  if (wrongQuestionWorkerRunning || wrongQuestionWorkerScheduled) return;
  wrongQuestionWorkerScheduled = true;
  setImmediate(() => {
    wrongQuestionWorkerScheduled = false;
    processWrongQuestionJobQueue().catch((error) => console.error("后台错题队列执行失败：", error));
  });
}

async function processWrongQuestionJobQueue() {
  if (wrongQuestionWorkerRunning) return;
  wrongQuestionWorkerRunning = true;
  try {
    while (true) {
      const job = Array.from(wrongQuestionJobs.values())
        .filter((item) => item.status === "queued")
        .sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""))[0];
      if (!job) break;
      await processWrongQuestionJob(job);
    }
  } finally {
    wrongQuestionWorkerRunning = false;
    if (Array.from(wrongQuestionJobs.values()).some((job) => job.status === "queued")) {
      scheduleWrongQuestionJobProcessing();
    }
  }
}

async function processWrongQuestionJob(job) {
  const request = job.request;
  job.status = "running";
  job.attempts += 1;
  job.updatedAt = new Date().toISOString();
  job.error = "";
  persistWrongQuestionJobs();
  try {
    const draft = await callWrongQuestionOrganizer(request.userText, {
      subject: request.subject,
      title: request.title,
      source: request.source,
      reviewStartDate: request.reviewStartDate,
      priority: request.priority,
      knowledgePoints: request.knowledgePoints,
      mistakeReason: request.mistakeReason,
      promptAddon: request.promptAddon,
      localContext: request.localContext
    });
    draft.notePrompt = request.userText;
    const prompt = buildNoteImagePrompt(request.userText);
    job.status = "done";
    job.updatedAt = new Date().toISOString();
    job.result = {
      ok: true,
      wrongQuestionDraft: draft,
      prompt,
      warnings: Array.isArray(draft.warnings) ? draft.warnings.map(String) : []
    };
  } catch (error) {
    job.status = "error";
    job.updatedAt = new Date().toISOString();
    job.error = publicErrorMessage(error || new Error("错题整理失败。"));
    job.result = null;
  }
  persistWrongQuestionJobs();
}

function loadWrongQuestionJobs() {
  if (!fs.existsSync(WRONG_QUESTION_JOBS_PATH)) return;
  let recovered = false;
  try {
    const payload = JSON.parse(fs.readFileSync(WRONG_QUESTION_JOBS_PATH, "utf8"));
    const jobs = Array.isArray(payload) ? payload : Array.isArray(payload.jobs) ? payload.jobs : [];
    jobs.forEach((source) => {
      const job = normalizeStoredWrongQuestionJob(source);
      if (!job) return;
      if (job.status === "running") {
        job.status = "queued";
        job.recoveryCount += 1;
        job.updatedAt = new Date().toISOString();
        recovered = true;
      }
      wrongQuestionJobs.set(job.id, job);
    });
    const pruned = pruneWrongQuestionJobs();
    if (recovered && !pruned) persistWrongQuestionJobs();
  } catch (error) {
    console.error("后台错题队列文件无法读取，已保留原文件：", error);
  }
}

function normalizeStoredWrongQuestionJob(source) {
  if (!source || typeof source !== "object" || typeof source.id !== "string") return null;
  const request = normalizeWrongQuestionJobRequest(source.request);
  if (!request.userText) return null;
  const allowedStatuses = new Set(["queued", "running", "done", "error", "cancelled"]);
  let status = allowedStatuses.has(source.status) ? source.status : "queued";
  const result = source.result && typeof source.result === "object" ? source.result : null;
  if (status === "done" && !result) status = "error";
  return {
    id: source.id,
    batchId: String(source.batchId || ""),
    status,
    createdAt: String(source.createdAt || new Date().toISOString()),
    updatedAt: String(source.updatedAt || source.createdAt || new Date().toISOString()),
    attempts: Math.max(0, Number(source.attempts) || 0),
    recoveryCount: Math.max(0, Number(source.recoveryCount) || 0),
    label: String(source.label || wrongQuestionJobLabel(request.userText)).slice(0, 120),
    request,
    result,
    error: String(source.error || "").slice(0, 500),
    importedAt: String(source.importedAt || ""),
    importedQuestionId: String(source.importedQuestionId || "").slice(0, 160),
    importOutcome: source.importOutcome === "duplicate" ? "duplicate" : source.importOutcome === "created" ? "created" : ""
  };
}

function persistWrongQuestionJobs() {
  ensureDataDirs();
  const tempPath = `${WRONG_QUESTION_JOBS_PATH}.${process.pid}.tmp`;
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    jobs: Array.from(wrongQuestionJobs.values())
      .sort((a, b) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""))
  };
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, WRONG_QUESTION_JOBS_PATH);
  fs.chmodSync(WRONG_QUESTION_JOBS_PATH, 0o600);
}

function pruneWrongQuestionJobs(targetSize = MAX_WRONG_QUESTION_JOBS) {
  const now = Date.now();
  let changed = false;
  for (const [id, job] of wrongQuestionJobs.entries()) {
    const updatedAt = Date.parse(job.updatedAt || job.createdAt || "");
    if (isRemovableWrongQuestionJob(job) && Number.isFinite(updatedAt) && now - updatedAt > WRONG_QUESTION_JOB_TTL_MS) {
      wrongQuestionJobs.delete(id);
      changed = true;
    }
  }
  if (wrongQuestionJobs.size > targetSize) {
    const removable = Array.from(wrongQuestionJobs.values())
      .filter(isRemovableWrongQuestionJob)
      .sort((a, b) => Date.parse(a.updatedAt || a.createdAt || "") - Date.parse(b.updatedAt || b.createdAt || ""));
    removable.slice(0, wrongQuestionJobs.size - targetSize).forEach((job) => {
      wrongQuestionJobs.delete(job.id);
      changed = true;
    });
  }
  if (changed) persistWrongQuestionJobs();
  return changed;
}

function isRemovableWrongQuestionJob(job) {
  return Boolean(job.importedAt) || job.status === "error" || job.status === "cancelled";
}

async function handleNotePromptImageRequest(req, res) {
  const config = getImageConfig();
  if (!getImageProviders(config).length) {
    sendJson(res, 400, { error: "未配置生图 API key。请到设置页填写 Image API Key。" });
    return;
  }
  if (!config.baseUrl) {
    sendJson(res, 400, { error: "未配置生图 Base URL。" });
    return;
  }

  const body = await readJsonBody(req, MAX_BODY_BYTES);
  const notePrompt = String(body.prompt || body.notePrompt || "").trim();
  const prompt = buildNoteImagePrompt(notePrompt);
  if (!prompt) {
    sendJson(res, 400, { error: "缺少一图流提示词。" });
    return;
  }

  const size = stringOrDefault(body.size, config.size || DEFAULT_IMAGE_SIZE);
  const imageData = await callImageGeneration(config, prompt, size);
  const imageUrl = await saveGeneratedImage(imageData, "note");
  const createdAt = new Date().toISOString();
  sendJson(res, 200, {
    ok: true,
    noteImage: {
      url: imageUrl,
      prompt,
      createdAt
    },
    prompt,
    createdAt
  });
}

async function handleRenderedNoteSaveRequest(req, res) {
  const body = await readJsonBody(req, MAX_IMAGE_BODY_BYTES);
  const imageData = String(body.imageData || "").trim();
  validateDataUrlImage(imageData, "排版图片");
  const imageUrl = saveDataUrlImage(imageData, "layout-note");
  sendJson(res, 200, {
    ok: true,
    noteImage: {
      url: imageUrl,
      prompt: "彩色排版笔记 · 本地渲染",
      createdAt: new Date().toISOString()
    }
  });
}

async function handleAiRequest(req, res, pathname) {
  if (!getAiProviders().length) {
    sendJson(res, 400, {
      error: "未配置 API key。请到设置页填入 API key，或复制 .env.example 为 .env 后重启 server.js。"
    });
    return;
  }

  const body = await readJsonBody(req);
  const endpointMode = {
    "/api/ai/parse-plan": "parsePlan",
    "/api/ai/daily-advice": "dailyAdvice",
    "/api/ai/reflection-summary": "reflectionSummary"
  }[pathname];

  if (!endpointMode) {
    sendJson(res, 404, { error: "未知 AI 接口" });
    return;
  }

  const mode = body.mode || endpointMode;
  const userText = String(body.userText || "");
  const appState = compactAiAppState(body.appState, mode);

  const aiPayload = await callDeepSeek(mode, userText, appState);
  sendJson(res, 200, aiPayload);
}

function normalizeRecitationEvaluation(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawScore = Number(source.score);
  if (!Number.isFinite(rawScore)) throw new Error("AI 评测没有返回有效分数。");
  const score = Math.min(10, Math.max(0, Math.round(rawScore * 10) / 10));
  const list = (item) => Array.isArray(item) ? item.map((entry) => String(entry || "").trim()).filter(Boolean).slice(0, 12) : [];
  return {
    score,
    maxScore: 10,
    summary: String(source.summary || "").trim().slice(0, 800),
    shortcomings: list(source.shortcomings),
    reinforcementPoints: list(source.reinforcementPoints),
    memoryTechnique: String(source.memoryTechnique || "").trim().slice(0, 1200)
  };
}

async function handleRecitationEvaluationRequest(req, res) {
  if (!getAiProviders().length) {
    sendJson(res, 400, { error: "未配置文本 AI API key。" });
    return;
  }
  const body = await readJsonBody(req, MAX_BODY_BYTES);
  const unitId = String(body.unitId || "").trim().slice(0, 180);
  const question = String(body.question || "").trim().slice(0, 4000);
  const standardAnswer = String(body.standardAnswer || "").trim().slice(0, 16000);
  const userAttempt = String(body.userAttempt || "").trim().slice(0, 12000);
  if (!unitId || !question || !standardAnswer) {
    sendJson(res, 400, { error: "评测需要知识点、题干和标准答案。" });
    return;
  }
  if (userAttempt.length < 4) {
    sendJson(res, 400, { error: "请先输入至少 4 个字的复述内容，再发起评测。" });
    return;
  }
  const requestBody = {
    messages: [
      {
        role: "system",
        content: [
          "你是考研专业课背诵评测老师。只输出合法 JSON，不要 Markdown 代码块，不要输出 JSON 以外的解释。",
          "请严格对照标准答案判分，满分 10 分；定义、前提、机制、推导、结论和边界条件缺失都要明确扣分。不要因语言风格不同扣分。",
          "shortcomings 和 reinforcementPoints 必须是具体、可执行的中文数组；memoryTechnique 必须针对当前知识点，不得使用泛化的本地文本拼接模板。",
          "输出字段固定为：score, maxScore, summary, shortcomings, reinforcementPoints, memoryTechnique。score 为 0 到 10 的数字，maxScore 必须为 10。"
        ].join("\n")
      },
      {
        role: "user",
        content: JSON.stringify({ unitId, question, standardAnswer, userAttempt }, null, 2)
      }
    ],
    response_format: { type: "json_object" },
    stream: false
  };
  try {
    const result = await callChatWithFallback("默写评测接口", requestBody, (payload) => normalizeRecitationEvaluation(parseChatJsonPayload(payload)));
    sendJson(res, 200, result);
  } catch (error) {
    console.error(`[AI] 默写评测失败：${publicErrorMessage(error)}`);
    sendJson(res, 502, { error: "AI 评测暂时不可用，请稍后重试；本次复述不会丢失。" });
  }
}

function compactAiText(value, maxLength = 240) {
  return String(value || "").trim().slice(0, maxLength);
}

function compactAiReview(review) {
  return {
    round: Number(review && review.round) || 0,
    dueDate: compactAiText(review && review.dueDate, 20),
    completedAt: compactAiText(review && review.completedAt, 24),
    score: typeof (review && review.score) === "number" ? review.score : null
  };
}

function compactAiAppState(value, mode) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const compactDailyTask = (task) => ({
    id: compactAiText(task && task.id, 180),
    title: compactAiText(task && task.title, 160),
    subject: compactAiText(task && task.subject, 60),
    category: compactAiText(task && task.category, 60),
    date: compactAiText(task && task.date, 20),
    status: task && task.status === "done" ? "done" : "planned",
    priority: Number(task && task.priority) || 3,
    estimatedMinutes: Number(task && task.estimatedMinutes) || null,
    startTime: compactAiText(task && task.startTime, 5),
    endTime: compactAiText(task && task.endTime, 5),
    linkedPlanId: compactAiText(task && task.linkedPlanId, 180),
    notes: compactAiText(task && task.notes, 240)
  });
  const compactRecitation = (task) => ({
    id: compactAiText(task && task.id, 180),
    title: compactAiText(task && task.title, 180),
    subject: compactAiText(task && task.subject, 60),
    startDate: compactAiText(task && task.startDate, 20),
    deadline: compactAiText(task && task.deadline, 20),
    status: compactAiText(task && task.status, 20),
    priority: Number(task && task.priority) || 3,
    linkedPlanId: compactAiText(task && task.linkedPlanId, 180),
    reviews: Array.isArray(task && task.reviews) ? task.reviews.slice(0, 8).map(compactAiReview) : []
  });
  const compactWrongQuestion = (question) => ({
    id: compactAiText(question && question.id, 180),
    title: compactAiText(question && question.title, 180),
    subject: compactAiText(question && question.subject, 60),
    priority: Number(question && question.priority) || 3,
    reviewStartDate: compactAiText(question && (question.reviewStartDate || question.date), 20),
    knowledgePoints: Array.isArray(question && question.knowledgePoints) ? question.knowledgePoints.slice(0, 12).map((item) => compactAiText(item, 80)).filter(Boolean) : [],
    mistakeReason: compactAiText(question && question.mistakeReason, 240),
    reviews: Array.isArray(question && question.reviews) ? question.reviews.slice(0, 8).map(compactAiReview) : []
  });
  const compactPlan = (plan) => ({
    id: compactAiText(plan && plan.id, 180),
    type: compactAiText(plan && plan.type, 12),
    parentId: compactAiText(plan && plan.parentId, 180),
    title: compactAiText(plan && plan.title, 180),
    subject: compactAiText(plan && plan.subject, 60),
    startDate: compactAiText(plan && plan.startDate, 20),
    endDate: compactAiText(plan && plan.endDate, 20),
    date: compactAiText(plan && plan.date, 20),
    status: compactAiText(plan && plan.status, 20),
    priority: Number(plan && plan.priority) || 3,
    goal: compactAiText(plan && plan.goal, 240)
  });
  const profile = source.profile && typeof source.profile === "object" ? source.profile : {};
  const compactProfile = {
    examDate: compactAiText(profile.examDate, 20),
    dailyCapacity: Number(profile.dailyCapacity) || 0,
    defaultCapacityMinutes: Number(profile.defaultCapacityMinutes) || 0,
    durationDefaults: profile.durationDefaults && typeof profile.durationDefaults === "object" ? profile.durationDefaults : {},
    subjectWeights: profile.subjectWeights && typeof profile.subjectWeights === "object" ? profile.subjectWeights : {}
  };
  const compactReflection = (reflection) => ({
    id: compactAiText(reflection && reflection.id, 180),
    type: compactAiText(reflection && reflection.type, 20),
    date: compactAiText(reflection && reflection.date, 20),
    subject: compactAiText(reflection && reflection.subject, 60),
    mood: compactAiText(reflection && reflection.mood, 80),
    summary: compactAiText(reflection && reflection.summary, 400),
    problems: compactAiText(reflection && reflection.problems, 400),
    tomorrow: compactAiText(reflection && reflection.tomorrow, 400)
  });
  const sourceDailyTasks = Array.isArray(source.dailyTasks) ? source.dailyTasks : [];
  const localToday = compactAiText(source.localContext && source.localContext.today, 20);
  const dailyTasks = mode === "parsePlan"
    ? (localToday
      ? sourceDailyTasks.filter((task) => compactAiText(task && task.date, 20) === localToday).slice(0, 20)
      : sourceDailyTasks.slice(-20))
    : sourceDailyTasks;

  return {
    localContext: source.localContext && typeof source.localContext === "object" ? {
      today: compactAiText(source.localContext.today, 20),
      yesterday: compactAiText(source.localContext.yesterday, 20),
      tomorrow: compactAiText(source.localContext.tomorrow, 20),
      dayAfterTomorrow: compactAiText(source.localContext.dayAfterTomorrow, 20),
      nextWeek: compactAiText(source.localContext.nextWeek, 20),
      timeZone: compactAiText(source.localContext.timeZone, 40),
      utcOffsetMinutes: Number(source.localContext.utcOffsetMinutes) || 480,
      studyDayCutoff: compactAiText(source.localContext.studyDayCutoff, 10),
      currentTime: compactAiText(source.localContext.currentTime, 40)
    } : {},
    manual45: source.manual45 && typeof source.manual45 === "object" ? {
      currentDay: Number(source.manual45.currentDay) || null,
      newListIds: Array.isArray(source.manual45.newListIds) ? source.manual45.newListIds.slice(0, 20) : [],
      reviewListIds: Array.isArray(source.manual45.reviewListIds) ? source.manual45.reviewListIds.slice(0, 63) : [],
      rest: Boolean(source.manual45.rest),
      completed: Boolean(source.manual45.completed)
    } : {},
    profile: compactProfile,
    dailyTasks: dailyTasks.map(compactDailyTask),
    tasks: mode === "parsePlan" ? [] : (Array.isArray(source.tasks) ? source.tasks.map(compactRecitation) : []),
    wrongQuestions: mode === "parsePlan" ? [] : (Array.isArray(source.wrongQuestions) ? source.wrongQuestions.map(compactWrongQuestion) : []),
    plans: Array.isArray(source.plans) ? source.plans.map(compactPlan) : [],
    reflections: mode === "reflectionSummary" && Array.isArray(source.reflections) ? source.reflections.slice(-30).map(compactReflection) : []
  };
}

async function handleAdjustmentExplanationRequest(req, res) {
  if (!getAiProviders().length) {
    sendJson(res, 400, { error: "未配置文本 AI API key。" });
    return;
  }
  const body = await readJsonBody(req);
  const suggestions = Array.isArray(body.suggestions) ? body.suggestions.slice(0, 30) : [];
  const allowedIds = new Set();
  const compact = suggestions.map((item) => {
    const id = String(item && item.id || "").trim();
    if (!/^[A-Za-z0-9_.:-]{1,180}$/.test(id) || allowedIds.has(id)) throw new Error("调整建议 ID 无效或重复。");
    allowedIds.add(id);
    return {
      id,
      type: String(item.type || "").slice(0, 40),
      title: String(item.title || "").slice(0, 160),
      original: item.original && typeof item.original === "object" ? item.original : {},
      suggested: item.suggested && typeof item.suggested === "object" ? item.suggested : {},
      basis: item.basis && typeof item.basis === "object" ? item.basis : {}
    };
  });
  if (!compact.length) {
    sendJson(res, 400, { error: "没有可解释的调整建议。" });
    return;
  }
  const reflection = body.reflection && typeof body.reflection === "object" ? {
    mood: String(body.reflection.mood || "").slice(0, 80),
    summary: String(body.reflection.summary || "").slice(0, 800),
    problems: String(body.reflection.problems || "").slice(0, 800),
    tomorrow: String(body.reflection.tomorrow || "").slice(0, 800)
  } : {};
  const requestBody = {
    messages: [
      { role: "system", content: "你是考研计划调整解释助手。确定性规则已经完成排程，你不能改日期、优先级、时长或规划关系。只输出 JSON object，字段 results 为数组；每项仅含 id、explanation、splitTitles、weekGoal。必须逐个返回给定 ID，不能增加 ID。解释说明数据依据，避免把降低难度包装成完成率提升。" },
      { role: "user", content: JSON.stringify({ reflection, suggestions: compact }) }
    ],
    temperature: 0.2,
    response_format: { type: "json_object" }
  };
  const parsed = await callChatWithFallback("调整建议解释接口", requestBody, parseChatJsonPayload);
  const results = normalizeAdjustmentExplanationResults(parsed, allowedIds);
  sendJson(res, 200, { ok: true, results });
}

function normalizeAdjustmentExplanationResults(value, allowedIds) {
  const source = value && typeof value === "object" ? value : {};
  const rows = Array.isArray(source.results) ? source.results : [];
  const seen = new Set();
  const output = rows.map((row) => {
    const id = String(row && row.id || "").trim();
    if (!allowedIds.has(id)) throw new Error(`AI 返回未知调整建议 ID：${id || "空"}`);
    if (seen.has(id)) throw new Error(`AI 重复返回调整建议 ID：${id}`);
    seen.add(id);
    const splitTitles = Array.isArray(row.splitTitles)
      ? row.splitTitles.map((title) => String(title || "").trim().slice(0, 120)).filter(Boolean).slice(0, 3)
      : [];
    return {
      id,
      explanation: String(row.explanation || "").trim().slice(0, 500),
      splitTitles,
      weekGoal: String(row.weekGoal || "").trim().slice(0, 400)
    };
  });
  if (seen.size !== allowedIds.size) throw new Error("AI 未返回全部调整建议 ID。");
  return output;
}

async function handleWrongQuestionChatRequest(req, res) {
  if (!getAiProviders().length) {
    sendJson(res, 400, { error: "未配置文本 AI API key。" });
    return;
  }
  const body = await readJsonBody(req);
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const question = String(body.question || "").trim();
  const history = Array.isArray(body.history) ? body.history : [];
  if (!question) {
    sendJson(res, 400, { error: "请输入要问的问题。" });
    return;
  }
  const contextText = JSON.stringify({
    title: String(context.title || "").slice(0, 1000),
    subject: String(context.subject || "").slice(0, 100),
    knowledgePoints: Array.isArray(context.knowledgePoints) ? context.knowledgePoints.slice(0, 30) : [],
    question: String(context.questionMarkdown || "").slice(0, 20000),
    answerAndAnalysis: String(context.detailMarkdown || context.fullMarkdown || "").slice(0, 30000),
    fullRecord: String(context.fullMarkdown || "").slice(0, 30000),
    originalTemplate: String(context.originalTemplate || "").slice(0, 30000)
  }, null, 2);
  const messages = [
    {
      role: "system",
      content: [
        "你是考研错题答疑老师。回答必须针对用户提供的这道题，不要泛泛讲课。",
        "题目、答案、解析和原始解题模板是主要上下文；不得擅自删改用户模板。",
        "先直接回答用户当前疑问，再给必要推导。数学公式使用标准 LaTeX：行内用 \\(...\\)，独立公式用 \\[...\\]。",
        "如果现有解析有明显错误，要明确指出依据；资料不足时直接说明缺少什么，不要编造。",
        `错题上下文：\n${contextText}`
      ].join("\n")
    },
    ...history.slice(-10).map((item) => ({
      role: item && item.role === "assistant" ? "assistant" : "user",
      content: String(item && item.content || "").slice(0, 8000)
    })).filter((item) => item.content),
    { role: "user", content: question.slice(0, 8000) }
  ];
  const payload = await callChatWithFallback("错题答疑接口", { messages, stream: false });
  const answer = payload.choices && payload.choices[0] && payload.choices[0].message
    ? String(payload.choices[0].message.content || "").trim()
    : "";
  if (!answer) throw new Error("AI 没有返回答疑内容。");
  sendJson(res, 200, { ok: true, answer });
}

async function handleRecordOrganizeRequest(req, res) {
  if (!getAiProviders().length) {
    sendJson(res, 400, { error: "未配置文本 AI API key。" });
    return;
  }
  const body = await readJsonBody(req);
  const kind = body.kind === "reflection" ? "reflection" : body.kind === "plan" ? "plan" : "";
  const record = body.record && typeof body.record === "object" ? body.record : {};
  const instruction = String(body.instruction || "请整理得清晰、具体、可执行。零散信息归类，保留原意，不虚构完成情况。").slice(0, 4000);
  if (!kind) {
    sendJson(res, 400, { error: "AI 整理类型无效。" });
    return;
  }
  const allowedFields = kind === "plan"
    ? ["type", "parentId", "title", "subject", "startDate", "endDate", "date", "goal", "notes", "priority"]
    : ["date", "subject", "mood", "summary", "problems", "tomorrow"];
  const requestBody = {
    messages: [
      {
        role: "system",
        content: `你是考研${kind === "plan" ? "进度规划" : "复盘感想"}整理助手。只输出合法 JSON object，不要 Markdown。仅允许字段：${allowedFields.join(", ")}。保留事实和原意，不得虚构已完成任务、学习时长或成绩。日期使用 YYYY-MM-DD。`
      },
      { role: "user", content: JSON.stringify({ instruction, record }, null, 2) }
    ],
    response_format: { type: "json_object" },
    stream: false
  };
  const parsed = await callChatWithFallback("AI 整理接口", requestBody, parseChatJsonPayload);
  const draft = {};
  allowedFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(parsed, field)) draft[field] = parsed[field];
  });
  sendJson(res, 200, { ok: true, kind, draft });
}

function normalizeReadingSelectionRequest(value) {
  const body = value && typeof value === "object" ? value : {};
  const selections = Array.isArray(body.selections) ? body.selections : [];
  if (!selections.length || selections.length > 20) {
    throw new Error("一次必须提交 1–20 个选区。");
  }
  const mode = body.mode === "deep" ? "deep" : "context";
  if (mode === "deep" && selections.length !== 1) {
    throw new Error("拆句/辨析一次只能处理一个选区。");
  }
  return {
    mode,
    selections: selections.map((item, index) => {
      const selectedText = String(item && item.selectedText || "").trim();
      const sentence = String(item && item.sentence || "").trim();
      const paragraphContext = String(item && item.paragraphContext || "").trim();
      if (!selectedText) throw new Error(`第 ${index + 1} 个选区为空。`);
      if (selectedText.length > 120) throw new Error(`第 ${index + 1} 个选区不能超过 120 个字符。`);
      if (sentence.length > 2000) throw new Error(`第 ${index + 1} 个选区所在句不能超过 2,000 个字符。`);
      if (paragraphContext.length > 6000) throw new Error(`第 ${index + 1} 个选区段落上下文不能超过 6,000 个字符。`);
      const existingSenses = (Array.isArray(item && item.existingSenses) ? item.existingSenses : []).slice(0, 50).map(sense => ({
        id: String(sense && sense.id || "").trim().slice(0, 160),
        meaningZh: String(sense && sense.meaningZh || "").trim().slice(0, 500),
        partOfSpeech: String(sense && sense.partOfSpeech || "").trim().slice(0, 80)
      })).filter(sense => sense.id);
      return {
        id: String(item && item.id || `selection-${index + 1}`).trim().slice(0, 160),
        selectedText,
        sentence,
        paragraphContext,
        existingSenses
      };
    })
  };
}

function normalizeReadingSelectionResults(value, selections, mode) {
  const raw = Array.isArray(value) ? value : Array.isArray(value && value.results) ? value.results : [];
  const byId = new Map();
  raw.forEach(item => {
    if (!item || typeof item !== "object") return;
    const id = String(item.id || "").trim();
    if (id && !byId.has(id)) byId.set(id, item);
  });
  const results = [];
  const failures = [];
  selections.forEach((selection, index) => {
    const hasExplicitIds = raw.some(value => value && typeof value === "object" && String(value.id || "").trim());
    const item = byId.get(selection.id) || (!hasExplicitIds ? raw[index] : null);
    if (!item || typeof item !== "object") {
      failures.push({ id: selection.id, error: "AI 未返回这个选区的解释。" });
      return;
    }
    const matchedSenseId = String(item.matchedSenseId || "").trim().slice(0, 160);
    const knownSenseIds = new Set(selection.existingSenses.map(sense => sense.id));
    if (matchedSenseId && !knownSenseIds.has(matchedSenseId)) {
      const error = new Error(`AI 返回了未知已有义项 ID：${matchedSenseId}`);
      error.code = "UNKNOWN_READING_SENSE";
      throw error;
    }
    const normalizedKey = String(item.normalizedKey || item.headword || selection.selectedText).trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
    const result = {
      id: selection.id,
      selectedText: selection.selectedText,
      normalizedKey,
      headword: String(item.headword || normalizedKey).trim().slice(0, 120),
      type: item.type === "phrase" || normalizedKey.includes(" ") ? "phrase" : "word",
      meaningZh: String(item.meaningZh || "").trim().slice(0, 500),
      partOfSpeech: String(item.partOfSpeech || "").trim().slice(0, 80),
      collocation: String(item.collocation || "").trim().slice(0, 500),
      rationale: String(item.rationale || "").trim().slice(0, 1000),
      classification: matchedSenseId ? "existing" : "new",
      matchedSenseId
    };
    if (mode === "deep") result.deepExplanation = String(item.deepExplanation || "").trim().slice(0, 4000);
    if (!result.meaningZh) {
      failures.push({ id: selection.id, error: "AI 没有返回上下文义。" });
      return;
    }
    results.push(result);
  });
  return { results, failures };
}

function readingSelectionCacheKey(selection, mode) {
  return crypto.createHash("sha256").update(JSON.stringify({
    mode,
    selectedText: selection.selectedText,
    sentence: selection.sentence
  })).digest("hex");
}

async function handleReadingSelectionExplanationRequest(req, res) {
  let request;
  try {
    request = normalizeReadingSelectionRequest(await readJsonBody(req));
  } catch (error) {
    sendJson(res, 400, { error: error.message || "选区数据无效。" });
    return;
  }
  if (!getAiProviders().length) {
    sendJson(res, 400, { error: "未配置文本 AI API key；标记已保留，可稍后重试或手动补卡。" });
    return;
  }
  const cachedResults = [];
  const pending = [];
  request.selections.forEach(selection => {
    const key = readingSelectionCacheKey(selection, request.mode);
    const cached = readingExplanationCache.get(key);
    const knownSenseIds = new Set(selection.existingSenses.map(sense => sense.id));
    if (cached && (!cached.matchedSenseId || knownSenseIds.has(cached.matchedSenseId))) {
      cachedResults.push({ ...cached, id: selection.id, selectedText: selection.selectedText, cached: true });
    } else pending.push(selection);
  });
  let normalized = { results: [], failures: [] };
  if (pending.length) {
    try {
      const parsed = await callChatWithFallback("阅读选区解释接口", {
        messages: [
          {
            role: "system",
            content: [
              "你是考研英语阅读语境助手，只解释用户主动选择的单词或连续短语，不扫描全文推荐生词。",
              "只输出合法 JSON object：{\"results\":[...]}，每个输入选区恰好对应一项并原样返回 id。",
              "每项字段：id、normalizedKey、headword、type(word|phrase)、meaningZh、partOfSpeech、collocation、rationale、matchedSenseId。",
              "meaningZh 必须是当前句中的准确中文义；rationale 用一句中文说明从哪处语境判断。",
              "只有与已有义项明显相同时才返回其原始 matchedSenseId，否则返回空字符串；不得创造义项 ID。",
              request.mode === "deep"
                ? "这是按需拆句/辨析模式，另加 deepExplanation，说明句法骨架、指代或近义表达区别。"
                : "不要返回长篇句法讲解或额外推荐词。"
            ].join("\n")
          },
          { role: "user", content: JSON.stringify({ mode: request.mode, selections: pending }, null, 2) }
        ],
        response_format: { type: "json_object" },
        stream: false
      }, parseChatJsonPayload);
      normalized = normalizeReadingSelectionResults(parsed, pending, request.mode);
      normalized.results.forEach(result => {
        const selection = pending.find(item => item.id === result.id);
        if (!selection) return;
        readingExplanationCache.set(readingSelectionCacheKey(selection, request.mode), { ...result, id: undefined, selectedText: undefined });
      });
      while (readingExplanationCache.size > 500) readingExplanationCache.delete(readingExplanationCache.keys().next().value);
    } catch (error) {
      sendJson(res, error && error.code === "UNKNOWN_READING_SENSE" ? 502 : 500, {
        error: error && error.code === "UNKNOWN_READING_SENSE"
          ? error.message
          : "AI 解释失败；标记仍会保留，可重试或手动补卡。"
      });
      return;
    }
  }
  const order = new Map(request.selections.map((item, index) => [item.id, index]));
  const results = [...cachedResults, ...normalized.results].sort((a, b) => order.get(a.id) - order.get(b.id));
  sendJson(res, 200, { ok: true, results, failures: normalized.failures });
}

async function callDeepSeek(mode, userText, appState) {
  const requestBody = {
    messages: [
      { role: "system", content: buildSystemPrompt(mode) },
      { role: "user", content: JSON.stringify({ mode, userText, appState }, null, 2) }
    ],
    response_format: { type: "json_object" },
    stream: false
  };
  const parsed = await callChatWithFallback("AI 接口", requestBody, parseChatJsonPayload);
  return normalizeDraft(parsed);
}

async function callWrongQuestionOrganizer(userText, options) {
  const isEditRequest = Boolean(options && String(options.editInstruction || "").trim());
  const requestOptions = {
    ...(options || {}),
    preserveTemplate: !isEditRequest && (Boolean(options && options.preserveTemplate) || hasCompleteSolutionTemplate(userText))
  };
  const requestBody = {
    messages: [
      { role: "system", content: buildWrongQuestionSystemPrompt(requestOptions) },
      { role: "user", content: JSON.stringify({ userText, options: requestOptions }, null, 2) }
    ],
    response_format: { type: "json_object" },
    stream: false
  };
  const parsed = await callChatWithFallback("错题整理接口", requestBody, parseChatJsonPayload);
  const draft = normalizeWrongQuestionDraft(parsed, userText, requestOptions);
  if (requestOptions.preserveTemplate) {
    draft.originalTemplate = userText;
    draft.questionMarkdown = firstMarkdownBlock(userText);
    draft.detailMarkdown = userText;
    draft.fullMarkdown = userText;
    draft.notePrompt = userText;
  }
  return draft;
}

function hasCompleteSolutionTemplate(userText) {
  const text = String(userText || "");
  const structureCount = ["第一时间该想到什么", "思路", "过程", "解题步骤", "逐步推导", "推导", "解题思路", "解析", "易错提醒", "类似题目"].filter((marker) => text.includes(marker)).length;
  return /(?:最终答案|答案|结论)/.test(text) && structureCount >= 2;
}

async function handleWrongQuestionEditRequest(req, res) {
  const body = await readJsonBody(req, MAX_BODY_BYTES);
  const question = body.question && typeof body.question === "object" ? body.question : {};
  const instruction = String(body.instruction || "").trim();
  const originalTemplate = typeof question.originalTemplate === "string" ? question.originalTemplate : "";
  const fullMarkdown = String(question.fullMarkdown || [question.questionMarkdown, question.detailMarkdown].filter(Boolean).join("\n\n")).trim();
  if (!fullMarkdown) {
    sendJson(res, 400, { error: "缺少要编辑的错题内容。" });
    return;
  }
  if (!instruction) {
    sendJson(res, 400, { error: "请说明希望如何修改。" });
    return;
  }

  const draft = await callWrongQuestionOrganizer(fullMarkdown, {
    subject: question.subject,
    title: question.title,
    source: question.source,
    reviewStartDate: question.reviewStartDate,
    priority: question.priority,
    knowledgePoints: question.knowledgePoints,
    mistakeReason: question.mistakeReason,
    editInstruction: instruction,
    localContext: body.localContext
  });
  draft.originalTemplate = originalTemplate;
  sendJson(res, 200, { ok: true, wrongQuestionDraft: draft });
}

async function callImageGeneration(config, prompt, size) {
  const providers = getImageProviders(config);
  if (!providers.length) throw new Error("未配置生图 API key。");
  const errors = [];
  for (const provider of providers) {
    try {
      return await requestImageProvider(provider, prompt, size || provider.size);
    } catch (error) {
      errors.push(error);
      if (!shouldTryNextProvider(error)) break;
    }
  }
  throw providerFallbackError("生图接口", errors);
}

async function callChatWithFallback(label, requestBody, transformResponse) {
  const providers = getAiProviders();
  if (!providers.length) throw new Error("未配置文本 AI API key。");
  const errors = [];
  providerLoop: for (const provider of providers) {
    const attempts = typeof transformResponse === "function" ? 2 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      let payload;
      try {
        const body = {
          ...requestBody,
          model: provider.model,
          max_tokens: provider.maxTokens
        };
        payload = await requestChatProvider(provider, body, label);
      } catch (error) {
        errors.push(error);
        console.warn(`[AI] ${label} · ${provider.name} 请求失败：${publicErrorMessage(error)}`);
        if (error && error.aiNetworkError && attempt + 1 < attempts) {
          await new Promise((resolve) => setTimeout(resolve, TEXT_API_NETWORK_RETRY_DELAY_MS));
          continue;
        }
        if (!shouldTryNextProvider(error)) break providerLoop;
        continue providerLoop;
      }

      if (typeof transformResponse !== "function") return payload;
      try {
        return transformResponse(payload);
      } catch (error) {
        const detail = publicErrorMessage(error);
        if (attempt + 1 < attempts) {
          console.warn(`[AI] ${label} · ${provider.name} 返回内容无效，自动重试：${detail}`);
          continue;
        }
        const wrapped = apiRequestError(`${label}返回内容无效：${detail}`, 502, detail, provider);
        errors.push(wrapped);
        console.warn(`[AI] ${label} · ${provider.name} 重试后仍无效：${detail}`);
        if (!shouldTryNextProvider(wrapped)) break providerLoop;
        continue providerLoop;
      }
    }
  }
  throw providerFallbackError(label, errors);
}

function parseChatJsonPayload(payload) {
  const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null;
  const message = choice && choice.message && typeof choice.message === "object" ? choice.message : {};
  const candidates = [message.content, message.reasoning_content]
    .filter((value) => typeof value === "string" && value.trim());
  if (!candidates.length) throw new Error("AI 接口没有返回内容。");
  let lastError = null;
  for (const content of candidates) {
    try {
      return parseJsonContent(content);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("AI 接口没有返回可解析内容。");
}

async function requestChatProvider(provider, requestBody, label, options = {}) {
  const timeoutMs = options && options.timeoutMs != null
    ? Math.max(1, Number(options.timeoutMs) || TEXT_API_TIMEOUT_MS)
    : TEXT_API_TIMEOUT_MS;
  const fetchImpl = options && typeof options.fetchImpl === "function" ? options.fetchImpl : fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch (error) {
      throw apiRequestError(`${label}返回了非 JSON 响应：${text.slice(0, 200)}`, response.status, text, provider);
    }

    if (!response.ok) {
      const detail = errorDetailFromPayload(payload, response.statusText);
      throw apiRequestError(`${label}请求失败：${detail}`, response.status, detail, provider);
    }

    return payload;
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw apiRequestError(`${label}请求超时（${Math.round(timeoutMs / 1000)}秒），正在尝试备用 API。`, 408, "timeout", provider);
    }
    if (error && Number(error.status)) throw error;
    const causeCode = error && error.cause && error.cause.code;
    const networkError = apiRequestError(
      `${label}无法连接 AI 服务${causeCode ? `（${causeCode}）` : ""}，请检查本机 AI 代理后重试。`,
      503,
      causeCode || "network error",
      provider
    );
    networkError.aiNetworkError = true;
    throw networkError;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestImageProvider(provider, prompt, size) {
  const requestBody = {
    model: provider.model,
    prompt,
    n: 1,
    size: size || provider.size || DEFAULT_IMAGE_SIZE
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_API_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(`${provider.baseUrl}/images/generations`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${provider.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw apiRequestError(`生图请求超时（${Math.round(IMAGE_API_TIMEOUT_MS / 1000)}秒），正在尝试备用 API。`, 408, "timeout", provider);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    throw apiRequestError(`生图接口返回了非 JSON 响应：${text.slice(0, 200)}`, response.status, text, provider);
  }

  if (!response.ok) {
    const detail = errorDetailFromPayload(payload, response.statusText);
    throw apiRequestError(`生图接口请求失败：${detail}`, response.status, detail, provider);
  }

  const image = extractImageFromPayload(payload);
  if (!image) throw apiRequestError("生图接口响应中没有找到图片。", response.status, "no image", provider);
  return image;
}

function errorDetailFromPayload(payload, fallback) {
  const error = payload && payload.error;
  const topMessage = payload && (payload.error_description || payload.message);
  if (typeof error === "string" && error.trim()) {
    return topMessage && String(topMessage).trim() && error.trim() !== String(topMessage).trim()
      ? `${error.trim()}: ${String(topMessage).trim()}`
      : error.trim();
  }
  if (error && typeof error === "object") {
    const code = error.code || error.type || error.error || "";
    const message = error.message || error.error_description || "";
    if (code && message && code !== message) return `${code}: ${message}`;
    if (message || code) return String(message || code);
  }
  return String(fallback || "unknown error");
}

function apiRequestError(message, status, detail, provider) {
  const error = new Error(message);
  error.status = Number(status) || 0;
  error.detail = String(detail || message || "");
  error.providerName = provider && provider.name ? provider.name : "";
  return error;
}

function shouldTryNextProvider(error) {
  const status = Number(error && error.status) || 0;
  const detail = `${error && error.message ? error.message : ""} ${error && error.detail ? error.detail : ""}`.toLowerCase();
  if (!status) return true;
  if ([401, 403, 408, 409, 429].includes(status)) return true;
  if (status >= 500) return true;
  return /余额|额度|欠费|不足|限额|quota|balance|insufficient|credit|billing|rate limit|too many|exceeded|overloaded|timeout|timed out|econn|enotfound|network/u.test(detail);
}

function providerFallbackError(label, errors) {
  const list = errors.filter(Boolean);
  const summary = list.map((error) => {
    const providerName = error.providerName ? `${error.providerName}: ` : "";
    return `${providerName}${publicErrorMessage(error)}`;
  }).join("；");
  const error = new Error(`${label}请求失败，已尝试 ${list.length} 组配置：${summary || "未知错误"}`);
  error.causes = list;
  return error;
}

function publicErrorMessage(error) {
  const message = error && error.message ? String(error.message) : "未知错误";
  return message.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***").slice(0, 240);
}

function buildWrongQuestionSystemPrompt(options) {
  const today = options && options.localContext && options.localContext.today ? options.localContext.today : new Date().toISOString().slice(0, 10);
  const isEditRequest = Boolean(options && options.editInstruction);
  return [
    "你是考研错题整理与解题助手。必须只输出合法 JSON，不要 Markdown 代码块。",
    isEditRequest ? "这是用户主动发起的已有错题编辑。只执行编辑要求中明确提出的修改；未提及的题干、条件、步骤、答案、结论、字段和结构必须保持不变。" : "自动判断用户输入是“只有题目”还是“题目+完整解题流程”。",
    !isEditRequest ? "如果只有题目，你必须按考研解题模板补出完整解析。" : "编辑后仍要完整返回所有字段，不得只返回改动片段。",
    !isEditRequest && options && options.preserveTemplate ? "用户已提供完整解题模板。你只能统一排版：使用清晰的 Markdown 标题、段落、编号和规范 LaTeX；可对原文中已有的关键结论、公式结论和答案使用 **加粗**。严禁补充、删减、改写任何题干、条件、步骤、推导、数值、答案、结论或易错提醒；答案和解析必须以用户模板为准。" : !isEditRequest ? "如果已有但不完整的解题流程，你可以整理、纠错、补齐结构，但不要删掉关键推导。" : "不要因为固定模板而重写整道题；除非编辑要求明确提出，否则沿用现有标题层级和解题结构。",
    "输出 JSON object 字段固定为：mode, subject, title, source, reviewStartDate, priority, knowledgePoints, mistakeReason, questionMarkdown, detailMarkdown, fullMarkdown, notePrompt, summary, warnings。",
    "科目归类规则：微观、宏观、微观经济学、宏观经济学、西方经济学、专业课计算题、三大本计算题都属于“专业课”，不要写成“数学”。只有高数、线代、概率论等公共数学才写“数学”。",
    `今天日期是 ${today}。reviewStartDate 默认今天，日期格式 YYYY-MM-DD。priority 范围 1-5，默认 3。`,
    "questionMarkdown 只放题干、条件、选项、图表文字描述，不放答案。",
    isEditRequest ? "detailMarkdown 保留当前解析结构，只在编辑要求涉及的位置修改。" : "detailMarkdown 按固定模板输出：## 考点、## 解题思路、## 逐步推导、## 易错点、## 最终答案、## 方法总结。",
    "所有数学公式必须使用标准 LaTeX：行内公式必须写成 \\(...\\)，独立推导公式必须单独一行并写成 \\[...\\]。禁止在普通文字中裸写 \\frac、\\sqrt、\\lim、\\sin、\\to 等 LaTeX 命令。",
    isEditRequest ? "fullMarkdown 必须是修改后的完整错题内容，并与 questionMarkdown、detailMarkdown 一致；除非编辑要求明确提出，否则保持现有结构。" : "fullMarkdown 必须包含：## 题目，然后是 detailMarkdown 的完整内容。",
    isEditRequest ? "notePrompt 原样返回当前值，不要根据编辑要求改写。" : "notePrompt 必须原样保留用户给出的解题模板，不要重写、概括、压缩、补充或添加任何内容。",
    isEditRequest ? `编辑要求：${String(options.editInstruction)}。必须保留原题核心信息、正确结论和已有复盘价值；只按要求修改，并完整返回所有字段。` : "",
    isEditRequest ? "options 中的 subject/title/source/reviewStartDate/priority/knowledgePoints/mistakeReason 是当前值。编辑要求涉及它们时可以修改，否则原样返回。" : "优先使用用户给的 subject/title/source/reviewStartDate/priority/knowledgePoints/mistakeReason 作为约束；用户没给时再自动推断。"
  ].filter(Boolean).join("\n");
}

function buildNoteImagePrompt(noteText) {
  const text = stringValue(noteText).trim();
  const style = "彩色考研笔记风格";
  if (new RegExp(`${style}\\s*$`, "u").test(text)) return text;
  return [text, style].filter(Boolean).join("\n\n");
}

function normalizeWrongQuestionDraft(draft, fallbackText, options) {
  const source = draft && typeof draft === "object" ? draft : {};
  const isEditRequest = Boolean(options && options.editInstruction);
  const fullMarkdown = stringValue(source.fullMarkdown) || stringValue(source.markdown) || stringValue(source.content) || fallbackText;
  const questionMarkdown = stringValue(source.questionMarkdown) || firstMarkdownBlock(fullMarkdown);
  const detailMarkdown = stringValue(source.detailMarkdown) || fullMarkdown;
  const reviewStartDate = /^\d{4}-\d{2}-\d{2}$/.test(stringValue(source.reviewStartDate))
    ? source.reviewStartDate
    : /^\d{4}-\d{2}-\d{2}$/.test(stringValue(options && options.reviewStartDate))
      ? options.reviewStartDate
      : new Date().toISOString().slice(0, 10);
  return {
    mode: stringValue(source.mode) || "auto",
    subject: normalizeStudySubject(isEditRequest ? stringValue(source.subject) || stringValue(options && options.subject) : stringValue(options && options.subject) || stringValue(source.subject), [source.title, fullMarkdown, questionMarkdown]) || "未分类",
    title: isEditRequest ? stringValue(source.title) || stringValue(options && options.title) || inferTitleFromText(questionMarkdown || fullMarkdown) : stringValue(options && options.title) || stringValue(source.title) || inferTitleFromText(questionMarkdown || fullMarkdown),
    source: isEditRequest ? stringValue(source.source) || stringValue(options && options.source) : stringValue(options && options.source) || stringValue(source.source),
    reviewStartDate,
    priority: clampNumber(isEditRequest ? source.priority || (options && options.priority) : options && options.priority ? options.priority : source.priority, 1, 5, 3),
    knowledgePoints: Array.isArray(source.knowledgePoints) ? source.knowledgePoints.map(String).filter(Boolean) : textListFromValue(options && options.knowledgePoints),
    mistakeReason: isEditRequest ? stringValue(source.mistakeReason) || stringValue(options && options.mistakeReason) : stringValue(options && options.mistakeReason) || stringValue(source.mistakeReason),
    questionMarkdown,
    detailMarkdown,
    fullMarkdown,
    notePrompt: stringValue(source.notePrompt) || fullMarkdown,
    originalTemplate: stringValue(source.originalTemplate),
    summary: stringValue(source.summary),
    warnings: Array.isArray(source.warnings) ? source.warnings.map(String) : []
  };
}

function normalizeStudySubject(subject, context) {
  const rawSubject = stringValue(subject);
  const text = [rawSubject].concat(Array.isArray(context) ? context : [context]).filter(Boolean).join(" ");
  if (/(微观|宏观|微观经济学|宏观经济学|西方经济学|专业课|专业课计算|三大本计算)/i.test(text)) return "专业课";
  return rawSubject;
}

function firstMarkdownBlock(markdown) {
  const text = String(markdown || "").trim();
  const match = text.match(/##\s*(?:题目|原题|题干)\s*([\s\S]*?)(?=\n##\s+|$)/);
  if (match && match[1].trim()) return match[1].trim();
  const sections = findWrongTemplateSections(text);
  const questionSection = sections.find((section) => section.title === "题目");
  if (questionSection) {
    const questionMarkdown = text.slice(questionSection.contentStart, questionSection.end).trim();
    if (questionMarkdown) return questionMarkdown;
  }
  return text.split(/\n{2,}/).slice(0, 2).join("\n\n").slice(0, 1500).trim() || text;
}

function findWrongTemplateSections(markdown) {
  const text = String(markdown || "");
  const sections = [];
  const pattern = /^[ \t]*(?:\[([^\]\r\n]{1,50})\]|([^:：\r\n]{1,50}))\s*[:：]\s*/gm;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const title = normalizeWrongTemplateSectionTitle(match[1] || match[2]);
    if (!title) continue;
    sections.push({ title, start: match.index, contentStart: pattern.lastIndex, end: text.length });
  }
  sections.forEach((section, index) => {
    if (sections[index + 1]) section.end = sections[index + 1].start;
  });
  return sections;
}

function normalizeWrongTemplateSectionTitle(value) {
  const title = String(value || "").replace(/^[#*\s]+|[#*\s]+$/g, "").trim();
  if (/^来源(?:\([^)]*\))?$/.test(title)) return title;
  return {
    "题目": "题目",
    "原题": "题目",
    "题干": "题目",
    "知识点": "知识点",
    "考点": "知识点",
    "第一时间该想到什么": "第一时间该想到什么",
    "思路": "思路",
    "解题思路": "思路",
    "过程": "过程",
    "解题步骤": "过程",
    "逐步推导": "过程",
    "解析": "过程",
    "答案": "答案",
    "最终答案": "答案",
    "易错提醒": "易错提醒",
    "易错点": "易错提醒",
    "此类题解的通式是什么": "通式",
    "通式": "通式",
    "类似题目": "类似题目",
    "方法总结": "方法总结"
  }[title] || "";
}

function inferTitleFromText(text) {
  const line = String(text || "").replace(/[#*_`>]/g, "").split(/\n/).map((item) => item.trim()).find(Boolean) || "未命名错题";
  return line.length > 36 ? `${line.slice(0, 36)}...` : line;
}

function textListFromValue(value) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  return String(value || "").split(/[，,、;\n]/).map((item) => item.trim()).filter(Boolean);
}

async function normalizeInputImage(value, label) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.startsWith("data:image/")) {
    validateDataUrlImage(text, label);
    return text;
  }
  if (text.startsWith("/generated-notes/")) {
    return dataUrlFromGeneratedNote(text, label);
  }
  throw new Error(`${label}格式不支持。`);
}

function validateDataUrlImage(dataUrl, label) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) throw new Error(`${label}必须是 PNG、JPG 或 WebP 图片。`);
  const imageBytes = Buffer.from(match[2], "base64");
  if (!imageBytes.length) throw new Error(`${label}内容为空。`);
  if (imageBytes.length > MAX_IMAGE_BYTES) throw new Error(`${label}超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB。`);
}

function dataUrlFromGeneratedNote(publicUrl, label) {
  const filePath = generatedNotePathFromUrl(publicUrl);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`${label}文件不存在。`);
  }
  const buffer = fs.readFileSync(filePath);
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`${label}超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB。`);
  return `data:${contentTypeFor(filePath)};base64,${buffer.toString("base64")}`;
}

function extractImageFromPayload(payload) {
  const candidates = [];
  const push = (value) => {
    if (typeof value === "string" && value.trim()) candidates.push(value.trim());
  };
  const visit = (value, depth = 0) => {
    if (!value || depth > 6) return;
    if (typeof value === "string") {
      push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    ["b64_json", "url", "image", "image_url", "data_url", "result"].forEach((key) => push(value[key]));
    if (value.image_url && typeof value.image_url === "object") push(value.image_url.url);
    ["data", "images", "output", "content", "parts"].forEach((key) => visit(value[key], depth + 1));
  };
  visit(payload);
  const dataUrl = candidates.find((item) => item.startsWith("data:image/"));
  if (dataUrl) return dataUrl;
  const httpUrl = candidates.find((item) => /^https?:\/\//i.test(item));
  if (httpUrl) return httpUrl;
  const base64Image = candidates.find((item) => /^[A-Za-z0-9+/=\r\n]{200,}$/.test(item));
  return base64Image ? `data:image/png;base64,${base64Image}` : "";
}

function saveDataUrlImage(dataUrl, prefix) {
  const { buffer, ext } = decodeDataUrlImage(dataUrl);
  const filename = `${prefix}-${stampForFile()}-${randomSuffix()}.${ext}`;
  const filePath = path.join(GENERATED_NOTES_DIR, filename);
  ensureGeneratedNotesDir();
  fs.writeFileSync(filePath, buffer);
  fs.chmodSync(filePath, 0o600);
  return `/generated-notes/${filename}`;
}

async function saveGeneratedImage(imageData, prefix) {
  if (imageData.startsWith("data:image/")) return saveDataUrlImage(imageData, prefix);
  if (/^https?:\/\//i.test(imageData)) {
    const response = await fetch(imageData);
    if (!response.ok) throw new Error(`生成图片下载失败：${response.statusText}`);
    const contentType = String(response.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase();
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (!buffer.length) throw new Error("生成图片内容为空。");
    if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`生成图片超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB。`);
    const ext = imageExtForType(contentType);
    const filename = `${prefix}-${stampForFile()}-${randomSuffix()}.${ext}`;
    const filePath = path.join(GENERATED_NOTES_DIR, filename);
    ensureGeneratedNotesDir();
    fs.writeFileSync(filePath, buffer);
    fs.chmodSync(filePath, 0o600);
    return `/generated-notes/${filename}`;
  }
  throw new Error("生图接口返回的图片格式不支持。");
}

function decodeDataUrlImage(dataUrl) {
  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) throw new Error("图片数据格式无效。");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw new Error("图片数据为空。");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`图片超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB。`);
  return { buffer, ext: imageExtForType(match[1].toLowerCase()) };
}

function imageExtForType(contentType) {
  if (contentType === "image/jpeg" || contentType === "image/jpg") return "jpg";
  if (contentType === "image/webp") return "webp";
  return "png";
}

function randomSuffix() {
  return Math.random().toString(16).slice(2, 10);
}

function buildSystemPrompt(mode) {
  const modeGuide = {
    parsePlan: "重点把用户粘贴的考研计划、目录、课表拆成 dailyTasksDraft、tasksDraft、wrongQuestionsDraft 和 plansDraft。",
    dailyAdvice: "重点基于今日任务、背诵逾期、错题复盘、熟练度、每日容量和科目权重生成 suggestions，不要随意造任务。",
    reflectionSummary: "重点基于完成记录和感想生成 summary、warnings、suggestions，可给少量 reflectionsDraft。"
  }[mode] || "生成考研背书规划建议。";

  return [
    "你是一个考研背书与复习规划助手。必须只输出合法 JSON，不要 Markdown，不要代码块。",
    "输出必须是一个 JSON object，字段固定为：summary, dailyTasksDraft, tasksDraft, wrongQuestionsDraft, plansDraft, reflectionsDraft, warnings, suggestions。",
    "所有日期都使用 YYYY-MM-DD。不要覆盖已有数据；如怀疑重复，把提醒放到 warnings。",
    "科目归类规则：微观、宏观、微观经济学、宏观经济学、西方经济学、专业课计算题、三大本计算题都属于“专业课”，不要写成“数学”。只有高数、线代、概率论等公共数学才写“数学”。",
    "dailyTasksDraft 是每天做什么的任务安排。刷题、听课、阅读、整理、复盘、做卷子、完成单词/词汇/vocab/word 背诵都放这里。item 字段：title, subject, category, date, priority, studyHours, startTime, endTime, linkedPlanId, notes。startTime/endTime 仅在原文包含明确时间段时填写 HH:MM，必须同时出现且 endTime 晚于 startTime；不确定时两者都留空。linkedPlanId 只能填写同日每日计划(day)的真实 id 或本次 plansDraft 中每日计划的临时 id，禁止填写阶段或周计划 id。",
    "tasksDraft 是背诵专区的知识点与复习对象，只放不属于专业背诵手册的非单词背诵，例如政治背诵、其他专业课知识点、默写、复述和记忆任务。item 字段：subject, title, pageRange, startDate, deadline, priority, source, linkedPlanId, notes。",
    "专业背诵手册、手册 Day N、手册 List N 由 appState.manual45 管理，禁止放入 dailyTasksDraft 或 tasksDraft，也不要自行生成复习轮次。只在 summary 或 warnings 中核对用户输入的 Day 与 appState.manual45.currentDay；不一致时明确以看板当前 Day 为准。",
    "单词、词汇、vocab、word、百词斩、墨墨、扇贝、红宝书、恋练有词相关内容即使用户写了“背诵”，也必须放 dailyTasksDraft，不要放 tasksDraft，不要生成复习轮次。",
    "wrongQuestionsDraft 是错题本内容，不是背诵知识点。item 字段：subject, title, source, date, reviewStartDate, priority, knowledgePoints, mistakeReason, questionMarkdown, detailMarkdown, fullMarkdown。",
    "错题 fullMarkdown 可以保留题目复述、知识点、解题思路、逐项判断、最终答案、方法升华；questionMarkdown 只放题干，detailMarkdown 放解析和方法。",
    "plansDraft 必须保持严格层级：phase 的 parentId 为空；week 必须以 phase 为父级；day 必须以 week 为父级。新建多级规划时，每项使用唯一临时 id（如 draft-phase-1、draft-week-1、draft-day-1），子级 parentId 引用父级临时 id。item 字段：id, type(phase|week|day), parentId, parentTitle, title, subject, startDate, endDate, date, goal, priority。周计划最长 7 天，每日计划的 startDate、endDate、date 必须是同一天并位于父周范围内。",
    "reflectionsDraft item 字段：type(daily|task), date, subject, mood, summary, problems, tomorrow, content。",
    "priority 范围 1-5，默认 3。不要把每日执行任务、背诵知识点和错题混到同一个数组；不确定是否为背诵时，优先放 dailyTasksDraft。",
    modeGuide
  ].join("\n");
}

function parseJsonContent(content) {
  if (!content || typeof content !== "string") {
    throw new Error("AI 接口没有返回内容。");
  }

  const candidates = [];
  try {
    return JSON.parse(content);
  } catch (error) {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) candidates.push(fenced[1]);
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) candidates.push(content.slice(start, end + 1));
  }

  let lastError = null;
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      lastError = error;
    }
    try {
      return JSON.parse(repairJsonStringEscapes(candidate));
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(lastError ? `AI 接口返回内容不是可解析的 JSON：${lastError.message}` : "AI 接口返回内容不是可解析的 JSON。");
}

function repairJsonStringEscapes(value) {
  let output = "";
  let inString = false;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (!inString) {
      output += char;
      if (char === '"') inString = true;
      continue;
    }
    if (char === '"') {
      output += char;
      inString = false;
      continue;
    }
    if (char === "\\") {
      const next = value[index + 1] || "";
      const afterNext = value[index + 2] || "";
      const unicode = next === "u" && /^[0-9a-fA-F]{4}$/u.test(value.slice(index + 2, index + 6));
      const simpleEscape = '"\\/bfnrt'.includes(next);
      const likelyLatexCommand = /^[A-Za-z]$/u.test(next) && /^[A-Za-z]$/u.test(afterNext);
      if (unicode || (simpleEscape && !likelyLatexCommand)) {
        output += char + next;
        index += 1;
      } else {
        output += "\\\\";
      }
      continue;
    }
    if (char.charCodeAt(0) < 0x20) {
      output += char === "\n" ? "\\n" : char === "\r" ? "\\r" : char === "\t" ? "\\t" : "\\b";
      continue;
    }
    output += char;
  }
  return output;
}

function normalizeDraft(draft) {
  const source = draft && typeof draft === "object" ? draft : {};
  return {
    summary: stringValue(source.summary),
    dailyTasksDraft: Array.isArray(source.dailyTasksDraft) ? source.dailyTasksDraft : [],
    tasksDraft: Array.isArray(source.tasksDraft) ? source.tasksDraft : [],
    wrongQuestionsDraft: Array.isArray(source.wrongQuestionsDraft) ? source.wrongQuestionsDraft : [],
    plansDraft: Array.isArray(source.plansDraft) ? source.plansDraft : [],
    reflectionsDraft: Array.isArray(source.reflectionsDraft) ? source.reflectionsDraft : [],
    warnings: Array.isArray(source.warnings) ? source.warnings.map(String) : [],
    suggestions: Array.isArray(source.suggestions) ? source.suggestions.map(String) : []
  };
}

function createId(prefix) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${ts}-${rand}`;
}

function buildServerLocalContext() {
  const now = new Date();
  const today = shanghaiStudyDayKey(now);
  const yesterday = shanghaiStudyDayKey(new Date(now.getTime() - 86400000));
  const tomorrow = shanghaiStudyDayKey(new Date(now.getTime() + 86400000));
  const dayAfterTomorrow = shanghaiStudyDayKey(new Date(now.getTime() + 2 * 86400000));
  const nextWeek = shanghaiStudyDayKey(new Date(now.getTime() + 7 * 86400000));
  return {
    today,
    yesterday,
    tomorrow,
    dayAfterTomorrow,
    nextWeek,
    timeZone: "Asia/Shanghai",
    utcOffsetMinutes: 480,
    studyDayCutoff: "04:00",
    currentTime: now.toISOString()
  };
}

function calculateTaskMinutes(item, estimatedMinutes) {
  if (Number.isFinite(Number(item.studyMinutes)) && Number(item.studyMinutes) > 0) {
    return Number(item.studyMinutes);
  }
  if (Number.isFinite(Number(item.durationMinutes)) && Number(item.durationMinutes) > 0) {
    return Number(item.durationMinutes);
  }
  if (item.startTime && item.endTime && /^\d{1,2}:\d{2}$/.test(item.startTime) && /^\d{1,2}:\d{2}$/.test(item.endTime)) {
    const [sh, sm] = item.startTime.split(":").map(Number);
    const [eh, em] = item.endTime.split(":").map(Number);
    const diff = (eh * 60 + em) - (sh * 60 + sm);
    if (diff > 0 && diff <= 720) return diff;
  }
  if (estimatedMinutes && estimatedMinutes > 0) {
    return estimatedMinutes;
  }
  return 60;
}

function serverDailyTaskFromDraft(item, fallbackDate, markAsDone = false) {
  if (!item || typeof item !== "object") return null;
  const draftDate = isServerDateKey(item.date)
    ? item.date
    : isServerDateKey(item.startDate)
      ? item.startDate
      : fallbackDate;
  const priorityNum = Number(item.priority);
  const priority = Number.isFinite(priorityNum) ? Math.min(5, Math.max(1, Math.round(priorityNum))) : 3;

  let estimatedMinutes = Number.isFinite(Number(item.estimatedMinutes)) ? Number(item.estimatedMinutes) : null;
  if (!estimatedMinutes && Number.isFinite(Number(item.studyHours))) {
    estimatedMinutes = Math.round(Number(item.studyHours) * 60);
  }

  const calculatedMinutes = calculateTaskMinutes(item, estimatedMinutes);
  const status = markAsDone ? "done" : "planned";
  const nowIso = new Date().toISOString();

  return {
    id: createId("daily"),
    title: String(item.title || item.name || "").trim().slice(0, 300),
    subject: String(item.subject || "").trim().slice(0, 80),
    category: String(item.category || item.typeLabel || "学习").trim().slice(0, 80),
    date: draftDate,
    status,
    priority,
    studyMinutes: markAsDone ? calculatedMinutes : (Number(item.studyMinutes) || 0),
    estimatedMinutes,
    startTime: String(item.startTime || "").trim().slice(0, 10),
    endTime: String(item.endTime || "").trim().slice(0, 10),
    origin: "ai",
    linkedPlanId: String(item.linkedPlanId || "").trim().slice(0, 180),
    notes: String(item.notes || item.goal || "").trim().slice(0, 1000),
    createdAt: nowIso,
    ...(markAsDone ? { completedAt: nowIso } : {})
  };
}

function serverTaskFromDraft(item, fallbackDate) {
  if (!item || typeof item !== "object") return null;
  const startDate = isServerDateKey(item.startDate)
    ? item.startDate
    : isServerDateKey(item.date)
      ? item.date
      : fallbackDate;
  const deadline = isServerDateKey(item.deadline) ? item.deadline : "";
  const priorityNum = Number(item.priority);
  const priority = Number.isFinite(priorityNum) ? Math.min(5, Math.max(1, Math.round(priorityNum))) : 3;

  return {
    id: createId("task"),
    subject: String(item.subject || "").trim().slice(0, 80),
    title: String(item.title || item.name || "").trim().slice(0, 300),
    pageRange: String(item.pageRange || item.pages || "").trim().slice(0, 80),
    startDate,
    deadline,
    priority,
    status: "active",
    source: String(item.source || "").trim().slice(0, 200),
    linkedPlanId: String(item.linkedPlanId || "").trim().slice(0, 180),
    notes: String(item.notes || "").trim().slice(0, 1000),
    origin: "ai",
    createdAt: new Date().toISOString(),
    reviews: []
  };
}

function serverWrongQuestionFromDraft(item, fallbackDate) {
  if (!item || typeof item !== "object") return null;
  const date = isServerDateKey(item.date) ? item.date : fallbackDate;
  const reviewStartDate = isServerDateKey(item.reviewStartDate) ? item.reviewStartDate : date;
  const priorityNum = Number(item.priority);
  const priority = Number.isFinite(priorityNum) ? Math.min(5, Math.max(1, Math.round(priorityNum))) : 3;
  const knowledgePoints = Array.isArray(item.knowledgePoints)
    ? item.knowledgePoints.map((kp) => String(kp || "").trim().slice(0, 100)).filter(Boolean)
    : [];

  return {
    id: createId("wrong"),
    title: String(item.title || "").trim().slice(0, 300),
    subject: String(item.subject || "").trim().slice(0, 80),
    source: String(item.source || "").trim().slice(0, 200),
    date,
    reviewStartDate,
    status: "active",
    priority,
    knowledgePoints,
    mistakeReason: String(item.mistakeReason || "").trim().slice(0, 500),
    questionMarkdown: String(item.questionMarkdown || "").trim().slice(0, 5000),
    detailMarkdown: String(item.detailMarkdown || "").trim().slice(0, 5000),
    fullMarkdown: String(item.fullMarkdown || "").trim().slice(0, 8000),
    origin: "ai",
    createdAt: new Date().toISOString(),
    reviews: []
  };
}

function serverReflectionFromDraft(item, fallbackDate) {
  if (!item || typeof item !== "object") return null;
  const date = isServerDateKey(item.date) ? item.date : fallbackDate;
  return {
    id: createId("reflection"),
    title: String(item.title || "").trim().slice(0, 300),
    content: String(item.content || item.body || item.summary || "").trim().slice(0, 3000),
    subject: String(item.subject || "").trim().slice(0, 80),
    mood: String(item.mood || "").trim().slice(0, 80),
    summary: String(item.summary || "").trim().slice(0, 1000),
    problems: String(item.problems || "").trim().slice(0, 1000),
    tomorrow: String(item.tomorrow || "").trim().slice(0, 1000),
    date,
    origin: "ai",
    createdAt: new Date().toISOString()
  };
}

function serverPlansFromDraft(items, existingPlans = [], fallbackDate) {
  const source = (Array.isArray(items) ? items : []).filter((item) => item && typeof item === "object");
  const created = [];
  const referenceMap = new Map();
  let skipped = 0;

  const findPlan = (id) => created.find((p) => p.id === id) || existingPlans.find((p) => p.id === id);

  ["phase", "week", "day"].forEach((type) => {
    source.filter((item) => (item.type || "week") === type).forEach((item) => {
      let parent = null;
      if (type !== "phase") {
        const refParentId = String(item.parentId || "").trim();
        const mappedParentId = referenceMap.get(refParentId) || refParentId;
        parent = findPlan(mappedParentId);
        if (!parent && item.parentTitle) {
          const pTitle = String(item.parentTitle).trim();
          parent = [...existingPlans, ...created].find((p) => p.title === pTitle && p.type === (type === "week" ? "phase" : "week"));
        }
      }

      const rawStart = item.startDate || item.date;
      const startDate = isServerDateKey(rawStart) ? rawStart : parent ? parent.startDate : fallbackDate;
      const rawEnd = item.endDate || item.date;
      const endDate = isServerDateKey(rawEnd) ? rawEnd : startDate;
      const id = createId("plan");

      const priorityNum = Number(item.priority);
      const priority = Number.isFinite(priorityNum) ? Math.min(5, Math.max(1, Math.round(priorityNum))) : 3;

      const plan = {
        id,
        type,
        parentId: parent ? parent.id : "",
        title: String(item.title || item.name || "").trim().slice(0, 300),
        subject: String(item.subject || "").trim().slice(0, 80),
        startDate,
        endDate,
        date: type === "day" ? startDate : "",
        goal: String(item.goal || item.notes || "").trim().slice(0, 1000),
        status: "planned",
        priority,
        origin: "ai",
        createdAt: new Date().toISOString(),
        linkedTaskIds: []
      };

      created.push(plan);
      const sourceId = String(item.id || item.ref || "").trim();
      if (sourceId) referenceMap.set(sourceId, id);
    });
  });

  return { plans: created, referenceMap, skipped };
}

async function handleParsePlanAndImport(req, res) {
  if (!getAiProviders().length) {
    sendJson(res, 400, {
      error: "未配置 API key。请先配置 AI API key 后再使用任务导入。"
    });
    return;
  }

  const body = await readJsonBody(req);
  const userText = String(body.userText || "").trim();
  if (!userText) {
    sendJson(res, 400, { error: "userText 不能为空。" });
    return;
  }

  const state = readStateFile();
  if (!state) {
    sendJson(res, 500, { error: "无法读取学习数据。" });
    return;
  }

  const localContext = buildServerLocalContext();
  const fallbackDate = localContext.today;

  const appState = compactAiAppState({
    dailyTasks: Array.isArray(state.dailyTasks) ? state.dailyTasks : [],
    tasks: Array.isArray(state.tasks) ? state.tasks : [],
    wrongQuestions: Array.isArray(state.wrongQuestions) ? state.wrongQuestions : [],
    plans: Array.isArray(state.plans) ? state.plans : [],
    reflections: Array.isArray(state.reflections) ? state.reflections : [],
    profile: state.profile || {},
    localContext
  }, "parsePlan");

  let aiPayload;
  try {
    aiPayload = await callDeepSeek("parsePlan", userText, appState);
  } catch (err) {
    console.error("[parse-plan-and-import] AI 调用异常：", err);
    sendJson(res, 502, { error: `AI 解析失败：${err.message || String(err)}` });
    return;
  }

  const draft = normalizeDraft(aiPayload);
  const importedCounts = {
    dailyTasks: 0,
    tasks: 0,
    wrongQuestions: 0,
    plans: 0,
    reflections: 0
  };

  // 1. 处理 plans
  const existingPlans = Array.isArray(state.plans) ? state.plans : [];
  const { plans, referenceMap } = serverPlansFromDraft(draft.plansDraft, existingPlans, fallbackDate);
  if (plans.length > 0) {
    if (!Array.isArray(state.plans)) state.plans = [];
    state.plans.push(...plans);
    importedCounts.plans = plans.length;
  }

  // 2. 映射 dailyTasksDraft 和 tasksDraft 中的 linkedPlanId
  if (referenceMap && referenceMap.size > 0) {
    ["dailyTasksDraft", "tasksDraft"].forEach((key) => {
      if (Array.isArray(draft[key])) {
        draft[key].forEach((item) => {
          if (item && item.linkedPlanId && referenceMap.has(item.linkedPlanId)) {
            item.linkedPlanId = referenceMap.get(item.linkedPlanId);
          }
        });
      }
    });
  }

  // 3. 处理 dailyTasks
  const shanghaiParts = DailyTaskAutoComplete.shanghaiDateTimeParts(new Date());
  const todayDate = shanghaiParts.date;

  const dailyTasks = draft.dailyTasksDraft
    .map((item) => {
      const itemDate = isServerDateKey(item.date)
        ? item.date
        : isServerDateKey(item.startDate)
          ? item.startDate
          : fallbackDate;
      let itemMarkAsDone;
      if (typeof body.markAsDone === "boolean") {
        itemMarkAsDone = body.markAsDone;
      } else if (itemDate < todayDate) {
        itemMarkAsDone = true; // 补记昨天或更早的任务，默认为已完成
      } else if (itemDate > todayDate) {
        itemMarkAsDone = false; // 明天或未来的任务，默认为待办计划
      } else {
        itemMarkAsDone = (shanghaiParts.hour >= 12); // 当日任务按12点规则
      }
      return serverDailyTaskFromDraft(item, fallbackDate, itemMarkAsDone);
    })
    .filter(Boolean);
  if (dailyTasks.length > 0) {
    if (!Array.isArray(state.dailyTasks)) state.dailyTasks = [];
    state.dailyTasks.push(...dailyTasks);
    importedCounts.dailyTasks = dailyTasks.length;
  }

  // 4. 处理 tasks (背诵知识点)
  const tasks = draft.tasksDraft
    .map((item) => serverTaskFromDraft(item, fallbackDate))
    .filter(Boolean);
  if (tasks.length > 0) {
    if (!Array.isArray(state.tasks)) state.tasks = [];
    state.tasks.push(...tasks);
    importedCounts.tasks = tasks.length;
  }

  // 5. 处理 wrongQuestions
  const wrongQuestions = draft.wrongQuestionsDraft
    .map((item) => serverWrongQuestionFromDraft(item, fallbackDate))
    .filter(Boolean);
  if (wrongQuestions.length > 0) {
    if (!Array.isArray(state.wrongQuestions)) state.wrongQuestions = [];
    state.wrongQuestions.push(...wrongQuestions);
    importedCounts.wrongQuestions = wrongQuestions.length;
  }

  // 6. 处理 reflections
  const reflections = draft.reflectionsDraft
    .map((item) => serverReflectionFromDraft(item, fallbackDate))
    .filter(Boolean);
  if (reflections.length > 0) {
    if (!Array.isArray(state.reflections)) state.reflections = [];
    state.reflections.push(...reflections);
    importedCounts.reflections = reflections.length;
  }

  // 7. 保存 state
  const saved = writeStateFile(state);

  const allCompleted = dailyTasks.length > 0 && dailyTasks.every((t) => t.status === "done");
  const anyCompleted = dailyTasks.some((t) => t.status === "done");
  const defaultMarkAsDone = typeof body.markAsDone === "boolean" ? body.markAsDone : (shanghaiParts.hour >= 12);
  const markAsDone = dailyTasks.length > 0 ? anyCompleted : defaultMarkAsDone;
  const completionStatus = allCompleted ? "done" : anyCompleted ? "mixed" : "planned";

  sendJson(res, 200, {
    ok: true,
    summary: draft.summary || "",
    importedCounts,
    markAsDone,
    completionStatus,
    warnings: draft.warnings || [],
    suggestions: draft.suggestions || [],
    updatedAt: saved.updatedAt
  });
}

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("请求体过大。"));
        req.destroy();
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    req.on("end", () => {
      try {
        const body = chunks.length ? Buffer.concat(chunks, size).toString("utf8") : "";
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(new Error("请求 JSON 格式无效。"));
      }
    });

    req.on("error", reject);
  });
}

function requireWriteAccess(req, res) {
  if (!ACCESS_TOKEN) {
    sendJson(res, 401, { error: "只读模式：服务端尚未配置 ACCESS_TOKEN。" });
    return false;
  }

  const deviceId = normalizeDeviceId(req.headers["x-study-device"]);
  if (deviceId && isTrustedDevice(req, deviceId)) return true;

  const token = String(req.headers["x-study-token"] || "").trim();
  if (token && token === ACCESS_TOKEN) return true;

  sendJson(res, 401, { error: "只读模式：请输入正确 token 后再操作。" });
  return false;
}

function hasReadAccess(req) {
  if (!ACCESS_TOKEN) return false;
  const deviceId = normalizeDeviceId(req.headers["x-study-device"]);
  if (deviceId && isTrustedDevice(req, deviceId)) return true;
  const token = String(req.headers["x-study-token"] || "").trim();
  return Boolean(token && token === ACCESS_TOKEN);
}

function redactPrivateState(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const profile = value.profile && typeof value.profile === "object" && !Array.isArray(value.profile)
    ? { ...value.profile, targetSchool: "", targetMajor: "", examDate: "" }
    : value.profile;
  if (profile && typeof profile === "object") {
    delete profile.capacityOverrides;
    delete profile.restDays;
    delete profile.durationDefaults;
  }
  return {
    version: value.version,
    profile,
    studyRoutine: value.studyRoutine,
    manual45Progress: value.manual45Progress,
    manual45Content: normalizeManual45ContentState(value.manual45Content),
    dailyTasks: value.dailyTasks,
    tasks: value.tasks,
    wrongQuestions: value.wrongQuestions,
    englishReading: value.englishReading,
    mathFormulaLibrary: value.mathFormulaLibrary,
    migrations: value.migrations,
    adjustmentRuns: [],
    plans: [],
    reflections: [],
    reports: []
  };
}

function compactStateForResponse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const manual45Content = value.manual45Content;
  if (!manual45Content || typeof manual45Content !== "object" || Array.isArray(manual45Content) || !manual45Content.package) {
    return value;
  }
  const { package: _package, ...manual45Metadata } = manual45Content;
  return { ...value, manual45Content: manual45Metadata };
}

function normalizeDeviceId(value) {
  const text = String(value || "").trim();
  if (!/^[A-Za-z0-9._:-]{16,120}$/.test(text)) return "";
  return text;
}

function readTrustedDevices() {
  if (!fs.existsSync(TRUSTED_DEVICES_PATH)) return { version: 1, devices: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(TRUSTED_DEVICES_PATH, "utf8"));
    return parsed && typeof parsed === "object" && parsed.devices && typeof parsed.devices === "object"
      ? { version: 1, devices: parsed.devices }
      : { version: 1, devices: {} };
  } catch (error) {
    console.error("读取受信设备失败，将使用空列表。", error);
    return { version: 1, devices: {} };
  }
}

function writeTrustedDevices(value) {
  ensureDataDirs();
  fs.writeFileSync(TRUSTED_DEVICES_PATH, JSON.stringify(value, null, 2), "utf8");
  fs.chmodSync(TRUSTED_DEVICES_PATH, 0o600);
}

function trustDevice(req, deviceId, deviceInfo) {
  const store = readTrustedDevices();
  const existing = store.devices[deviceId] || {};
  const now = new Date().toISOString();
  const info = deviceInfo && typeof deviceInfo === "object" ? deviceInfo : {};
  const device = {
    id: deviceId,
    createdAt: existing.createdAt || now,
    lastSeenAt: now,
    userAgent: String(req.headers["user-agent"] || ""),
    ip: clientIp(req),
    timeZone: stringValue(info.timeZone),
    language: stringValue(info.language),
    platform: stringValue(info.platform),
    screen: stringValue(info.screen)
  };
  store.devices[deviceId] = device;
  pruneTrustedDevices(store);
  writeTrustedDevices(store);
  return device;
}

function isTrustedDevice(req, deviceId) {
  const store = readTrustedDevices();
  const device = store.devices[deviceId];
  if (!device) return false;
  device.lastSeenAt = new Date().toISOString();
  device.userAgent = String(req.headers["user-agent"] || device.userAgent || "");
  device.ip = clientIp(req);
  store.devices[deviceId] = device;
  writeTrustedDevices(store);
  return true;
}

function pruneTrustedDevices(store) {
  const entries = Object.values(store.devices)
    .filter((device) => device && device.id)
    .sort((a, b) => String(b.lastSeenAt || "").localeCompare(String(a.lastSeenAt || "")));
  store.devices = Object.fromEntries(entries.slice(0, MAX_TRUSTED_DEVICES).map((device) => [device.id, device]));
}

function publicDevice(device) {
  return {
    id: device.id,
    createdAt: device.createdAt,
    lastSeenAt: device.lastSeenAt,
    timeZone: device.timeZone,
    platform: device.platform
  };
}

function clientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "";
}

function readStateFile() {
  if (!fs.existsSync(STATE_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch (error) {
    backupBrokenStateFile(error);
    return null;
  }
}

function normalizeManual45Progress(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const completedDays = {};
  const entries = source.completedDays && typeof source.completedDays === "object" && !Array.isArray(source.completedDays)
    ? Object.entries(source.completedDays)
    : [];
  entries.forEach(([dayValue, date]) => {
    const day = Number(dayValue);
    if (Number.isInteger(day) && day >= 1 && day <= MANUAL45_TOTAL_DAYS && isServerDateKey(date)) {
      completedDays[String(day)] = date;
    }
  });
  const restDates = Array.from(new Set((Array.isArray(source.restDates) ? source.restDates : []).filter(isServerDateKey))).sort();
  return {
    completedDays,
    restDates,
    revision: Math.max(0, Number.isInteger(Number(source.revision)) ? Number(source.revision) : 0),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : ""
  };
}

function normalizeManual45ContentState(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const normalized = Manual45ContentCore.normalizeState(source);
  return {
    ...(source.package ? { package: normalized.package } : {}),
    packageId: String(source.packageId || normalized.package.packageId || "local-manual").trim(),
    sourceHash: String(source.sourceHash || normalized.package.sourceHash || "").trim(),
    bindings: normalized.bindings,
    progress: normalized.progress,
    revisions: normalized.revisions,
    memorized: normalized.memorized,
    recitationReviews: normalized.recitationReviews,
    study: normalized.study,
    issueReports: normalized.issueReports,
    revision: normalized.revision,
    updatedAt: normalized.updatedAt
  };
}

function manual45CompletedDayEntries(progress) {
  return Object.entries(progress.completedDays)
    .map(([day, date]) => [Number(day), date])
    .filter(([day]) => Number.isInteger(day) && day >= 1 && day <= MANUAL45_TOTAL_DAYS)
    .sort((a, b) => a[0] - b[0]);
}

function manual45ContinuousCompletedCount(progress) {
  let count = 0;
  for (let day = 1; day <= MANUAL45_TOTAL_DAYS; day += 1) {
    if (!progress.completedDays[String(day)]) break;
    count = day;
  }
  return count;
}

function manual45CurrentDay(progress) {
  return Math.min(MANUAL45_TOTAL_DAYS + 1, manual45ContinuousCompletedCount(progress) + 1);
}

function isServerDateKey(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function shanghaiStudyDayKey(now = new Date()) {
  const shifted = new Date(now.getTime() + (8 - 4) * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function runAutomaticDailyTaskCompletion(now = new Date()) {
  const time = DailyTaskAutoComplete.shanghaiDateTimeParts(now);
  if (time.hour < DailyTaskAutoComplete.AUTOMATIC_COMPLETION_HOUR) {
    return { date: time.date, completedCount: 0, taskIds: [] };
  }
  const state = readStateFile();
  if (!state) return { date: time.date, completedCount: 0, taskIds: [] };
  const result = DailyTaskAutoComplete.completeDailyTasksForDate(state, time.date);
  if (!result.completedCount) return result;
  const saved = writeStateFile(state);
  console.log(`[自动收尾] ${result.date} 自动完成 ${result.completedCount} 个每日任务，按预估时长记录；${saved.updatedAt}`);
  return { ...result, updatedAt: saved.updatedAt };
}

function scheduleAutomaticDailyTaskCompletion() {
  if (automaticDailyTaskCompletionTimer) clearTimeout(automaticDailyTaskCompletionTimer);
  const delay = Math.max(1000, DailyTaskAutoComplete.nextAutomaticCompletionAt().getTime() - Date.now() + 100);
  automaticDailyTaskCompletionTimer = setTimeout(() => {
    try {
      runAutomaticDailyTaskCompletion();
    } catch (error) {
      console.error("每日任务自动收尾失败：", error);
    } finally {
      scheduleAutomaticDailyTaskCompletion();
    }
  }, delay);
}

function handleCompleteTodayTasks(res) {
  const time = DailyTaskAutoComplete.shanghaiDateTimeParts(new Date());
  const state = readStateFile();
  if (!state) {
    sendJson(res, 500, { error: "无法读取学习数据。" });
    return;
  }
  const result = DailyTaskAutoComplete.completeDailyTasksForDate(state, time.date);
  if (result.completedCount > 0) {
    const saved = writeStateFile(state);
    console.log(`[手动完成] ${result.date} 完成 ${result.completedCount} 个每日任务，按预估时长记录；${saved.updatedAt}`);
    sendJson(res, 200, { ok: true, ...result, updatedAt: saved.updatedAt });
  } else {
    sendJson(res, 200, { ok: true, ...result, message: "今日没有待完成的任务。" });
  }
}

function handleTodaySummary(res, url) {
  const time = DailyTaskAutoComplete.shanghaiDateTimeParts(new Date());
  let targetDate = time.date;
  if (url && url.searchParams) {
    const queryDate = String(url.searchParams.get("date") || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
      targetDate = queryDate;
    } else if (queryDate === "yesterday" || queryDate === "昨天") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      targetDate = DailyTaskAutoComplete.shanghaiDateTimeParts(d).date;
    } else if (queryDate === "tomorrow" || queryDate === "明天") {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      targetDate = DailyTaskAutoComplete.shanghaiDateTimeParts(d).date;
    }
  }
  const state = readStateFile();
  if (!state) {
    sendJson(res, 500, { error: "无法读取学习数据。" });
    return;
  }
  const allTasks = Array.isArray(state.dailyTasks) ? state.dailyTasks : [];
  const targetTasks = allTasks.filter((t) => t && t.date === targetDate);
  const doneTasks = targetTasks.filter((t) => t.status === "done");
  const totalMinutes = doneTasks.reduce((sum, t) => sum + (Number(t.studyMinutes) || 0), 0);
  const tasks = targetTasks.map((t) => ({
    id: String(t.id || ""),
    title: String(t.title || ""),
    subject: String(t.subject || ""),
    status: t.status || "planned",
    startTime: String(t.startTime || ""),
    endTime: String(t.endTime || ""),
    studyMinutes: Number(t.studyMinutes) || 0,
    estimatedMinutes: Number(t.estimatedMinutes) || 0
  }));
  sendJson(res, 200, {
    ok: true,
    date: targetDate,
    isToday: targetDate === time.date,
    totalCount: targetTasks.length,
    completedCount: doneTasks.length,
    totalMinutes,
    tasks
  });
}

function writeStateFile(state, options = {}) {
  ensureDataDirs();
  backupStateFile();
  const existingState = readStateFile();
  const mergedState = preserveServerOwnedState(
    existingState,
    preserveOriginalWrongQuestionTemplates(existingState, state),
    Boolean(options.allowManual45Update)
  );
  const payload = {
    ...mergedState,
    version: mergedState.version || 2,
    updatedAt: new Date().toISOString()
  };
  const tempPath = `${STATE_PATH}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf8");
  fs.renameSync(tempPath, STATE_PATH);
  fs.chmodSync(STATE_PATH, 0o600);
  pruneStateBackups();
  return payload;
}

function preserveServerOwnedState(existingState, incomingState, allowManual45Update = false) {
  if (!incomingState || typeof incomingState !== "object" || Array.isArray(incomingState)) return incomingState;
  const hasExistingProgress = Boolean(existingState && existingState.manual45Progress && typeof existingState.manual45Progress === "object");
  const existing = normalizeManual45Progress(existingState && existingState.manual45Progress);
  const incoming = normalizeManual45Progress(incomingState.manual45Progress);
  const hasExistingContent = Boolean(existingState && existingState.manual45Content && typeof existingState.manual45Content === "object");
  const hasIncomingContent = Boolean(incomingState.manual45Content && typeof incomingState.manual45Content === "object");
  const existingContent = hasExistingContent ? normalizeManual45ContentState(existingState.manual45Content) : null;
  const incomingContent = hasIncomingContent ? normalizeManual45ContentState(incomingState.manual45Content) : null;
  const manual45Content = !incomingContent
    ? existingContent || normalizeManual45ContentState(null)
    : existingContent && existingContent.package && !incomingContent.package
      ? { ...incomingContent, package: existingContent.package }
      : incomingContent;
  return {
    ...incomingState,
    manual45Progress: hasExistingProgress && !allowManual45Update ? existing : incoming,
    manual45Content
  };
}

function preserveRedactedPrivateState(existingState, incomingState, privateStateLoaded) {
  if (privateStateLoaded || !existingState || !incomingState || typeof incomingState !== "object") return incomingState;

  const existingProfile = existingState.profile && typeof existingState.profile === "object" ? existingState.profile : {};
  const incomingProfile = incomingState.profile && typeof incomingState.profile === "object" ? incomingState.profile : {};
  const existingHasPrivateState = Boolean(
    existingProfile.targetSchool || existingProfile.targetMajor || existingProfile.examDate
    || Object.keys(existingProfile.capacityOverrides || {}).length
    || Object.keys(existingProfile.restDays || {}).length
    || (Array.isArray(existingState.plans) && existingState.plans.length)
    || (Array.isArray(existingState.reflections) && existingState.reflections.length)
    || (Array.isArray(existingState.reports) && existingState.reports.length)
    || (Array.isArray(existingState.adjustmentRuns) && existingState.adjustmentRuns.length)
  );
  if (!existingHasPrivateState) return incomingState;

  const incomingLooksRedacted = Boolean(
    (existingProfile.targetSchool && !incomingProfile.targetSchool)
    || (existingProfile.targetMajor && !incomingProfile.targetMajor)
    || (existingProfile.examDate && !incomingProfile.examDate)
    || (Object.keys(existingProfile.capacityOverrides || {}).length && !Object.keys(incomingProfile.capacityOverrides || {}).length)
    || (Object.keys(existingProfile.restDays || {}).length && !Object.keys(incomingProfile.restDays || {}).length)
    || (Array.isArray(existingState.plans) && existingState.plans.length && Array.isArray(incomingState.plans) && !incomingState.plans.length)
    || (Array.isArray(existingState.reflections) && existingState.reflections.length && Array.isArray(incomingState.reflections) && !incomingState.reflections.length)
    || (Array.isArray(existingState.reports) && existingState.reports.length && Array.isArray(incomingState.reports) && !incomingState.reports.length)
    || (Array.isArray(existingState.adjustmentRuns) && existingState.adjustmentRuns.length && Array.isArray(incomingState.adjustmentRuns) && !incomingState.adjustmentRuns.length)
  );
  if (!incomingLooksRedacted) return incomingState;

  const profile = { ...incomingProfile };
  ["targetSchool", "targetMajor", "examDate", "capacityOverrides", "restDays", "durationDefaults"].forEach((key) => {
    const existingValue = existingProfile[key];
    const incomingValue = incomingProfile[key];
    const incomingEmptyObject = incomingValue && typeof incomingValue === "object" && !Array.isArray(incomingValue) && !Object.keys(incomingValue).length;
    if (existingValue && ((key === "durationDefaults" && incomingLooksRedacted) || !incomingValue || incomingEmptyObject)) profile[key] = existingValue;
  });

  const preserved = { ...incomingState, profile };
  ["plans", "reflections", "reports", "adjustmentRuns"].forEach((key) => {
    if (Array.isArray(existingState[key]) && existingState[key].length && Array.isArray(incomingState[key]) && !incomingState[key].length) preserved[key] = existingState[key];
  });
  return preserved;
}

function preserveOriginalWrongQuestionTemplates(existingState, incomingState) {
  if (!existingState || !Array.isArray(existingState.wrongQuestions) || !Array.isArray(incomingState && incomingState.wrongQuestions)) return incomingState;
  const existingById = new Map(existingState.wrongQuestions.map((question) => [question && question.id, question]));
  return {
    ...incomingState,
    wrongQuestions: incomingState.wrongQuestions.map((question) => {
      const existing = existingById.get(question && question.id);
      if (!existing || !existing.originalTemplate || question.originalTemplate) return question;
      return {
        ...question,
        originalTemplate: existing.originalTemplate,
        fullMarkdown: existing.fullMarkdown || question.fullMarkdown,
        detailMarkdown: existing.detailMarkdown || question.detailMarkdown,
        notePrompt: existing.notePrompt || question.notePrompt
      };
    })
  };
}

function ensureDataDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(STATE_BACKUP_DIR, { recursive: true });
  fs.chmodSync(DATA_DIR, 0o700);
  fs.chmodSync(STATE_BACKUP_DIR, 0o700);
}

function ensureGeneratedNotesDir() {
  ensureDataDirs();
  fs.mkdirSync(GENERATED_NOTES_DIR, { recursive: true });
  fs.chmodSync(GENERATED_NOTES_DIR, 0o700);
}

function backupStateFile() {
  if (!fs.existsSync(STATE_PATH)) return;
  ensureDataDirs();
  const backupPath = path.join(STATE_BACKUP_DIR, `state-${stampForFile()}-${randomSuffix()}.json`);
  fs.copyFileSync(STATE_PATH, backupPath);
  fs.chmodSync(backupPath, 0o600);
}

function backupBrokenStateFile(error) {
  try {
    ensureDataDirs();
    const backupPath = path.join(STATE_BACKUP_DIR, `state-broken-${stampForFile()}.json`);
    fs.copyFileSync(STATE_PATH, backupPath);
    fs.chmodSync(backupPath, 0o600);
    console.error(`学习数据解析失败，已备份损坏文件：${backupPath}`, error);
  } catch (backupError) {
    console.error("学习数据解析失败，且损坏文件备份失败。", backupError);
  }
}

function pruneStateBackups() {
  const files = fs.readdirSync(STATE_BACKUP_DIR)
    .filter((name) => /^state-.*\.json$/.test(name))
    .map((name) => ({ name, path: path.join(STATE_BACKUP_DIR, name), mtime: fs.statSync(path.join(STATE_BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  files.slice(MAX_STATE_BACKUPS).forEach((file) => {
    try {
      fs.unlinkSync(file.path);
    } catch (error) {
      console.error(`清理旧备份失败：${file.path}`, error);
    }
  });
}

function countStateBackups() {
  if (!fs.existsSync(STATE_BACKUP_DIR)) return 0;
  return fs.readdirSync(STATE_BACKUP_DIR).filter((name) => /^state-.*\.json$/.test(name)).length;
}

function listStateBackups(limit) {
  if (!fs.existsSync(STATE_BACKUP_DIR)) return [];
  return fs.readdirSync(STATE_BACKUP_DIR)
    .filter((name) => /^state-[A-Za-z0-9._-]+\.json$/.test(name))
    .map((name) => {
      const filePath = path.join(STATE_BACKUP_DIR, name);
      const stat = fs.statSync(filePath);
      let summary = {};
      try {
        const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
        summary = {
          updatedAt: String(value.updatedAt || stat.mtime.toISOString()),
          dailyTasks: Array.isArray(value.dailyTasks) ? value.dailyTasks.length : 0,
          tasks: Array.isArray(value.tasks) ? value.tasks.length : 0,
          wrongQuestions: Array.isArray(value.wrongQuestions) ? value.wrongQuestions.length : 0,
          plans: Array.isArray(value.plans) ? value.plans.length : 0,
          reflections: Array.isArray(value.reflections) ? value.reflections.length : 0
        };
      } catch (error) {
        summary = { invalid: true, updatedAt: stat.mtime.toISOString() };
      }
      return { name, size: stat.size, createdAt: stat.mtime.toISOString(), ...summary };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

function fileUpdatedAt(filePath) {
  if (!fs.existsSync(filePath)) return "";
  return fs.statSync(filePath).mtime.toISOString();
}

function stampForFile() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function serveStatic(req, res, pathname) {
  const cleanPath = pathname === "/" ? "/index.html" : pathname;
  const decoded = decodeURIComponent(cleanPath);
  let filePath = path.normalize(path.join(ROOT, decoded));

  if (decoded === "/manual45-content/content.json" && !fs.existsSync(filePath)) {
    filePath = path.join(ROOT, "examples", "manual45-content", "content.json");
  }

  if (!filePath.startsWith(ROOT) || decoded === "/data" || decoded.startsWith("/data/") || path.basename(filePath).startsWith(".") || path.basename(filePath) === "server.js") {
    sendText(res, 404, "Not Found", "text/plain; charset=utf-8");
    return;
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not Found", "text/plain; charset=utf-8");
    return;
  }

  const stat = fs.statSync(filePath);
  const contentType = contentTypeFor(filePath);
  const etag = `\"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}\"`;
  const cacheControl = decoded === "/index.html"
    ? "public, max-age=60, must-revalidate"
    : decoded === "/manual45-content/content.json"
      ? "public, max-age=86400, must-revalidate"
    : decoded === "/vendor/mathjax/tex-svg.js"
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300, must-revalidate";
  const cacheHeaders = {
    "Content-Type": contentType,
    "Cache-Control": cacheControl,
    "ETag": etag,
    "Last-Modified": stat.mtime.toUTCString()
  };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, cacheHeaders);
    res.end();
    return;
  }
  res.writeHead(200, cacheHeaders);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function serveGeneratedNote(req, res, pathname) {
  const filePath = generatedNotePathFromUrl(pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not Found", "text/plain; charset=utf-8");
    return;
  }

  const contentType = contentTypeFor(filePath);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "private, no-store"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function generatedNotePathFromUrl(publicUrl) {
  const text = String(publicUrl || "").trim();
  if (!text.startsWith("/generated-notes/")) return "";
  const name = decodeURIComponent(text.slice("/generated-notes/".length));
  if (!/^[A-Za-z0-9._-]+\.(png|jpg|jpeg|webp)$/i.test(name)) return "";
  const filePath = path.normalize(path.join(GENERATED_NOTES_DIR, name));
  return filePath.startsWith(GENERATED_NOTES_DIR) ? filePath : "";
}

function publicGeneratedNoteUrl(value) {
  const filePath = generatedNotePathFromUrl(value);
  if (!filePath) return "";
  return `/generated-notes/${path.basename(filePath)}`;
}

function serveExternalQuestionAsset(req, res, pathname) {
  const filePath = externalQuestionAssetPathFromUrl(pathname);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(res, 404, "Not Found", "text/plain; charset=utf-8");
    return;
  }
  res.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff"
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function externalQuestionAssetPathFromUrl(publicUrl) {
  const text = String(publicUrl || "").trim();
  const prefix = "/external-question-assets/";
  if (!text.startsWith(prefix)) return "";
  const name = decodeURIComponent(text.slice(prefix.length));
  if (!/^[a-f0-9]{64}\.png$/.test(name)) return "";
  const filePath = path.normalize(path.join(EXTERNAL_QUESTION_ASSETS_DIR, name));
  return filePath.startsWith(`${EXTERNAL_QUESTION_ASSETS_DIR}${path.sep}`) ? filePath : "";
}

function sendJson(res, status, payload, headers = {}) {
  const body = status === 204 ? "" : JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "http://127.0.0.1",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Study-Token, X-Study-Device",
    "Cache-Control": "no-store",
    ...headers
  });
  res.end(body);
}

function sendText(res, status, body, contentType) {
  res.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "application/javascript; charset=utf-8";
  if (ext === ".json") return "application/json; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      try {
        value = JSON.parse(value);
      } catch (error) {
        value = value.slice(1, -1);
      }
    }
    if (key && process.env[key] == null) process.env[key] = value;
  }
}

function writeDotEnv(filePath, values) {
  const ordered = [
    ["DEEPSEEK_API_KEY", values.DEEPSEEK_API_KEY || ""],
    ["DEEPSEEK_MODEL", values.DEEPSEEK_MODEL || DEFAULT_MODEL],
    ["DEEPSEEK_BASE_URL", values.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL],
    ["DEEPSEEK_MAX_TOKENS", values.DEEPSEEK_MAX_TOKENS || "6000"],
    ["TEXT_PRIMARY_ENABLED", values.TEXT_PRIMARY_ENABLED || "true"],
    ["TEXT_API_PROVIDERS", values.TEXT_API_PROVIDERS || "[]"],
    ["IMAGE_API_KEY", values.IMAGE_API_KEY || ""],
    ["IMAGE_MODEL", values.IMAGE_MODEL || DEFAULT_IMAGE_MODEL],
    ["IMAGE_BASE_URL", values.IMAGE_BASE_URL || values.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL],
    ["IMAGE_SIZE", values.IMAGE_SIZE || DEFAULT_IMAGE_SIZE],
    ["IMAGE_PRIMARY_ENABLED", values.IMAGE_PRIMARY_ENABLED || "true"],
    ["IMAGE_API_PROVIDERS", values.IMAGE_API_PROVIDERS || "[]"],
    ["ACCESS_TOKEN", values.ACCESS_TOKEN || ACCESS_TOKEN],
    ["HOST", values.HOST || HOST],
    ["PORT", values.PORT || String(PORT)]
  ];
  const content = [
    "# 本文件可由网页设置页自动更新。",
    "# Linux 服务器外部访问通常设置 HOST=0.0.0.0。",
    ...ordered.map(([key, value]) => `${key}=${escapeEnvValue(value)}`),
    ""
  ].join("\n");
  fs.writeFileSync(filePath, content, "utf8");
}

function getAiConfig() {
  return {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    model: process.env.DEEPSEEK_MODEL || DEFAULT_MODEL,
    baseUrl: (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    maxTokens: clampNumber(process.env.DEEPSEEK_MAX_TOKENS, 512, 20000, 6000)
  };
}

function getAiBackupProviders() {
  const fallback = parseProviderJson(process.env.TEXT_API_PROVIDERS, "text")
    .filter((provider) => provider.apiKey && provider.baseUrl && provider.model);
  return fallback.map((provider, index) => ({
    name: provider.name || `文本备用 ${index + 1}`,
    apiKey: provider.apiKey,
    model: provider.model || getAiConfig().model,
    baseUrl: (provider.baseUrl || getAiConfig().baseUrl).replace(/\/+$/, ""),
    maxTokens: clampNumber(provider.maxTokens, 512, 20000, getAiConfig().maxTokens),
    enabled: provider.enabled !== false,
    slot: `text:backup:${index}`
  }));
}

function getAllAiProviders() {
  const primary = getAiConfig();
  const providers = [];
  if (primary.apiKey) providers.push({ name: "文本主 API", ...primary, enabled: process.env.TEXT_PRIMARY_ENABLED !== "false", slot: "text:primary" });
  return providers.concat(getAiBackupProviders());
}

function getAiProviders() {
  return getAllAiProviders().filter((provider) => provider.enabled !== false);
}

function getImageConfig() {
  return {
    apiKey: process.env.IMAGE_API_KEY || "",
    model: process.env.IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
    baseUrl: (process.env.IMAGE_BASE_URL || process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    size: process.env.IMAGE_SIZE || DEFAULT_IMAGE_SIZE
  };
}

function getImageBackupProviders() {
  const primary = getImageConfig();
  const fallback = parseProviderJson(process.env.IMAGE_API_PROVIDERS, "image")
    .filter((provider) => provider.apiKey && provider.baseUrl && provider.model);
  return fallback.map((provider, index) => ({
    name: provider.name || `生图备用 ${index + 1}`,
    apiKey: provider.apiKey,
    model: provider.model || primary.model,
    baseUrl: (provider.baseUrl || primary.baseUrl).replace(/\/+$/, ""),
    size: provider.size || primary.size || DEFAULT_IMAGE_SIZE,
    enabled: provider.enabled !== false,
    slot: `image:backup:${index}`
  }));
}

function getAllImageProviders(primaryOverride) {
  const primary = primaryOverride || getImageConfig();
  const providers = [];
  if (primary.apiKey) providers.push({ name: "生图主 API", ...primary, enabled: process.env.IMAGE_PRIMARY_ENABLED !== "false", slot: "image:primary" });
  return providers.concat(getImageBackupProviders());
}

function getImageProviders(primaryOverride) {
  return getAllImageProviders(primaryOverride).filter((provider) => provider.enabled !== false);
}

function publicSettings(message, fullAccess = false) {
  const config = getAiConfig();
  const imageConfig = getImageConfig();
  const aiProviders = getAiProviders();
  const imageProviders = getImageProviders(imageConfig);
  if (!fullAccess) {
    return {
      locked: true,
      apiKeyConfigured: aiProviders.length > 0,
      apiProviderCount: aiProviders.length,
      imageApiKeyConfigured: imageProviders.length > 0,
      imageProviderCount: imageProviders.length,
      message: message || "设置详情已锁定"
    };
  }
  const allAiProviders = getAllAiProviders();
  const allImageProviders = getAllImageProviders(imageConfig);
  return {
    locked: false,
    apiKeyConfigured: aiProviders.length > 0,
    apiKeyPreview: maskKey(config.apiKey),
    model: config.model,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
    apiProviderCount: aiProviders.length,
    apiProviders: allAiProviders.map((provider, index) => publicProvider(provider, index === 0 ? "primary" : "backup")),
    apiBackupProviderCount: getAiBackupProviders().length,
    imageApiKeyConfigured: imageProviders.length > 0,
    imageApiKeyPreview: maskKey(imageConfig.apiKey),
    imageModel: imageConfig.model,
    imageBaseUrl: imageConfig.baseUrl,
    imageSize: imageConfig.size,
    imageProviderCount: imageProviders.length,
    imageProviders: allImageProviders.map((provider, index) => publicProvider(provider, index === 0 ? "primary" : "backup")),
    imageBackupProviderCount: getImageBackupProviders().length,
    host: HOST,
    port: PORT,
    message: message || (aiProviders.length ? `OpenAI 兼容 API 已配置 ${aiProviders.length} 组` : "未配置 API key")
  };
}

function publicProvider(provider, role = "backup") {
  return {
    name: provider.name,
    model: provider.model,
    baseUrl: provider.baseUrl,
    size: provider.size || "",
    maxTokens: provider.maxTokens || null,
    keyPreview: maskKey(provider.apiKey),
    enabled: provider.enabled !== false,
    slot: provider.slot || "",
    role
  };
}

function parseProviderJson(value, kind) {
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => normalizeProvider(item, kind)).filter(Boolean);
  } catch (error) {
    return [];
  }
}

function parseProviderLines(value, kind, fallback) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const parts = line.split("|").map((part) => part.trim());
      const [name, baseUrl, model, apiKey, extra] = parts;
      return normalizeProvider({
        name: name || `${kind === "image" ? "生图备用" : "文本备用"} ${index + 1}`,
        baseUrl: baseUrl || fallback.baseUrl,
        model: model || fallback.model,
        apiKey,
        maxTokens: kind === "text" ? extra : undefined,
        size: kind === "image" ? extra : undefined
      }, kind);
    })
    .filter(Boolean);
}

function normalizeProvider(source, kind) {
  if (!source || typeof source !== "object") return null;
  const apiKey = stringValue(source.apiKey).trim();
  const baseUrl = stringValue(source.baseUrl).trim().replace(/\/+$/, "");
  const model = stringValue(source.model).trim();
  if (!apiKey || !baseUrl || !model) return null;
  return {
    name: stringOrDefault(source.name, kind === "image" ? "生图备用 API" : "文本备用 API"),
    apiKey,
    baseUrl,
    model,
    enabled: source.enabled !== false,
    maxTokens: kind === "text" ? clampNumber(source.maxTokens, 512, 20000, 6000) : undefined,
    size: kind === "image" ? stringOrDefault(source.size, DEFAULT_IMAGE_SIZE) : undefined
  };
}

function maskKey(value) {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function stringOrDefault(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function escapeEnvValue(value) {
  const text = String(value || "");
  if (/[\s#"']/u.test(text)) return JSON.stringify(text);
  return text;
}

function stringValue(value) {
  return typeof value === "string" ? value : "";
}
