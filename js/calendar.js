import { ApiError, apiRequest, canUseApi, describeApiError } from "./utils/apiClient.js";

const weekdays = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const monthFormatter = new Intl.DateTimeFormat("de-DE", {
  month: "long",
  year: "numeric",
});
const dayLabelFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

const calendarGrid = document.getElementById("calendar-grid");
const monthLabel = document.getElementById("calendar-month-label");
const planList = document.getElementById("plan-list");
const selectedDateLabel = document.getElementById("calendar-selected-date");
const statusElement = document.getElementById("calendar-status");
const createPlanButton = document.getElementById("calendar-create-plan");
const createPlanHint = document.getElementById("calendar-create-hint");
const copyLastButton = document.getElementById("calendar-copy-last");
const prevButton = document.getElementById("calendar-prev");
const nextButton = document.getElementById("calendar-next");
const todayButton = document.getElementById("calendar-today");

let currentMonth = startOfMonth(new Date());
let selectedDateKey = dateToKey(new Date());
let plans = [];
let plansByDate = new Map();
let mostRecentPlan = null;

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dateToKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function keyToDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoToDateKey(isoString) {
  if (!isoString) {
    return null;
  }
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return dateToKey(parsed);
}

function setStatus(message, type = "info") {
  if (!statusElement) {
    return;
  }
  statusElement.textContent = message;
  if (message) {
    statusElement.dataset.statusType = type;
  } else {
    delete statusElement.dataset.statusType;
  }
}

function clearStatus() {
  setStatus("");
}

function buildIndex() {
  plansByDate = new Map();
  for (const plan of plans) {
    const key = isoToDateKey(plan.planDate);
    if (!key) {
      continue;
    }
    if (!plansByDate.has(key)) {
      plansByDate.set(key, []);
    }
    plansByDate.get(key).push(plan);
  }
  for (const planList of plansByDate.values()) {
    planList.sort((a, b) => {
      const aTime = new Date(a.planDate).getTime();
      const bTime = new Date(b.planDate).getTime();
      if (aTime === bTime) {
        return a.id - b.id;
      }
      return aTime - bTime;
    });
  }
}

function renderCalendar() {
  if (!calendarGrid || !monthLabel) {
    return;
  }

  monthLabel.textContent = monthFormatter.format(currentMonth);
  calendarGrid.innerHTML = "";

  for (const dayName of weekdays) {
    const headerCell = document.createElement("div");
    headerCell.className = "calendar-weekday";
    headerCell.textContent = dayName;
    headerCell.setAttribute("role", "columnheader");
    calendarGrid.append(headerCell);
  }

  const firstDay = startOfMonth(currentMonth);
  const daysInMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 0).getDate();
  const startWeekday = (firstDay.getDay() + 6) % 7; // Montag als erster Tag
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const prevMonth = new Date(firstDay.getFullYear(), firstDay.getMonth(), 0);
  const nextMonth = new Date(firstDay.getFullYear(), firstDay.getMonth() + 1, 1);

  for (let index = 0; index < totalCells; index += 1) {
    const cell = document.createElement("div");
    cell.className = "calendar-cell";
    cell.setAttribute("role", "presentation");

    let cellDate;
    let isOtherMonth = false;

    if (index < startWeekday) {
      const dayOffset = startWeekday - index;
      cellDate = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), prevMonth.getDate() - dayOffset + 1);
      isOtherMonth = true;
    } else if (index >= startWeekday + daysInMonth) {
      const dayNumber = index - (startWeekday + daysInMonth) + 1;
      cellDate = new Date(nextMonth.getFullYear(), nextMonth.getMonth(), dayNumber);
      isOtherMonth = true;
    } else {
      const dayNumber = index - startWeekday + 1;
      cellDate = new Date(firstDay.getFullYear(), firstDay.getMonth(), dayNumber);
    }

    const dateKey = dateToKey(cellDate);
    const planCount = plansByDate.get(dateKey)?.length ?? 0;
    const isSelected = dateKey === selectedDateKey;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    if (isOtherMonth) {
      button.classList.add("is-outside-month");
    }
    if (planCount > 0) {
      button.classList.add("has-plans");
      button.setAttribute("data-plan-count", String(planCount));
    }
    if (isSelected) {
      button.classList.add("is-selected");
      button.setAttribute("aria-pressed", "true");
    } else {
      button.setAttribute("aria-pressed", "false");
    }
    button.dataset.date = dateKey;
    button.dataset.month = String(cellDate.getMonth());
    if (isOtherMonth) {
      button.dataset.outside = "true";
    }

    const label = dayLabelFormatter.format(cellDate);
    const accessibleLabel = planCount > 0 ? `${label} – ${planCount} gespeicherte ${planCount === 1 ? "Plan" : "Pläne"}` : label;
    button.setAttribute("aria-label", accessibleLabel);

    const numberSpan = document.createElement("span");
    numberSpan.className = "calendar-day-number";
    numberSpan.textContent = String(cellDate.getDate());
    button.append(numberSpan);

    const marker = document.createElement("span");
    marker.className = "calendar-marker";
    marker.setAttribute("aria-hidden", "true");
    button.append(marker);

    cell.append(button);
    calendarGrid.append(cell);
  }
}

