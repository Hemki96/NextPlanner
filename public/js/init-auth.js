import { initAdminNavigation } from "./utils/admin-nav.js";
import { fetchAuthStatus, resetAuthStatusCache } from "./utils/auth-status.js";
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

initAdminNavigation();
renderAuthIndicator();

if (typeof window !== "undefined") {
  window.addEventListener(AUTH_CHANGED_EVENT, async () => {
    resetAuthStatusCache();
    await renderAuthIndicator();
  });
}
