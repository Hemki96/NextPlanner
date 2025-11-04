import { apiRequest, ApiError } from "./utils/api-client.js";

const cycleListEl = document.querySelector("[data-cycle-list]");
const detailEl = document.querySelector("[data-cycle-detail]");
const createForm = document.querySelector("[data-create-cycle-form]");
const feedbackEl = document.querySelector("[data-feedback]");

const initialSelection = typeof window !== "undefined" ? parseInitialSelection() : null;

const state = {
  cycles: [],
  activeCycleId: null,
  loading: false,
  highlightDayId: initialSelection?.dayId ?? null,
};

let shouldAutoScrollHighlight = Boolean(state.highlightDayId);

const planCache = new Map();

const distanceFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const decimalFormatter = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const dateFormatter = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" });
const weekDayFormatter = new Intl.DateTimeFormat("de-DE", { weekday: "short" });

const phaseLabels = {
  volume: "Volumen",
  intensity: "Intensität",
  deload: "Deload",
  custom: "Individuell",
};

function init() {
  if (createForm) {
    createForm.addEventListener("submit", onCreateCycleSubmit);
  }
  refreshCycles({ selectId: initialSelection?.cycleId });
}

function setFeedback(message, stateName = "info") {
  if (!feedbackEl) {
    return;
  }
  feedbackEl.textContent = message ?? "";
  if (message) {
    feedbackEl.dataset.state = stateName;
  } else {
    delete feedbackEl.dataset.state;
  }
}

