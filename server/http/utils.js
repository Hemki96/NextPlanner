// Kleine HTTP-Helfer für bedingte Anfragen. Der ETag-Vergleich ist im
// zentralen ETag-Modul implementiert und wird hier nur weitergereicht.
import { etagMatches } from "./etag.js";

function parseHttpDate(value) {
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function isRequestFresh(headers, etag, mtimeMs) {
  // Entscheidet, ob eine Ressource seit dem letzten Zugriff unverändert ist.
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