function formatDateLabel(dateKey) {
  if (!dateKey) {
    return "–";
  }
  const date = keyToDate(dateKey);
  return dayLabelFormatter.format(date);
}

function formatTime(isoString) {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return "–";
  }
  return timeFormatter.format(parsed);
}

function buildDuplicateUrl(plan, targetDateKey) {
  if (!plan || !plan.id) {
    return "planner.html";
  }
  const params = new URLSearchParams();
  params.set("duplicatePlanId", String(plan.id));
  if (targetDateKey) {
    params.set("planDate", targetDateKey);
  }
  if (plan.focus) {
    params.set("planFocus", plan.focus);
  }
  const plannedAt = new Date(plan.planDate);
  if (!Number.isNaN(plannedAt.getTime())) {
    params.set(
      "planTime",
      `${String(plannedAt.getHours()).padStart(2, "0")}:${String(plannedAt.getMinutes()).padStart(2, "0")}`,
    );
  }
  return `planner.html?${params.toString()}`;
}

function updateCopyLastButton(targetDateKey) {
  if (!copyLastButton) {
    return;
  }
  if (!mostRecentPlan) {
    copyLastButton.disabled = true;
    copyLastButton.removeAttribute("data-url");
    copyLastButton.title = "Keine gespeicherten Pläne vorhanden";
    return;
  }
  const url = buildDuplicateUrl(mostRecentPlan, targetDateKey ?? selectedDateKey);
  copyLastButton.disabled = false;
  copyLastButton.dataset.url = url;
  copyLastButton.title = `Übernehme "${mostRecentPlan.title ?? "Ohne Titel"}"`;
}

function renderPlanList(dateKey) {
  if (!planList || !selectedDateLabel) {
    return;
  }
  selectedDateLabel.textContent = formatDateLabel(dateKey);
  planList.innerHTML = "";

  const plansForDay = plansByDate.get(dateKey) ?? [];
  if (plansForDay.length === 0) {
    const empty = document.createElement("p");
    empty.className = "calendar-empty";
    empty.textContent = "Für dieses Datum sind noch keine Pläne gespeichert.";
    planList.append(empty);
    updateCreateButton(dateKey);
    return;
  }

  for (const plan of plansForDay) {
    const entry = document.createElement("article");
    entry.className = "plan-entry";

    const header = document.createElement("header");
    header.className = "plan-entry-header";

    const title = document.createElement("h3");
    title.textContent = plan.title ?? "Ohne Titel";
    header.append(title);

    const time = document.createElement("span");
    time.className = "plan-entry-time";
    time.textContent = formatTime(plan.planDate);
    header.append(time);
    entry.append(header);

    const meta = document.createElement("p");
    meta.className = "plan-entry-meta";
    const focus = plan.focus ? `Fokus: ${plan.focus}` : "Fokus unbekannt";
    meta.textContent = focus;
    entry.append(meta);

    if (plan.metadata?.notes) {
      const notes = document.createElement("p");
      notes.className = "plan-entry-notes";
      notes.textContent = plan.metadata.notes;
      entry.append(notes);
    }

    const actions = document.createElement("div");
    actions.className = "plan-entry-actions";

    const openButton = document.createElement("a");
    openButton.className = "primary-button plan-entry-link";
    openButton.href = `planner.html?planId=${encodeURIComponent(plan.id)}`;
    openButton.textContent = "Im Planner öffnen";
    actions.append(openButton);

    const duplicateLink = document.createElement("a");
    duplicateLink.className = "ghost-button plan-entry-link";
    duplicateLink.href = buildDuplicateUrl(plan, dateKey);
    duplicateLink.textContent = "Plan duplizieren";
    actions.append(duplicateLink);

    entry.append(actions);
    planList.append(entry);
  }

  updateCreateButton(dateKey);
}