function getErrorMessage(error) {
  if (error instanceof ApiError) {
    if (error.body && typeof error.body === "object") {
      const bodyMessage = error.body.error?.message ?? error.body.message;
      if (typeof bodyMessage === "string" && bodyMessage.trim()) {
        return bodyMessage;
      }
    }
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unbekannter Fehler beim Laden der Wochenplanung.";
}

async function refreshCycles({ selectId } = {}) {
  state.loading = true;
  try {
    const { data } = await apiRequest("/api/cycles");
    const cycles = Array.isArray(data) ? data : [];
    applyCycleCollection(cycles, { selectId });
    if (state.cycles.length === 0) {
      setFeedback("Lege deinen ersten Trainingszyklus an, um die Wochenansicht zu verwenden.", "info");
    } else {
      setFeedback("", "info");
    }
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
    renderCycleList();
    renderCycleDetail();
  } finally {
    state.loading = false;
  }
}

function renderCycleList() {
  if (!cycleListEl) {
    return;
  }
  cycleListEl.innerHTML = "";
  if (state.cycles.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "cycle-list-empty";
    emptyItem.textContent = "Noch keine Wochenzyklen angelegt.";
    cycleListEl.append(emptyItem);
    return;
  }
  for (const cycle of state.cycles) {
    const item = document.createElement("li");
    item.className = "cycle-list-item";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cycle-list-button";
    if (cycle.id === state.activeCycleId) {
      button.classList.add("is-active");
    }
    const title = document.createElement("span");
    title.className = "cycle-list-title";
    title.textContent = cycle.name ?? "Unbenannter Zyklus";

    const meta = document.createElement("span");
    meta.className = "cycle-list-meta";
    const weeks = cycle.summary?.weekCount ?? cycle.weeks?.length ?? 0;
    const metaParts = [];
    if (weeks) {
      metaParts.push(`${weeks} Woche${weeks === 1 ? "" : "n"}`);
    }
    if (cycle.startDate) {
      const start = formatDate(cycle.startDate);
      const end = cycle.endDate ? formatDate(cycle.endDate) : null;
      metaParts.push(end ? `${start} – ${end}` : start);
    }
    if (typeof cycle.summary?.totalDistance === "number" && cycle.summary.totalDistance > 0) {
      metaParts.push(`${distanceFormatter.format(cycle.summary.totalDistance)} m`);
    }
    meta.textContent = metaParts.join(" • ");

    button.addEventListener("click", () => {
      state.activeCycleId = cycle.id;
      renderCycleList();
      renderCycleDetail();
    });

    button.append(title, meta);
    item.append(button);
    cycleListEl.append(item);
  }
}

function applyCycleCollection(cycles, { selectId } = {}) {
  planCache.clear();
  state.cycles = cycles.slice();
  const candidateId = selectId ?? state.activeCycleId;
  if (candidateId && state.cycles.some((cycle) => cycle.id === candidateId)) {
    state.activeCycleId = candidateId;
  } else {
    state.activeCycleId = state.cycles[0]?.id ?? null;
  }
  if (
    state.highlightDayId &&
    !state.cycles.some((cycle) => cycleContainsDay(cycle, state.highlightDayId))
  ) {
    state.highlightDayId = null;
    shouldAutoScrollHighlight = false;
  }
  renderCycleList();
  renderCycleDetail();
}

function updateCycleState(cycle, { select = true } = {}) {
  if (!cycle || typeof cycle.id !== "number") {
    return;
  }
  invalidateCyclePlanSummaries(cycle);
  const nextCycles = state.cycles.slice();
  const index = nextCycles.findIndex((entry) => entry.id === cycle.id);
  if (index >= 0) {
    nextCycles.splice(index, 1, cycle);
  } else {
    nextCycles.push(cycle);
  }
  state.cycles = nextCycles;
  if (
    state.highlightDayId &&
    !state.cycles.some((entry) => cycleContainsDay(entry, state.highlightDayId))
  ) {
    state.highlightDayId = null;
    shouldAutoScrollHighlight = false;
  }
  if (select || state.activeCycleId === null) {
    state.activeCycleId = cycle.id;
  }
  renderCycleList();
  renderCycleDetail();
}

function invalidateCyclePlanSummaries(cycle) {
  if (!cycle?.weeks) {
    return;
  }
  for (const week of cycle.weeks) {
    for (const day of week.days ?? []) {
      if (typeof day.planId === "number") {
        planCache.delete(day.planId);
      }
    }
  }
}

async function reloadCycle(cycleId, { select = true } = {}) {
  const { data } = await apiRequest(`/api/cycles/${cycleId}`);
  if (data && typeof data === "object") {
    invalidateCyclePlanSummaries(data);
    updateCycleState(data, { select });
  }
  return data ?? null;
}

function deriveDayFocus(cycle, week, day) {
  const candidates = [
    day.mainSetFocus,
    week.focusLabel,
    cycle.name,
    phaseLabels[cycle.cycleType] ?? cycle.cycleType,
  ];
  for (const candidate of candidates) {
    if (candidate && String(candidate).trim()) {
      return String(candidate).trim();
    }
  }
  return "";
}

function buildPlannerUrl({ cycle, week, day, planId }) {
  const params = new URLSearchParams();
  if (planId) {
    params.set("planId", String(planId));
  }
  params.set("cycleId", String(cycle.id));
  params.set("weekId", String(week.id));
  params.set("dayId", String(day.id));
  if (day.date) {
    params.set("planDate", formatDateInput(day.date));
  }
  const focus = deriveDayFocus(cycle, week, day);
  if (focus) {
    params.set("planFocus", focus);
  }
  return `planner.html?${params.toString()}`;
}

async function fetchPlanSummary(planId) {
  if (planCache.has(planId)) {
    return planCache.get(planId);
  }
  try {
    const { data } = await apiRequest(`/api/plans/${planId}`);
    const summary = {
      id: data.id,
      title: data.title ?? `Plan #${planId}`,
      focus: data.focus ?? "",
      weeklyCycle: data.metadata?.weeklyCycle ?? null,
    };
    planCache.set(planId, summary);
    return summary;
  } catch (error) {
    const summary = { id: planId, error: getErrorMessage(error) };
    planCache.set(planId, summary);
    return summary;
  }
}

function applyPlanSummary(titleEl, metaEl, summary) {
  if (!summary) {
    titleEl.textContent = titleEl.dataset.planFallback ?? "Plan";
    metaEl.textContent = "";
    return;
  }
  if (summary.error) {
    titleEl.textContent = `Plan #${summary.id}`;
    metaEl.textContent = summary.error;
    metaEl.dataset.state = "error";
    return;
  }
  titleEl.textContent = summary.title;
  delete metaEl.dataset.state;
  const focusParts = [];
  if (summary.weeklyCycle?.mainSetFocus) {
    focusParts.push(summary.weeklyCycle.mainSetFocus);
  }
  if (summary.weeklyCycle?.skillFocus1) {
    focusParts.push(summary.weeklyCycle.skillFocus1);
  }
  if (summary.weeklyCycle?.skillFocus2) {
    focusParts.push(summary.weeklyCycle.skillFocus2);
  }
  if (summary.focus && !focusParts.includes(summary.focus)) {
    focusParts.push(summary.focus);
  }
  metaEl.textContent = focusParts.filter(Boolean).join(" • ");
}

async function refreshPlanSummary(titleEl, metaEl, planId) {
  const summary = await fetchPlanSummary(planId);
  applyPlanSummary(titleEl, metaEl, summary);
}

function createPlanCell(cycle, week, day) {
  const cell = document.createElement("td");
  cell.className = "week-plan-cell";

  const title = document.createElement("p");
  title.className = "week-plan-title";
  const meta = document.createElement("p");
  meta.className = "week-plan-meta";
  const actions = document.createElement("div");
  actions.className = "week-plan-actions";

  cell.append(title, meta, actions);

  if (day.planId) {
    title.dataset.planFallback = `Plan #${day.planId}`;
    title.textContent = "Plan wird geladen …";
    meta.textContent = "";
    refreshPlanSummary(title, meta, day.planId);

    const openLink = document.createElement("a");
    openLink.className = "ghost-button compact";
    openLink.textContent = "Plan öffnen";
    openLink.href = buildPlannerUrl({ cycle, week, day, planId: day.planId });
    actions.append(openLink);

    const unlinkButton = document.createElement("button");
    unlinkButton.type = "button";
    unlinkButton.className = "ghost-button compact";
    unlinkButton.textContent = "Verknüpfung lösen";
    unlinkButton.addEventListener("click", () => {
      unlinkDayPlan(cycle.id, day.id, unlinkButton);
    });
    actions.append(unlinkButton);
  } else {
    title.textContent = "Kein Plan verknüpft";
    const focusHint = deriveDayFocus(cycle, week, day);
    meta.textContent = focusHint ? `Fokus: ${focusHint}` : "";

    const createLink = document.createElement("a");
    createLink.className = "ghost-button compact";
    createLink.textContent = "Plan erstellen";
    createLink.href = buildPlannerUrl({ cycle, week, day });
    actions.append(createLink);
  }

  return cell;
}

async function unlinkDayPlan(cycleId, dayId, button) {
  try {
    if (button) {
      button.disabled = true;
    }
    planCache.clear();
    await apiRequest(`/api/days/${dayId}`, { method: "PATCH", json: { planId: null } });
    await reloadCycle(cycleId, { select: true });
    setFeedback("Plan-Verknüpfung entfernt.", "success");
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
  } finally {
    if (button) {
      button.disabled = false;
    }
  }
}

function renderCycleDetail() {
  if (!detailEl) {
    return;
  }
  detailEl.innerHTML = "";
  const cycle = state.cycles.find((entry) => entry.id === state.activeCycleId) ?? null;
  if (!cycle) {
    const empty = document.createElement("div");
    empty.className = "weekly-empty";
    const heading = document.createElement("h2");
    heading.textContent = "Kein Zyklus ausgewählt";
    const message = document.createElement("p");
    message.textContent = "Wähle links einen Zyklus aus oder erstelle einen neuen Zeitraum.";
    empty.append(heading, message);
    detailEl.append(empty);
    return;
  }

  const header = document.createElement("section");
  header.className = "cycle-detail-header";

  const dateRange = document.createElement("p");
  dateRange.className = "cycle-date-range";
  dateRange.textContent = buildDateRange(cycle);
  header.append(dateRange);

  const form = document.createElement("form");
  form.className = "cycle-update-form";
  const nameField = createInputField({
    label: "Name",
    type: "text",
    name: "name",
    value: cycle.name ?? "",
    required: true,
  });
  const typeField = createSelectField({
    label: "Typ",
    name: "cycleType",
    value: cycle.cycleType ?? "custom",
    options: [
      { value: "volume", label: "Volumenphase" },
      { value: "intensity", label: "Intensitätsphase" },
      { value: "deload", label: "Deload" },
      { value: "custom", label: "Individuell" },
    ],
  });
  const startField = createInputField({
    label: "Startdatum",
    type: "date",
    name: "startDate",
    value: cycle.startDate ?? "",
    required: true,
  });
  const endField = createInputField({
    label: "Enddatum",
    type: "date",
    name: "endDate",
    value: cycle.endDate ?? "",
  });
  const notesField = createTextareaField({
    label: "Notiz",
    name: "notes",
    value: typeof cycle.metadata?.notes === "string" ? cycle.metadata.notes : "",
  });
  form.append(nameField, typeField, startField, endField, notesField);

  const actions = document.createElement("div");
  actions.className = "cycle-update-actions";
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "primary-button";
  saveButton.textContent = "Zyklus aktualisieren";

  const addWeekButton = document.createElement("button");
  addWeekButton.type = "button";
  addWeekButton.className = "secondary-button";
  addWeekButton.textContent = "Weitere Woche hinzufügen";
  addWeekButton.addEventListener("click", () => handleAddWeek(cycle));

  actions.append(saveButton, addWeekButton);
  header.append(form, actions);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleCycleUpdate(cycle, form);
  });

  const summary = buildCycleSummary(cycle);

  const weekContainer = document.createElement("div");
  weekContainer.className = "week-grid";
  for (const week of cycle.weeks ?? []) {
    const weekCard = createWeekCard(cycle, week);
    weekContainer.append(weekCard);
  }

  detailEl.append(header, summary, weekContainer);

  if (state.highlightDayId) {
    const highlightRow = detailEl.querySelector(`[data-day-id="${state.highlightDayId}"]`);
    if (highlightRow) {
      highlightRow.classList.add("week-day--highlight");
      if (shouldAutoScrollHighlight) {
        highlightRow.scrollIntoView({ block: "center", behavior: "smooth" });
        shouldAutoScrollHighlight = false;
      }
    }
  }
}

