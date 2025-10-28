import { createServer as createHttpServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { JsonPlanStore } from "../js/storage/jsonPlanStore.js";

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

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

function sendEmpty(res, status) {
  res.writeHead(status);
  res.end();
}

async function readJsonBody(req) {
  const chunks = [];
  let totalLength = 0;
  const limit = 1_000_000;

  for await (const chunk of req) {
    totalLength += chunk.length;
    if (totalLength > limit) {
      throw new Error("Request body too large");
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
    return JSON.parse(body);
  } catch (error) {
    throw new Error("Ungültige JSON-Nutzlast");
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

async function handleApiRequest(req, res, url, store) {
  if (req.method === "POST" && url.pathname === "/api/plans") {
    try {
      const body = await readJsonBody(req);
      const plan = store.createPlan(body);
      sendJson(res, 201, plan);
    } catch (error) {
      const status = error.message.includes("JSON") || error.message.includes("body") ? 400 : error instanceof TypeError ? 400 : 500;
      sendJson(res, status, { error: error.message });
    }
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/plans") {
    try {
      const { focus, from, to } = url.searchParams;
      const plans = store.listPlans({
        focus: focus ?? undefined,
        from: from ?? undefined,
        to: to ?? undefined,
      });
      sendJson(res, 200, plans);
    } catch (error) {
      const status = error instanceof TypeError ? 400 : 500;
      sendJson(res, status, { error: error.message });
    }
    return;
  }

  const planId = parseIdFromPath(url.pathname);
  if (planId === null) {
    sendJson(res, 404, { error: "Endpunkt nicht gefunden" });
    return;
  }

  if (req.method === "GET") {
    const plan = store.getPlan(planId);
    if (!plan) {
      sendJson(res, 404, { error: "Plan nicht gefunden" });
      return;
    }
    sendJson(res, 200, plan);
    return;
  }

  if (req.method === "PATCH") {
    try {
      const body = await readJsonBody(req);
      const updates = {};
      if (Object.prototype.hasOwnProperty.call(body, "title")) {
        updates.title = body.title;
      }
      if (Object.prototype.hasOwnProperty.call(body, "content")) {
        updates.content = body.content;
      }
      if (Object.prototype.hasOwnProperty.call(body, "planDate")) {
        updates.planDate = body.planDate;
      }
      if (Object.prototype.hasOwnProperty.call(body, "focus")) {
        updates.focus = body.focus;
      }
      if (Object.prototype.hasOwnProperty.call(body, "metadata")) {
        updates.metadata = body.metadata;
      }
      const plan = store.updatePlan(planId, updates);
      if (!plan) {
        sendJson(res, 404, { error: "Plan nicht gefunden" });
        return;
      }
      sendJson(res, 200, plan);
    } catch (error) {
      const status = error instanceof TypeError ? 400 : 500;
      sendJson(res, status, { error: error.message });
    }
    return;
  }

  if (req.method === "DELETE") {
    const removed = store.deletePlan(planId);
    if (!removed) {
      sendJson(res, 404, { error: "Plan nicht gefunden" });
      return;
    }
    sendEmpty(res, 204);
    return;
  }

  sendJson(res, 405, { error: "Methode nicht erlaubt" });
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
