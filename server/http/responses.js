import { HttpError } from "./http-error.js";

const API_CORS_HEADERS = {
  "Access-Control-Allow-Headers": "Content-Type,If-Match,If-None-Match",
  "Access-Control-Allow-Methods": "GET,HEAD,POST,PUT,DELETE,OPTIONS",
  "Access-Control-Allow-Credentials": "true",
  "Access-Control-Max-Age": "600",
};

const API_BASE_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'none'; script-src 'self'; base-uri 'self'; frame-ancestors 'none';",
  "X-Content-Type-Options": "nosniff",
});

function stringifyJson(payload, spacing = 0) {
  return spacing > 0 ? JSON.stringify(payload, null, spacing) : JSON.stringify(payload);
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

function selectCorsOrigin(origin, allowedOrigins) {
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return origin ?? "";
  }
  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }
  return allowedOrigins[0] ?? origin ?? "";
}

function withCorsHeaders(headers = {}, origin, allowedOrigins) {
  const chosenOrigin = selectCorsOrigin(origin, allowedOrigins);
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

function sendJson(res, status, payload, { headers = {}, method = "GET" } = {}) {
  const body = stringifyJson(payload, res.locals?.jsonSpacing ?? 0);
  const baseHeaders = {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  };
  res.writeHead(status, { ...headers, ...baseHeaders });
  if (method !== "HEAD") {
    res.end(body);
  } else {
    res.end();
  }
}

function sendEmpty(res, status, { headers = {} } = {}) {
  res.writeHead(status, headers);
  res.end();
}

function sendApiJson(res, status, payload, { origin, allowedOrigins, headers, method = "GET" } = {}) {
  const finalHeaders = withCorsHeaders(buildApiHeaders(headers), origin, allowedOrigins);
  sendJson(res, status, payload, { headers: finalHeaders, method });
}

function sendApiEmpty(res, status, { origin, allowedOrigins, headers } = {}) {
  const finalHeaders = withCorsHeaders(buildApiHeaders(headers), origin, allowedOrigins);
  sendEmpty(res, status, { headers: finalHeaders });
}

function handleApiError(res, error, { origin, allowedOrigins, cookies } = {}) {
  const status = error instanceof HttpError ? error.status : 500;
  const message =
    error instanceof HttpError && error.expose
      ? error.message
      : "Unerwarteter Fehler. Bitte versuchen Sie es erneut.";
  const payload = {
    error: {
      message,
      code: error instanceof HttpError ? error.code : "internal-error",
      hint: error instanceof HttpError ? error.hint : undefined,
    },
  };
  sendApiJson(res, status, payload, {
    origin,
    allowedOrigins,
    headers: cookies && cookies.length > 0 ? { "Set-Cookie": cookies } : undefined,
  });
}

export {
  buildApiHeaders,
  sendApiEmpty,
  sendApiJson,
  sendEmpty,
  sendJson,
  handleApiError,
  withCorsHeaders,
};
