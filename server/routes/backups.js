// Schnittstellen für Backups: Exportiert alle Pläne und erlaubt das Importieren
// eines vorher erzeugten Backups.
import { sendApiEmpty, sendApiJson } from "../http/responses.js";
import { HttpError } from "../http/http-error.js";

function createBackupsRouter({ planService }) {
  return async function backupsRouter(ctx) {
    if (ctx.url.pathname !== "/api/backups") {
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
      const backup = await planService.exportBackup();
      sendApiJson(
        ctx.res,
        200,
        { ...backup, planCount: backup.data?.plans?.length ?? 0 },
        { origin, allowedOrigins, headers: ctx.withCookies(), method },
      );
      return true;
    }

    if (method === "POST") {
      try {
        const restored = await planService.importBackup(ctx.body ?? {});
        sendApiJson(
          ctx.res,
          200,
          {
            success: true,
            planCount: restored?.plans?.length ?? ctx.body?.data?.plans?.length ?? 0,
            ...restored,
          },
          { origin, allowedOrigins, headers: ctx.withCookies() },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        sendApiJson(ctx.res, 400, { error: { message } }, { origin, allowedOrigins, headers: ctx.withCookies() });
      }
      return true;
    }

    throw new HttpError(405, "Methode nicht erlaubt");
  };
}

export { createBackupsRouter };
