/**
 * Zentrale Konfigurationswerte der Anwendung.
 * Die Intensitätsliste wird von Parser und UI genutzt, um Konsistenz zu gewährleisten.
 */
const DEFAULT_INTENSITY_CODES = [
  "CLEAR",
  "White2",
  "White3",
  "PINK4",
  "PINK5",
  "RED6",
  "RED7",
  "ORANGE8",
  "ORANGE9",
  "ORANGE10",
  "PURPLE9",
  "PURPLE10",
  "BLUE8",
  "BLUE9",
  "BLUE10",
  "GREEN",
  "GOLD",
];

export const defaultIntensityCodes = Object.freeze([...DEFAULT_INTENSITY_CODES]);
export const intensityLevels = Object.freeze([...DEFAULT_INTENSITY_CODES]);

const DEFAULT_EQUIPMENT_ITEMS = [
  "Pullbuoy",
  "Paddles",
  "Flossen",
  "Schnorchel",
  "Brett",
];

export const defaultEquipmentItems = Object.freeze([...DEFAULT_EQUIPMENT_ITEMS]);

/**
 * Kürzel für Fokusbereiche, die der Parser aus Freitext extrahiert.
 */
export const focusTags = ["AR", "BE", "GSA"];
