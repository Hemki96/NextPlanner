import { createHash, timingSafeEqual } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  JsonPlanStore,
  PlanConflictError,
  PlanValidationError,
  StorageIntegrityError,
} from "./stores/json-plan-store.js";
import { JsonSnippetStore } from "./stores/json-snippet-store.js";
import {
  JsonTemplateStore,
  TemplateValidationError,
} from "./stores/json-template-store.js";
import { JsonHighlightConfigStore } from "./stores/json-highlight-config-store.js";
import { DATA_DIR } from "./config.js";
import { logger, createRequestLogger } from "./logger.js";
import { SessionStore } from "./sessions/session-store.js";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_QUICK_SNIPPET_FILE = path.join(DATA_DIR, "quick-snippets.json");
const DEFAULT_HIGHLIGHT_CONFIG_FILE = path.join(DATA_DIR, "highlight-config.json");

class HttpError extends Error {
  constructor(status, message, { expose = true, code = null, hint = null } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.expose = expose;
    this.code = code ?? `http-${status}`;
    this.hint = hint;
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const DEFAULT_ALLOWED_ORIGINS = Object.freeze(["http://localhost:3000"]);
const JSON_SPACING = process.env.NODE_ENV === "development" ? 2 : 0;
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12h
const SESSION_COOKIE_NAME = "nextplanner_session";
const DEFAULT_ADMIN_USERNAME = process.env.NEXTPLANNER_ADMIN_USER ?? "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.NEXTPLANNER_ADMIN_PASSWORD ?? "admin123";
const LOGIN_RATE_LIMIT_DEFAULTS = Object.freeze({
  windowMs: 1000 * 60 * 5,
  maxAttempts: 5,
  blockDurationMs: 1000 * 60 * 5,
});

/**
 * Serialises JSON responses using pretty-printing only in development mode.
 * This keeps production payloads compact while retaining readability locally.
 *
 * @param {unknown} payload
 * @returns {string}
 */
function stringifyJson(payload) {
  if (JSON_SPACING > 0) {
    return JSON.stringify(payload, null, JSON_SPACING);
  }
  return JSON.stringify(payload);
}

function parseAllowedOrigins(value) {
  if (!value) {
    return DEFAULT_ALLOWED_ORIGINS;
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

const ALLOWED_ORIGINS = parseAllowedOrigins(process.env.ALLOWED_ORIGINS);

function hashPassword(password) {
  return createHash("sha256").update(String(password ?? "")).digest();
}

function normalizeUserRecord(user) {
  if (!user || typeof user.username !== "string" || !user.username.trim()) {
    return null;
  }
  const username = user.username.trim();
  let passwordHash = null;
  if (user.passwordHash) {
    passwordHash = Buffer.isBuffer(user.passwordHash)
      ? user.passwordHash
      : Buffer.from(String(user.passwordHash), "hex");
  } else if (typeof user.password === "string" && user.password.trim()) {
    passwordHash = hashPassword(user.password);
  }
  if (!passwordHash) {
    return null;
  }
  return {
    username,
    passwordHash,
    isAdmin: Boolean(user.isAdmin),
  };
}

function buildUserRegistry(users) {
  const registry = new Map();
  const normalizedUsers =
    Array.isArray(users) && users.length > 0
      ? users
      : [
          {
            username: DEFAULT_ADMIN_USERNAME,
            password: DEFAULT_ADMIN_PASSWORD,
            isAdmin: true,
          },
        ];
  for (const entry of normalizedUsers) {
    const normalized = normalizeUserRecord(entry);
    if (normalized) {
      registry.set(normalized.username, normalized);
    }
  }
  return registry;
}

function verifyUserCredentials(registry, username, password) {
  if (!username || !password) {
    return null;
  }
  const record = registry.get(username.trim());
  if (!record) {
    return null;
  }
  const attempted = hashPassword(password);
  if (record.passwordHash.length !== attempted.length) {
    return null;
  }
  if (!timingSafeEqual(record.passwordHash, attempted)) {
    return null;
  }
  return { username: record.username, isAdmin: Boolean(record.isAdmin) };
}

function parseCookies(header = "") {
  return (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const [name, ...rest] = part.split("=");
      if (!name) {
        return acc;
      }
      acc[name] = rest.join("=");
      return acc;
    }, {});
}

function buildSessionCookie(token, expiresAt) {
  const parts = [`${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`, "HttpOnly", "Secure", "SameSite=Lax", "Path=/"];
  const expiresDate = new Date(expiresAt);
  if (!Number.isNaN(expiresDate.getTime())) {
    const maxAgeSeconds = Math.max(0, Math.floor((expiresDate.getTime() - Date.now()) / 1000));
    parts.push(`Expires=${expiresDate.toUTCString()}`);
    parts.push(`Max-Age=${maxAgeSeconds}`);
  }
  return parts.join("; ");
}

function buildExpiredSessionCookie() {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

function getClientIp(req) {
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    const [first] = forwarded.split(",");
    if (first && first.trim()) {
      return first.trim();
    }
  }
  return req.socket?.remoteAddress ?? "unknown";
}

class LoginRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs ?? LOGIN_RATE_LIMIT_DEFAULTS.windowMs;
    this.maxAttempts = options.maxAttempts ?? LOGIN_RATE_LIMIT_DEFAULTS.maxAttempts;
    this.blockDurationMs = options.blockDurationMs ?? LOGIN_RATE_LIMIT_DEFAULTS.blockDurationMs;
    this.buckets = new Map();
  }

  buildKeys(ip, username) {
    const keys = [];
    if (ip) {
      keys.push(`ip:${ip}`);
    }
    if (username) {
      keys.push(`user:${username}`);
    }
    if (ip && username) {
      keys.push(`combo:${username}@${ip}`);
    }
    return keys;
  }

  check(ip, username) {
    const now = Date.now();
    const keys = this.buildKeys(ip, username);
    let blockedUntil = null;
    for (const key of keys) {
      const entry = this.buckets.get(key);
      if (!entry) {
        continue;
      }
      const isBlocked = entry.blockedUntil && entry.blockedUntil > now;
      const windowExpired = entry.firstAttempt + this.windowMs < now;
      if (isBlocked) {
        blockedUntil = Math.max(blockedUntil ?? 0, entry.blockedUntil);
      } else if (windowExpired) {
        this.buckets.delete(key);
      }
    }
    return { allowed: blockedUntil === null, blockedUntil, keys, now };
  }

  recordFailure(ip, username) {
    const { keys, now } = this.check(ip, username);
    let blockedUntil = null;
    for (const key of keys) {
      const existing = this.buckets.get(key);
      const withinWindow = existing ? now - existing.firstAttempt <= this.windowMs : false;
      const nextCount = withinWindow ? (existing?.count ?? 0) + 1 : 1;
      const firstAttempt = withinWindow && existing ? existing.firstAttempt : now;
      const newEntry = {
        count: nextCount,
        firstAttempt,
        blockedUntil:
          nextCount >= this.maxAttempts ? now + this.blockDurationMs : existing?.blockedUntil ?? null,
      };
      this.buckets.set(key, newEntry);
      if (newEntry.blockedUntil && (!blockedUntil || newEntry.blockedUntil > blockedUntil)) {
        blockedUntil = newEntry.blockedUntil;
      }
    }
    return blockedUntil;
  }

  recordSuccess(ip, username) {
    const { keys } = this.check(ip, username);
    for (const key of keys) {
      this.buckets.delete(key);
    }
  }
}

const HEALTH_ENDPOINTS = Object.freeze({
  readiness: "/readyz",
  liveness: "/livez",
  health: "/healthz",
});

const HEALTH_PATHS = new Set(Object.values(HEALTH_ENDPOINTS));
const HEALTH_ALLOWED_METHODS = "GET,HEAD,OPTIONS";

const API_CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type,If-Match,If-None-Match",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "600",
};

