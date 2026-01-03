// Helfer rund um HTTP-Antworten: JSON-Antworten erstellen, leere Antworten
// senden und CORS-Header korrekt setzen. Alle Funktionen sind so gehalten, dass
// sie auch von wenig erfahrenen Entwickler:innen verstanden werden können.
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
  // Wandelt ein Objekt in einen JSON-String um und berücksichtigt optional eine
  // hübsche Einrückung für lokale Debug-Zwecke.
  return spacing > 0 ? JSON.stringify(payload, null, spacing) : JSON.stringify(payload);
}

function appendVary(value, field) {
  // Ergänzt ein Header-Feld in einer Vary-Liste, ohne Duplikate zu erzeugen.
  const vary = new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  );
  vary.add(field);
  return Array.from(vary).join(", ");
}

function isLoopbackOrigin(origin) {
  // Erlaubt localhost-Hosts immer, um lokale Entwicklung zu vereinfachen.
  if (!origin) return false;
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function selectCorsOrigin(origin, allowedOrigins) {
  // Wählt den Origin aus, der im CORS-Header zurückgegeben werden soll. Falls
  // keiner explizit erlaubt ist, wird der anfragende Origin gespiegelt.
  if (!allowedOrigins || allowedOrigins.length === 0) {
    return origin ?? "";
  }
  if (origin && allowedOrigins.includes(origin)) {
    return origin;
  }
  if (origin && isLoopbackOrigin(origin)) {
    return origin;
  }
  return allowedOrigins[0] ?? origin ?? "";
}

function withCorsHeaders(headers = {}, origin, allowedOrigins) {
  // Ergänzt die Standard-CORS-Header um den passenden Origin.
  const chosenOrigin = selectCorsOrigin(origin, allowedOrigins);
  const base = { ...API_CORS_HEADERS, ...headers };
  if (chosenOrigin) {
    base["Access-Control-Allow-Origin"] = chosenOrigin;
  }
  base.Vary = appendVary(base.Vary, "Origin");
  return base;
}

function buildApiHeaders(extra = {}) {
  // Basis-HTTP-Sicherheitsheader plus optionale Ergänzungen.
  return { ...API_BASE_HEADERS, ...extra };
}

function sendJson(res, status, payload, { headers = {}, method = "GET" } = {}) {
  // Schickt JSON-Antworten inklusive Content-Length. HEAD-Requests erhalten
  // keinen Body, behalten aber die gleichen Header.
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
  // Universelle Funktion zum Senden leerer Antworten.
  res.writeHead(status, headers);
  res.end();
}

function sendApiJson(res, status, payload, { origin, allowedOrigins, headers, method = "GET" } = {}) {
  // API-spezifische Variante, die CORS-Header mitliefert.
  const finalHeaders = withCorsHeaders(buildApiHeaders(headers), origin, allowedOrigins);
  sendJson(res, status, payload, { headers: finalHeaders, method });
}

function sendApiEmpty(res, status, { origin, allowedOrigins, headers } = {}) {
  const finalHeaders = withCorsHeaders(buildApiHeaders(headers), origin, allowedOrigins);
  sendEmpty(res, status, { headers: finalHeaders });
}

function handleApiError(res, error, { origin, allowedOrigins, cookies } = {}) {
  // Vereinheitlichte Fehlerbehandlung für alle API-Calls. Ob eine detaillierte
  // Fehlermeldung ausgegeben wird, hängt von der HttpError-Konfiguration ab.
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
