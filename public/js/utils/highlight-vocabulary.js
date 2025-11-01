import { defaultEquipmentItems, defaultIntensityCodes } from "../config/constants.js";

const EVENT_NAME = "nextplanner:highlight-vocabulary-changed";
const MAX_ITEM_LENGTH = 80;
const MAX_ITEM_COUNT = 120;

const DEFAULT_VOCABULARY = Object.freeze({
  intensities: Array.from(defaultIntensityCodes),
  equipment: Array.from(defaultEquipmentItems),
});

let currentVocabulary = cloneVocabulary(DEFAULT_VOCABULARY);
let intensityEntries = buildIntensityEntries(currentVocabulary.intensities);
let intensityPatternSource = buildIntensityPatternSource(intensityEntries);
let intensityPattern = buildIntensityPattern(intensityPatternSource);
let equipmentEntries = buildEquipmentEntries(currentVocabulary.equipment);
let equipmentPatternSource = buildEquipmentPatternSource(equipmentEntries);
let equipmentPattern = buildEquipmentPattern(equipmentPatternSource);

const subscribers = new Set();

function cloneVocabulary(vocabulary) {
  return {
    intensities: Array.from(vocabulary?.intensities ?? []),
    equipment: Array.from(vocabulary?.equipment ?? []),
  };
}

function normalizeEntry(value) {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value)
      .replace(/\s+/g, " ")
      .trim();
    if (normalized) {
      return normalized.slice(0, MAX_ITEM_LENGTH);
    }
  }
  return null;
}

function sanitizeList(values, fallback, { allowEmpty = false } = {}) {
  const seen = new Set();
  const result = [];
  if (Array.isArray(values)) {
    for (const entry of values) {
      const normalized = normalizeEntry(entry);
      if (!normalized) {
        continue;
      }
      const key = normalized.toUpperCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(normalized);
      if (result.length >= MAX_ITEM_COUNT) {
        break;
      }
    }
  }
  if (result.length > 0 || allowEmpty) {
    return result;
  }
  if (Array.isArray(fallback) && fallback.length > 0) {
    return Array.from(fallback);
  }
  return [];
}

function buildIntensityEntries(intensities) {
  const entries = [];
  if (!Array.isArray(intensities)) {
    return entries;
  }
  const seen = new Set();
  for (const item of intensities) {
    const label = typeof item === "string" ? item : String(item ?? "");
    const trimmed = label.trim();
    if (!trimmed) {
      continue;
    }
    const upper = trimmed.toUpperCase();
    if (seen.has(upper)) {
      continue;
    }
    seen.add(upper);
    entries.push({ label: trimmed, upper, pattern: escapeForRegex(trimmed) });
  }
  return entries;
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildIntensityPatternSource(entries) {
  if (!entries || entries.length === 0) {
    return "";
  }
  return entries.map((entry) => entry.pattern).join("|");
}

function buildIntensityPattern(source) {
  if (!source) {
    return new RegExp("(?!x)", "gi");
  }
  return new RegExp(`\\b(?:${source})\\b`, "gi");
}

function buildEquipmentEntries(equipment) {
  const entries = [];
  if (!Array.isArray(equipment)) {
    return entries;
  }
  const seen = new Set();
  for (const item of equipment) {
    const label = typeof item === "string" ? item : String(item ?? "");
    const trimmed = label.trim();
    if (!trimmed) {
      continue;
    }
    const upper = trimmed.toUpperCase();
    if (seen.has(upper)) {
      continue;
    }
    seen.add(upper);
    entries.push({ label: trimmed, upper, pattern: escapeForRegex(trimmed) });
  }
  return entries;
}

function buildEquipmentPatternSource(entries) {
  if (!entries || entries.length === 0) {
    return "";
  }
  return entries.map((entry) => entry.pattern).join("|");
}

function buildEquipmentPattern(source) {
  if (!source) {
    return new RegExp("(?!x)", "gi");
  }
  return new RegExp(`\\b(?:${source})\\b`, "gi");
}

function notifyChange() {
  const snapshot = getHighlightVocabulary();
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, {
        detail: { vocabulary: cloneVocabulary(snapshot) },
      }),
    );
  }
  for (const callback of subscribers) {
    try {
      callback(cloneVocabulary(snapshot));
    } catch (error) {
      console.error("Fehler bei Highlight-Vokabular-Listener", error);
    }
  }
}