function createInputField({ label, type, name, value, required = false }) {
  const input = document.createElement("input");
  input.type = type;
  input.name = name;
  if (type === "date") {
    input.value = formatDateInput(value);
  } else if (value !== undefined && value !== null) {
    input.value = String(value);
  }
  if (required) {
    input.required = true;
  }
  return wrapField(label, input);
}

function createSelectField({ label, name, value, options }) {
  const select = document.createElement("select");
  select.name = name;
  for (const option of options) {
    const optionEl = document.createElement("option");
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    if (option.value === value) {
      optionEl.selected = true;
    }
    select.append(optionEl);
  }
  return wrapField(label, select);
}

function createTextareaField({ label, name, value }) {
  const textarea = document.createElement("textarea");
  textarea.name = name;
  textarea.rows = 2;
  if (value) {
    textarea.value = value;
  }
  return wrapField(label, textarea);
}

function wrapField(labelText, element) {
  const wrapper = document.createElement(labelText ? "label" : "div");
  wrapper.className = "form-field";
  if (labelText) {
    const span = document.createElement("span");
    span.textContent = labelText;
    wrapper.append(span, element);
  } else {
    wrapper.append(element);
  }
  return wrapper;
}

function buildCycleSummary(cycle) {
  const container = document.createElement("section");
  container.className = "cycle-summary";

  const weekCount = cycle.summary?.weekCount ?? cycle.weeks?.length ?? 0;
  const totalDistance = cycle.summary?.totalDistance ?? 0;
  const totalVolume = cycle.summary?.totalVolume ?? 0;
  const averageRpe = cycle.summary?.averageWeeklyRpe ?? null;
  const phaseDistribution = cycle.summary?.phaseDistribution ?? {};

  container.append(
    createSummaryItem("Wochen", weekCount ? `${weekCount}` : "–"),
    createSummaryItem(
      "Gesamtumfang",
      totalDistance ? `${distanceFormatter.format(totalDistance)} m` : "–"
    ),
    createSummaryItem(
      "Gesamtvolumen",
      totalVolume ? `${distanceFormatter.format(totalVolume)} m` : "–"
    ),
    createSummaryItem(
      "Ø Wochen-RPE",
      typeof averageRpe === "number" ? decimalFormatter.format(averageRpe) : "–"
    ),
    createSummaryItem("Phasen", formatPhaseDistribution(phaseDistribution))
  );

  return container;
}

