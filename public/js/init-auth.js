import { initAdminNavigation } from "./utils/admin-nav.js";
import { fetchAuthStatus, resetAuthStatusCache } from "./utils/auth-status.js";
import { buildLoginRedirectUrl, isLoginPath, resolvePostLoginTarget } from "./utils/auth-redirect.js";
import { setStatus } from "./utils/status.js";
import { renderDevAuthControls } from "./utils/dev-auth.js";

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

async function renderAuthIndicator(status) {
  const indicator = ensureAuthIndicator();
  if (!indicator) {
    return;
  }
  try {
    const resolvedStatus = status ?? (await fetchAuthStatus());
    if (resolvedStatus?.authenticated) {
      const suffix = resolvedStatus.devAuth?.enabled ? " (DEV)" : "";
      setStatus(indicator, `Angemeldet als ${resolvedStatus.username ?? "Nutzer"}${suffix}.`, "success");
    } else {
      const message = resolvedStatus?.devAuth?.enabled
        ? "DEV-Modus aktiv: Nutzer wählen, um anzumelden."
        : "Nicht angemeldet.";
      setStatus(indicator, message, "warning");
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

  if (!authenticated && status?.devAuth?.enabled) {
    await renderDevAuthControls(status);
    return false;
  }

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
    const status = await fetchAuthStatus();
    await renderAuthIndicator(status);
    await renderDevAuthControls(status);
  }
})();

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_CHANGED_EVENT, async () => {
    resetAuthStatusCache();
    const redirected = await enforceAuthGuards();
    if (!redirected) {
      const status = await fetchAuthStatus();
      await renderAuthIndicator(status);
      await renderDevAuthControls(status);
    }
  });
}
