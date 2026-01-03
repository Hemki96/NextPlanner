// REST-Routen für Trainingspläne: erstellen, lesen, aktualisieren und löschen.
// Validiert Nutzereingaben und nutzt ETags, um konkurrierende Änderungen
// sauber abzuwickeln.
import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";
import { etagMatches } from "../http/utils.js";
import { PlanConflictError, PlanValidationError, buildPlanEtag } from "../services/plan-service.js";
import { readJsonBody } from "../http/body.js";

function requireAuth(ctx) {
  if (!ctx.authUser) {
    throw new HttpError(401, "Authentifizierung erforderlich.");
  }
}

function localizePlanValidationMessage(message) {
  if (/content is required/i.test(message)) {
    return "content ist erforderlich";
  }
  if (/title is required/i.test(message)) {
    return "title ist erforderlich";
  }
  if (/focus is required/i.test(message)) {
    return "focus ist erforderlich";
  }
  if (/metadata must be an object/i.test(message)) {
    return "metadata muss ein Objekt sein";
  }
  return message;
}

function requireJson(ctx) {
  const contentType = ctx.req.headers?.["content-type"] ?? "";
  if (!/^application\/json/i.test(contentType)) {
    throw new HttpError(415, "Content-Type muss application/json sein", {
      hint: "Setzen Sie den Header 'Content-Type' auf 'application/json', um JSON-Daten zu senden.",
    });
  }
}

function createPlansRouter({ planService }) {
  return async function plansRouter(ctx) {
    if (!ctx.url.pathname.startsWith("/api/plans")) {
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
        const plans = await planService.listPlans({
          focus: ctx.url.searchParams.get("focus") ?? undefined,
          from: ctx.url.searchParams.get("from") ?? undefined,
          to: ctx.url.searchParams.get("to") ?? undefined,
        });
        sendApiJson(ctx.res, 200, plans, {
          origin,
          allowedOrigins,
          headers: ctx.withCookies(),
          method,
        });
        return true;
      }

      if (method === "POST") {
        requireJson(ctx);
        if (!ctx.body || Object.keys(ctx.body).length === 0) {
          ctx.body = await readJsonBody(ctx.req);
        }
        try {
          const { plan, etag } = await planService.createPlan(ctx.body ?? {}, {
            userId: ctx.authUser?.id,
          });
          sendApiJson(ctx.res, 201, plan, {
            origin,
            allowedOrigins,
            headers: ctx.withCookies({ ETag: etag }),
          });
        } catch (error) {
          if (error instanceof PlanValidationError) {
            throw new HttpError(400, localizePlanValidationMessage(error.message));
          }
          throw error;
        }
        return true;
      }

      throw new HttpError(405, "Methode nicht erlaubt");
    }

    const planId = Number(pathParts[2]);
    if (!Number.isInteger(planId)) {
      throw new HttpError(400, "Ungültige Plan-ID");
    }

    if (method === "GET" || method === "HEAD") {
      const result = await planService.getPlanWithEtag(planId);
      if (!result) {
        throw new HttpError(404, "Plan nicht gefunden");
      }
      if (etagMatches(ctx.req.headers["if-none-match"], result.etag)) {
        sendApiEmpty(ctx.res, 304, { origin, allowedOrigins, headers: ctx.withCookies({ ETag: result.etag }) });
        return true;
      }
      sendApiJson(ctx.res, 200, result.plan, {
        origin,
        allowedOrigins,
        headers: ctx.withCookies({ ETag: result.etag }),
        method,
      });
      return true;
    }

    if (method === "PUT") {
      const ifMatch = ctx.req.headers["if-match"];
      if (!ifMatch) {
        throw new HttpError(428, "If-Match Header erforderlich", { code: "missing-precondition" });
      }
      requireJson(ctx);
      if (!ctx.body || Object.keys(ctx.body).length === 0) {
        ctx.body = await readJsonBody(ctx.req);
      }
      try {
        const { plan, etag } = await planService.updatePlan(planId, ctx.body ?? {}, {
          expectedEtag: ifMatch,
          userId: ctx.authUser?.id,
        });
        if (!plan) {
          throw new HttpError(404, "Plan nicht gefunden");
        }
        sendApiJson(ctx.res, 200, plan, {
          origin,
          allowedOrigins,
          headers: ctx.withCookies({ ETag: etag }),
        });
      } catch (error) {
        if (error instanceof PlanConflictError) {
          const currentEtag = buildPlanEtag(error.currentPlan);
          sendApiJson(
            ctx.res,
            412,
            { error: { message: error.message, details: { currentPlan: error.currentPlan } } },
            { origin, allowedOrigins, headers: ctx.withCookies({ ETag: currentEtag }) },
          );
          return true;
        }
        if (error instanceof PlanValidationError) {
          throw new HttpError(400, localizePlanValidationMessage(error.message));
        }
        throw error;
      }
      return true;
    }

    if (method === "DELETE") {
      const ifMatch = ctx.req.headers["if-match"];
      if (!ifMatch) {
        throw new HttpError(428, "If-Match Header erforderlich", { code: "missing-precondition" });
      }
      try {
        const result = await planService.deletePlan(planId, { expectedEtag: ifMatch });
        if (!result.deleted) {
          const current = await planService.getPlanWithEtag(planId);
          if (!current) {
            throw new HttpError(404, "Plan nicht gefunden");
          }
          sendApiJson(
            ctx.res,
            412,
            { error: { message: "Plan wurde bereits geändert.", details: { currentPlan: current.plan } } },
            { origin, allowedOrigins, headers: ctx.withCookies({ ETag: current.etag }) },
          );
          return true;
        }
        sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
      } catch (error) {
        if (error instanceof PlanConflictError) {
          const currentEtag = buildPlanEtag(error.currentPlan);
          sendApiJson(
            ctx.res,
            412,
            { error: { message: error.message, details: { currentPlan: error.currentPlan } } },
            { origin, allowedOrigins, headers: ctx.withCookies({ ETag: currentEtag }) },
          );
          return true;
        }
        throw error;
      }
      return true;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  };
}

export { createPlansRouter };
