const LOGIN_PATHS = new Set(["/login", "/login/", "/login.html"]);

function isLoginPath(pathname) {
  if (typeof pathname !== "string") {
    return false;
  }
  const normalized = pathname.trim().toLowerCase();
  return LOGIN_PATHS.has(normalized);
}

function buildReturnPath(location) {
  if (!location || typeof location !== "object") {
    return null;
  }
  const pathname = typeof location.pathname === "string" && location.pathname ? location.pathname : "/";
  if (isLoginPath(pathname)) {
    return null;
  }
  const search = typeof location.search === "string" ? location.search : "";
  const hash = typeof location.hash === "string" ? location.hash : "";
  return `${pathname}${search}${hash}`;
}

function buildLoginRedirectUrl({ location, reason = "login-required" } = {}) {
  const params = new URLSearchParams();
  if (reason) {
    params.set("reason", reason);
  }
  const next = buildReturnPath(location);
  if (next) {
    params.set("next", next);
  }
  const query = params.toString();
  return query ? `/login.html?${query}` : "/login.html";
}

function resolvePostLoginTarget(search, fallback = "/index.html") {
  const params = new URLSearchParams(typeof search === "string" ? search : "");
  const next = params.get("next");
  if (next && next.startsWith("/")) {
    return next;
  }
  return fallback;
}

export { buildLoginRedirectUrl, buildReturnPath, isLoginPath, resolvePostLoginTarget };