const API_BASE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; base-uri 'self'; frame-ancestors 'none';", // tightened for API responses
  "X-Content-Type-Options": "nosniff",
});

const STATIC_SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});

const IMMUTABLE_CACHE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".json",
]);

const FINGERPRINT_PATTERN = /(?:^|[.-])[0-9a-f]{8,}(?:\.|$)/i;

function resolveCacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") {
    return "public, max-age=60";
  }

  const fileName = path.basename(filePath);
  if (IMMUTABLE_CACHE_EXTENSIONS.has(ext) && FINGERPRINT_PATTERN.test(fileName)) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=3600";
}

function appendVary(value, field) {
  const vary = new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  vary.add(field);
  return Array.from(vary).join(", ");
}

function selectCorsOrigin(origin) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return origin;
  }
  return ALLOWED_ORIGINS[0] ?? origin ?? "";
}

function withCorsHeaders(headers = {}, origin) {
  const chosenOrigin = selectCorsOrigin(origin);
  const base = { ...API_CORS_HEADERS, ...headers };
  if (chosenOrigin) {
    base["Access-Control-Allow-Origin"] = chosenOrigin;
  }
  base.Vary = appendVary(base.Vary, "Origin");
  return base;
}

function buildApiHeaders(extra = {}) {
  return { ...API_BASE_HEADERS, ...extra };
}

function buildEtag(fileStat) {
  const sizeHex = fileStat.size.toString(16);
  const mtimeHex = Math.floor(fileStat.mtimeMs).toString(16);
  return `"${sizeHex}-${mtimeHex}"`;
}

function sortCanonical(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortCanonical(item));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortCanonical(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalizePlan(plan) {
  const canonicalPlan = {
    id: plan.id,
    title: plan.title,
    content: plan.content,
    planDate: plan.planDate,
    focus: plan.focus,
    metadata: plan.metadata ?? {},
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
  return JSON.stringify(sortCanonical(canonicalPlan));
}

function buildPlanEtag(plan) {
  const canonical = canonicalizePlan(plan);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `"${hash}"`;
}

function canonicalizeTemplate(template) {
  const canonicalTemplate = {
    id: template.id,
    type: template.type,
    title: template.title,
    notes: template.notes,
    content: template.content,
    tags: Array.isArray(template.tags) ? [...template.tags] : [],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
  return JSON.stringify(sortCanonical(canonicalTemplate));
}

function buildTemplateEtag(template) {
  const canonical = canonicalizeTemplate(template);
  const hash = createHash("sha256").update(canonical).digest("hex");
  return `"${hash}"`;
}

function ifMatchSatisfied(header, currentEtag) {
  if (!header || !currentEtag) {
    return false;
  }
  const trimmed = header.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === "*") {
    return true;
  }
  const candidates = trimmed
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return candidates.some((candidate) => candidate === currentEtag);
}

function parseHttpDate(value) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function etagMatches(header, currentEtag) {
  if (!header || !currentEtag) {
    return false;
  }
  const trimmed = header.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed === "*") {
    return true;
  }
  const candidates = trimmed.split(",").map((tag) => tag.trim()).filter(Boolean);
  return candidates.some((candidate) => {
    if (candidate === currentEtag) {
      return true;
    }
    if (candidate.startsWith("W/")) {
      return candidate.slice(2) === currentEtag;
    }
    if (currentEtag.startsWith("W/")) {
      return currentEtag.slice(2) === candidate;
    }
    return false;
  });
}

function isRequestFresh(headers, etag, mtimeMs) {
  if (etagMatches(headers["if-none-match"], etag)) {
    return true;
  }
  const ifModifiedSince = headers["if-modified-since"];
  if (!ifModifiedSince) {
    return false;
  }
  const since = parseHttpDate(ifModifiedSince);
  if (since === null) {
    return false;
  }
  // HTTP dates are second resolution, allow equality within one second window.
  return Math.floor(mtimeMs / 1000) <= Math.floor(since / 1000);
}

function sendJson(
  res,
  status,
  payload,
  { cors = false, method = "GET", headers = {}, origin } = {},
) {
  const body = stringifyJson(payload);
  const baseHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  };
  const finalHeaders = { ...(headers ?? {}), ...baseHeaders };
  res.writeHead(
    status,
    cors ? withCorsHeaders(finalHeaders, origin) : finalHeaders,
  );
  if (method !== "HEAD") {
    res.end(body);
  } else {
    res.end();
  }
}

function sendEmpty(res, status, { cors = false, headers = {}, origin } = {}) {
  const finalHeaders = { ...(headers ?? {}) };
  res.writeHead(
    status,
    cors ? withCorsHeaders(finalHeaders, origin) : finalHeaders,
  );
  res.end();
}

function sendApiJson(res, status, payload, { method = "GET", headers, origin } = {}) {
  sendJson(res, status, payload, {
    cors: true,
    method,
    origin,
    headers: buildApiHeaders(headers),
  });
}

function sendApiEmpty(res, status, { headers, origin } = {}) {
  sendEmpty(res, status, {
    cors: true,
    origin,
    headers: buildApiHeaders(headers),
  });
}

async function evaluateStoreHealth(name, store, log = logger) {
  if (!store || typeof store.checkHealth !== "function") {
    return { name, status: "unknown" };
  }
  try {
    const details = await store.checkHealth();
    return { name, status: "ok", details };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failure = { name, status: "error", error: message };
    if (error instanceof StorageIntegrityError && error.backupFile) {
      failure.details = { backupFile: error.backupFile };
    }
    const level = error instanceof StorageIntegrityError ? "error" : "warn";
    if (log && typeof log[level] === "function") {
      log[level]("Health check '%s' failed: %s", name, error instanceof Error ? error.stack ?? error.message : message);
    } else if (typeof logger[level] === "function") {
      logger[level]("Health check '%s' failed: %s", name, message);
    }
    return failure;
  }
}

function buildHealthPayload(checks) {
  const hasError = checks.some((entry) => entry.status === "error");
  const hasOk = checks.some((entry) => entry.status === "ok");
  const status = hasError ? "degraded" : hasOk ? "ok" : "unknown";
  const components = checks.reduce((acc, entry) => {
    const info = { status: entry.status };
    if (entry.details) {
      info.details = entry.details;
    }
    if (entry.error) {
      info.error = entry.error;
    }
    acc[entry.name] = info;
    return acc;
  }, {});
  return {
    status,
    timestamp: new Date().toISOString(),
    checks: components,
    degraded: hasError,
  };
}

