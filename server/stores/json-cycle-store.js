import { createHash } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";

import { DATA_DIR } from "../config.js";
import { logger } from "../logger.js";

const DEFAULT_FILE_NAME = "training-cycles.json";
const VALID_PHASES = new Set(["volume", "intensity", "deload", "custom"]);
const VALID_CYCLE_TYPES = new Set(["volume", "intensity", "deload", "custom"]);
const MS_PER_DAY = 86_400_000;

export class CycleValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CycleValidationError";
  }
}

export class CycleNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "CycleNotFoundError";
  }
}

export class WeekNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "WeekNotFoundError";
  }
}

export class DayNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "DayNotFoundError";
  }
}

function ensureDirectory(filePath) {
  const directory = dirname(filePath);
  return fs.mkdir(directory, { recursive: true });
}

function resolveStorageFile(filePath) {
  return filePath ? filePath : join(DATA_DIR, DEFAULT_FILE_NAME);
}

function sortKeys(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => sortKeys(entry));
  }
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeys(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function canonicalizeDay(day) {
  return sortKeys({
    id: day.id,
    weekId: day.weekId,
    date: day.date,
    planId: day.planId ?? null,
    mainSetFocus: day.mainSetFocus ?? null,
    skillFocus1: day.skillFocus1 ?? null,
    skillFocus2: day.skillFocus2 ?? null,
    volume: day.volume ?? null,
    distance: day.distance ?? null,
    kickPercent: day.kickPercent ?? null,
    pullPercent: day.pullPercent ?? null,
    rpe: day.rpe ?? null,
    notes: day.notes ?? {},
    createdAt: day.createdAt,
    updatedAt: day.updatedAt,
  });
}

function canonicalizeWeek(week) {
  return sortKeys({
    id: week.id,
    cycleId: week.cycleId,
    weekNumber: week.weekNumber,
    focusLabel: week.focusLabel ?? null,
    phase: week.phase,
    summary: week.summary ?? {},
    days: week.days.map((day) => canonicalizeDay(day)),
    createdAt: week.createdAt,
    updatedAt: week.updatedAt,
  });
}

function canonicalizeCycle(cycle) {
  return sortKeys({
    id: cycle.id,
    name: cycle.name,
    cycleType: cycle.cycleType,
    startDate: cycle.startDate,
    endDate: cycle.endDate ?? null,
    metadata: cycle.metadata ?? {},
    summary: cycle.summary ?? {},
    weeks: cycle.weeks.map((week) => canonicalizeWeek(week)),
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
  });
}

function toIsoDate(value, label, { required = true } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) {
      throw new CycleValidationError(`${label} ist erforderlich.`);
    }
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new CycleValidationError(`${label} muss ein gültiges Datum sein.`);
  }
  return date.toISOString();
}

function normalizeOptionalString(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeNonEmptyString(value, label) {
  const text = normalizeOptionalString(value);
  if (!text) {
    throw new CycleValidationError(`${label} ist erforderlich.`);
  }
  return text;
}

function normalizeMetadata(metadata) {
  if (metadata === undefined || metadata === null) {
    return {};
  }
  if (typeof metadata !== "object" || Array.isArray(metadata)) {
    throw new CycleValidationError("metadata muss ein Objekt sein.");
  }
  return { ...metadata };
}

function normalizePhase(phase, label = "phase") {
  if (!phase) {
    return "custom";
  }
  const normalized = String(phase).toLowerCase();
  if (!VALID_PHASES.has(normalized)) {
    throw new CycleValidationError(`${label} muss einer der Werte ${Array.from(VALID_PHASES).join(", ")} sein.`);
  }
  return normalized;
}

function normalizeCycleType(type) {
  if (!type) {
    return "custom";
  }
  const normalized = String(type).toLowerCase();
  if (!VALID_CYCLE_TYPES.has(normalized)) {
    throw new CycleValidationError(
      `cycleType muss einer der Werte ${Array.from(VALID_CYCLE_TYPES).join(", ")} sein.`,
    );
  }
  return normalized;
}

function normalizeNumber(value, label, { allowNull = true, min = 0, max = Number.POSITIVE_INFINITY } = {}) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    if (allowNull) {
      return null;
    }
    throw new CycleValidationError(`${label} darf nicht leer sein.`);
  }
  const number = typeof value === "number" ? value : Number.parseFloat(String(value));
  if (Number.isNaN(number)) {
    throw new CycleValidationError(`${label} muss eine Zahl sein.`);
  }
  if (number < min || number > max) {
    throw new CycleValidationError(`${label} muss zwischen ${min} und ${max} liegen.`);
  }
  return number;
}

