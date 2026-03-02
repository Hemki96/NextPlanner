// Benutzerverwaltung: listet vorhandene Nutzer.
import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";
import { UserValidationError } from "../services/user-service.js";
import { readJsonBody } from "../http/body.js";

function requireJson(ctx) {
  const contentType = ctx.req.headers?.["content-type"] ?? "";
  if (!/^application\/json/i.test(contentType)) {
    throw new HttpError(415, "Content-Type muss application/json sein", {
      hint: "Setzen Sie den Header 'Content-Type' auf 'application/json', um JSON-Daten zu senden.",
    });
  }
}

function createUsersRouter({ userService }) {
  return async function usersRouter(ctx) {
    const pathParts = ctx.url.pathname.split("/").filter(Boolean);
    if (pathParts[0] !== "api" || pathParts[1] !== "users") {
      return false;
    }
    const origin = ctx.origin;
    const allowedOrigins = ctx.config.server.allowedOrigins;
    const method = (ctx.req.method ?? "GET").toUpperCase();
    const hasId = pathParts.length === 3;

    if (method === "OPTIONS") {
      sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
      return true;
    }

    if (!hasId) {
      if (method === "GET" || method === "HEAD") {
        const users = await userService.listUsers();
        sendApiJson(ctx.res, 200, users, { origin, allowedOrigins, headers: ctx.withCookies(), method });
        return true;
      }
      if (method === "POST") {
        requireJson(ctx);
        if (!ctx.body || Object.keys(ctx.body).length === 0) {
          ctx.body = await readJsonBody(ctx.req);
        }
        try {
          const created = await userService.createUser(ctx.body ?? {});
          sendApiJson(ctx.res, 201, created, { origin, allowedOrigins, headers: ctx.withCookies() });
        } catch (error) {
          if (error instanceof UserValidationError) {
            throw new HttpError(400, error.message);
          }
          throw error;
        }
        return true;
      }
      throw new HttpError(405, "Methode nicht erlaubt");
    }

    const userId = Number(pathParts[2]);
    if (!Number.isInteger(userId) || userId <= 0) {
      throw new HttpError(400, "Ungültige Benutzer-ID");
    }

    if (method === "PUT") {
      requireJson(ctx);
      if (!ctx.body || Object.keys(ctx.body).length === 0) {
        ctx.body = await readJsonBody(ctx.req);
      }
      try {
        const updated = await userService.updateUser(userId, ctx.body ?? {});
        if (!updated) {
          throw new HttpError(404, "Benutzer nicht gefunden");
        }
        sendApiJson(ctx.res, 200, updated, { origin, allowedOrigins, headers: ctx.withCookies() });
      } catch (error) {
        if (error instanceof UserValidationError) {
          throw new HttpError(400, error.message);
        }
        throw error;
      }
      return true;
    }

    if (method === "DELETE") {
      requireJson(ctx);
      if (!ctx.body || Object.keys(ctx.body).length === 0) {
        ctx.body = await readJsonBody(ctx.req);
      }
      if (ctx.body?.confirm !== true) {
        throw new HttpError(400, "Löschvorgang muss bestätigt werden.");
      }
      const deleted = await userService.deleteUser(userId);
      if (!deleted) {
        throw new HttpError(404, "Benutzer nicht gefunden");
      }
      sendApiEmpty(ctx.res, 204, { origin, allowedOrigins, headers: ctx.withCookies() });
      return true;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  };
}

export { createUsersRouter };