async function handleHealthRequest(
  req,
  res,
  url,
  {
    planStore,
    templateStore,
    teamSnippetStore,
    quickSnippetStore,
    highlightConfigStore,
  },
  { method, logger: requestLogger } = {},
) {
  const methodName = (method ?? req.method ?? "GET").toUpperCase();
  const activeLogger = requestLogger ?? logger;

  if (methodName === "OPTIONS") {
    sendEmpty(res, 204, {
      headers: buildApiHeaders({ Allow: HEALTH_ALLOWED_METHODS }),
    });
    return;
  }

  if (methodName !== "GET" && methodName !== "HEAD") {
    sendEmpty(res, 405, {
      headers: buildApiHeaders({ Allow: HEALTH_ALLOWED_METHODS }),
    });
    return;
  }

  if (url.pathname === HEALTH_ENDPOINTS.liveness) {
    const payload = {
      status: "ok",
      timestamp: new Date().toISOString(),
    };
    sendJson(res, 200, payload, {
      method: methodName,
      headers: buildApiHeaders(),
    });
    return;
  }

  const checks = [];
  for (const [name, store] of [
    ["planStore", planStore],
    ["templateStore", templateStore],
    ["teamSnippetStore", teamSnippetStore],
    ["quickSnippetStore", quickSnippetStore],
    ["highlightConfigStore", highlightConfigStore],
  ]) {
    // eslint-disable-next-line no-await-in-loop
    checks.push(await evaluateStoreHealth(name, store, activeLogger));
  }

  const payload = buildHealthPayload(checks);
  const statusCode = payload.degraded ? 503 : 200;
  sendJson(res, statusCode, payload, {
    method: methodName,
    headers: buildApiHeaders(),
  });
}

async function readJsonBody(req, { limit = 1_000_000 } = {}) {
  req.setEncoding("utf8");
  let body = "";
  let totalLength = 0;

  const method = req.method ?? "GET";
  if (method === "POST" || method === "PUT") {
    const contentType = req.headers["content-type"] ?? "";
    if (!/^application\/json(?:;|$)/i.test(contentType)) {
      throw new HttpError(415, "Content-Type muss application/json sein", {
        hint: "Setzen Sie den Header 'Content-Type' auf 'application/json', um JSON-Daten zu senden.",
      });
    }
  }

  for await (const chunk of req) {
    totalLength += Buffer.byteLength(chunk);
    if (totalLength > limit) {
      throw new HttpError(413, "Request body too large", {
        hint: "Reduzieren Sie die Größe der Anfrage oder senden Sie weniger Daten pro Aufruf.",
      });
    }
    body += chunk;
  }

  if (!body) {
    return {};
  }

  if (!body.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object") {
      throw new HttpError(400, "JSON body muss ein Objekt sein", {
        hint: "Senden Sie ein JSON-Objekt (z. B. {\"title\":\"...\"}) statt eines Arrays oder eines einfachen Werts.",
      });
    }
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "Ungültige JSON-Nutzlast", {
      hint: "Prüfen Sie die JSON-Syntax. Häufige Fehler sind fehlende Anführungszeichen oder Kommas.",
    });
  }
}

function isApiRequest(pathname) {
  return pathname.startsWith("/api/");
}

function isHealthCheckRequest(pathname) {
  return HEALTH_PATHS.has(pathname);
}

function mapExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function sanitizePath(rootDir, requestedPath) {
  const decoded = decodeURIComponent(requestedPath);
  let normalized = path.normalize(decoded);

  if (normalized === path.sep || normalized === "." || normalized === "") {
    normalized = "index.html";
  }

  if (normalized.endsWith(path.sep)) {
    normalized = path.join(normalized, "index.html");
  }

  normalized = normalized.replace(/^[/\\]+/, "");
  if (!normalized) {
    normalized = "index.html";
  }

  const resolved = path.resolve(rootDir, normalized);
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (resolved !== rootDir && !resolved.startsWith(rootWithSep)) {
    return null;
  }

  return resolved;
}

async function serveStatic(req, res, url, rootDir) {
  const safePath = sanitizePath(rootDir, url.pathname);
  if (!safePath) {
    sendEmpty(res, 403, { headers: STATIC_SECURITY_HEADERS });
    return;
  }

  let filePath = safePath;
  let fileStat;
  let attemptedFallback = false;

  while (true) {
    try {
      fileStat = await stat(filePath);
      if (fileStat.isDirectory()) {
        filePath = path.join(filePath, "index.html");
        continue;
      }
      break;
    } catch (error) {
      if (!attemptedFallback && (req.method === "GET" || req.method === "HEAD")) {
        filePath = path.join(rootDir, "index.html");
        attemptedFallback = true;
        continue;
      }
      sendEmpty(res, 404, { headers: STATIC_SECURITY_HEADERS });
      return;
    }
  }

  const method = req.method ?? "GET";
  const mime = mapExtension(filePath);
  const etag = buildEtag(fileStat);
  const cacheHeaders = {
    "Last-Modified": fileStat.mtime.toUTCString(),
    ETag: etag,
    "Cache-Control": resolveCacheControl(filePath),
  };

  const notModifiedHeaders = { ...cacheHeaders, ...STATIC_SECURITY_HEADERS };
  if (isRequestFresh(req.headers ?? {}, etag, fileStat.mtimeMs)) {
    res.writeHead(304, notModifiedHeaders);
    res.end();
    return;
  }

  const headers = {
    ...cacheHeaders,
    "Content-Type": mime,
    "Content-Length": fileStat.size,
  };
  const responseHeaders = { ...headers, ...STATIC_SECURITY_HEADERS };

  if (method === "HEAD") {
    res.writeHead(200, responseHeaders);
    res.end();
    return;
  }

  if (method !== "GET") {
    sendEmpty(res, 405, { headers: STATIC_SECURITY_HEADERS });
    return;
  }

  const stream = createReadStream(filePath);
  stream.once("open", () => {
    res.writeHead(200, responseHeaders);
  });
  stream.once("error", (error) => {
    if (!res.headersSent) {
      const status = error?.code === "ENOENT" ? 404 : 500;
      sendEmpty(res, status, { headers: STATIC_SECURITY_HEADERS });
    } else {
      res.destroy(error);
    }
  });
  res.once("close", () => {
    stream.destroy();
  });
  stream.pipe(res);
}

function parseIdFromPath(pathname) {
  const match = /^\/api\/plans\/(\d+)$/.exec(pathname);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function parseTemplateIdFromPath(pathname) {
  const match = /^\/api\/templates\/([^/]+)$/.exec(pathname);
  if (!match) {
    return null;
  }
  return match[1];
}

function ensureJsonObject(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "JSON body muss ein Objekt sein", {
      hint: "Verwenden Sie ein JSON-Objekt mit Schlüssel-Wert-Paaren, um die Daten zu übermitteln.",
    });
  }
  return payload;
}

