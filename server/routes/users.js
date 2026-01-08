// Benutzerverwaltung: listet vorhandene Nutzer.
import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";

function createUsersRouter({ userService }) {
  return async function usersRouter(ctx) {
    if (ctx.url.pathname !== "/api/users") {
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
      const users = await userService.listUsers();
      sendApiJson(ctx.res, 200, users, { origin, allowedOrigins, headers: ctx.withCookies(), method });
      return true;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  };
}

export { createUsersRouter };