function normalizePlanId(value) {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const id = Number.parseInt(String(value), 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new CycleValidationError("planId muss eine positive Ganzzahl sein.");
  }
  return id;
}

function normalizeNotes(value) {
  if (value === undefined || value === null) {
    return {};
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new CycleValidationError("notes müssen ein Objekt sein.");
  }
  return { ...value };
}

function computeWeekSummary(week) {
  let totalVolume = 0;
  let totalDistance = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  let kickSum = 0;
  let kickCount = 0;
  let pullSum = 0;
  let pullCount = 0;

  for (const day of week.days) {
    if (typeof day.volume === "number") {
      totalVolume += day.volume;
    }
    if (typeof day.distance === "number") {
      totalDistance += day.distance;
    }
    if (typeof day.rpe === "number") {
      rpeSum += day.rpe;
      rpeCount += 1;
    }
    if (typeof day.kickPercent === "number") {
      kickSum += day.kickPercent;
      kickCount += 1;
    }
    if (typeof day.pullPercent === "number") {
      pullSum += day.pullPercent;
      pullCount += 1;
    }
  }

  const summary = {
    totalVolume,
    totalDistance,
    averageRpe: rpeCount > 0 ? Number((rpeSum / rpeCount).toFixed(2)) : null,
    averageKickPercent: kickCount > 0 ? Number((kickSum / kickCount).toFixed(2)) : null,
    averagePullPercent: pullCount > 0 ? Number((pullSum / pullCount).toFixed(2)) : null,
  };
  return summary;
}

function computeCycleSummary(cycle) {
  let totalVolume = 0;
  let totalDistance = 0;
  let rpeSum = 0;
  let rpeCount = 0;
  const phaseDistribution = { volume: 0, intensity: 0, deload: 0, custom: 0 };

  for (const week of cycle.weeks) {
    const summary = week.summary ?? computeWeekSummary(week);
    totalVolume += summary.totalVolume ?? 0;
    totalDistance += summary.totalDistance ?? 0;
    if (typeof summary.averageRpe === "number") {
      rpeSum += summary.averageRpe;
      rpeCount += 1;
    }
    if (phaseDistribution[week.phase] !== undefined) {
      phaseDistribution[week.phase] += 1;
    } else {
      phaseDistribution[week.phase] = 1;
    }
  }

  return {
    totalVolume,
    totalDistance,
    averageWeeklyRpe: rpeCount > 0 ? Number((rpeSum / rpeCount).toFixed(2)) : null,
    weekCount: cycle.weeks.length,
    phaseDistribution,
  };
}

function cloneDay(day) {
  return {
    id: day.id,
    weekId: day.weekId,
    date: day.date,
    planId: day.planId ?? null,
    mainSetFocus: day.mainSetFocus ?? null,
    skillFocus1: day.skillFocus1 ?? null,
    skillFocus2: day.skillFocus2 ?? null,
    volume: day.volume ?? null,
    distance: day.distance ?? null,
    kickPercent: day.kickPercent ?? null,
    pullPercent: day.pullPercent ?? null,
    rpe: day.rpe ?? null,
    notes: { ...(day.notes ?? {}) },
    createdAt: day.createdAt,
    updatedAt: day.updatedAt,
  };
}

function cloneWeek(week) {
  return {
    id: week.id,
    cycleId: week.cycleId,
    weekNumber: week.weekNumber,
    focusLabel: week.focusLabel ?? null,
    phase: week.phase,
    summary: { ...(week.summary ?? computeWeekSummary(week)) },
    days: week.days.map((day) => cloneDay(day)),
    createdAt: week.createdAt,
    updatedAt: week.updatedAt,
  };
}