function validateMetadata(metadata) {
  if (metadata === undefined) {
    return undefined;
  }
  if (metadata === null) {
    return {};
  }
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new HttpError(400, "metadata muss ein Objekt sein", {
      hint: "'metadata' erwartet ein JSON-Objekt, z. B. {\"priority\":\"hoch\"}.",
    });
  }
  return metadata;
}

function validateCreatePayload(payload) {
  const data = ensureJsonObject(payload);
  const { title, content, planDate, focus, metadata } = data;
  if (typeof title !== "string" || !title.trim()) {
    throw new HttpError(400, "title ist erforderlich und muss ein String sein", {
      hint: "Geben Sie einen nicht-leeren Text im Feld 'title' an.",
    });
  }
  if (typeof content !== "string" || !content.trim()) {
    throw new HttpError(400, "content ist erforderlich und muss ein String sein", {
      hint: "Füllen Sie das Feld 'content' mit einer Beschreibung des Plans aus.",
    });
  }
  if (typeof planDate !== "string" || !planDate.trim()) {
    throw new HttpError(400, "planDate ist erforderlich und muss ein ISO-Datum sein", {
      hint: "Verwenden Sie ein ISO-Datum, z. B. '2025-01-31'.",
    });
  }
  if (typeof focus !== "string" || !focus.trim()) {
    throw new HttpError(400, "focus ist erforderlich und muss ein String sein", {
      hint: "Definieren Sie einen Schwerpunkt im Feld 'focus', z. B. 'Teamkommunikation'.",
    });
  }
  return {
    title,
    content,
    planDate,
    focus,
    metadata: validateMetadata(metadata) ?? {},
  };
}

function buildErrorPayload(code, message, details, hint) {
  const payload = { error: { code, message } };
  if (details !== undefined) {
    payload.error.details = details;
  }
  if (hint) {
    payload.error.hint = hint;
  }
  return payload;
}

function handleApiError(res, error, method = "GET", origin, options = {}) {
  const log = options?.logger ?? logger;
  const path = options?.path ?? "";
  const location = path ? `${method} ${path}` : method;
  const logWith = (level, message, ...args) => {
    if (log && typeof log[level] === "function") {
      log[level](message, ...args);
    } else if (typeof logger[level] === "function") {
      logger[level](message, ...args);
    }
  };

  const sendError = (status, code, message, details, headers, hint) => {
    sendApiJson(res, status, buildErrorPayload(code, message, details, hint), {
      method,
      origin,
      headers,
    });
  };

  if (error instanceof HttpError) {
    const message = error.expose ? error.message : "Unbekannter Fehler";
    const level = error.status >= 500 ? "error" : "debug";
    logWith(level, "API %s -> %d: %s", location, error.status, message);
    sendError(
      error.status,
      error.code ?? `http-${error.status}`,
      message,
      undefined,
      undefined,
      error.hint,
    );
    return;
  }
  if (error instanceof PlanValidationError) {
    logWith("warn", "Plan validation failed for %s: %s", location, error.message);
    sendError(
      400,
      "plan-validation",
      error.message,
      undefined,
      undefined,
      "Bitte prüfen Sie die angegebenen Felder und korrigieren Sie ungültige Werte.",
    );
    return;
  }
  if (error instanceof StorageIntegrityError) {
    const details = error.backupFile ? { backupFile: error.backupFile } : undefined;
    const backupInfo = error.backupFile ? ` (Backup: ${error.backupFile})` : "";
    logWith(
      "error",
      "Storage integrity issue detected for %s: %s%s",
      location,
      error.message,
      backupInfo,
    );
    sendError(
      503,
      "storage-integrity",
      error.message,
      details,
      undefined,
      "Die lokalen Daten konnten nicht gespeichert werden. Bitte sichern Sie Ihre Eingaben und versuchen Sie es später erneut.",
    );
    return;
  }
  if (error instanceof TemplateValidationError) {
    logWith("warn", "Template validation failed for %s: %s", location, error.message);
    sendError(
      400,
      "template-validation",
      error.message,
      undefined,
      undefined,
      "Überprüfen Sie die Angaben zur Vorlage und korrigieren Sie ungültige Werte.",
    );
    return;
  }
  if (error instanceof PlanConflictError) {
    const details = error.currentPlan ? { currentPlan: error.currentPlan } : undefined;
    const headers = error.currentPlan ? { ETag: buildPlanEtag(error.currentPlan) } : undefined;
    logWith("warn", "Plan conflict detected for %s: %s", location, error.message);
    sendError(
      412,
      "plan-conflict",
      error.message,
      details,
      headers,
      "Der Plan wurde inzwischen geändert. Laden Sie die aktuelle Version und übernehmen Sie Ihre Anpassungen erneut.",
    );
    return;
  }
  const rawMessage =
    error instanceof Error ? error.stack ?? error.message : String(error ?? "Unbekannter Fehler");
  logWith("error", "Unexpected API error for %s: %s", location, rawMessage);
  const message =
    process.env.NODE_ENV === "development"
      ? error instanceof Error
        ? error.message
        : String(error)
      : "Interner Serverfehler";
  sendError(
    500,
    "internal-error",
    message,
    undefined,
    undefined,
    "Bitte versuchen Sie es später erneut oder wenden Sie sich an den Support, falls das Problem bestehen bleibt.",
  );
}

