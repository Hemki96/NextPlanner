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