function createSummaryItem(label, value) {
  const item = document.createElement("div");
  item.className = "cycle-summary-item";
  const title = document.createElement("h3");
  title.textContent = label;
  const content = document.createElement("p");
  content.textContent = value;
  item.append(title, content);
  return item;
}

function formatPhaseDistribution(distribution) {
  const parts = [];
  for (const [key, count] of Object.entries(distribution ?? {})) {
    if (!count) {
      continue;
    }
    const label = phaseLabels[key] ?? key;
    parts.push(`${label} ${count}`);
  }
  return parts.length > 0 ? parts.join(" • ") : "–";
}

async function handleCycleUpdate(cycle, form) {
  const formData = new FormData(form);
  const payload = {
    name: (formData.get("name") ?? "").toString().trim(),
    cycleType: (formData.get("cycleType") ?? "custom").toString(),
    startDate: formData.get("startDate") || null,
    endDate: formData.get("endDate") || null,
  };

  const notes = (formData.get("notes") ?? "").toString().trim();
  const metadata = { ...(cycle.metadata ?? {}) };
  if (notes) {
    metadata.notes = notes;
  } else {
    delete metadata.notes;
  }
  payload.metadata = metadata;

  try {
    const { data } = await apiRequest(`/api/cycles/${cycle.id}`, {
      method: "PATCH",
      json: payload,
    });
    const updatedCycle = data && typeof data === "object" ? data : null;
    if (updatedCycle) {
      updateCycleState(updatedCycle, { select: true });
    } else {
      await reloadCycle(cycle.id, { select: true });
    }
    setFeedback("Zyklus aktualisiert.", "success");
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
  }
}

