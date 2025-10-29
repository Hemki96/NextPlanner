import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  JsonPlanStore,
  PlanValidationError,
  StorageIntegrityError,
} from "../js/storage/jsonPlanStore.js";

class HttpError extends Error {
  constructor(status, message, { expose = true } = {}) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.expose = expose;
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

const API_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
  "Access-Control-Max-Age": "600",
};

function withCorsHeaders(headers = {}) {
  return { ...API_CORS_HEADERS, ...headers };
}

function sendJson(res, status, payload, { cors = false, method = "GET" } = {}) {
  const body = JSON.stringify(payload, null, 2);
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  };
  res.writeHead(status, cors ? withCorsHeaders(headers) : headers);
  if (method !== "HEAD") {
    res.end(body);
  } else {
    res.end();
  }
}

function sendEmpty(res, status, { cors = false } = {}) {
  if (cors) {
    res.writeHead(status, withCorsHeaders());
  } else {
    res.writeHead(status);
  }
  res.end();
}

async function readJsonBody(req) {
  const chunks = [];
  let totalLength = 0;
  const limit = 1_000_000;

  const method = req.method ?? "GET";
  if (method === "POST" || method === "PATCH") {
    const contentType = req.headers["content-type"] ?? "";
    if (!/^application\/json(?:;|$)/i.test(contentType)) {
      throw new HttpError(415, "Content-Type muss application/json sein");
    }
  }

  for await (const chunk of req) {
    totalLength += chunk.length;
    if (totalLength > limit) {
      throw new HttpError(413, "Request body too large");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  const body = Buffer.concat(chunks).toString("utf8");
  if (!body.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object") {
      throw new HttpError(400, "JSON body muss ein Objekt sein");
    }
    return parsed;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "Ungültige JSON-Nutzlast");
  }
}

function isApiRequest(pathname) {
  return pathname.startsWith("/api/");
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
    sendEmpty(res, 403);
    return;
  }

  let filePath = safePath;
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
  } catch (error) {
    if (req.method === "GET" || req.method === "HEAD") {
      filePath = path.join(rootDir, "index.html");
    } else {
      sendEmpty(res, 404);
      return;
    }
  }

  try {
    const content = await readFile(filePath);
    const mime = mapExtension(filePath);
    const headers = {
      "Content-Type": mime,
    };
    if (req.method === "HEAD") {
      headers["Content-Length"] = Buffer.byteLength(content);
      res.writeHead(200, headers);
      res.end();
      return;
    }
    res.writeHead(200, headers);
    res.end(content);
  } catch (error) {
    sendEmpty(res, 404);
  }
}

function parseIdFromPath(pathname) {
  const match = /^\/api\/plans\/(\d+)$/.exec(pathname);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

function ensureJsonObject(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new HttpError(400, "JSON body muss ein Objekt sein");
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
    throw new HttpError(400, "metadata muss ein Objekt sein");
  }
  return metadata;
}

function validateCreatePayload(payload) {
  const data = ensureJsonObject(payload);
  const { title, content, planDate, focus, metadata } = data;
  if (typeof title !== "string" || !title.trim()) {
    throw new HttpError(400, "title ist erforderlich und muss ein String sein");
  }
  if (typeof content !== "string" || !content.trim()) {
    throw new HttpError(400, "content ist erforderlich und muss ein String sein");
  }
  if (typeof planDate !== "string" || !planDate.trim()) {
    throw new HttpError(400, "planDate ist erforderlich und muss ein ISO-Datum sein");
  }
  if (typeof focus !== "string" || !focus.trim()) {
    throw new HttpError(400, "focus ist erforderlich und muss ein String sein");
  }
  return {
    title,
    content,
    planDate,
    focus,
    metadata: validateMetadata(metadata) ?? {},
  };
}

