import { io, type Socket } from "socket.io-client";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  AuthLoginInput,
  AuthRegisterInput,
  ImportCreateInput,
  PlanDto,
  PlanRevisionDto,
  TeamDto
} from "@nextplanner2/shared";
import {
  clearSessionLocally,
  createPlan,
  deletePlan,
  duplicatePlan,
  fetchMe,
  fetchPlanHistory,
  fetchPlans,
  getAccessToken,
  getErrorMessage,
  hasSession,
  isVersionConflict,
  login,
  logout,
  register,
  startImport,
  toPlanEtag,
  updatePlan
} from "./api";

type AuthMode = "login" | "register";

type FormState = {
  title: string;
  scheduledAt: string;
  focus: string;
  content: string;
  notes: string;
};

type AuthFormState = {
  email: string;
  password: string;
  name: string;
  organizationName: string;
  teamName: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  scheduledAt: new Date().toISOString().slice(0, 16),
  focus: "",
  content: "",
  notes: ""
};

const EMPTY_AUTH: AuthFormState = {
  email: "",
  password: "",
  name: "",
  organizationName: "",
  teamName: ""
};

const POLL_INTERVAL_MS = 30000;

function toInputDateTime(value: string): string {
  return value.slice(0, 16);
}

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

export default function App() {
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authForm, setAuthForm] = useState<AuthFormState>(EMPTY_AUTH);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [userName, setUserName] = useState<string>("");

  const [teams, setTeams] = useState<TeamDto[]>([]);
  const [teamId, setTeamId] = useState<string>("");

  const [plans, setPlans] = useState<PlanDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [planEtags, setPlanEtags] = useState<Record<string, string>>({});
  const [listEtag, setListEtag] = useState<string | undefined>();
  const [history, setHistory] = useState<PlanRevisionDto[]>([]);

  const [importPayload, setImportPayload] = useState<string>("");
  const [importSourceType, setImportSourceType] = useState<"json" | "csv">("json");
  const [importDryRun, setImportDryRun] = useState(false);

  const [status, setStatus] = useState<string>("Initializing...");
  const [busy, setBusy] = useState(false);
  const [conflictSnapshot, setConflictSnapshot] = useState<PlanDto | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string>("");

  const socketRef = useRef<Socket | null>(null);

  const selectedPlan = useMemo(
    () => plans.find((entry) => entry.id === selectedId) ?? null,
    [plans, selectedId]
  );

  async function initializeSession() {
    if (!hasSession()) {
      setInitialized(true);
      setIsAuthenticated(false);
      setStatus("Please log in.");
      return;
    }

    try {
      const me = await fetchMe();
      setIsAuthenticated(true);
      setUserName(me.user.name ?? me.user.email);
      setTeams(me.teams);
      setTeamId((prev) => prev || me.teams[0]?.id || "");
      setStatus("Session loaded.");
    } catch (error) {
      clearSessionLocally();
      setIsAuthenticated(false);
      setStatus(`Session expired: ${getErrorMessage(error)}`);
    } finally {
      setInitialized(true);
    }
  }

  async function reloadPlans(useEtag = true) {
    if (!teamId) {
      return;
    }

    const result = await fetchPlans(teamId, useEtag ? listEtag : undefined);
    if (result.notModified) {
      return;
    }

    const nextPlans = result.plans;
    const nextEtagMap = Object.fromEntries(nextPlans.map((plan) => [plan.id, toPlanEtag(plan)]));

    setPlans(nextPlans);
    setPlanEtags(nextEtagMap);
    setListEtag(result.etag ?? undefined);

    if (selectedId && !nextPlans.some((plan) => plan.id === selectedId)) {
      setSelectedId(null);
      setHistory([]);
    }
  }

  async function reloadHistory() {
    if (!teamId || !selectedId) {
      setHistory([]);
      return;
    }

    const revisions = await fetchPlanHistory(teamId, selectedId);
    setHistory(revisions);
  }

  useEffect(() => {
    initializeSession().catch((error) => {
      setStatus(`Initialization failed: ${getErrorMessage(error)}`);
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !teamId) {
      return;
    }

    reloadPlans(false)
      .then(() => setStatus("Plans loaded."))
      .catch((error) => {
        setStatus(`Failed to load plans: ${getErrorMessage(error)}`);
      });
  }, [isAuthenticated, teamId]);

  useEffect(() => {
    if (!selectedPlan) {
      setForm(EMPTY_FORM);
      return;
    }

    setForm({
      title: selectedPlan.title,
      scheduledAt: toInputDateTime(selectedPlan.scheduledAt),
      focus: selectedPlan.focus ?? "",
      content: selectedPlan.content,
      notes: selectedPlan.notes ?? ""
    });
  }, [selectedPlan]);

  useEffect(() => {
    reloadHistory().catch(() => {
      setHistory([]);
    });
  }, [selectedId, teamId]);

  useEffect(() => {
    if (!isAuthenticated || !teamId) {
      return;
    }

    const timer = window.setInterval(() => {
      reloadPlans(true).catch((error) => {
        setStatus(`Polling error: ${getErrorMessage(error)}`);
      });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isAuthenticated, teamId, listEtag]);

  useEffect(() => {
    if (!isAuthenticated || !teamId) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const token = getAccessToken();
    if (!token) {
      return;
    }

    const socket = io(import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000", {
      path: "/v1/realtime/socket",
      transports: ["websocket", "polling"],
      auth: { token }
    });

    socket.on("event", (event: { teamId: string; type: string }) => {
      if (event.teamId !== teamId) {
        return;
      }

      reloadPlans(false).catch((error) => {
        setStatus(`Realtime sync failed: ${getErrorMessage(error)}`);
      });

      if (selectedId && ["plan.updated", "plan.created", "plan.deleted"].includes(event.type)) {
        reloadHistory().catch(() => undefined);
      }
    });

    socket.on("connect", () => {
      setStatus("Realtime connected.");
    });

    socket.on("disconnect", () => {
      setStatus("Realtime disconnected. Polling fallback active.");
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, teamId, selectedId]);

  async function onSubmitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);

    try {
      if (authMode === "login") {
        const payload: AuthLoginInput = {
          email: authForm.email,
          password: authForm.password
        };

        const session = await login(payload);
        setUserName(session.user.name ?? session.user.email);
        setTeams(session.teams);
        setTeamId(session.teams[0]?.id ?? "");
      } else {
        const payload: AuthRegisterInput = {
          email: authForm.email,
          password: authForm.password,
          name: authForm.name,
          organizationName: authForm.organizationName,
          teamName: authForm.teamName
        };

        const session = await register(payload);
        setUserName(session.user.name ?? session.user.email);
        setTeams(session.teams);
        setTeamId(session.teams[0]?.id ?? "");
      }

      setIsAuthenticated(true);
      setAuthForm(EMPTY_AUTH);
      setStatus("Authenticated.");
    } catch (error) {
      setStatus(`Auth failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    setBusy(true);
    try {
      await logout();
      setIsAuthenticated(false);
      setUserName("");
      setTeams([]);
      setTeamId("");
      setPlans([]);
      setSelectedId(null);
      setHistory([]);
      setPlanEtags({});
      setListEtag(undefined);
      setStatus("Logged out.");
    } catch (error) {
      setStatus(`Logout failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onSubmitPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamId) {
      return;
    }

    setBusy(true);
    setConflictSnapshot(null);
    setConflictMessage("");

    try {
      if (selectedPlan) {
        const etag = planEtags[selectedPlan.id] ?? toPlanEtag(selectedPlan);
        const updated = await updatePlan(teamId, selectedPlan.id, {
          title: form.title,
          scheduledAt: toIsoDateTime(form.scheduledAt),
          focus: form.focus || null,
          content: form.content,
          notes: form.notes || null
        }, etag);

        setPlanEtags((prev) => ({ ...prev, [updated.plan.id]: updated.etag ?? toPlanEtag(updated.plan) }));
        setStatus("Plan updated.");
      } else {
        const created = await createPlan(teamId, {
          title: form.title,
          scheduledAt: toIsoDateTime(form.scheduledAt),
          focus: form.focus || null,
          content: form.content,
          notes: form.notes || null
        });

        setSelectedId(created.plan.id);
        setPlanEtags((prev) => ({ ...prev, [created.plan.id]: created.etag ?? toPlanEtag(created.plan) }));
        setStatus("Plan created.");
      }

      await reloadPlans(false);
      await reloadHistory();
    } catch (error) {
      if (isVersionConflict(error)) {
        const serverSnapshot =
          (error.details as { serverSnapshot?: PlanDto } | undefined)?.serverSnapshot ?? null;
        setConflictSnapshot(serverSnapshot);
        setConflictMessage("Version conflict: another user changed the plan.");
      }

      setStatus(`Save failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteCurrent() {
    if (!selectedPlan || !teamId) {
      return;
    }

    setBusy(true);
    try {
      await deletePlan(teamId, selectedPlan.id);
      setSelectedId(null);
      setHistory([]);
      setStatus("Plan deleted.");
      await reloadPlans(false);
    } catch (error) {
      setStatus(`Delete failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onDuplicateCurrent() {
    if (!selectedPlan || !teamId) {
      return;
    }

    setBusy(true);
    try {
      const duplicated = await duplicatePlan(teamId, selectedPlan.id, {});
      setSelectedId(duplicated.plan.id);
      setPlanEtags((prev) => ({ ...prev, [duplicated.plan.id]: duplicated.etag ?? toPlanEtag(duplicated.plan) }));
      setStatus("Plan duplicated.");
      await reloadPlans(false);
    } catch (error) {
      setStatus(`Duplicate failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!teamId || !importPayload.trim()) {
      return;
    }

    const payload: ImportCreateInput = {
      sourceType: importSourceType,
      payload: importPayload,
      dryRun: importDryRun
    };

    setBusy(true);
    try {
      const job = await startImport(teamId, payload);
      setStatus(
        `Import completed: total ${job.summary?.total ?? 0}, imported ${job.summary?.imported ?? 0}, errors ${job.summary?.errors ?? 0}.`
      );
      await reloadPlans(false);
    } catch (error) {
      setStatus(`Import failed: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  function applyServerSnapshot() {
    if (!conflictSnapshot) {
      return;
    }

    setForm({
      title: conflictSnapshot.title,
      scheduledAt: toInputDateTime(conflictSnapshot.scheduledAt),
      focus: conflictSnapshot.focus ?? "",
      content: conflictSnapshot.content,
      notes: conflictSnapshot.notes ?? ""
    });
    setConflictMessage("Loaded latest server version into the editor.");
  }

  if (!initialized) {
    return <main className="screen"><p>Initializing...</p></main>;
  }

  if (!isAuthenticated) {
    return (
      <main className="screen auth-screen">
        <section className="auth-card">
          <h1>NextPlanner2</h1>
          <p className="status">{status}</p>
          <div className="mode-switch">
            <button type="button" onClick={() => setAuthMode("login")} className={authMode === "login" ? "active" : ""}>
              Login
            </button>
            <button
              type="button"
              onClick={() => setAuthMode("register")}
              className={authMode === "register" ? "active" : ""}
            >
              Register
            </button>
          </div>

          <form className="auth-form" onSubmit={onSubmitAuth}>
            <label>
              E-Mail
              <input
                type="email"
                required
                value={authForm.email}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </label>

            <label>
              Passwort
              <input
                type="password"
                required
                minLength={8}
                value={authForm.password}
                onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>

            {authMode === "register" ? (
              <>
                <label>
                  Name
                  <input
                    required
                    value={authForm.name}
                    onChange={(event) => setAuthForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </label>
                <label>
                  Organisation
                  <input
                    required
                    value={authForm.organizationName}
                    onChange={(event) =>
                      setAuthForm((prev) => ({ ...prev, organizationName: event.target.value }))
                    }
                  />
                </label>
                <label>
                  Team
                  <input
                    required
                    value={authForm.teamName}
                    onChange={(event) => setAuthForm((prev) => ({ ...prev, teamName: event.target.value }))}
                  />
                </label>
              </>
            ) : null}

            <button disabled={busy} type="submit">
              {authMode === "login" ? "Anmelden" : "Registrieren"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="layout">
      <section className="panel list-panel">
        <header className="panel-header">
          <div>
            <h1>NextPlanner2</h1>
            <p className="muted">{userName}</p>
          </div>
          <button type="button" onClick={onLogout} disabled={busy}>
            Logout
          </button>
        </header>

        <label className="team-select">
          Team
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.organizationName} / {team.name} ({team.role})
              </option>
            ))}
          </select>
        </label>

        <div className="inline-actions">
          <button type="button" onClick={() => setSelectedId(null)}>
            New
          </button>
          <button type="button" disabled={!selectedPlan || busy} onClick={onDuplicateCurrent}>
            Duplicate
          </button>
          <button type="button" disabled={!selectedPlan || busy} onClick={onDeleteCurrent}>
            Delete
          </button>
        </div>

        <p className="status">{status}</p>

        <ul className="plan-list" aria-label="Plans">
          {plans.map((plan) => (
            <li key={plan.id}>
              <button
                type="button"
                className={plan.id === selectedId ? "plan-item active" : "plan-item"}
                onClick={() => setSelectedId(plan.id)}
              >
                <span>{plan.title}</span>
                <small>{new Date(plan.scheduledAt).toLocaleString()}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel editor-panel">
        <form onSubmit={onSubmitPlan} className="editor-form">
          <label>
            Titel
            <input
              required
              value={form.title}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            />
          </label>

          <label>
            Termin
            <input
              required
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => setForm((prev) => ({ ...prev, scheduledAt: event.target.value }))}
            />
          </label>

          <label>
            Fokus
            <input
              value={form.focus}
              onChange={(event) => setForm((prev) => ({ ...prev, focus: event.target.value }))}
            />
          </label>

          <label>
            Plantext
            <textarea
              required
              rows={9}
              value={form.content}
              onChange={(event) => setForm((prev) => ({ ...prev, content: event.target.value }))}
            />
          </label>

          <label>
            Notizen
            <textarea
              rows={5}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </label>

          <div className="actions">
            <button disabled={busy} type="submit">
              {selectedPlan ? "Update" : "Create"}
            </button>
          </div>
        </form>

        {conflictMessage ? (
          <section className="conflict-box">
            <strong>{conflictMessage}</strong>
            {conflictSnapshot ? (
              <button type="button" onClick={applyServerSnapshot}>
                Load server version
              </button>
            ) : null}
          </section>
        ) : null}

        <section className="history-box">
          <h2>History</h2>
          <ul>
            {history.slice(0, 8).map((revision) => (
              <li key={revision.id}>
                v{revision.planVersion} - {new Date(revision.changedAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>

        <section className="import-box">
          <h2>Import</h2>
          <div className="import-controls">
            <label>
              Source
              <select
                value={importSourceType}
                onChange={(event) => setImportSourceType(event.target.value as "json" | "csv")}
              >
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </label>

            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={importDryRun}
                onChange={(event) => setImportDryRun(event.target.checked)}
              />
              Dry run
            </label>
          </div>

          <textarea
            rows={6}
            placeholder={importSourceType === "json" ? '[{"title":"...","scheduledAt":"...","content":"..."}]' : "title,scheduledAt,content"}
            value={importPayload}
            onChange={(event) => setImportPayload(event.target.value)}
          />

          <button type="button" onClick={onImport} disabled={busy || !importPayload.trim()}>
            Start import
          </button>
        </section>
      </section>
    </main>
  );
}
