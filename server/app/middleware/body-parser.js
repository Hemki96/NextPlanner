// Middleware, die JSON-Bodies für API-Endpunkte einliest und am Kontext
// ablegt. So müssen die einzelnen Routen sich nicht selbst um das Parsing
// kümmern und können direkt auf `ctx.body` zugreifen.
import { readJsonBody } from "../../http/body.js";

const API_JSON_METHODS = new Set(["POST", "PUT", "PATCH"]);

async function parseApiJsonBody(ctx) {
  const method = (ctx.req.method ?? "GET").toUpperCase();
  if (!ctx.url.pathname.startsWith("/api/") || !API_JSON_METHODS.has(method)) {
    return;
  }
  const contentType = ctx.req.headers?.["content-type"] ?? "";
  if (/^application\/json/i.test(contentType)) {
    ctx.body = await readJsonBody(ctx.req);
  } else {
    ctx.body = {};
  }
}

export { parseApiJsonBody };
