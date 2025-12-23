const DEFAULT_TIMEOUT = 8000;
const MUTATING_ETAG_METHODS = new Set(["PUT", "PATCH", "DELETE"]);
const API_PREFIX = "/api/";

const resourceEtags = new Map();

export class ApiError extends Error {
  constructor(message, { status = 0, body, cause, timeout = false, offline = false } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.cause = cause;
    this.timeout = timeout;
    this.offline = offline;
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

export async function apiRequest(
  path,
  { method = "GET", json, headers = {}, timeout = DEFAULT_TIMEOUT } = {},
) {
  if (!canUseApi() || typeof fetch !== "function") {
    throw new ApiError(
      "Lokaler Server nicht erreichbar. Bitte 'npm start' ausführen und die Anwendung über http://localhost:3000 öffnen.",
      { offline: true }
    );
  }

  const normalizedMethod = String(method ?? "GET").toUpperCase();
  const cacheKey = resolveCacheKey(path);
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

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

  let response;
  try {
    response = await fetch(resolveBaseUrl(path), {
      method: normalizedMethod,
      headers: finalHeaders,
      body,
      signal: controller?.signal,
      credentials: "include",
    });
  } catch (error) {
    if (controller && error?.name === "AbortError") {
      throw new ApiError("Zeitüberschreitung beim Zugriff auf den lokalen Server.", {
        timeout: true,
        cause: error,
      });
    }
    throw new ApiError("Netzwerkfehler beim Zugriff auf den lokalen Server.", { cause: error });
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }

  const contentType = response.headers.get("content-type") ?? "";
  let data = null;
  const isHeadRequest = normalizedMethod === "HEAD";
  if (!isHeadRequest && response.status !== 204 && response.status !== 304) {
    if (contentType.includes("application/json")) {
      try {
        data = await response.json();
      } catch (error) {
        throw new ApiError("Server lieferte keine gültige JSON-Antwort.", {
          status: response.status,
          cause: error,
        });
      }
    } else {
      const text = await response.text();
      data = text || null;
    }
  }

  if (!response.ok) {
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
    if ((response.status === 412 || response.status === 409) && cacheKey) {
      removeCachedEtag(cacheKey);
    }
    throw new ApiError(message, { status: response.status, body: data });
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