function cloneCycle(cycle) {
  return {
    id: cycle.id,
    name: cycle.name,
    cycleType: cycle.cycleType,
    startDate: cycle.startDate,
    endDate: cycle.endDate ?? null,
    metadata: { ...(cycle.metadata ?? {}) },
    summary: { ...(cycle.summary ?? computeCycleSummary(cycle)) },
    weeks: cycle.weeks.map((week) => cloneWeek(week)),
    createdAt: cycle.createdAt,
    updatedAt: cycle.updatedAt,
  };
}

function createInitialData() {
  return {
    nextCycleId: 1,
    nextWeekId: 1,
    nextDayId: 1,
    cycles: [],
  };
}

function computeWeekStart(startDateIso, weekNumber) {
  const startDate = new Date(startDateIso);
  if (Number.isNaN(startDate.getTime())) {
    return null;
  }
  const offsetDays = (weekNumber - 1) * 7;
  const timestamp = startDate.getTime() + offsetDays * MS_PER_DAY;
  return new Date(timestamp).toISOString();
}

function computeDayDate(startDateIso, weekNumber, dayIndex) {
  const weekStart = computeWeekStart(startDateIso, weekNumber);
  if (!weekStart) {
    return null;
  }
  const base = new Date(weekStart);
  const timestamp = base.getTime() + dayIndex * MS_PER_DAY;
  return new Date(timestamp).toISOString();
}

export class JsonCycleStore {
  #file;
  #data;
  #ready;
  #writeQueue = Promise.resolve();
  #closed = false;

  constructor(options = {}) {
    const { storageFile } = options;
    this.#file = resolveStorageFile(storageFile);
    this.#ready = this.#initialize();
  }

  get storageFile() {
    return this.#file;
  }

  async #initialize() {
    await ensureDirectory(this.#file);
    this.#data = await this.#loadFromDisk();
  }

  async #loadFromDisk() {
    try {
      await fs.access(this.#file, constants.F_OK);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        const seed = createInitialData();
        await this.#writeToDisk(seed);
        return seed;
      }
      throw error;
    }

    try {
      const content = await fs.readFile(this.#file, "utf8");
      const parsed = JSON.parse(content);
      if (!parsed || typeof parsed !== "object") {
        throw new Error("Ungültige Datenstruktur");
      }
      const { nextCycleId, nextWeekId, nextDayId, cycles } = parsed;
      if (
        typeof nextCycleId !== "number" ||
        typeof nextWeekId !== "number" ||
        typeof nextDayId !== "number" ||
        !Array.isArray(cycles)
      ) {
        throw new Error("Ungültige Datenstruktur");
      }
      for (const cycle of cycles) {
        cycle.metadata = normalizeMetadata(cycle.metadata);
        cycle.summary = cycle.summary ?? computeCycleSummary(cycle);
        for (const week of cycle.weeks) {
          week.summary = week.summary ?? computeWeekSummary(week);
          week.days = Array.isArray(week.days) ? week.days : [];
          for (const day of week.days) {
            day.notes = normalizeNotes(day.notes);
          }
        }
      }
      return parsed;
    } catch (error) {
      logger.error("Fehler beim Laden der Zyklen: %s", error instanceof Error ? error.stack ?? error.message : error);
      const seed = createInitialData();
      await this.#writeToDisk(seed);
      return seed;
    }
  }

  async #writeToDisk(data) {
    const directory = dirname(this.#file);
    const baseName = basename(this.#file);
    const tempFile = join(directory, `.${baseName}.${process.pid}.${Date.now()}.tmp`);
    const payload = JSON.stringify(data, null, 2);
    try {
      await fs.writeFile(tempFile, payload, "utf8");
      await fs.rename(tempFile, this.#file);
    } catch (error) {
      try {
        await fs.unlink(tempFile);
      } catch {
        // ignore cleanup failure
      }
      throw error;
    }
  }

  async #persist() {
    if (this.#closed) {
      throw new Error("Store wurde bereits geschlossen");
    }
    this.#writeQueue = this.#writeQueue.then(() => this.#writeToDisk(this.#data));
    await this.#writeQueue;
  }

  async #ensureReady() {
    await this.#ready;
  }

