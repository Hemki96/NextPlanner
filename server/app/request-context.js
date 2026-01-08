// Baut ein Kontextobjekt für jeden eingehenden Request. Der Kontext sammelt
// nützliche Helfer (z. B. Cookies setzen) und hält Referenzen auf Konfiguration,
// Logger und Services.
function createRequestContext({ req, res, config, services, logger, requestId }) {
  const ctx = {
    req,
    res,
    url: new URL(req.url ?? "/", "http://localhost"),
    config,
    services,
    logger,
    baseLogger: logger,
    requestId,
    cookies: [],
    withCookies: (extra = {}) => (ctx.cookies.length > 0 ? { ...extra, "Set-Cookie": ctx.cookies } : extra),
    state: {},
    authUser: null,
    origin: req.headers?.origin,
  };

  return ctx;
}

export { createRequestContext };
