// Routen für Textbausteine (Snippets). Ermöglicht das Laden und Ersetzen der
// gesamten Bibliothek.
import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";

function createSnippetsRouter({ snippetService }) {
  return async function snippetsRouter(ctx) {
    if (ctx.url.pathname !== "/api/snippets") {
      return false;
    }
    const origin = ctx.origin;
    const allowedOrigins = ctx.config.server.allowedOrigins;
    const method = (ctx.req.method ?? "GET").toUpperCase();

    if (method === "OPTIONS") {
      sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
      return true;
    }

    if (method === "GET" || method === "HEAD") {
      const library = await snippetService.getLibrary();
      sendApiJson(ctx.res, 200, library, { origin, allowedOrigins, headers: ctx.withCookies(), method });
      return true;
    }

    if (method === "PUT") {
      try {
        const saved = await snippetService.replaceLibrary(ctx.body ?? {});
        sendApiJson(ctx.res, 200, saved, { origin, allowedOrigins, headers: ctx.withCookies() });
      } catch (error) {
        const code = error.code ?? "invalid-snippet-payload";
        sendApiJson(ctx.res, 400, { error: { code, message: error.message } }, { origin, allowedOrigins, headers: ctx.withCookies() });
      }
      return true;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  };
}

export { createSnippetsRouter };