async function resolveAuthContext(req, sessionStoreInstance, requestLogger) {
  if (!sessionStoreInstance) {
    return { user: null, isAdmin: false, token: null };
  }
  try {
    const cookies = parseCookies(req.headers?.cookie ?? "");
    const token = cookies[SESSION_COOKIE_NAME];
    if (!token) {
      return { user: null, isAdmin: false, token: null };
    }
    const session = await sessionStoreInstance.getSession(token);
    if (!session || !session.username) {
      return { user: null, isAdmin: false, token };
    }
    return {
      user: { username: session.username },
      isAdmin: Boolean(session.isAdmin),
      token,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    requestLogger?.warn?.("Session konnte nicht geladen werden: %s", message);
    return { user: null, isAdmin: false, token: null };
  }
}

async function handleApiRequest(
  req,
  res,
  url,
  planStore,
  templateStore,
  teamSnippetStore,
  quickSnippetStore,
  highlightConfigStore,
  origin,
  {
    method: providedMethod,
    logger: requestLogger,
    auth,
    sessionStore,
    userRegistry,
    loginRateLimiter,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  } = {},
) {
  const requestOrigin = origin ?? req.headers?.origin ?? "";
  const method = (providedMethod ?? req.method ?? "GET").toUpperCase();
  const logOptions = { logger: requestLogger ?? logger, path: url.pathname };
  const authContext = auth ?? { user: null, isAdmin: false, token: null };

  if (method === "OPTIONS") {
    sendApiEmpty(res, 204, {
      headers: {
        "Access-Control-Allow-Methods":
          API_CORS_HEADERS["Access-Control-Allow-Methods"],
      },
      origin: requestOrigin,
    });
    return;
  }

  if (url.pathname === "/api/auth/login") {
    if (method !== "POST") {
      handleApiError(
        res,
        new HttpError(405, "Methode nicht erlaubt", {
          hint: "Verwenden Sie POST mit { username, password }, um sich anzumelden.",
        }),
        method,
        requestOrigin,
        logOptions,
      );
      return;
    }
    try {
      const body = await readJsonBody(req, { limit: 50_000 });
      const payload = ensureJsonObject(body);
      const { username, password } = payload;
      if (typeof username !== "string" || typeof password !== "string" || !username.trim()) {
        throw new HttpError(400, "username und password sind erforderlich", {
          code: "invalid-credentials-input",
          hint: "Senden Sie beide Felder als Strings, z. B. { \"username\": \"coach\", \"password\": \"secret\" }.",
        });
      }

      const clientIp = getClientIp(req);
      const rateStatus = loginRateLimiter?.check(clientIp, username);
      if (rateStatus && rateStatus.allowed === false) {
        const retryAfterMs = Math.max(0, (rateStatus?.blockedUntil ?? Date.now()) - Date.now());
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(retryAfterMs / 1000),
        );
        throw new HttpError(429, "Zu viele fehlgeschlagene Anmeldeversuche", {
          code: "login-rate-limit",
          hint: `Warten Sie ${retryAfterSeconds} Sekunden, bevor Sie es erneut versuchen.`,
        });
      }

      const verifiedUser = verifyUserCredentials(userRegistry ?? new Map(), username, password);
      if (!verifiedUser) {
        const blockedUntil = loginRateLimiter?.recordFailure(clientIp, username);
        const hint =
          blockedUntil && blockedUntil > Date.now()
            ? `Zu viele Fehlversuche. Bitte warten Sie ${Math.max(1, Math.floor((blockedUntil - Date.now()) / 1000))} Sekunden.`
            : "Bitte prüfen Sie Benutzername oder Passwort.";
        throw new HttpError(401, "Ungültige Zugangsdaten", {
          code: "invalid-credentials",
          hint,
        });
      }

      loginRateLimiter?.recordSuccess(clientIp, verifiedUser.username);
      const session = await sessionStore.createSession({
        username: verifiedUser.username,
        isAdmin: verifiedUser.isAdmin,
        ttlMs: sessionTtlMs,
      });
      const cookie = buildSessionCookie(session.token, session.expiresAt);
      sendApiJson(
        res,
        200,
        {
          success: true,
          user: { username: verifiedUser.username, isAdmin: verifiedUser.isAdmin },
          expiresAt: session.expiresAt,
        },
        {
          method,
          origin: requestOrigin,
          headers: { "Set-Cookie": cookie },
        },
      );
    } catch (error) {
      handleApiError(res, error, method, requestOrigin, logOptions);
    }
    return;
  }

  if (url.pathname === "/api/auth/logout") {
    if (method !== "POST") {
      handleApiError(
        res,
        new HttpError(405, "Methode nicht erlaubt", {
          hint: "Verwenden Sie POST, um die Sitzung zu beenden.",
        }),
        method,
        requestOrigin,
        logOptions,
      );
      return;
    }
    try {
      if (authContext.token) {
        await sessionStore.deleteSession(authContext.token);
      }
      sendApiEmpty(res, 204, {
        origin: requestOrigin,
        headers: { "Set-Cookie": buildExpiredSessionCookie() },
      });
    } catch (error) {
      handleApiError(res, error, method, requestOrigin, logOptions);
    }
    return;
  }

  if (!authContext.user) {
    handleApiError(
      res,
      new HttpError(401, "Authentifizierung erforderlich", {
        code: "unauthenticated",
        hint: "Melden Sie sich an, um auf diese API zuzugreifen.",
      }),
      method,
      requestOrigin,
      logOptions,
    );
    return;
  }

  const isBackupsRoute =
    url.pathname === "/api/backups" ||
    url.pathname === "/api/storage/backup" ||
    url.pathname === "/api/storage/restore";
  if (isBackupsRoute) {
    const isRestorePath = url.pathname === "/api/storage/restore";
    if ((method === "GET" || method === "HEAD") && !isRestorePath) {
      try {
        const backup = await planStore.exportBackup();
        sendApiJson(res, 200, backup, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }
    if (method === "POST") {
      try {
        const body = await readJsonBody(req, { limit: 5_000_000 });
        const payload = ensureJsonObject(body);
        const result = await planStore.importBackup(payload);
        const responseBody = {
          success: true,
          planCount: result.planCount,
          restoredAt: new Date().toISOString(),
        };
        sendApiJson(res, 200, responseBody, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }
    handleApiError(
      res,
      new HttpError(405, "Methode nicht erlaubt", {
        hint: "Für Sicherungen stehen GET/HEAD (Export) und POST (Import) zur Verfügung.",
      }),
      method,
      requestOrigin,
      logOptions,
    );
    return;
  }

  if (url.pathname === "/api/quick-snippets") {
    if (!quickSnippetStore) {
      handleApiError(
        res,
        new HttpError(503, "Schnellbausteine nicht verfügbar", {
          hint: "Der Server konnte keinen Speicher für Schnellbausteine initialisieren.",
        }),
        method,
        requestOrigin,
        logOptions,
      );
      return;
    }

    if (method === "GET" || method === "HEAD") {
      try {
        const library = await quickSnippetStore.getLibrary();
        sendApiJson(res, 200, library, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    if (method === "PUT") {
      try {
        const body = await readJsonBody(req, { limit: 1_000_000 });
        const payload = Array.isArray(body) ? body : ensureJsonObject(body).groups ?? body;
        if (!Array.isArray(payload)) {
          throw new HttpError(400, "Erwartet wurde ein Array von Gruppen", {
            code: "invalid-snippet-payload",
            hint: "Senden Sie ein Array mit Gruppenobjekten, jeweils inklusive 'title' und 'snippets'.",
          });
        }
        const library = await quickSnippetStore.replaceLibrary(payload);
        sendApiJson(res, 200, library, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    handleApiError(
      res,
      new HttpError(405, "Methode nicht erlaubt", {
        hint: "Verwenden Sie GET/HEAD zum Abrufen oder PUT zum Aktualisieren der Schnellbausteine.",
      }),
      method,
      requestOrigin,
      logOptions,
    );
    return;
  }

  if (url.pathname === "/api/highlight-config") {
    if (!highlightConfigStore) {
      handleApiError(
        res,
        new HttpError(503, "Highlight-Konfiguration nicht verfügbar", {
          hint: "Der Server konnte die Konfiguration für Plan-Markierungen nicht initialisieren.",
        }),
        method,
        requestOrigin,
        logOptions,
      );
      return;
    }

    if (method === "GET" || method === "HEAD") {
      try {
        const config = await highlightConfigStore.getConfig();
        sendApiJson(res, 200, config, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    if (method === "PUT") {
      try {
        const body = await readJsonBody(req, { limit: 200_000 });
        const payload = ensureJsonObject(body);
        const updated = await highlightConfigStore.updateConfig(payload);
        sendApiJson(res, 200, updated, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    handleApiError(
      res,
      new HttpError(405, "Methode nicht erlaubt", {
        hint: "Verwenden Sie GET/HEAD zum Abrufen oder PUT zum Aktualisieren der Highlight-Konfiguration.",
      }),
      method,
      requestOrigin,
      logOptions,
    );
    return;
  }

  if (url.pathname === "/api/templates") {
    if (!templateStore) {
      handleApiError(
        res,
        new HttpError(503, "Template-Speicher nicht verfügbar", {
          hint: "Der Server konnte keinen Speicher für Vorlagen initialisieren.",
        }),
        method,
        requestOrigin,
        logOptions,
      );
      return;
    }

    if (method === "GET" || method === "HEAD") {
      try {
        const templates = await templateStore.listTemplates();
        sendApiJson(res, 200, templates, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    if (method === "POST") {
      try {
        const body = await readJsonBody(req, { limit: 500_000 });
        const template = await templateStore.createTemplate(body);
        sendApiJson(res, 201, template, {
          method,
          origin: requestOrigin,
          headers: {
            Location: `/api/templates/${encodeURIComponent(template.id)}`,
            ETag: buildTemplateEtag(template),
          },
        });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    handleApiError(
      res,
      new HttpError(405, "Methode nicht erlaubt", {
        hint: "Nutzen Sie GET/HEAD zum Abruf oder POST zum Anlegen neuer Vorlagen.",
      }),
      method,
      requestOrigin,
      logOptions,
    );
    return;
  }

  const templateId = parseTemplateIdFromPath(url.pathname);
  if (templateId !== null) {
    if (!templateStore) {
      handleApiError(
        res,
        new HttpError(503, "Template-Speicher nicht verfügbar", {
          hint: "Der Server konnte keinen Speicher für Vorlagen initialisieren.",
        }),
        method,
        requestOrigin,
        logOptions,
      );
      return;
    }

    if (method === "GET" || method === "HEAD") {
      try {
        const template = await templateStore.getTemplate(templateId);
        if (!template) {
          throw new HttpError(404, "Vorlage nicht gefunden", {
            hint: "Prüfen Sie, ob die Vorlage bereits gelöscht wurde.",
          });
        }
        const etag = buildTemplateEtag(template);
        if (etagMatches(req.headers?.["if-none-match"], etag)) {
          sendApiEmpty(res, 304, {
            headers: { ETag: etag },
            origin: requestOrigin,
          });
          return;
        }
        sendApiJson(res, 200, template, {
          method,
          origin: requestOrigin,
          headers: { ETag: etag },
        });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    if (method === "PUT") {
      try {
        const ifMatch = req.headers?.["if-match"];
        const current = await templateStore.getTemplate(templateId);
        if (!current) {
          throw new HttpError(404, "Vorlage nicht gefunden", {
            hint: "Die Vorlage wurde möglicherweise gelöscht.",
          });
        }
        const currentEtag = buildTemplateEtag(current);
        if (ifMatch && !ifMatchSatisfied(ifMatch, currentEtag)) {
          throw new HttpError(412, "Vorlage wurde bereits geändert.", {
            code: "template-conflict",
            hint: "Laden Sie die aktuelle Version und versuchen Sie es erneut.",
            expose: true,
          });
        }
        const body = await readJsonBody(req, { limit: 500_000 });
        const template = await templateStore.updateTemplate(templateId, body);
        if (!template) {
          throw new HttpError(404, "Vorlage nicht gefunden", {
            hint: "Die Vorlage wurde möglicherweise gelöscht.",
          });
        }
        sendApiJson(res, 200, template, {
          method,
          origin: requestOrigin,
          headers: { ETag: buildTemplateEtag(template) },
        });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    if (method === "DELETE") {
      try {
        const ifMatch = req.headers?.["if-match"];
        const current = await templateStore.getTemplate(templateId);
        if (!current) {
          throw new HttpError(404, "Vorlage nicht gefunden", {
            hint: "Die Vorlage wurde möglicherweise bereits gelöscht.",
          });
        }
        const currentEtag = buildTemplateEtag(current);
        if (ifMatch && !ifMatchSatisfied(ifMatch, currentEtag)) {
          throw new HttpError(412, "Vorlage wurde bereits geändert.", {
            code: "template-conflict",
            hint: "Laden Sie die aktuelle Version und versuchen Sie es erneut.",
            expose: true,
          });
        }
        const removed = await templateStore.deleteTemplate(templateId);
        if (!removed) {
          throw new HttpError(404, "Vorlage nicht gefunden", {
            hint: "Die Vorlage wurde möglicherweise bereits gelöscht.",
          });
        }
        sendApiEmpty(res, 204, { origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    handleApiError(
      res,
      new HttpError(405, "Methode nicht erlaubt", {
        hint: "Erlaubte Methoden sind GET/HEAD, PUT und DELETE.",
      }),
      method,
      requestOrigin,
    );
    return;
  }

  if (url.pathname === "/api/snippets") {
    if (!teamSnippetStore) {
      handleApiError(
        res,
        new HttpError(503, "Team-Bibliothek nicht verfügbar", {
          hint: "Aktivieren oder konfigurieren Sie die Team-Bibliothek, um auf Snippets zuzugreifen.",
        }),
        method,
        requestOrigin,
      );
      return;
    }

    if (method === "GET" || method === "HEAD") {
      try {
        const library = await teamSnippetStore.getLibrary();
        sendApiJson(res, 200, library, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    if (method === "PUT") {
      try {
        const body = await readJsonBody(req, { limit: 1_000_000 });
        const payload = Array.isArray(body) ? body : ensureJsonObject(body).groups ?? body;
        if (!Array.isArray(payload)) {
          throw new HttpError(400, "Erwartet wurde ein Array von Gruppen", {
            code: "invalid-snippet-payload",
            hint: "Senden Sie ein Array mit Gruppenobjekten, jeweils inklusive 'title' und 'snippets'.",
          });
        }
        const library = await teamSnippetStore.replaceLibrary(payload);
        sendApiJson(res, 200, library, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    handleApiError(
      res,
      new HttpError(405, "Methode nicht erlaubt", {
        hint: "Verwenden Sie GET/HEAD zum Abrufen oder PUT zum Ersetzen der Snippet-Bibliothek.",
      }),
      method,
      requestOrigin,
      logOptions,
    );
    return;
  }

  if (url.pathname === "/api/plans") {
    if (method === "POST") {
      try {
        const body = await readJsonBody(req);
        const payload = validateCreatePayload(body);
        const plan = await planStore.createPlan(payload);
        sendApiJson(res, 201, plan, {
          method,
          origin: requestOrigin,
          headers: {
            ETag: buildPlanEtag(plan),
            Location: `/api/plans/${plan.id}`,
          },
        });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    if (method === "GET" || method === "HEAD") {
      try {
        const { focus, from, to } = url.searchParams;
        const plans = await planStore.listPlans({
          focus: focus ?? undefined,
          from: from ?? undefined,
          to: to ?? undefined,
        });
        sendApiJson(res, 200, plans, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin, logOptions);
      }
      return;
    }

    handleApiError(
      res,
      new HttpError(405, "Methode nicht erlaubt", {
        hint: "Nutzen Sie POST zum Anlegen oder GET/HEAD zum Auflisten von Plänen.",
      }),
      method,
      requestOrigin,
      logOptions,
    );
    return;
  }

  const planId = parseIdFromPath(url.pathname);
  if (planId === null) {
    handleApiError(
      res,
      new HttpError(404, "Endpunkt nicht gefunden", {
        hint: "Prüfen Sie die URL. Einzelpläne erreichen Sie unter /api/plans/{id}.",
      }),
      method,
      requestOrigin,
      logOptions,
    );
    return;
  }

  if (method === "GET" || method === "HEAD") {
    try {
      const plan = await planStore.getPlan(planId);
      if (!plan) {
        throw new HttpError(404, "Plan nicht gefunden", {
          hint: "Stellen Sie sicher, dass die Plan-ID korrekt ist oder der Plan noch existiert.",
        });
      }
      const etag = buildPlanEtag(plan);
      if (etagMatches(req.headers?.["if-none-match"], etag)) {
        sendApiEmpty(res, 304, {
          headers: { ETag: etag },
          origin: requestOrigin,
        });
        return;
      }
      sendApiJson(res, 200, plan, {
        method,
        origin: requestOrigin,
        headers: { ETag: etag },
      });
    } catch (error) {
      handleApiError(res, error, method, requestOrigin, logOptions);
    }
    return;
  }

  if (method === "PUT") {
    try {
      const ifMatch = req.headers?.["if-match"];
      if (!ifMatch) {
        throw new HttpError(412, "If-Match Header ist erforderlich", {
          code: "missing-if-match",
          hint: "Senden Sie den aktuellen ETag des Plans im Header 'If-Match', um Konflikte zu vermeiden.",
        });
      }
      const current = await planStore.getPlan(planId);
      if (!current) {
        throw new HttpError(404, "Plan nicht gefunden", {
          hint: "Stellen Sie sicher, dass die Plan-ID korrekt ist oder der Plan noch existiert.",
        });
      }
      const currentEtag = buildPlanEtag(current);
      if (!ifMatchSatisfied(ifMatch, currentEtag)) {
        throw new PlanConflictError("Plan wurde bereits geändert.", { currentPlan: current });
      }
      const body = await readJsonBody(req);
      const replacement = validateCreatePayload(body);
      const plan = await planStore.replacePlan(planId, replacement, {
        expectedUpdatedAt: current.updatedAt,
      });
      if (!plan) {
        throw new HttpError(404, "Plan nicht gefunden", {
          hint: "Der Plan wurde eventuell gleichzeitig gelöscht. Laden Sie die Übersicht neu.",
        });
      }
      sendApiJson(res, 200, plan, {
        method,
        origin: requestOrigin,
        headers: { ETag: buildPlanEtag(plan) },
      });
    } catch (error) {
      handleApiError(res, error, method, requestOrigin, logOptions);
    }
    return;
  }

  if (method === "DELETE") {
    try {
      const ifMatch = req.headers?.["if-match"];
      if (!ifMatch) {
        throw new HttpError(412, "If-Match Header ist erforderlich", {
          code: "missing-if-match",
          hint: "Übermitteln Sie den zuletzt erhaltenen ETag im Header 'If-Match', um den Löschvorgang freizugeben.",
        });
      }
      const current = await planStore.getPlan(planId);
      if (!current) {
        throw new HttpError(404, "Plan nicht gefunden", {
          hint: "Prüfen Sie, ob der Plan bereits entfernt oder archiviert wurde.",
        });
      }
      const currentEtag = buildPlanEtag(current);
      if (!ifMatchSatisfied(ifMatch, currentEtag)) {
        throw new PlanConflictError("Plan wurde bereits geändert.", { currentPlan: current });
      }
      const removed = await planStore.deletePlan(planId, {
        expectedUpdatedAt: current.updatedAt,
      });
      if (!removed) {
        throw new HttpError(404, "Plan nicht gefunden", {
          hint: "Der Plan wurde möglicherweise parallel gelöscht. Aktualisieren Sie die Liste.",
        });
      }
      sendApiEmpty(res, 204, { origin: requestOrigin });
    } catch (error) {
      handleApiError(res, error, method, requestOrigin, logOptions);
    }
    return;
  }

  handleApiError(
    res,
    new HttpError(405, "Methode nicht erlaubt", {
      hint: "Erlaubte Methoden sind GET/HEAD (lesen), PUT (aktualisieren) und DELETE (entfernen).",
    }),
    method,
    requestOrigin,
    logOptions,
  );
}

/**
 * Creates the HTTP request handler for the NextPlanner server including API,
 * health-check and static-file routing.
 *
 * @param {object} [options]
 * @param {import("./stores/json-plan-store.js").JsonPlanStore} [options.store]
 * @param {import("./stores/json-template-store.js").JsonTemplateStore} [options.templateStore]
 * @param {import("./stores/json-snippet-store.js").JsonSnippetStore} [options.snippetStore]
 * @param {import("./stores/json-snippet-store.js").JsonSnippetStore} [options.quickSnippetStore]
 * @param {import("./stores/json-highlight-config-store.js").JsonHighlightConfigStore} [options.highlightConfigStore]
 * @param {string} [options.publicDir]
 * @param {import("./sessions/session-store.js").SessionStore} [options.sessionStore]
 * @param {Array<{ username: string, password?: string, passwordHash?: string, isAdmin?: boolean }>} [options.users]
 * @param {number} [options.sessionTtlMs]
 * @param {{ windowMs?: number, maxAttempts?: number, blockDurationMs?: number }} [options.loginRateLimit]
 * @returns {(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => Promise<void>}
 */
export function createRequestHandler({
  store,
  templateStore,
  snippetStore,
  quickSnippetStore,
  highlightConfigStore,
  publicDir,
  sessionStore: providedSessionStore,
  users,
  sessionTtlMs = DEFAULT_SESSION_TTL_MS,
  loginRateLimit,
} = {}) {
  const planStore = store ?? new JsonPlanStore();
  const templateStoreInstance = templateStore ?? new JsonTemplateStore();
  const teamSnippetStore = snippetStore ?? new JsonSnippetStore();
  const localQuickSnippetStore =
    quickSnippetStore ?? new JsonSnippetStore({ storageFile: DEFAULT_QUICK_SNIPPET_FILE });
  const localHighlightConfigStore =
    highlightConfigStore ?? new JsonHighlightConfigStore({ storageFile: DEFAULT_HIGHLIGHT_CONFIG_FILE });
  const defaultDir = path.join(CURRENT_DIR, "..", "public");
  const rootDir = path.resolve(publicDir ?? defaultDir);
  const sessionStore = providedSessionStore ?? new SessionStore({ defaultTtlMs: sessionTtlMs });
  const userRegistry = buildUserRegistry(users);
  const loginRateLimiter = new LoginRateLimiter(loginRateLimit);

  let requestCounter = 0;

  return async (req, res) => {
    const start = process.hrtime.bigint();
    const method = (req.method ?? "GET").toUpperCase();
    const requestId = ++requestCounter;
    const requestLogger = createRequestLogger({ req: requestId });
    let pathForLogging = req.url ?? "<unknown>";
    let authContext = { user: null, isAdmin: false, token: null };

    res.once("finish", () => {
      const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
      const status = res.statusCode ?? 0;
      const level =
        isApiRequest(pathForLogging) || isHealthCheckRequest(pathForLogging) ? "info" : "debug";
      const formattedDuration = Number.isFinite(durationMs)
        ? durationMs.toFixed(1)
        : "0.0";
      requestLogger[level](
        "%s %s -> %d (%s ms)",
        method,
        pathForLogging,
        status,
        formattedDuration,
      );
    });

    res.once("error", (error) => {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      requestLogger.error("Antwortfehler für %s %s: %s", method, pathForLogging, message);
    });

    const host = req.headers?.host ?? "localhost";
    let url;
    try {
      url = new URL(req.url ?? "/", `http://${host}`);
      pathForLogging = url.pathname;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      requestLogger.warn("Ungültige Anfrage-URL '%s': %s", req.url ?? "<unknown>", message);
      if (!res.headersSent) {
        sendJson(
          res,
          400,
          buildErrorPayload(
            "invalid-url",
            "Ungültige Anfrage-URL.",
            undefined,
            "Die angeforderte Adresse konnte nicht verarbeitet werden.",
          ),
          { method, headers: buildApiHeaders() },
        );
      } else {
        res.end();
      }
      return;
    }

    try {
      if (sessionStore) {
        await sessionStore.pruneExpired();
      }
      authContext = await resolveAuthContext(req, sessionStore, requestLogger);
      req.user = authContext.user;
      req.isAdmin = authContext.isAdmin;

      if (isHealthCheckRequest(url.pathname)) {
        await handleHealthRequest(
          req,
          res,
          url,
          {
            planStore,
            templateStore: templateStoreInstance,
            teamSnippetStore,
            quickSnippetStore: localQuickSnippetStore,
            highlightConfigStore: localHighlightConfigStore,
          },
          { method, logger: requestLogger },
        );
        return;
      }

      if (isApiRequest(url.pathname)) {
        await handleApiRequest(
          req,
          res,
          url,
          planStore,
          templateStoreInstance,
          teamSnippetStore,
          localQuickSnippetStore,
          localHighlightConfigStore,
          req.headers?.origin ?? "",
          {
            method,
            logger: requestLogger,
            auth: authContext,
            sessionStore,
            userRegistry,
            loginRateLimiter,
            sessionTtlMs,
          },
        );
        return;
      }

      await serveStatic(req, res, url, rootDir);
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error ?? "");
      requestLogger.error("Unerwarteter Fehler für %s %s: %s", method, pathForLogging, message);
      if (!res.headersSent) {
        sendJson(
          res,
          500,
          buildErrorPayload(
            "internal-error",
            "Interner Serverfehler",
            undefined,
            "Die Anfrage konnte nicht abgeschlossen werden. Laden Sie die Seite neu und versuchen Sie es erneut.",
          ),
          { method, headers: buildApiHeaders() },
        );
      } else {
        res.end();
      }
    }
  };
}

/**
 * Creates an HTTP server with graceful shutdown hooks and store lifecycle
 * management. The returned server listens for requests when `.listen()` is
 * invoked by the caller.
 *
 * @param {object} [options]
 * @param {import("./stores/json-plan-store.js").JsonPlanStore} [options.store]
 * @param {import("./stores/json-template-store.js").JsonTemplateStore} [options.templateStore]
 * @param {import("./stores/json-snippet-store.js").JsonSnippetStore} [options.snippetStore]
 * @param {import("./stores/json-snippet-store.js").JsonSnippetStore} [options.quickSnippetStore]
 * @param {import("./stores/json-highlight-config-store.js").JsonHighlightConfigStore} [options.highlightConfigStore]
 * @param {string} [options.publicDir]
 * @param {string[]} [options.gracefulShutdownSignals]
 * @returns {import("node:http").Server}
 */
export function createServer(options = {}) {
  const {
    store = new JsonPlanStore(),
    templateStore = new JsonTemplateStore(),
    snippetStore = new JsonSnippetStore(),
    quickSnippetStore = new JsonSnippetStore({ storageFile: DEFAULT_QUICK_SNIPPET_FILE }),
    highlightConfigStore = new JsonHighlightConfigStore({
      storageFile: DEFAULT_HIGHLIGHT_CONFIG_FILE,
    }),
    publicDir,
    sessionStore,
    users,
    sessionTtlMs = DEFAULT_SESSION_TTL_MS,
    loginRateLimit,
    gracefulShutdownSignals = ["SIGINT", "SIGTERM"],
  } = options;
  const activeSessionStore =
    sessionStore ?? new SessionStore({ defaultTtlMs: sessionTtlMs });
  const handler = createRequestHandler({
    store,
    templateStore,
    snippetStore,
    quickSnippetStore,
    highlightConfigStore,
    publicDir,
    sessionStore: activeSessionStore,
    users,
    sessionTtlMs,
    loginRateLimit,
  });
  const server = createHttpServer(handler);

  const signalHandlers = new Map();
  let shuttingDown = false;
  let closePromise;

  const closeStoreSafely = () => {
    if (closePromise) {
      return closePromise;
    }
    closePromise = (async () => {
      try {
        await store.close();
        await templateStore.close();
        if (snippetStore && typeof snippetStore.close === "function") {
          await snippetStore.close();
        }
        if (quickSnippetStore && typeof quickSnippetStore.close === "function") {
          await quickSnippetStore.close();
        }
        if (highlightConfigStore && typeof highlightConfigStore.close === "function") {
          await highlightConfigStore.close();
        }
        if (activeSessionStore && typeof activeSessionStore.close === "function") {
          await activeSessionStore.close();
        }
      } catch (error) {
        logger.error("Fehler beim Schließen des Planstores: %s", error);
        throw error;
      }
    })();
    return closePromise;
  };

  const removeSignalHandlers = () => {
    for (const [signal, listener] of signalHandlers.entries()) {
      process.off(signal, listener);
    }
    signalHandlers.clear();
  };

  server.on("close", () => {
    removeSignalHandlers();
    closeStoreSafely().catch(() => {});
  });

  const closeServer = () =>
    new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });

  if (Array.isArray(gracefulShutdownSignals) && gracefulShutdownSignals.length > 0) {
    for (const signal of gracefulShutdownSignals) {
      const listener = async () => {
        if (shuttingDown) {
          return;
        }
        shuttingDown = true;
        logger.warn("%s empfangen, Server wird beendet …", signal);
        try {
          await closeServer();
          await closeStoreSafely();
          removeSignalHandlers();
          logger.info("Server wurde sauber beendet.");
          process.exit(0);
        } catch (error) {
          logger.error("Fehler beim geordneten Shutdown: %s", error);
          removeSignalHandlers();
          process.exit(1);
        }
      };
      process.on(signal, listener);
      signalHandlers.set(signal, listener);
    }
  }

  return server;
}