async function handleAddWeek(cycle) {
  const nextWeekNumber = (cycle.weeks?.length ?? 0) + 1;
  const payload = {
    weekNumber: nextWeekNumber,
    phase: cycle.cycleType ?? "custom",
  };
  try {
    await apiRequest(`/api/cycles/${cycle.id}/weeks`, { method: "POST", json: payload });
    await reloadCycle(cycle.id, { select: true });
    setFeedback("Neue Woche hinzugefügt.", "success");
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
  }
}

function createWeekCard(cycle, week) {
  const card = document.createElement("article");
  card.className = "week-card";
  card.dataset.weekId = String(week.id);

  const headerRow = document.createElement("div");
  headerRow.className = "week-card-header";

  const form = document.createElement("form");
  form.className = "week-form";
  const weekNumberField = createInputField({
    label: "Woche",
    type: "number",
    name: "weekNumber",
    value: week.weekNumber ?? "",
  });
  const focusField = createInputField({
    label: "Fokus",
    type: "text",
    name: "focusLabel",
    value: week.focusLabel ?? "",
  });
  const phaseField = createSelectField({
    label: "Phase",
    name: "phase",
    value: week.phase ?? "custom",
    options: [
      { value: "volume", label: "Volumen" },
      { value: "intensity", label: "Intensität" },
      { value: "deload", label: "Deload" },
      { value: "custom", label: "Individuell" },
    ],
  });
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "secondary-button";
  saveButton.textContent = "Woche speichern";

  form.append(weekNumberField, focusField, phaseField, wrapField("", saveButton));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handleWeekUpdate(cycle, week, form);
  });

  const badge = document.createElement("span");
  badge.className = "phase-badge";
  badge.textContent = phaseLabels[week.phase] ?? "Individuell";

  headerRow.append(form, badge);

  const summary = document.createElement("div");
  summary.className = "week-summary";
  const distanceText = typeof week.summary?.totalDistance === "number" && week.summary.totalDistance > 0
    ? `${distanceFormatter.format(week.summary.totalDistance)} m`
    : "–";
  const volumeText = typeof week.summary?.totalVolume === "number" && week.summary.totalVolume > 0
    ? `${distanceFormatter.format(week.summary.totalVolume)} m`
    : "–";
  const rpeText = typeof week.summary?.averageRpe === "number"
    ? decimalFormatter.format(week.summary.averageRpe)
    : "–";
  summary.append(
    buildWeekSummaryPart("Gesamtumfang", distanceText),
    buildWeekSummaryPart("Gesamtvolumen", volumeText),
    buildWeekSummaryPart("Ø RPE", rpeText),
  );

  const tableWrapper = document.createElement("div");
  tableWrapper.className = "week-table-wrapper";
  const table = document.createElement("table");
  table.className = "week-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const headers = [
    "Tag",
    "Main Set Fokus",
    "Skill Fokus #1",
    "Skill Fokus #2",
    "Volumen (m)",
    "Distanz (m)",
    "Kick %",
    "Pull %",
    "RPE",
    "Plan",
    "Aktion",
  ];
  for (const label of headers) {
    const cell = document.createElement("th");
    cell.textContent = label;
    headRow.append(cell);
  }
  thead.append(headRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  for (const day of week.days ?? []) {
    const row = createDayRow(cycle, week, day);
    tbody.append(row);
  }
  table.append(tbody);

  tableWrapper.append(table);

  card.append(headerRow, summary, tableWrapper);
  return card;
}

