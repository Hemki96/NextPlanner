// Helfer für HTTP-Präconditions wie If-Match und If-None-Match. Diese Funktionen
// sorgen dafür, dass konkurrierende Änderungen sauber erkannt und behandelt
// werden.
import { HttpError } from "./http-error.js";
import { sendApiEmpty, sendApiJson } from "./responses.js";

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
    if (candidate === currentEtag) return true;
    if (candidate.startsWith("W/")) {
      return candidate.slice(2) === currentEtag;
    }
    if (currentEtag.startsWith("W/")) {
      return currentEtag.slice(2) === candidate;
    }
    return false;
  });
}

function requireIfMatch(req) {
  // Stellt sicher, dass eine Anfrage einen If-Match-Header mitbringt, wenn eine
  // Ressource modifiziert werden soll. Fehlt er, wird mit 428 geantwortet.
  const header = req.headers?.["if-match"];
  if (!header) {
    throw new HttpError(428, "If-Match Header erforderlich", { code: "missing-precondition" });
  }
  return header;
}

function sendPreconditionFailed(res, { origin, allowedOrigins, headers, message, details, etag, method }) {
  // Vereinheitlichte Antwort für 412 Precondition Failed mit CORS-Headern.
  const extraHeaders = typeof headers === "function" ? headers(etag ? { ETag: etag } : {}) : headers;
  sendApiJson(
    res,
    412,
    { error: { message, details } },
    {
      origin,
      allowedOrigins,
      headers: extraHeaders,
      method,
    },
  );
}

function respondIfNoneMatch(req, res, etag, { origin, allowedOrigins, headers }) {
  // Reagiert auf If-None-Match und liefert 304 Not Modified, wenn der ETag noch
  // übereinstimmt. Spart Bandbreite bei unveränderten Ressourcen.
  if (!etagMatches(req.headers?.["if-none-match"], etag)) {
    return false;
  }
  sendApiEmpty(res, 304, { origin, allowedOrigins, headers: headers({ ETag: etag }) });
  return true;
}

export { etagMatches, requireIfMatch, respondIfNoneMatch, sendPreconditionFailed };
