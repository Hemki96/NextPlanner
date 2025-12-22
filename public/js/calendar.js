import { ApiError, apiRequest, canUseApi, describeApiError } from "./utils/api-client.js";
import { triggerDownload } from "./utils/download.js";
import { createWeekPdfDocument, createWeekWordDocument } from "./utils/week-export.js";
import { parsePlan } from "./parser/plan-parser.js";
import {
  applyFeatureVisibility,
  getFeatureSettings,
  subscribeToFeatureSettings,
} from "./utils/feature-settings.js";
import { resolveUserDirectory } from "./utils/user-directory.js";

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
const shortDateFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});
const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});
const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "short",
  timeStyle: "short",
});

const calendarGrid = document.getElementById("calendar-grid");
const monthLabel = document.getElementById("calendar-month-label");
const planList = document.getElementById("plan-list");
const selectedDateLabel = document.getElementById("calendar-selected-date");
const statusElement = document.getElementById("calendar-status");
const createPlanButton = document.getElementById("calendar-create-plan");
const createPlanHint = document.getElementById("calendar-create-hint");
const copyLastButton = document.getElementById("calendar-copy-last");
const exportWeekWordButton = document.getElementById("calendar-export-week-word");
const exportWeekPdfButton = document.getElementById("calendar-export-week-pdf");
const prevButton = document.getElementById("calendar-prev");
const nextButton = document.getElementById("calendar-next");
const todayButton = document.getElementById("calendar-today");

const featureSettings = getFeatureSettings();
applyFeatureVisibility(document, featureSettings);
subscribeToFeatureSettings(() => {
  window.location.reload();
});

const calendarFeatureEnabled = featureSettings.calendarView !== false;

let currentMonth = startOfMonth(new Date());
let selectedDateKey = dateToKey(new Date());
let plans = [];
let plansByDate = new Map();
let mostRecentPlan = null;
let userDirectory = new Map();

function describePlanForMessages(plan, dateKey) {
  const parts = [];
  const title = plan?.title?.trim();
  if (title) {
    parts.push(`„${title}“`);
  }
  const label = dateKey ? formatDateLabel(dateKey) : null;
  if (label) {
    parts.push(`(${label})`);
  }
  return parts.join(" ");
}

function confirmPlanDeletion(plan, dateKey) {
  if (typeof window === "undefined" || typeof window.confirm !== "function") {
    return true;
  }
  const label = describePlanForMessages(plan, dateKey);
  const message = label
    ? `Möchtest du den Plan ${label} dauerhaft löschen? Dieser Schritt kann nicht rückgängig gemacht werden.`
    : "Möchtest du diesen Plan dauerhaft löschen? Dieser Schritt kann nicht rückgängig gemacht werden.";
  return window.confirm(message);
}

function removePlanFromState(planId) {
  plans = plans.filter((entry) => entry.id !== planId);
  buildIndex();
  mostRecentPlan =
    plans
      .slice()
      .sort((a, b) => new Date(b.planDate).getTime() - new Date(a.planDate).getTime())[0] ?? null;
}

async function requestPlanDeletion(plan, dateKey, button) {
  if (!plan?.id) {
    return;
  }
  if (!canUseApi()) {
    setStatus(
      "Zum Löschen wird der lokale NextPlanner-Server benötigt. Bitte 'npm start' ausführen und die Seite über http://localhost:3000 öffnen.",
      "warning",
    );
    return;
  }
  if (!confirmPlanDeletion(plan, dateKey)) {
    return;
  }

  setStatus("Plan wird gelöscht…", "info");
  button.disabled = true;
  const endpoint = `/api/plans/${encodeURIComponent(plan.id)}`;

  try {
    await apiRequest(endpoint, { method: "HEAD" });
    await apiRequest(endpoint, { method: "DELETE" });
    removePlanFromState(plan.id);
    renderCalendar();
    renderPlanList(selectedDateKey);
    updateCopyLastButton(selectedDateKey);
    const label = describePlanForMessages(plan, isoToDateKey(plan.planDate) ?? dateKey);
    const message = label ? `Plan ${label} wurde gelöscht.` : "Plan wurde gelöscht.";
    setStatus(message, "success");
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      removePlanFromState(plan.id);
      renderCalendar();
      renderPlanList(selectedDateKey);
      updateCopyLastButton(selectedDateKey);
      setStatus("Plan war bereits entfernt – Ansicht aktualisiert.", "info");
    } else {
      console.error("Plan konnte nicht gelöscht werden", error);
      const message = describeApiError(error);
      const statusType = error instanceof ApiError && error.offline ? "warning" : "error";
      setStatus(`Plan konnte nicht gelöscht werden: ${message}`, statusType);
    }
  } finally {
    button.disabled = false;
  }
}

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

function parsePlanDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    const copy = new Date(value.getTime());
    return Number.isNaN(copy.getTime()) ? null : copy;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const fromNumber = value > 0 && value < 10_000_000_000 ? value * 1000 : value;
    const fromTimestamp = new Date(fromNumber);
    return Number.isNaN(fromTimestamp.getTime()) ? null : fromTimestamp;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let candidate = trimmed;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    candidate = `${trimmed}T00:00:00`;
  } else if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(trimmed)) {
    candidate = trimmed.replace(/\s+/, "T");
  } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    const [day, month, year] = trimmed.split(".");
    candidate = `${year}-${month}-${day}T00:00:00`;
  }

  let parsed = new Date(candidate);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  parsed = new Date(trimmed.replace(/\s+/, "T"));
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function formatDateTimeLabel(value) {
  const parsed = parsePlanDate(value);
  if (!parsed) {
    return "unbekannt";
  }
  return dateTimeFormatter.format(parsed);
}

function describeUserName(userId) {
  if (!userId) {
    return "Unbekannt";
  }
  const entry = userDirectory.get(userId);
  if (entry?.name) {
    return entry.name;
  }
  return typeof userId === "string" && userId.trim() ? userId : String(userId);
}

async function refreshUserDirectory(planList) {
  const identifiers = new Set();
  for (const plan of planList ?? []) {
    if (plan?.createdByUserId) {
      identifiers.add(plan.createdByUserId);
    }
    if (plan?.updatedByUserId) {
      identifiers.add(plan.updatedByUserId);
    }
  }
  try {
    userDirectory = await resolveUserDirectory(Array.from(identifiers));
  } catch (error) {
    console.warn("Benutzernamen konnten nicht geladen werden", error);
    userDirectory = new Map();
  }
}

function isoToDateKey(isoString) {
  const parsed = parsePlanDate(isoString);
  if (!parsed) {
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
  const parsed = parsePlanDate(isoString);
  if (!parsed) {
    return "–";
  }
  return timeFormatter.format(parsed);
}

function getWeekRange(dateKey) {
  if (!dateKey) {
    return null;
  }
  const referenceDate = keyToDate(dateKey);
  if (!referenceDate || Number.isNaN(referenceDate.getTime())) {
    return null;
  }

  const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  start.setHours(0, 0, 0, 0);
  const weekdayIndex = (start.getDay() + 6) % 7; // Montag = 0
  start.setDate(start.getDate() - weekdayIndex);

  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  return {
    start,
    end,
    startKey: dateToKey(start),
    endKey: dateToKey(end),
  };
}

const isoWeekdayLabels = ["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."];
const weekBlockOrder = ["Einschwimmen", "Main", "Ausschwimmen"];

function formatShortExportDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear() % 100).padStart(2, "0");
  return `${day}.${month}.${year}`;
}

function computeIsoWeekInfo(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return { week: 0, year: 0 };
  }
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const firstThursday = new Date(target.getFullYear(), 0, 4);
  firstThursday.setHours(0, 0, 0, 0);
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
  return { week, year: target.getFullYear() };
}

function toDisplayTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function toCompactTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}${minutes}`;
}

function detectGroupLabel(line) {
  if (typeof line !== "string") {
    return null;
  }
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }
  const headingMatch = trimmed.match(/^#{3,6}\s*(.+)$/);
  if (headingMatch) {
    const label = headingMatch[1].trim();
    return label || null;
  }
  if (trimmed.endsWith(":")) {
    const candidate = trimmed.slice(0, -1).trim();
    if (candidate && candidate.length <= 40 && !/\d/.test(candidate)) {
      return candidate;
    }
  }
  if (/gruppe$/i.test(trimmed) && !/\d/.test(trimmed) && trimmed.length <= 40) {
    return trimmed;
  }
  return null;
}

function classifyBlockName(name) {
  const normalized = (name ?? "").trim().toLowerCase();
  if (!normalized) {
    return "Main";
  }
  if (/dry|land|stabi|kraft/.test(normalized)) {
    return "Dryland";
  }
  if (/einschwimmen|warm/.test(normalized)) {
    return "Einschwimmen";
  }
  if (/ausschwimmen|cool|locker/.test(normalized)) {
    return "Ausschwimmen";
  }
  if (/main|haupt|kern|key|set/.test(normalized)) {
    return "Main";
  }
  return "Main";
}

function sanitizePlanLine(line) {
  if (typeof line !== "string") {
    return "";
  }
  return line.replace(/\t/g, "  ").replace(/\s+$/u, "");
}

function createSectionSummary(distance, time) {
  const totalDistance = Number.isFinite(distance) ? distance : 0;
  const totalTime = Number.isFinite(time) ? time : 0;
  if (totalDistance <= 0 && totalTime <= 0) {
    return null;
  }
  const summary = {};
  if (totalDistance > 0) {
    summary.km = Math.round(((totalDistance ?? 0) / 1000) * 10) / 10;
  }
  if (totalTime > 0) {
    summary.min = Math.round((totalTime ?? 0) / 60);
  }
  return summary;
}

function safeParsePlanText(text) {
  try {
    return parsePlan(typeof text === "string" ? text : "");
  } catch (error) {
    console.warn("Plan konnte nicht für den Export analysiert werden.", error);
    return {
      blocks: [],
      totalDistance: 0,
      totalTime: 0,
      equipment: new Map(),
    };
  }
}

function buildEquipmentList(plan, parsedPlan) {
  const collected = [];
  const seen = new Set();
  const push = (value) => {
    if (!value) {
      return;
    }
    const label = String(value).trim();
    if (!label || seen.has(label)) {
      return;
    }
    seen.add(label);
    collected.push(label);
  };

  const summaryEquipment = plan?.metadata?.summary?.equipment;
  if (Array.isArray(summaryEquipment)) {
    summaryEquipment.forEach((item) => push(item?.label));
  }

  if (parsedPlan?.equipment instanceof Map) {
    for (const entry of parsedPlan.equipment.values()) {
      push(entry?.label);
    }
  }

  return collected;
}

function extractSessionStructure(parsedPlan) {
  const groupsMap = new Map();
  const sectionTotals = new Map();
  const drylandLines = [];

  const ensureGroup = (label) => {
    const key = label ?? "__default";
    if (!groupsMap.has(key)) {
      groupsMap.set(key, { label: label ?? null, blocks: new Map() });
    }
    return groupsMap.get(key);
  };

  const addLineToGroup = (label, blockType, rawLine) => {
    const sanitized = sanitizePlanLine(rawLine);
    if (!sanitized) {
      return;
    }
    const group = ensureGroup(label);
    if (!group.blocks.has(blockType)) {
      group.blocks.set(blockType, { type: blockType, lines: [] });
    }
    group.blocks.get(blockType).lines.push(sanitized);
  };

  const extractContentLines = (sourceLines) => {
    if (!Array.isArray(sourceLines)) {
      return [];
    }
    if (sourceLines.length > 0 && /^#{1,6}\s/.test(sourceLines[0]?.trim?.() ?? "")) {
      return sourceLines.slice(1);
    }
    return sourceLines;
  };

  for (const block of parsedPlan?.blocks ?? []) {
    const blockType = classifyBlockName(block?.name);
    const contentLines = extractContentLines(block?.sourceLines ?? []);
    if (blockType === "Dryland") {
      contentLines
        .map(sanitizePlanLine)
        .filter(Boolean)
        .forEach((line) => {
          drylandLines.push(line);
        });
      continue;
    }

    if (!sectionTotals.has(blockType)) {
      sectionTotals.set(blockType, { distance: 0, time: 0 });
    }
    const totals = sectionTotals.get(blockType);
    if (Number.isFinite(block?.distance)) {
      totals.distance += block.distance;
    }
    if (Number.isFinite(block?.time)) {
      totals.time += block.time;
    }

    let currentGroup = null;
    for (const line of contentLines) {
      const trimmed = typeof line === "string" ? line.trim() : "";
      if (!trimmed) {
        continue;
      }
      const maybeGroup = detectGroupLabel(line);
      if (maybeGroup !== null) {
        currentGroup = maybeGroup;
        ensureGroup(currentGroup);
        continue;
      }
      addLineToGroup(currentGroup, blockType, line);
    }
  }

  const sectionSummaries = {};
  for (const [type, totals] of sectionTotals.entries()) {
    const summary = createSectionSummary(totals.distance, totals.time);
    if (summary) {
      sectionSummaries[type] = summary;
    }
  }

  const groups = Array.from(groupsMap.values())
    .map((entry) => {
      const blocks = weekBlockOrder
        .map((type) => {
          const blockEntry = entry.blocks.get(type);
          if (!blockEntry) {
            return null;
          }
          if (sectionSummaries[type]) {
            blockEntry.section_sum = sectionSummaries[type];
          }
          return blockEntry;
        })
        .filter(Boolean);
      if (blocks.length === 0) {
        return null;
      }
      return { label: entry.label, blocks };
    })
    .filter(Boolean);

  return { groups, dryland: drylandLines, sectionSummaries };
}

function convertPlanToWeekSession(plan, sessionDate) {
  const parsedPlan = safeParsePlanText(plan?.content ?? "");
  const planDate = parsePlanDate(plan?.planDate);
  const summaryDistance = Number(plan?.metadata?.summary?.totalDistance);
  const summaryTime = Number(plan?.metadata?.summary?.totalTime);
  const totalDistance = Number.isFinite(summaryDistance) && summaryDistance > 0
    ? Math.round(summaryDistance)
    : Math.round(parsedPlan?.totalDistance ?? 0);
  const totalTimeSeconds = Number.isFinite(summaryTime) && summaryTime > 0
    ? summaryTime
    : parsedPlan?.totalTime ?? 0;
  const endDate = planDate && totalTimeSeconds > 0
    ? new Date(planDate.getTime() + totalTimeSeconds * 1000)
    : planDate ?? null;

  const equipment = buildEquipmentList(plan, parsedPlan);
  const { groups, dryland, sectionSummaries } = extractSessionStructure(parsedPlan);

  let sessionGroups = groups;
  if (sessionGroups.length === 0) {
    const fallbackLines = String(plan?.content ?? "")
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map(sanitizePlanLine)
      .filter(Boolean);
    if (fallbackLines.length > 0) {
      sessionGroups = [
        {
          label: null,
          blocks: [
            {
              type: "Main",
              lines: fallbackLines,
              section_sum:
                sectionSummaries.Main ?? createSectionSummary(totalDistance, totalTimeSeconds),
            },
          ],
        },
      ];
    }
  }

  if (!sectionSummaries.Main && (totalDistance > 0 || totalTimeSeconds > 0)) {
    sectionSummaries.Main = createSectionSummary(totalDistance, totalTimeSeconds);
  }

  const focus = plan?.focus?.trim?.() || "";
  const title = plan?.title?.trim?.() || "";
  const dateLabel = sessionDate ? formatShortExportDate(sessionDate) : "";
  const weekday = sessionDate ? isoWeekdayLabels[sessionDate.getDay()] ?? "" : "";
  const timeStartDisplay = toDisplayTime(planDate);
  const timeEndDisplay = toDisplayTime(endDate) || timeStartDisplay;
  const compactStart = toCompactTime(planDate);
  const rawCompactEnd = toCompactTime(endDate);
  const compactEnd = rawCompactEnd || compactStart || "";
  const timeWindow = compactStart && compactEnd ? `${compactStart}-${compactEnd}` : compactStart || "";

  return {
    id: plan?.id ?? null,
    title: title || focus || "Ohne Titel",
    focus,
    weekday,
    date: sessionDate ? dateToKey(sessionDate) : null,
    dateLabel,
    time_start: timeStartDisplay,
    time_end: timeEndDisplay,
    time_window: timeWindow,
    time_start_compact: compactStart,
    time_end_compact: compactEnd,
    equipment,
    total_m: Number.isFinite(totalDistance) && totalDistance > 0 ? totalDistance : 0,
    groups: sessionGroups,
    dryland,
    sectionSummaries,
  };
}

function buildWeekExportData(dateKey) {
  const range = getWeekRange(dateKey);
  if (!range) {
    return null;
  }

  const { start, end, startKey, endKey } = range;
  const { week: weekNumber, year: isoYear } = computeIsoWeekInfo(start);
  const sessions = [];
  const focusSet = new Set();

  for (let offset = 0; offset < 7; offset += 1) {
    const current = new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
    current.setHours(0, 0, 0, 0);
    const currentKey = dateToKey(current);
    const plansForDay = (plansByDate.get(currentKey) ?? [])
      .slice()
      .sort((a, b) => new Date(a.planDate).getTime() - new Date(b.planDate).getTime());

    for (const plan of plansForDay) {
      const session = convertPlanToWeekSession(plan, current);
      sessions.push(session);
      if (session.focus) {
        focusSet.add(session.focus);
      }
    }
  }

  const overviewRows = sessions.map((session) => ({
    weekday: session.weekday,
    date: session.dateLabel,
    title: session.title,
    focus: session.focus,
    timeWindow: session.time_window,
    equipment: session.equipment?.length ? session.equipment.join(", ") : "–",
    total: session.total_m ? `${session.total_m}m` : "–",
  }));

  const rangeLabel = `${shortDateFormatter.format(start)} – ${shortDateFormatter.format(end)}`;
  const longRangeLabel = `${dayLabelFormatter.format(start)} – ${dayLabelFormatter.format(end)}`;
  const hasPlans = sessions.length > 0;
  const focusSummary = Array.from(focusSet).filter(Boolean);

  return {
    title: `KW ${weekNumber} – Wochenplan`,
    subtitle: focusSummary.length > 0 ? focusSummary.join(" • ") : longRangeLabel,
    rangeLabel,
    startKey,
    endKey,
    start,
    end,
    kw: weekNumber,
    isoYear,
    longRangeLabel,
    sessions,
    overviewRows,
    hasPlans,
  };
}

function buildWeekFilenamePrefix(week) {
  return `nextplanner-woche-${week.startKey}-bis-${week.endKey}`;
}

function handleWeekWordExport(button) {
  const week = buildWeekExportData(selectedDateKey);
  if (!week) {
    setStatus("Woche konnte nicht exportiert werden: Ungültiges Datum.", "error");
    return;
  }

  const targetButton = button ?? exportWeekWordButton;
  if (targetButton) {
    targetButton.disabled = true;
  }

  try {
    const documentHtml = createWeekWordDocument(week);
    const blob = new Blob([documentHtml], { type: "application/msword" });
    const filename = `${buildWeekFilenamePrefix(week)}.doc`;
    triggerDownload(filename, blob);
    setStatus(`Woche ${week.rangeLabel} als Word exportiert.`, "success");
  } catch (error) {
    console.error("Woche konnte nicht als Word exportiert werden", error);
    const message = error instanceof Error ? error.message : "Woche konnte nicht als Word exportiert werden.";
    setStatus(message, "error");
  } finally {
    if (targetButton) {
      targetButton.disabled = false;
    }
  }
}

function handleWeekPdfExport(button) {
  const week = buildWeekExportData(selectedDateKey);
  if (!week) {
    setStatus("Woche konnte nicht exportiert werden: Ungültiges Datum.", "error");
    return;
  }

  const targetButton = button ?? exportWeekPdfButton;
  if (targetButton) {
    targetButton.disabled = true;
  }

  try {
    const pdfBytes = createWeekPdfDocument(week);
    const blob = new Blob([pdfBytes], { type: "application/pdf" });
    const filename = `${buildWeekFilenamePrefix(week)}.pdf`;
    triggerDownload(filename, blob);
    setStatus(`Woche ${week.rangeLabel} als PDF exportiert.`, "success");
  } catch (error) {
    console.error("Woche konnte nicht als PDF exportiert werden", error);
    const message = error instanceof Error ? error.message : "Woche konnte nicht als PDF exportiert werden.";
    setStatus(message, "error");
  } finally {
    if (targetButton) {
      targetButton.disabled = false;
    }
  }
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

    const audit = document.createElement("p");
    audit.className = "plan-entry-meta plan-entry-audit";
    const createdByLabel = describeUserName(plan.createdByUserId);
    const updatedByLabel = describeUserName(plan.updatedByUserId);
    const createdAtLabel = formatDateTimeLabel(plan.createdAt);
    const updatedAtLabel = formatDateTimeLabel(plan.updatedAt);
    audit.textContent = `Erstellt von ${createdByLabel} (${createdAtLabel}), zuletzt bearbeitet von ${updatedByLabel} (${updatedAtLabel}).`;
    entry.append(audit);

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

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger-button plan-entry-link";
    deleteButton.textContent = "Plan löschen";
    deleteButton.addEventListener("click", () => {
      requestPlanDeletion(plan, dateKey, deleteButton).catch((error) => {
        console.error("Unerwarteter Fehler beim Löschen eines Plans", error);
        setStatus("Unerwarteter Fehler beim Löschen des Plans.", "error");
      });
    });
    actions.append(deleteButton);

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
    await refreshUserDirectory(plans);
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

if (calendarFeatureEnabled) {
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

  exportWeekWordButton?.addEventListener("click", () => {
    handleWeekWordExport(exportWeekWordButton);
  });

  exportWeekPdfButton?.addEventListener("click", () => {
    handleWeekPdfExport(exportWeekPdfButton);
  });

  renderCalendar();
  renderPlanList(selectedDateKey);

  loadPlans().catch((error) => {
    console.error("Unerwarteter Fehler beim Laden des Kalenders", error);
    setStatus("Unerwarteter Fehler beim Laden des Kalenders.", "error");
  });
} else {
  setStatus("Der Plan-Kalender ist in den Einstellungen deaktiviert.", "info");
  const layout = document.querySelector('[data-feature="calendarView"]');
  if (layout) {
    layout.innerHTML = "";
    const card = document.createElement("section");
    card.className = "page-card feature-disabled-card";
    const heading = document.createElement("h2");
    heading.textContent = "Plan-Kalender deaktiviert";
    const message = document.createElement("p");
    message.className = "feature-disabled-message";
    message.textContent = "Aktiviere den Plan-Kalender in den Einstellungen, um gespeicherte Trainingspläne anzuzeigen.";
    card.append(heading, message);
    layout.append(card);
  }
}