  async #getCycleInternal(cycleId) {
    await this.#ensureReady();
    const id = Number(cycleId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new CycleValidationError("Ungültige Zyklus-ID");
    }
    const cycle = this.#data.cycles.find((entry) => entry.id === id);
    if (!cycle) {
      throw new CycleNotFoundError("Zyklus nicht gefunden");
    }
    return cycle;
  }

  async #getWeekInternal(weekId) {
    await this.#ensureReady();
    const id = Number(weekId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new CycleValidationError("Ungültige Wochen-ID");
    }
    for (const cycle of this.#data.cycles) {
      const week = cycle.weeks.find((entry) => entry.id === id);
      if (week) {
        return { cycle, week };
      }
    }
    throw new WeekNotFoundError("Woche nicht gefunden");
  }

  async #getDayInternal(dayId) {
    await this.#ensureReady();
    const id = Number(dayId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new CycleValidationError("Ungültige Tages-ID");
    }
    for (const cycle of this.#data.cycles) {
      for (const week of cycle.weeks) {
        const day = week.days.find((entry) => entry.id === id);
        if (day) {
          return { cycle, week, day };
        }
      }
    }
    throw new DayNotFoundError("Tag nicht gefunden");
  }

  #updateWeekSummary(week) {
    week.summary = computeWeekSummary(week);
  }

  #updateCycleSummary(cycle) {
    cycle.summary = computeCycleSummary(cycle);
  }

  #touchWeek(week) {
    week.updatedAt = new Date().toISOString();
    this.#updateWeekSummary(week);
  }

  #touchCycle(cycle) {
    cycle.updatedAt = new Date().toISOString();
    this.#updateCycleSummary(cycle);
  }

  #sortWeeks(cycle) {
    cycle.weeks.sort((a, b) => a.weekNumber - b.weekNumber);
  }

  #updateWeekDates(cycle, week) {
    if (!cycle.startDate) {
      return;
    }
    for (let index = 0; index < week.days.length; index += 1) {
      const computed = computeDayDate(cycle.startDate, week.weekNumber, index);
      if (computed) {
        week.days[index].date = computed;
        week.days[index].updatedAt = new Date().toISOString();
      }
    }
    this.#touchWeek(week);
    this.#touchCycle(cycle);
  }

  async listCycles() {
    await this.#ensureReady();
    return this.#data.cycles.map((cycle) => cloneCycle(cycle));
  }

  async getCycle(cycleId) {
    const cycle = await this.#getCycleInternal(cycleId);
    return cloneCycle(cycle);
  }

  async getWeek(weekId) {
    const { week } = await this.#getWeekInternal(weekId);
    return cloneWeek(week);
  }

  async getDay(dayId) {
    const { day } = await this.#getDayInternal(dayId);
    return cloneDay(day);
  }

  async createCycle(payload) {
    await this.#ensureReady();
    const name = normalizeNonEmptyString(payload?.name, "name");
    const cycleType = normalizeCycleType(payload?.cycleType);
    const startDate = toIsoDate(payload?.startDate, "startDate");
    const endDate = toIsoDate(payload?.endDate, "endDate", { required: false });
    if (endDate && new Date(endDate).getTime() < new Date(startDate).getTime()) {
      throw new CycleValidationError("endDate darf nicht vor dem startDate liegen.");
    }

    const cycle = {
      id: this.#data.nextCycleId++,
      name,
      cycleType,
      startDate,
      endDate,
      metadata: normalizeMetadata(payload?.metadata),
      weeks: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      summary: null,
    };

    this.#data.cycles.push(cycle);

    if (Array.isArray(payload?.weeks)) {
      for (const rawWeek of payload.weeks) {
        // eslint-disable-next-line no-await-in-loop
        await this.addWeek(cycle.id, rawWeek);
      }
    } else {
      // create default 4-week template when none specified
      for (let i = 0; i < 4; i += 1) {
        await this.addWeek(cycle.id, { weekNumber: cycle.weeks.length + 1 });
      }
    }

    this.#touchCycle(cycle);
    await this.#persist();
    return cloneCycle(cycle);
  }

  async updateCycle(cycleId, patch) {
    const cycle = await this.#getCycleInternal(cycleId);
    let changed = false;

    if (Object.hasOwn(patch, "name")) {
      const name = normalizeOptionalString(patch.name);
      if (name) {
        cycle.name = name;
        changed = true;
      }
    }
    if (Object.hasOwn(patch, "cycleType")) {
      const type = normalizeCycleType(patch.cycleType);
      if (type !== cycle.cycleType) {
        cycle.cycleType = type;
        changed = true;
      }
    }
    if (Object.hasOwn(patch, "startDate")) {
      const startDate = toIsoDate(patch.startDate, "startDate");
      if (startDate !== cycle.startDate) {
        cycle.startDate = startDate;
        changed = true;
        for (const week of cycle.weeks) {
          this.#updateWeekDates(cycle, week);
        }
      }
    }
    if (Object.hasOwn(patch, "endDate")) {
      const endDate = toIsoDate(patch.endDate, "endDate", { required: false });
      if (endDate !== cycle.endDate) {
        cycle.endDate = endDate;
        changed = true;
      }
    }
    if (Object.hasOwn(patch, "metadata")) {
      cycle.metadata = normalizeMetadata(patch.metadata);
      changed = true;
    }

    if (cycle.endDate && new Date(cycle.endDate).getTime() < new Date(cycle.startDate).getTime()) {
      throw new CycleValidationError("endDate darf nicht vor dem startDate liegen.");
    }

    if (changed) {
      this.#touchCycle(cycle);
      await this.#persist();
    }

    return cloneCycle(cycle);
  }

  async addWeek(cycleId, payload = {}) {
    const cycle = await this.#getCycleInternal(cycleId);
    const focusLabel = normalizeOptionalString(payload.focusLabel) ?? null;
    const weekNumberRaw = Object.hasOwn(payload, "weekNumber") ? payload.weekNumber : cycle.weeks.length + 1;
    const weekNumber = normalizeNumber(weekNumberRaw, "weekNumber", { allowNull: false, min: 1 });
    const phase = normalizePhase(payload.phase);

    const week = {
      id: this.#data.nextWeekId++,
      cycleId: cycle.id,
      weekNumber,
      focusLabel,
      phase,
      days: [],
      summary: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    cycle.weeks.push(week);
    this.#sortWeeks(cycle);

    if (Array.isArray(payload?.days) && payload.days.length > 0) {
      for (const rawDay of payload.days) {
        // eslint-disable-next-line no-await-in-loop
        await this.addDay(week.id, rawDay, { skipPersist: true });
      }
    } else {
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const defaultDate = computeDayDate(cycle.startDate, week.weekNumber, dayIndex);
        const defaults = {
          date: defaultDate,
          mainSetFocus: null,
          skillFocus1: null,
          skillFocus2: null,
          volume: null,
          distance: null,
          kickPercent: null,
          pullPercent: null,
          rpe: null,
        };
        await this.addDay(week.id, defaults, { skipPersist: true });
      }
    }

    this.#touchWeek(week);
    this.#touchCycle(cycle);
    await this.#persist();
    return cloneWeek(week);
  }

  async updateWeek(weekId, patch) {
    const { cycle, week } = await this.#getWeekInternal(weekId);
    let changed = false;

    if (Object.hasOwn(patch, "focusLabel")) {
      week.focusLabel = normalizeOptionalString(patch.focusLabel) ?? null;
      changed = true;
    }
    if (Object.hasOwn(patch, "phase")) {
      const phase = normalizePhase(patch.phase);
      if (phase !== week.phase) {
        week.phase = phase;
        changed = true;
      }
    }
    if (Object.hasOwn(patch, "weekNumber")) {
      const weekNumber = normalizeNumber(patch.weekNumber, "weekNumber", { allowNull: false, min: 1 });
      if (weekNumber !== week.weekNumber) {
        week.weekNumber = weekNumber;
        changed = true;
        this.#sortWeeks(cycle);
        this.#updateWeekDates(cycle, week);
      }
    }

    if (changed) {
      this.#touchWeek(week);
      this.#touchCycle(cycle);
      await this.#persist();
    }

    return cloneWeek(week);
  }

  async addDay(weekId, payload, { skipPersist = false } = {}) {
    const { cycle, week } = await this.#getWeekInternal(weekId);
    const mainSetFocus = normalizeOptionalString(payload?.mainSetFocus) ?? null;
    const skillFocus1 = normalizeOptionalString(payload?.skillFocus1) ?? null;
    const skillFocus2 = normalizeOptionalString(payload?.skillFocus2) ?? null;
    const volume = normalizeNumber(payload?.volume, "volume");
    const distance = normalizeNumber(payload?.distance, "distance");
    const kickPercent = normalizeNumber(payload?.kickPercent, "kickPercent", { min: 0, max: 100 });
    const pullPercent = normalizeNumber(payload?.pullPercent, "pullPercent", { min: 0, max: 100 });
    const rpe = normalizeNumber(payload?.rpe, "rpe", { min: 0, max: 10 });
    const dateValue = payload?.date ?? computeDayDate(cycle.startDate, week.weekNumber, week.days.length);
    const date = toIsoDate(dateValue, "date");

    const day = {
      id: this.#data.nextDayId++,
      weekId: week.id,
      date,
      planId: normalizePlanId(payload?.planId) ?? null,
      mainSetFocus,
      skillFocus1,
      skillFocus2,
      volume,
      distance,
      kickPercent,
      pullPercent,
      rpe,
      notes: normalizeNotes(payload?.notes),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    week.days.push(day);
    week.days.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    this.#touchWeek(week);
    this.#touchCycle(cycle);
    if (!skipPersist) {
      await this.#persist();
    }
    return cloneDay(day);
  }

  async updateDay(dayId, patch) {
    const { cycle, week, day } = await this.#getDayInternal(dayId);
    let changed = false;

    if (Object.hasOwn(patch, "date")) {
      const date = toIsoDate(patch.date, "date");
      if (date !== day.date) {
        day.date = date;
        changed = true;
      }
    }
    if (Object.hasOwn(patch, "planId")) {
      const planId = normalizePlanId(patch.planId);
      if (planId !== undefined && planId !== day.planId) {
        day.planId = planId ?? null;
        changed = true;
      }
    }
    if (Object.hasOwn(patch, "mainSetFocus")) {
      day.mainSetFocus = normalizeOptionalString(patch.mainSetFocus) ?? null;
      changed = true;
    }
    if (Object.hasOwn(patch, "skillFocus1")) {
      day.skillFocus1 = normalizeOptionalString(patch.skillFocus1) ?? null;
      changed = true;
    }
    if (Object.hasOwn(patch, "skillFocus2")) {
      day.skillFocus2 = normalizeOptionalString(patch.skillFocus2) ?? null;
      changed = true;
    }
    if (Object.hasOwn(patch, "volume")) {
      day.volume = normalizeNumber(patch.volume, "volume");
      changed = true;
    }
    if (Object.hasOwn(patch, "distance")) {
      day.distance = normalizeNumber(patch.distance, "distance");
      changed = true;
    }
    if (Object.hasOwn(patch, "kickPercent")) {
      day.kickPercent = normalizeNumber(patch.kickPercent, "kickPercent", { min: 0, max: 100 });
      changed = true;
    }
    if (Object.hasOwn(patch, "pullPercent")) {
      day.pullPercent = normalizeNumber(patch.pullPercent, "pullPercent", { min: 0, max: 100 });
      changed = true;
    }
    if (Object.hasOwn(patch, "rpe")) {
      day.rpe = normalizeNumber(patch.rpe, "rpe", { min: 0, max: 10 });
      changed = true;
    }
    if (Object.hasOwn(patch, "notes")) {
      day.notes = normalizeNotes(patch.notes);
      changed = true;
    }

    if (changed) {
      day.updatedAt = new Date().toISOString();
      week.days.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      this.#touchWeek(week);
      this.#touchCycle(cycle);
      await this.#persist();
    }

    return cloneDay(day);
  }

  async checkHealth() {
    await this.#ensureReady();
    return {
      cycles: this.#data.cycles.length,
      storageFile: this.#file,
    };
  }

  async close() {
    await this.#ensureReady();
    await this.#writeQueue;
    this.#closed = true;
  }
}

function hashCanonical(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildCycleEtag(cycle) {
  const canonical = JSON.stringify(canonicalizeCycle(cycle));
  const hash = hashCanonical(canonical);
  return `"${hash}"`;
}

export function buildWeekEtag(week) {
  const canonical = JSON.stringify(canonicalizeWeek(week));
  const hash = hashCanonical(canonical);
  return `"${hash}"`;
}

export function buildDayEtag(day) {
  const canonical = JSON.stringify(canonicalizeDay(day));
  const hash = hashCanonical(canonical);
  return `"${hash}"`;
}