function buildWeekSummaryPart(label, value) {
  const fragment = document.createElement("span");
  fragment.innerHTML = `<strong>${label}:</strong> ${value}`;
  return fragment;
}

async function handleWeekUpdate(cycle, week, form) {
  const formData = new FormData(form);
  const payload = {};
  const weekNumberRaw = formData.get("weekNumber");
  if (weekNumberRaw !== null && weekNumberRaw !== "") {
    payload.weekNumber = Number.parseInt(weekNumberRaw, 10);
  }
  payload.focusLabel = (formData.get("focusLabel") ?? "").toString();
  payload.phase = (formData.get("phase") ?? "custom").toString();
  try {
    await apiRequest(`/api/weeks/${week.id}`, { method: "PATCH", json: payload });
    await reloadCycle(cycle.id, { select: true });
    setFeedback("Woche aktualisiert.", "success");
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
  }
}

function createDayRow(cycle, week, day) {
  const row = document.createElement("tr");
  row.dataset.dayId = String(day.id);

  const labelCell = document.createElement("th");
  labelCell.scope = "row";
  labelCell.textContent = `${formatWeekday(day.date)} ${formatDate(day.date)}`;
  row.append(labelCell);

  const fields = [
    { field: "mainSetFocus", type: "text" },
    { field: "skillFocus1", type: "text" },
    { field: "skillFocus2", type: "text" },
    { field: "volume", type: "number", step: "50" },
    { field: "distance", type: "number", step: "50" },
    { field: "kickPercent", type: "number", min: "0", max: "100" },
    { field: "pullPercent", type: "number", min: "0", max: "100" },
    { field: "rpe", type: "number", min: "0", max: "10", step: "0.1" },
  ];

  for (const config of fields) {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.type = config.type;
    input.dataset.field = config.field;
    if (config.step) {
      input.step = config.step;
    }
    if (config.min) {
      input.min = config.min;
    }
    if (config.max) {
      input.max = config.max;
    }
    const value = day[config.field];
    if (value !== null && value !== undefined) {
      input.value = String(value);
    }
    input.className = "week-input";
    cell.append(input);
    row.append(cell);
  }

  const planCell = createPlanCell(cycle, week, day);
  row.append(planCell);

  const actionCell = document.createElement("td");
  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "secondary-button week-save-button";
  saveButton.textContent = "Speichern";
  saveButton.addEventListener("click", async () => {
    await handleDayUpdate(cycle.id, week.id, day.id, row, saveButton);
  });
  actionCell.append(saveButton);
  row.append(actionCell);

  return row;
}