function updateCreateButton(dateKey) {
  if (!createPlanButton) {
    return;
  }

  const targetDate = dateKey ? keyToDate(dateKey) : null;
  const isoDate = dateKey ?? "";

  if (isoDate) {
    createPlanButton.href = `planner.html?planDate=${encodeURIComponent(isoDate)}`;
    createPlanButton.removeAttribute("aria-disabled");
  } else {
    createPlanButton.href = "planner.html";
    createPlanButton.setAttribute("aria-disabled", "true");
  }

  if (createPlanHint) {
    if (targetDate) {
      createPlanHint.textContent = `Der Planner öffnet sich mit dem Datum ${dayLabelFormatter.format(targetDate)}.`;
    } else {
      createPlanHint.textContent = "Wähle einen Tag, um einen neuen Plan zu hinterlegen.";
    }
  }

  updateCopyLastButton(dateKey);
}

function selectDate(dateKey) {
  if (!dateKey) {
    return;
  }
  selectedDateKey = dateKey;
  currentMonth = startOfMonth(keyToDate(dateKey));
  renderCalendar();
  renderPlanList(selectedDateKey);
}

async function loadPlans() {
  if (!canUseApi()) {
    setStatus(
      "Die Kalenderübersicht benötigt den lokalen NextPlanner-Server. Bitte 'npm start' ausführen und die Anwendung über http://localhost:3000 öffnen.",
      "warning",
    );
    return;
  }

  try {
    const { data } = await apiRequest("/api/plans");
    plans = Array.isArray(data) ? data : [];
    buildIndex();
    mostRecentPlan = plans
      .slice()
      .sort((a, b) => new Date(b.planDate).getTime() - new Date(a.planDate).getTime())[0] ?? null;
    if (!plansByDate.has(selectedDateKey) && plansByDate.size > 0) {
      const firstKey = Array.from(plansByDate.keys()).sort()[0];
      selectedDateKey = firstKey;
    }
    clearStatus();
    renderCalendar();
    renderPlanList(selectedDateKey);
    updateCopyLastButton(selectedDateKey);
  } catch (error) {
    console.error("Konnte Pläne für den Kalender nicht laden", error);
    const message = describeApiError(error);
    const statusType = error instanceof ApiError && error.offline ? "warning" : "error";
    setStatus(`Pläne konnten nicht geladen werden: ${message}`, statusType);
    renderCalendar();
    renderPlanList(selectedDateKey);
    updateCopyLastButton(selectedDateKey);
  }
}

function changeMonth(offset) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
  renderCalendar();
}

if (calendarGrid) {
  calendarGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button.calendar-day");
    if (!button || !button.dataset.date) {
      return;
    }
    const dateKey = button.dataset.date;
    selectDate(dateKey);
  });
}

prevButton?.addEventListener("click", () => {
  changeMonth(-1);
});

nextButton?.addEventListener("click", () => {
  changeMonth(1);
});

todayButton?.addEventListener("click", () => {
  const today = new Date();
  selectedDateKey = dateToKey(today);
  currentMonth = startOfMonth(today);
  renderCalendar();
  renderPlanList(selectedDateKey);
});

copyLastButton?.addEventListener("click", () => {
  const url = copyLastButton.dataset.url;
  if (url) {
    window.location.href = url;
  }
});

renderCalendar();
renderPlanList(selectedDateKey);

loadPlans().catch((error) => {
  console.error("Unerwarteter Fehler beim Laden des Kalenders", error);
  setStatus("Unerwarteter Fehler beim Laden des Kalenders.", "error");
});
