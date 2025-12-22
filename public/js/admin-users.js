import { describeApiError, get, post, put, delete as deleteRequest } from "./utils/api-client.js";
import { fetchAuthStatus } from "./utils/auth-status.js";
import { initAdminNavigation } from "./utils/admin-nav.js";

const state = {
  users: [],
};

const dom = {
  status: document.getElementById("admin-status"),
  createSection: document.getElementById("user-create-section"),
  listSection: document.getElementById("user-list-section"),
  userList: document.getElementById("admin-user-list"),
  createForm: document.getElementById("create-user-form"),
  createStatus: document.getElementById("create-user-status"),
  refreshButton: document.getElementById("refresh-users"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function setStatus(element, message, type = "info") {
  if (!element) {
    return;
  }
  element.textContent = message ?? "";
  element.dataset.state = type;
}

function parseRolesInput(value) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validateUsername(username) {
  if (typeof username !== "string") {
    return "Benutzername fehlt.";
  }
  const trimmed = username.trim();
  if (trimmed.length < 3) {
    return "Benutzername muss mindestens 3 Zeichen haben.";
  }
  if (/\s/.test(trimmed)) {
    return "Benutzername darf keine Leerzeichen enthalten.";
  }
  return null;
}

function validatePassword(password) {
  if (typeof password !== "string") {
    return "Passwort fehlt.";
  }
  const trimmed = password.trim();
  if (trimmed.length < 10) {
    return "Passwort muss mindestens 10 Zeichen lang sein.";
  }
  if (!/[a-z]/.test(trimmed) || !/[A-Z]/.test(trimmed) || !/\d/.test(trimmed) || !/[^A-Za-z0-9]/.test(trimmed)) {
    return "Passwort benötigt Groß- und Kleinbuchstaben, eine Zahl und ein Sonderzeichen.";
  }
  return null;
}

function doubleConfirm(message) {
  return window.confirm(message) && window.confirm("Bitte erneut bestätigen.");
}

function renderEmptyState() {
  if (!dom.userList) {
    return;
  }
  dom.userList.innerHTML = "";
  const empty = document.createElement("p");
  empty.className = "form-hint";
  empty.textContent = "Keine Benutzer gefunden.";
  dom.userList.appendChild(empty);
}

function renderUserList(users) {
  if (!dom.userList) {
    return;
  }
  dom.userList.innerHTML = "";
  if (!users || users.length === 0) {
    renderEmptyState();
    return;
  }

  users.forEach((user) => {
    const card = document.createElement("article");
    card.className = "admin-user-card";
    card.dataset.userId = String(user.id);
    const roleLabel = user.roles?.length ? user.roles.join(", ") : "user";
    const activeLabel = user.active ? "Aktiv" : "Deaktiviert";
    card.innerHTML = `
      <header class="admin-user-header">
        <div>
          <div class="admin-user-name">${escapeHtml(user.username)}</div>
          <div class="admin-user-meta">
            <span class="admin-badge">ID ${escapeHtml(user.id)}</span>
            <span class="admin-badge ${user.active ? "admin-badge--ok" : "admin-badge--muted"}">${activeLabel}</span>
            <span class="admin-badge">Rollen: ${escapeHtml(roleLabel)}</span>
          </div>
        </div>
        <div class="admin-user-actions">
          <button type="button" class="ghost-button" data-action="toggle">${user.active ? "Deaktivieren" : "Aktivieren"}</button>
          <button type="button" class="ghost-button danger-button" data-action="delete">Löschen</button>
        </div>
      </header>
      <form class="admin-user-form" data-action="roles">
        <label class="form-field">
          <span>Rollen (Komma-getrennt)</span>
          <input type="text" name="roles" value="${escapeHtml(roleLabel)}" />
        </label>
        <div class="form-actions">
          <button type="submit" class="secondary-button">Rollen speichern</button>
        </div>
      </form>
      <form class="admin-user-form" data-action="password">
        <label class="form-field">
          <span>Passwort zurücksetzen</span>
          <input type="password" name="password" autocomplete="new-password" placeholder="Neues Passwort" />
          <span class="field-hint">Mindestens 10 Zeichen inkl. Groß-/Kleinbuchstaben, Zahl, Sonderzeichen.</span>
        </label>
        <div class="form-actions">
          <button type="submit" class="secondary-button">Passwort setzen</button>
        </div>
      </form>
      <p class="form-status" data-status role="status" aria-live="polite"></p>
    `;
    dom.userList.appendChild(card);
  });
}

function findUserFromCard(card) {
  const userId = Number(card?.dataset?.userId);
  if (!Number.isFinite(userId)) {
    return null;
  }
  return state.users.find((entry) => entry.id === userId) ?? null;
}

function setCardStatus(card, message, type = "info") {
  if (!card) {
    return;
  }
  const statusEl = card.querySelector("[data-status]");
  setStatus(statusEl, message, type);
}

async function loadUsers() {
  setStatus(dom.status, "Lade Benutzer...", "info");
  try {
    const { data } = await get("/api/users");
    state.users = Array.isArray(data?.users) ? data.users : [];
    renderUserList(state.users);
    setStatus(dom.status, "Benutzerliste aktualisiert.", "success");
  } catch (error) {
    renderEmptyState();
    setStatus(dom.status, describeApiError(error), "error");
  }
}

async function handleToggle(card) {
  const user = findUserFromCard(card);
  if (!user) {
    return;
  }
  const nextActive = !user.active;
  if (!nextActive && !doubleConfirm(`Benutzer "${user.username}" wirklich deaktivieren?`)) {
    return;
  }
  setCardStatus(card, "Aktualisiere Status...", "info");
  try {
    await put(`/api/users/${user.id}`, {
      json: { active: nextActive, confirm: nextActive ? undefined : true },
    });
    await loadUsers();
    setStatus(dom.status, `Status von ${user.username} aktualisiert.`, "success");
  } catch (error) {
    setCardStatus(card, describeApiError(error), "error");
  }
}

async function handleDelete(card) {
  const user = findUserFromCard(card);
  if (!user) {
    return;
  }
  if (!doubleConfirm(`Benutzer "${user.username}" endgültig löschen?`)) {
    return;
  }
  setCardStatus(card, "Lösche Benutzer...", "info");
  try {
    await deleteRequest(`/api/users/${user.id}`, { json: { confirm: true } });
    await loadUsers();
    setStatus(dom.status, `Benutzer ${user.username} entfernt.`, "success");
  } catch (error) {
    setCardStatus(card, describeApiError(error), "error");
  }
}

async function handleRoleUpdate(event) {
  event.preventDefault();
  const form = event.target;
  const card = form.closest("[data-user-id]");
  const user = findUserFromCard(card);
  if (!user) {
    return;
  }
  const input = form.querySelector("input[name='roles']");
  const roles = parseRolesInput(input?.value ?? "");
  setCardStatus(card, "Speichere Rollen...", "info");
  try {
    await put(`/api/users/${user.id}`, { json: { roles } });
    await loadUsers();
    setStatus(dom.status, `Rollen für ${user.username} aktualisiert.`, "success");
  } catch (error) {
    setCardStatus(card, describeApiError(error), "error");
  }
}

async function handlePasswordReset(event) {
  event.preventDefault();
  const form = event.target;
  const card = form.closest("[data-user-id]");
  const user = findUserFromCard(card);
  if (!user) {
    return;
  }
  const input = form.querySelector("input[name='password']");
  const password = input?.value ?? "";
  const validationError = validatePassword(password);
  if (validationError) {
    setCardStatus(card, validationError, "error");
    return;
  }
  setCardStatus(card, "Setze Passwort zurück...", "info");
  try {
    await put(`/api/users/${user.id}`, { json: { password } });
    input.value = "";
    await loadUsers();
    setStatus(dom.status, `Passwort für ${user.username} aktualisiert.`, "success");
  } catch (error) {
    setCardStatus(card, describeApiError(error), "error");
  }
}

async function handleCreateUser(event) {
  event.preventDefault();
  const form = event.target;
  const usernameInput = form.querySelector("#create-username");
  const passwordInput = form.querySelector("#create-password");
  const rolesInput = form.querySelector("#create-roles");
  const activeInput = form.querySelector("#create-active");

  const username = usernameInput?.value ?? "";
  const password = passwordInput?.value ?? "";
  const roles = parseRolesInput(rolesInput?.value ?? "");
  const active = !!activeInput?.checked;

  const usernameError = validateUsername(username);
  if (usernameError) {
    setStatus(dom.createStatus, usernameError, "error");
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    setStatus(dom.createStatus, passwordError, "error");
    return;
  }

  setStatus(dom.createStatus, "Lege Benutzer an...", "info");
  try {
    await post("/api/users", {
      json: { username, password, roles, active },
    });
    form.reset();
    if (activeInput) {
      activeInput.checked = true;
    }
    setStatus(dom.createStatus, "Benutzer angelegt.", "success");
    await loadUsers();
  } catch (error) {
    setStatus(dom.createStatus, describeApiError(error), "error");
  }
}

function bindEvents() {
  dom.userList?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const card = target.closest("[data-user-id]");
    if (!card) {
      return;
    }
    const action = target.dataset.action;
    if (action === "toggle") {
      handleToggle(card);
    } else if (action === "delete") {
      handleDelete(card);
    }
  });

  dom.userList?.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }
    const action = form.dataset.action;
    if (action === "roles") {
      handleRoleUpdate(event);
    } else if (action === "password") {
      handlePasswordReset(event);
    }
  });

  dom.createForm?.addEventListener("submit", handleCreateUser);
  dom.refreshButton?.addEventListener("click", () => {
    loadUsers();
  });
}

async function guardAccess() {
  setStatus(dom.status, "Prüfe Anmeldung...", "info");
  let auth;
  try {
    auth = await fetchAuthStatus();
  } catch {
    auth = { isAdmin: false, authenticated: false };
  }
  if (!auth.isAdmin) {
    setStatus(
      dom.status,
      auth.authenticated
        ? "Kein Zugriff: Admin-Rechte erforderlich."
        : "Bitte zuerst anmelden. Admin-Rechte erforderlich.",
      "error",
    );
    return false;
  }
  if (dom.createSection) {
    dom.createSection.hidden = false;
  }
  if (dom.listSection) {
    dom.listSection.hidden = false;
  }
  setStatus(dom.status, "Angemeldet als Admin.", "success");
  return true;
}

async function init() {
  initAdminNavigation();
  bindEvents();
  const hasAccess = await guardAccess();
  if (hasAccess) {
    await loadUsers();
  }
}

init();