function cycleContainsDay(cycle, dayId) {
  if (!cycle || !dayId) {
    return false;
  }
  for (const week of cycle.weeks ?? []) {
    for (const day of week.days ?? []) {
      if (day.id === dayId) {
        return true;
      }
    }
  }
  return false;
}

async function handleDayUpdate(cycleId, weekId, dayId, row, button) {
  const inputs = row.querySelectorAll("[data-field]");
  const payload = {};
  for (const input of inputs) {
    const field = input.dataset.field;
    if (!field) {
      continue;
    }
    if (input.type === "number") {
      const value = parseNumberValue(input.value);
      payload[field] = value;
    } else {
      payload[field] = input.value.trim();
    }
  }
  try {
    button.disabled = true;
    await apiRequest(`/api/days/${dayId}`, { method: "PATCH", json: payload });
    await reloadCycle(cycleId, { select: true });
    setFeedback("Tag gespeichert.", "success");
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
  } finally {
    button.disabled = false;
  }
}

function parseNumberValue(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = raw.toString().trim();
  if (!trimmed) {
    return null;
  }
  const value = Number.parseFloat(trimmed);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
}

function buildDateRange(cycle) {
  if (!cycle.startDate) {
    return "Zeitraum nicht definiert.";
  }
  const start = formatDate(cycle.startDate);
  const end = cycle.endDate ? formatDate(cycle.endDate) : null;
  return end ? `Zeitraum: ${start} – ${end}` : `Start: ${start}`;
}

function formatDateInput(value) {
  if (!value) {
    return "";
  }
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function formatDate(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "–";
    }
    return dateFormatter.format(date);
  } catch {
    return "–";
  }
}

function formatWeekday(value) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return weekDayFormatter.format(date);
  } catch {
    return "";
  }
}

async function onCreateCycleSubmit(event) {
  event.preventDefault();
  if (!createForm) {
    return;
  }
  const formData = new FormData(createForm);
  const name = (formData.get("name") ?? "").toString().trim();
  const cycleType = (formData.get("cycleType") ?? "custom").toString();
  const startDate = formData.get("startDate");
  const endDate = formData.get("endDate") || null;
  const initialWeeksValue = Number.parseInt(formData.get("initialWeeks"), 10);
  const initialWeeks = Number.isInteger(initialWeeksValue) && initialWeeksValue > 0 ? initialWeeksValue : 4;
  const notes = (formData.get("notes") ?? "").toString().trim();

  const weeks = Array.from({ length: initialWeeks }, (_, index) => ({
    weekNumber: index + 1,
    phase: cycleType,
  }));

  const payload = {
    name,
    cycleType,
    startDate,
    endDate: endDate || undefined,
    weeks,
  };
  if (notes) {
    payload.metadata = { notes };
  }

  try {
    const { data } = await apiRequest("/api/cycles", { method: "POST", json: payload });
    setFeedback("Zyklus angelegt.", "success");
    createForm.reset();
    const weeksField = createForm.querySelector('[name="initialWeeks"]');
    if (weeksField) {
      weeksField.value = "4";
    }
    const createdCycle = data && typeof data === "object" ? data : null;
    if (createdCycle) {
      updateCycleState(createdCycle, { select: true });
    } else {
      await refreshCycles();
    }
  } catch (error) {
    setFeedback(getErrorMessage(error), "error");
  }
}

function parseInitialSelection() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    const toPositiveInt = (value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    };
    const cycleId = toPositiveInt(params.get("cycleId"));
    const weekId = toPositiveInt(params.get("weekId"));
    const dayId = toPositiveInt(params.get("dayId"));
    if (!cycleId && !dayId) {
      return null;
    }
    return {
      cycleId: cycleId ?? null,
      weekId: weekId ?? null,
      dayId: dayId ?? null,
    };
  } catch (error) {
    console.warn("Konnte Vorauswahl für Wochenplanung nicht auswerten", error);
    return null;
  }
}

init();
