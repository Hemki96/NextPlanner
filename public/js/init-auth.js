import { initAdminNavigation } from "./utils/admin-nav.js";
import { fetchAuthStatus, resetAuthStatusCache } from "./utils/auth-status.js";
import { buildLoginRedirectUrl, isLoginPath, resolvePostLoginTarget } from "./utils/auth-redirect.js";
import { setStatus } from "./utils/status.js";

const AUTH_CHANGED_EVENT = "nextplanner:auth-changed";

function ensureAuthIndicator() {
  const header = document.querySelector(".page-header");
  if (!header) {
    return null;
  }
  let indicator = header.querySelector("[data-auth-indicator]");
  if (!indicator) {
    indicator = document.createElement("p");
    indicator.className = "form-status auth-status-pill";
    indicator.setAttribute("data-auth-indicator", "true");
    indicator.setAttribute("role", "status");
    indicator.setAttribute("aria-live", "polite");
    header.appendChild(indicator);
  }
  return indicator;
}

async function renderAuthIndicator() {
  const indicator = ensureAuthIndicator();
  if (!indicator) {
    return;
  }
  try {
    const status = await fetchAuthStatus();
    if (status?.authenticated) {
      setStatus(indicator, `Angemeldet als ${status.username ?? "Nutzer"}.`, "success");
    } else {
      setStatus(indicator, "Nicht angemeldet.", "warning");
    }
  } catch (error) {
    const message = error?.message ?? "Anmeldestatus konnte nicht abgerufen werden.";
    setStatus(indicator, message, "warning");
  }
}

async function enforceAuthGuards() {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }

  let status;
  try {
    status = await fetchAuthStatus();
  } catch {
    status = { authenticated: false };
  }
  const authenticated = Boolean(status?.authenticated);
  const pathname = window.location.pathname ?? "";
  const onLoginPage = isLoginPath(pathname);

  if (!authenticated && !onLoginPage) {
    const redirectUrl = buildLoginRedirectUrl({ location: window.location, reason: "login-required" });
    window.location.replace(redirectUrl);
    return true;
  }

  if (authenticated && onLoginPage) {
    const target = resolvePostLoginTarget(window.location.search, "/index.html");
    if (target && target !== pathname) {
      window.location.replace(target);
      return true;
    }
  }

  return false;
}

initAdminNavigation();
(async () => {
  const redirected = await enforceAuthGuards();
  if (!redirected) {
    await renderAuthIndicator();
  }
})();

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_CHANGED_EVENT, async () => {
    resetAuthStatusCache();
    const redirected = await enforceAuthGuards();
    if (!redirected) {
      await renderAuthIndicator();
    }
  });
}