function rebuildDerivedState() {
  intensityEntries = buildIntensityEntries(currentVocabulary.intensities);
  intensityPatternSource = buildIntensityPatternSource(intensityEntries);
  intensityPattern = buildIntensityPattern(intensityPatternSource);
  equipmentEntries = buildEquipmentEntries(currentVocabulary.equipment);
  equipmentPatternSource = buildEquipmentPatternSource(equipmentEntries);
  equipmentPattern = buildEquipmentPattern(equipmentPatternSource);
}

export function sanitizeHighlightVocabulary(value, { allowEmpty = true } = {}) {
  const fallback = allowEmpty ? { intensities: [], equipment: [] } : DEFAULT_VOCABULARY;
  const intensities = sanitizeList(value?.intensities, fallback.intensities, {
    allowEmpty,
  });
  const equipment = sanitizeList(value?.equipment, fallback.equipment, {
    allowEmpty,
  });
  return { intensities, equipment };
}

export function getDefaultHighlightVocabulary() {
  return cloneVocabulary(DEFAULT_VOCABULARY);
}

export function getHighlightVocabulary() {
  return cloneVocabulary(currentVocabulary);
}

export function setHighlightVocabulary(next) {
  const merged = {
    intensities: Array.isArray(next?.intensities)
      ? sanitizeList(next.intensities, DEFAULT_VOCABULARY.intensities, { allowEmpty: true })
      : Array.from(currentVocabulary.intensities),
    equipment: Array.isArray(next?.equipment)
      ? sanitizeList(next.equipment, DEFAULT_VOCABULARY.equipment, { allowEmpty: true })
      : Array.from(currentVocabulary.equipment),
  };
  currentVocabulary = merged;
  rebuildDerivedState();
  notifyChange();
  return getHighlightVocabulary();
}

export function resetHighlightVocabulary() {
  currentVocabulary = cloneVocabulary(DEFAULT_VOCABULARY);
  rebuildDerivedState();
  notifyChange();
  return getHighlightVocabulary();
}

export function subscribeToHighlightVocabulary(callback) {
  if (typeof callback !== "function") {
    return () => {};
  }
  subscribers.add(callback);
  return () => {
    subscribers.delete(callback);
  };
}

export function getIntensityPattern() {
  return new RegExp(intensityPattern.source, intensityPattern.flags);
}

export function getIntensityPatternSource() {
  return intensityPatternSource;
}

export function matchIntensities(text) {
  if (!text || typeof text !== "string" || intensityEntries.length === 0) {
    return [];
  }
  const upper = text.toUpperCase();
  const matches = [];
  for (const entry of intensityEntries) {
    if (upper.includes(entry.upper)) {
      matches.push(entry.label);
    }
  }
  return matches;
}

export function getEquipmentPattern() {
  return new RegExp(equipmentPattern.source, equipmentPattern.flags);
}

export function getEquipmentPatternSource() {
  return equipmentPatternSource;
}

export function matchEquipment(text) {
  if (!text || typeof text !== "string" || equipmentEntries.length === 0) {
    return [];
  }
  const upper = text.toUpperCase();
  const matches = [];
  for (const entry of equipmentEntries) {
    if (upper.includes(entry.upper)) {
      matches.push(entry.label);
    }
  }
  return matches;
}

if (typeof window !== "undefined") {
  window.addEventListener(EVENT_NAME, (event) => {
    const vocabulary = event.detail?.vocabulary;
    if (!vocabulary) {
      return;
    }
    currentVocabulary = cloneVocabulary(vocabulary);
    rebuildDerivedState();
  });
}
