// API-Routen für Vorlagen (Templates). Zuständig für Auflisten, Anlegen,
// Aktualisieren und Löschen inklusive ETag-Handling.
import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";
import { etagMatches } from "../http/utils.js";
import { TemplateValidationError, buildTemplateEtag } from "../services/template-service.js";

function requireAuth(ctx) {
  if (!ctx.authUser) {
    throw new HttpError(401, "Authentifizierung erforderlich.");
  }
}

function createTemplatesRouter({ templateService }) {
  return async function templatesRouter(ctx) {
    if (!ctx.url.pathname.startsWith("/api/templates")) {
      return false;
    }

    const origin = ctx.origin;
    const allowedOrigins = ctx.config.server.allowedOrigins;
    const method = (ctx.req.method ?? "GET").toUpperCase();
    const pathParts = ctx.url.pathname.split("/").filter(Boolean);
    const hasId = pathParts.length === 3;

    if (method === "OPTIONS") {
      sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
      return true;
    }

    requireAuth(ctx);

    if (!hasId) {
      if (method === "GET" || method === "HEAD") {
        const templates = await templateService.listTemplates();
        sendApiJson(
          ctx.res,
          200,
          templates.map((entry) => entry.template),
          { origin, allowedOrigins, headers: ctx.withCookies(), method },
        );
        return true;
      }
      if (method === "POST") {
        try {
          const { template, etag } = await templateService.createTemplate(ctx.body ?? {});
          sendApiJson(ctx.res, 201, template, {
            origin,
            allowedOrigins,
            headers: ctx.withCookies({ ETag: etag }),
          });
        } catch (error) {
          if (error instanceof TemplateValidationError) {
            throw new HttpError(400, error.message);
          }
          throw error;
        }
        return true;
      }
      throw new HttpError(405, "Methode nicht erlaubt");
    }

    const templateId = decodeURIComponent(pathParts[2]);
    const { template: existingTemplate, etag: currentEtag } =
      method === "PUT" || method === "DELETE" ? await templateService.getTemplate(templateId) : { template: null, etag: null };
    if ((method === "PUT" || method === "DELETE") && !existingTemplate) {
      throw new HttpError(404, "Vorlage nicht gefunden");
    }

    if (method === "GET" || method === "HEAD") {
      const { template, etag } = existingTemplate
        ? { template: existingTemplate, etag: currentEtag }
        : await templateService.getTemplate(templateId);
      if (!template) {
        throw new HttpError(404, "Vorlage nicht gefunden");
      }
      if (etagMatches(ctx.req.headers["if-none-match"], etag)) {
        sendApiEmpty(ctx.res, 304, { origin, allowedOrigins, headers: ctx.withCookies({ ETag: etag }) });
        return true;
      }
      sendApiJson(ctx.res, 200, template, {
        origin,
        allowedOrigins,
        headers: ctx.withCookies({ ETag: etag }),
        method,
      });
      return true;
    }

    if (method === "PUT") {
      const ifMatch = ctx.req.headers["if-match"];
      if (!ifMatch) {
        throw new HttpError(412, "If-Match-Header wird benötigt.");
      }
      if (!etagMatches(ifMatch, currentEtag)) {
        throw new HttpError(412, "If-Match stimmt nicht mit aktueller Version überein.");
      }
      try {
        const { template, etag } = await templateService.updateTemplate(templateId, ctx.body ?? {});
        sendApiJson(ctx.res, 200, template, { origin, allowedOrigins, headers: ctx.withCookies({ ETag: etag }) });
      } catch (error) {
        if (error instanceof TemplateValidationError) {
          throw new HttpError(400, error.message);
        }
        throw error;
      }
      return true;
    }

    if (method === "DELETE") {
      const ifMatch = ctx.req.headers["if-match"];
      if (!ifMatch) {
        throw new HttpError(412, "If-Match-Header wird benötigt.");
      }
      if (!etagMatches(ifMatch, currentEtag)) {
        throw new HttpError(412, "If-Match stimmt nicht mit aktueller Version überein.");
      }
      const deleted = await templateService.deleteTemplate(templateId);
      sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
      return true;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  };
}

export { createTemplatesRouter };
