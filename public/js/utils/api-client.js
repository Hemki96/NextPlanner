const DEFAULT_TIMEOUT = 8000;
const DEFAULT_RETRIES = 1;
const RETRY_BASE_DELAY_MS = 150;
const MUTATING_ETAG_METHODS = new Set(["PUT", "PATCH", "DELETE"]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD"]);
const API_PREFIX = "/api/";

const resourceEtags = new Map();

export class ApiError extends Error {
  constructor(message, { status = 0, body, cause, timeout = false, offline = false, transient = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.cause = cause;
    this.timeout = timeout;
    this.offline = offline;
    this.transient = transient;
  }
}

export function canUseApi() {
  if (typeof window === "undefined") {
    return false;
  }
  const protocol = window.location?.protocol ?? "";
  return protocol !== "file:";
}

function resolveBaseUrl(path) {
  if (typeof window === "undefined") {
    return path;
  }
  try {
    const url = new URL(path, window.location.origin);
    return url.toString();
  } catch {
    return path;
  }
}

function resolveCacheKey(path) {
  if (typeof path !== "string" || !path) {
    return null;
  }

  const base =
    typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost";

  try {
    const url = new URL(path, base);
    if (!url.pathname.startsWith(API_PREFIX)) {
      return null;
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return path.startsWith(API_PREFIX) ? path : null;
  }
}

function hasHeader(headers, name) {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === lower);
}

function applyIfMatchHeader(method, cacheKey, headers) {
  if (!cacheKey || !MUTATING_ETAG_METHODS.has(method)) {
    return;
  }
  if (hasHeader(headers, "if-match")) {
    return;
  }
  const cached = resourceEtags.get(cacheKey);
  if (cached) {
    headers["If-Match"] = cached;
  }
}

function rememberEtag(cacheKey, headers) {
  if (!cacheKey || !headers) {
    return;
  }
  const etag = headers.get("etag");
  if (etag) {
    resourceEtags.set(cacheKey, etag);
  }
}

function removeCachedEtag(cacheKey) {
  if (cacheKey) {
    resourceEtags.delete(cacheKey);
  }
}

export function getCachedEtag(path) {
  const cacheKey = resolveCacheKey(path);
  if (!cacheKey) {
    return null;
  }
  return resourceEtags.get(cacheKey) ?? null;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientStatus(status) {
  return status >= 500 || status === 408 || status === 429;
}

function normalizeError(error) {
  if (error instanceof ApiError) {
    return error;
  }
  if (error?.name === "AbortError") {
    return new ApiError("Zeitüberschreitung beim Zugriff auf den lokalen Server.", {
      timeout: true,
      transient: true,
      cause: error,
    });
  }
  return new ApiError("Netzwerkfehler beim Zugriff auf den lokalen Server.", {
    transient: true,
    cause: error,
  });
}

async function readResponseBody(response, isHeadRequest) {
  if (isHeadRequest || response.status === 204 || response.status === 304) {
    return null;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch (error) {
      throw new ApiError("Server lieferte keine gültige JSON-Antwort.", {
        status: response.status,
        cause: error,
      });
    }
  }
  const text = await response.text();
  return text || null;
}

function errorFromResponse(response, data) {
  let message = `Serverfehler (${response.status})`;
  if (data && typeof data === "object" && data.error) {
    if (typeof data.error === "string") {
      message = data.error;
    } else if (typeof data.error.message === "string") {
      message = data.error.message;
    } else if (typeof data.error.code === "string") {
      message = data.error.code;
    }
  }
  return new ApiError(message, {
    status: response.status,
    body: data,
    transient: isTransientStatus(response.status),
  });
}

export async function apiRequest(
  path,
  { method = "GET", json, headers = {}, timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES } = {},
) {
  if (!canUseApi() || typeof fetch !== "function") {
    throw new ApiError(
      "Lokaler Server nicht erreichbar. Bitte 'npm start' ausführen und die Anwendung über http://localhost:3000 öffnen.",
      { offline: true }
    );
  }

  const normalizedMethod = String(method ?? "GET").toUpperCase();
  const cacheKey = resolveCacheKey(path);
  const attemptLimit = IDEMPOTENT_METHODS.has(normalizedMethod) ? Math.max(0, retries) + 1 : 1;

  const finalHeaders = { ...headers };
  if (!hasHeader(finalHeaders, "accept")) {
    finalHeaders.Accept = "application/json";
  }

  let body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!hasHeader(finalHeaders, "content-type")) {
      finalHeaders["Content-Type"] = "application/json";
    }
  }

  applyIfMatchHeader(normalizedMethod, cacheKey, finalHeaders);
  const isHeadRequest = normalizedMethod === "HEAD";
  let lastError;

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    // Der Timer bleibt bis zum Ende des Body-Readings aktiv, nicht nur bis
    // zum Headers der Antwort.
    const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

    try {
      const response = await fetch(resolveBaseUrl(path), {
        method: normalizedMethod,
        headers: finalHeaders,
        body,
        signal: controller?.signal,
        credentials: "include",
      });
      const data = await readResponseBody(response, isHeadRequest);

      if (!response.ok) {
        if ((response.status === 412 || response.status === 428 || response.status === 409) && cacheKey) {
          removeCachedEtag(cacheKey);
        }
        throw errorFromResponse(response, data);
      }

      if (normalizedMethod === "DELETE") {
        removeCachedEtag(cacheKey);
      } else {
        const preferredKey =
          normalizedMethod === "POST"
            ? resolveCacheKey(response.headers.get("location") ?? path)
            : cacheKey;
        if (preferredKey) {
          rememberEtag(preferredKey, response.headers);
        }
      }

      return { data, status: response.status, headers: response.headers };
    } catch (error) {
      lastError = normalizeError(error);
      if (lastError.transient && attempt < attemptLimit - 1) {
        await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
        // eslint-disable-next-line no-continue
        continue;
      }
      throw lastError;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  throw lastError ?? new ApiError("Unbekannter API-Fehler.");
}

export function describeApiError(error) {
  if (error instanceof ApiError) {
    if (error.offline) {
      return error.message;
    }
    if (error.timeout) {
      return "Der Server hat nicht rechtzeitig geantwortet. Bitte später erneut versuchen.";
    }
    if (error.body && typeof error.body === "object" && error.body.error) {
      const details = error.body.error;
      if (typeof details.message === "string" && details.message.trim()) {
        return details.message;
      }
      if (typeof details.code === "string" && details.code.trim()) {
        return details.code;
      }
    }
    return error.message || "Unbekannter API-Fehler.";
  }
  return error?.message ?? "Unbekannter Fehler.";
}

function requestWithMethod(method, path, options) {
  return apiRequest(path, { ...options, method });
}

export function get(path, options) {
  return requestWithMethod("GET", path, options);
}

export function head(path, options) {
  return requestWithMethod("HEAD", path, options);
}

export function post(path, options) {
  return requestWithMethod("POST", path, options);
}

export function put(path, options) {
  return requestWithMethod("PUT", path, options);
}

export function patch(path, options) {
  return requestWithMethod("PATCH", path, options);
}

function deleteRequest(path, options) {
  return requestWithMethod("DELETE", path, options);
}

export { deleteRequest as delete };
