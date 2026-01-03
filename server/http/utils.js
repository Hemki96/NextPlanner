// Sammlung kleiner HTTP-Helfer, um ETags und Cache-Header auszuwerten. Diese
// Funktionen halten den Code in den Routen übersichtlich.
function parseHttpDate(value) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function etagMatches(header, currentEtag) {
  // Prüft, ob ein If-None-Match-Header mit dem aktuellen ETag übereinstimmt.
  // Unterstützt starke (W/) und schwache ETags.
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

function isRequestFresh(headers, etag, mtimeMs) {
  // Entscheidet, ob eine Ressource seit dem letzten Zugriff unverändert ist.
  // Wenn ja, kann der Server mit 304 Not Modified antworten.
  if (etagMatches(headers["if-none-match"], etag)) {
    return true;
  }
  const since = headers["if-modified-since"];
  if (!since) {
    return false;
  }
  const parsed = parseHttpDate(since);
  if (parsed === null) {
    return false;
  }
  return Math.floor(mtimeMs / 1000) <= Math.floor(parsed / 1000);
}

export { parseHttpDate, etagMatches, isRequestFresh };
