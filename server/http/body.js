import { HttpError } from "./http-error.js";

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

  if (!body.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(body);
    if (parsed === null || typeof parsed !== "object") {
      throw new HttpError(400, "JSON body muss ein Objekt sein", {
        hint: "Verwenden Sie ein JSON-Objekt statt Array oder primitive Werte.",
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

export { readJsonBody };
