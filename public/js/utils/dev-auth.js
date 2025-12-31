import { describeApiError, post } from "./api-client.js";
import { resetAuthStatusCache } from "./auth-status.js";
import { setStatus } from "./status.js";

const AUTH_CHANGED_EVENT = "nextplanner:auth-changed";
const PANEL_SELECTOR = "[data-dev-auth-panel]";

function dispatchAuthChanged() {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT));
}

function removeDevPanel() {
  const existing = document.querySelector(PANEL_SELECTOR);
  if (existing?.parentElement) {
    existing.parentElement.removeChild(existing);
  }
}

function ensurePanel() {
  const header = document.querySelector(".page-header");
  if (!header) {
    return null;
  }
  let panel = header.querySelector(PANEL_SELECTOR);
  if (panel) {
    return panel;
  }
  panel = document.createElement("section");
  panel.className = "dev-auth-panel page-card";
  panel.setAttribute("data-dev-auth-panel", "true");
  const title = document.createElement("header");
  title.className = "section-header";
  title.innerHTML = "<h2>DEV-Anmeldung</h2><p>Login wird übersprungen. Wähle einen Benutzer.</p>";
  panel.appendChild(title);

  const form = document.createElement("form");
  form.className = "form-grid";
  form.innerHTML = `
    <label class="form-field">
      <span>Nutzer</span>
      <select data-dev-auth-user aria-label="Dev Nutzer auswählen"></select>
    </label>
    <div class="form-field">
      <span>Passwort</span>
      <input type="password" value="DevPass123!" data-dev-auth-password aria-label="Dev Passwort" />
      <p class="help-text">Im DEV-Modus ist das Passwort immer "DevPass123!".</p>
    </div>
    <div class="form-actions">
      <button type="submit" class="primary-button" data-dev-auth-submit>Anmelden</button>
      <button type="button" class="ghost-button" data-dev-auth-clear>Abmelden</button>
    </div>
    <p class="form-status" role="status" aria-live="polite" data-dev-auth-status></p>
  `;
  panel.appendChild(form);
  header.appendChild(panel);
  return panel;
}

function fillOptions(select, users) {
  select.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Bitte wählen";
  select.appendChild(placeholder);

  for (const user of users) {
    const option = document.createElement("option");
    option.value = user.username;
    const suffix = user.roles?.includes("admin") ? " (Admin)" : user.roles?.[0] ? ` (${user.roles[0]})` : "";
    option.textContent = `${user.username}${suffix}`;
    select.appendChild(option);
  }
}

async function handleDevLogin({ username, password, statusElement }) {
  if (!username) {
    setStatus(statusElement, "Bitte Nutzer wählen.", "warning");
    return;
  }
  setStatus(statusElement, "Anmeldung wird erstellt...", "info");
  try {
    await post("/api/auth/dev-login", { json: { username, password } });
    resetAuthStatusCache();
    dispatchAuthChanged();
    setStatus(statusElement, `Angemeldet als ${username}.`, "success");
  } catch (error) {
    const message = describeApiError(error) ?? "Dev-Anmeldung fehlgeschlagen.";
    setStatus(statusElement, message, "error");
  }
}

async function handleDevLogout(statusElement) {
  try {
    await post("/api/auth/logout");
    resetAuthStatusCache();
    dispatchAuthChanged();
    setStatus(statusElement, "Abgemeldet.", "success");
  } catch (error) {
    setStatus(statusElement, error?.message ?? "Abmelden fehlgeschlagen.", "error");
  }
}

export async function renderDevAuthControls(status) {
  const devAuth = status?.devAuth;
  if (!devAuth?.enabled || !Array.isArray(devAuth.users) || devAuth.users.length === 0) {
    removeDevPanel();
    return;
  }

  const panel = ensurePanel();
  if (!panel) {
    return;
  }

  const select = panel.querySelector("[data-dev-auth-user]");
  const passwordInput = panel.querySelector("[data-dev-auth-password]");
  const submit = panel.querySelector("[data-dev-auth-submit]");
  const clear = panel.querySelector("[data-dev-auth-clear]");
  const statusElement = panel.querySelector("[data-dev-auth-status]");
  const form = panel.querySelector("form");

  if (passwordInput && devAuth.defaultPassword) {
    passwordInput.value = devAuth.defaultPassword;
  }

  if (select) {
    fillOptions(select, devAuth.users);
  }

  const onSubmit = async (event) => {
    event.preventDefault();
    const username = select?.value ?? "";
    const password = passwordInput?.value ?? "";
    await handleDevLogin({ username, password, statusElement });
  };

  const onClear = async () => {
    await handleDevLogout(statusElement);
  };

  if (submit) {
    submit.removeEventListener("click", submit.__devAuthHandler);
    submit.__devAuthHandler = onSubmit;
    submit.addEventListener("click", onSubmit);
  }

  if (form) {
    form.removeEventListener("submit", form.__devAuthHandler);
    form.__devAuthHandler = onSubmit;
    form.addEventListener("submit", onSubmit);
  }

  if (clear) {
    clear.removeEventListener("click", clear.__devAuthHandler);
    clear.__devAuthHandler = onClear;
    clear.addEventListener("click", onClear);
  }
}
