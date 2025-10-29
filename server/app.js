import { createHash } from "node:crypto";
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

const API_CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type,If-Match,If-None-Match",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
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
  const body = JSON.stringify(payload, null, 2);
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
    "Cache-Control": "public, max-age=300",
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

function handleApiError(res, error, method = "GET", origin) {
  const sendError = (status, code, message, details, headers, hint) => {
    sendApiJson(res, status, buildErrorPayload(code, message, details, hint), {
      method,
      origin,
      headers,
    });
  };

  if (error instanceof HttpError) {
    const message = error.expose ? error.message : "Unbekannter Fehler";
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
  if (error instanceof PlanConflictError) {
    const details = error.currentPlan ? { currentPlan: error.currentPlan } : undefined;
    const headers = error.currentPlan ? { ETag: buildPlanEtag(error.currentPlan) } : undefined;
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
  console.error("Unexpected API error", error);
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

async function handleApiRequest(
  req,
  res,
  url,
  planStore,
  snippetStore,
  origin,
) {
  const requestOrigin = origin ?? req.headers?.origin ?? "";
  const method = (req.method ?? "GET").toUpperCase();

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
        handleApiError(res, error, method, requestOrigin);
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
        handleApiError(res, error, method, requestOrigin);
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
    );
    return;
  }

  if (url.pathname === "/api/snippets") {
    if (!snippetStore) {
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
        const library = await snippetStore.getLibrary();
        sendApiJson(res, 200, library, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin);
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
        const library = await snippetStore.replaceLibrary(payload);
        sendApiJson(res, 200, library, { method, origin: requestOrigin });
      } catch (error) {
        handleApiError(res, error, method, requestOrigin);
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
        handleApiError(res, error, method, requestOrigin);
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
        handleApiError(res, error, method, requestOrigin);
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
      handleApiError(res, error, method, requestOrigin);
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
      handleApiError(res, error, method, requestOrigin);
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
      handleApiError(res, error, method, requestOrigin);
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
  );
}

export function createRequestHandler({ store, snippetStore, publicDir } = {}) {
  const planStore = store ?? new JsonPlanStore();
  const teamSnippetStore = snippetStore ?? new JsonSnippetStore();
  const defaultDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "public",
  );
  const rootDir = path.resolve(publicDir ?? defaultDir);

  return async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (isApiRequest(url.pathname)) {
        await handleApiRequest(
          req,
          res,
          url,
          planStore,
          teamSnippetStore,
          req.headers?.origin ?? "",
        );
        return;
      }
      await serveStatic(req, res, url, rootDir);
    } catch (error) {
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
        );
      } else {
        res.end();
      }
    }
  };
}

export function createServer(options = {}) {
  const {
    store = new JsonPlanStore(),
    snippetStore = new JsonSnippetStore(),
    publicDir,
    gracefulShutdownSignals = ["SIGINT", "SIGTERM"],
  } = options;
  const handler = createRequestHandler({ store, snippetStore, publicDir });
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
        if (snippetStore && typeof snippetStore.close === "function") {
          await snippetStore.close();
        }
      } catch (error) {
        console.error("Fehler beim Schließen des Planstores", error);
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
        try {
          await closeServer();
          await closeStoreSafely();
          removeSignalHandlers();
          process.exit(0);
        } catch (error) {
          console.error("Fehler beim geordneten Shutdown", error);
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
