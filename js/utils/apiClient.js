const DEFAULT_TIMEOUT = 8000;

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

export async function apiRequest(path, { method = "GET", json, headers = {}, timeout = DEFAULT_TIMEOUT } = {}) {
  if (!canUseApi() || typeof fetch !== "function") {
    throw new ApiError(
      "Lokaler Server nicht erreichbar. Bitte 'npm start' ausführen und die Anwendung über http://localhost:3000 öffnen.",
      { offline: true }
    );
  }

  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null;

  const finalHeaders = { ...headers };
  let body;
  if (json !== undefined) {
    body = JSON.stringify(json);
    if (!finalHeaders["Content-Type"]) {
      finalHeaders["Content-Type"] = "application/json";
    }
  }

  let response;
  try {
    response = await fetch(resolveBaseUrl(path), {
      method,
      headers: finalHeaders,
      body,
      signal: controller?.signal,
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
  if (response.status !== 204) {
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
    const message = typeof data === "object" && data?.error ? data.error : `Serverfehler (${response.status})`;
    throw new ApiError(message, { status: response.status, body: data });
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
    return error.message || "Unbekannter API-Fehler.";
  }
  return error?.message ?? "Unbekannter Fehler.";
}