function validateUpdatePayload(payload) {
  const data = ensureJsonObject(payload);
  const allowedKeys = ["title", "content", "planDate", "focus", "metadata"];
  const updates = {};
  let changed = false;
  for (const key of allowedKeys) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) {
      continue;
    }
    const value = data[key];
    changed = true;
    if (key === "metadata") {
      updates.metadata = validateMetadata(value);
    } else if (value === undefined || value === null) {
      throw new HttpError(400, `${key} darf nicht leer sein`);
    } else if (typeof value !== "string" || !value.trim()) {
      throw new HttpError(400, `${key} muss ein nicht-leerer String sein`);
    } else {
      updates[key] = value;
    }
  }
  if (!changed) {
    throw new HttpError(400, "Keine gültigen Felder für Update vorhanden");
  }
  return updates;
}

function handleApiError(res, error, method = "GET") {
  if (error instanceof HttpError) {
    const payload = { error: error.message };
    sendJson(res, error.status, payload, { cors: true, method });
    return;
  }
  if (error instanceof PlanValidationError) {
    sendJson(res, 400, { error: error.message }, { cors: true, method });
    return;
  }
  if (error instanceof StorageIntegrityError) {
    const body = { error: error.message };
    if (error.backupFile) {
      body.backupFile = error.backupFile;
    }
    sendJson(res, 503, body, { cors: true, method });
    return;
  }
  console.error("Unexpected API error", error);
  const message = process.env.NODE_ENV === "development" ? error.message : "Interner Serverfehler";
  sendJson(res, 500, { error: message }, { cors: true, method });
}

async function handleApiRequest(req, res, url, store) {
  const method = req.method ?? "GET";

  if (method === "OPTIONS") {
    sendEmpty(res, 204, { cors: true });
    return;
  }

  if (url.pathname === "/api/plans") {
    if (method === "POST") {
      try {
        const body = await readJsonBody(req);
        const payload = validateCreatePayload(body);
        const plan = await store.createPlan(payload);
        sendJson(res, 201, plan, { cors: true, method });
      } catch (error) {
        handleApiError(res, error, method);
      }
      return;
    }

    if (method === "GET" || method === "HEAD") {
      try {
        const { focus, from, to } = url.searchParams;
        const plans = await store.listPlans({
          focus: focus ?? undefined,
          from: from ?? undefined,
          to: to ?? undefined,
        });
        sendJson(res, 200, plans, { cors: true, method });
      } catch (error) {
        handleApiError(res, error, method);
      }
      return;
    }

    handleApiError(res, new HttpError(405, "Methode nicht erlaubt"), method);
    return;
  }

  const planId = parseIdFromPath(url.pathname);
  if (planId === null) {
    handleApiError(res, new HttpError(404, "Endpunkt nicht gefunden"), method);
    return;
  }

  if (method === "GET" || method === "HEAD") {
    try {
      const plan = await store.getPlan(planId);
      if (!plan) {
        throw new HttpError(404, "Plan nicht gefunden");
      }
      sendJson(res, 200, plan, { cors: true, method });
    } catch (error) {
      handleApiError(res, error, method);
    }
    return;
  }

  if (method === "PATCH") {
    try {
      const body = await readJsonBody(req);
      const updates = validateUpdatePayload(body);
      const plan = await store.updatePlan(planId, updates);
      if (!plan) {
        throw new HttpError(404, "Plan nicht gefunden");
      }
      sendJson(res, 200, plan, { cors: true, method });
    } catch (error) {
      handleApiError(res, error, method);
    }
    return;
  }

  if (method === "DELETE") {
    try {
      const removed = await store.deletePlan(planId);
      if (!removed) {
        throw new HttpError(404, "Plan nicht gefunden");
      }
      sendEmpty(res, 204, { cors: true });
    } catch (error) {
      handleApiError(res, error, method);
    }
    return;
  }

  handleApiError(res, new HttpError(405, "Methode nicht erlaubt"), method);
}

export function createRequestHandler({ store = new JsonPlanStore(), publicDir } = {}) {
  const defaultDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const rootDir = path.resolve(publicDir ?? defaultDir);

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (isApiRequest(url.pathname)) {
        await handleApiRequest(req, res, url, store);
        return;
      }
      await serveStatic(req, res, url, rootDir);
    } catch (error) {
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Interner Serverfehler" });
      } else {
        res.end();
      }
    }
  };
}

export function createServer(options = {}) {
  const handler = createRequestHandler(options);
  return createHttpServer(handler);
}
