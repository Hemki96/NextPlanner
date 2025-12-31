import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";

import { sendEmpty } from "../http/responses.js";
import { isRequestFresh } from "../http/utils.js";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

const STATIC_SECURITY_HEADERS = Object.freeze({
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
});

const IMMUTABLE_CACHE_EXTENSIONS = new Set([
  ".css",
  ".js",
  ".mjs",
  ".cjs",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".json",
]);

const FINGERPRINT_PATTERN = /(?:^|[.-])[0-9a-f]{8,}(?:\.|$)/i;

function mapExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function resolveCacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") {
    return "public, max-age=60";
  }

  const fileName = path.basename(filePath);
  if (IMMUTABLE_CACHE_EXTENSIONS.has(ext) && FINGERPRINT_PATTERN.test(fileName)) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=3600";
}

function sanitizePath(rootDir, requestedPath) {
  const decoded = decodeURIComponent(requestedPath);
  let normalized = path.normalize(decoded);

  if (normalized === path.sep || normalized === "." || normalized === "") {
    normalized = "index.html";
  }

  if (normalized.endsWith(path.sep)) {
    normalized = path.join(normalized, "index.html");
  }

  normalized = normalized.replace(/^[/\\]+/, "");
  if (!normalized) {
    normalized = "index.html";
  }

  const resolved = path.resolve(rootDir, normalized);
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  if (resolved !== rootDir && !resolved.startsWith(rootWithSep)) {
    return null;
  }

  return resolved;
}

function createStaticRouter({ publicDir }) {
  return async function staticRouter(ctx) {
    const safePath = sanitizePath(publicDir, ctx.url.pathname);
    if (!safePath) {
      sendEmpty(ctx.res, 403, { headers: STATIC_SECURITY_HEADERS });
      return true;
    }

    let filePath = safePath;
    let fileStat;
    let attemptedFallback = false;

    const isLoginPage = safePath.endsWith(`${path.sep}login.html`) || safePath.endsWith("login.html");
    const isHtmlRequest = safePath.toLowerCase().endsWith(".html");
    const devAuthEnabled = Boolean(ctx.config?.security?.devAuth?.enabled);

    if (isHtmlRequest && !isLoginPage && !ctx.authUser && !devAuthEnabled) {
      const next = `${ctx.url.pathname ?? ""}${ctx.url.search ?? ""}`;
      const params = new URLSearchParams({ reason: "login-required" });
      if (next.startsWith("/")) {
        params.set("next", next);
      }
      const location = `/login.html?${params.toString()}`;
      ctx.res.writeHead(302, { Location: location, "Cache-Control": "no-store", ...STATIC_SECURITY_HEADERS });
      ctx.res.end();
      return true;
    }

    while (true) {
      try {
        // eslint-disable-next-line no-await-in-loop
        fileStat = await stat(filePath);
        if (fileStat.isDirectory()) {
          filePath = path.join(filePath, "index.html");
          continue;
        }
        break;
      } catch (error) {
        if (!attemptedFallback && (ctx.req.method === "GET" || ctx.req.method === "HEAD")) {
          filePath = path.join(publicDir, "index.html");
          attemptedFallback = true;
          continue;
        }
        sendEmpty(ctx.res, 404, { headers: STATIC_SECURITY_HEADERS });
        return true;
      }
    }

    const method = ctx.req.method ?? "GET";
    const mime = mapExtension(filePath);
    const etag = `"${fileStat.size.toString(16)}-${Math.floor(fileStat.mtimeMs).toString(16)}"`;
    const cacheHeaders = {
      "Last-Modified": fileStat.mtime.toUTCString(),
      ETag: etag,
      "Cache-Control": resolveCacheControl(filePath),
    };

    const notModifiedHeaders = { ...cacheHeaders, ...STATIC_SECURITY_HEADERS };
    if (isRequestFresh(ctx.req.headers ?? {}, etag, fileStat.mtimeMs)) {
      ctx.res.writeHead(304, notModifiedHeaders);
      ctx.res.end();
      return true;
    }

    const headers = {
      ...cacheHeaders,
      "Content-Type": mime,
      "Content-Length": fileStat.size,
    };
    const responseHeaders = { ...headers, ...STATIC_SECURITY_HEADERS };

    if (method === "HEAD") {
      ctx.res.writeHead(200, responseHeaders);
      ctx.res.end();
      return true;
    }

    if (method !== "GET") {
      sendEmpty(ctx.res, 405, { headers: STATIC_SECURITY_HEADERS });
      return true;
    }

    const stream = createReadStream(filePath);
    stream.once("open", () => {
      ctx.res.writeHead(200, responseHeaders);
    });
    stream.once("error", (error) => {
      if (!ctx.res.headersSent) {
        const status = error?.code === "ENOENT" ? 404 : 500;
        sendEmpty(ctx.res, status, { headers: STATIC_SECURITY_HEADERS });
      } else {
        ctx.res.destroy(error);
      }
    });
    ctx.res.once("close", () => {
      stream.destroy();
    });
    stream.pipe(ctx.res);
    return true;
  };
}

export { createStaticRouter };
