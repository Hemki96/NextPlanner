import { post } from "./utils/api-client.js";
import { fetchAuthStatus, resetAuthStatusCache } from "./utils/auth-status.js";
import { initAdminNavigation } from "./utils/admin-nav.js";
import { setStatus } from "./utils/status.js";

const AUTH_CHANGED_EVENT = "nextplanner:auth-changed";

const dom = {
  form: document.querySelector("#login-form"),
  logout: document.querySelector("#logout"),
  status: document.querySelector("#login-status"),
  username: document.querySelector("#username"),
  password: document.querySelector("#password"),
};

function showRedirectReason() {
  const params = new URLSearchParams(window.location.search);
  const reason = params.get("reason");
  if (!reason) {
    return;
  }
  if (reason === "login-required") {
    setStatus(dom.status, "Bitte anmelden, um die Anwendung zu verwenden.", "info");
  }
}

function resolveRedirectTarget() {
  const params = new URLSearchParams(window.location.search);
  const target = params.get("next");
  if (target && target.startsWith("/")) {
    return target;
  }
  return "/index.html";
}

function announceAuthChange() {
  if (typeof window === "undefined") {
    return;
  }
  const event = new CustomEvent(AUTH_CHANGED_EVENT);
  window.dispatchEvent(event);
}

function focusUsername() {
  if (dom.username) {
    dom.username.focus();
  }
}

async function showCurrentStatus() {
  const auth = await fetchAuthStatus();
  if (auth?.authenticated) {
    setStatus(dom.status, `Angemeldet als ${auth.username ?? "Nutzer"}.`, "success");
    return;
  }
  setStatus(dom.status, "Nicht angemeldet.", "info");
}

async function handleLogin(event) {
  event.preventDefault();
  if (!dom.username || !dom.password) {
    return;
  }
  const username = dom.username.value.trim();
  const password = dom.password.value;
  if (!username || !password) {
    setStatus(dom.status, "Bitte Benutzername und Passwort ausfüllen.", "error");
    return;
  }
  setStatus(dom.status, "Anmeldung läuft...", "info");
  try {
    await post("/api/auth/login", {
      json: { username, password },
      headers: { "Content-Type": "application/json" },
    });
    resetAuthStatusCache();
    announceAuthChange();
    setStatus(dom.status, "Erfolgreich angemeldet. Weiterleitung...", "success");
    window.location.assign(resolveRedirectTarget());
  } catch (error) {
    setStatus(dom.status, error?.message ?? "Anmeldung fehlgeschlagen.", "error");
    dom.password.value = "";
    focusUsername();
  }
}

async function handleLogout() {
  setStatus(dom.status, "Abmelden...", "info");
  try {
    await post("/api/auth/logout");
    resetAuthStatusCache();
    announceAuthChange();
    setStatus(dom.status, "Abgemeldet.", "success");
  } catch (error) {
    setStatus(dom.status, error?.message ?? "Abmelden fehlgeschlagen.", "error");
  }
}

function init() {
  initAdminNavigation();
  dom.form?.addEventListener("submit", handleLogin);
  dom.logout?.addEventListener("click", handleLogout);
  showRedirectReason();
  showCurrentStatus();
  focusUsername();
}

init();
