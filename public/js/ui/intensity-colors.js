import { getIntensityPattern } from "../utils/highlight-vocabulary.js";

const intensityColorTokens = [
  { token: "CLEAR", className: "intensity-color-clear" },
  { token: "WHITE", className: "intensity-color-white" },
  { token: "PINK", className: "intensity-color-pink" },
  { token: "RED", className: "intensity-color-red" },
  { token: "ORANGE", className: "intensity-color-orange" },
  { token: "PURPLE", className: "intensity-color-purple" },
  { token: "BLUE", className: "intensity-color-blue" },
  { token: "GREEN", className: "intensity-color-green" },
  { token: "GOLD", className: "intensity-color-gold" },
];

export function getIntensityColorClass(label) {
  const upper = label.toUpperCase();
  const entry = intensityColorTokens.find(({ token }) => upper.includes(token));
  return entry ? entry.className : "intensity-color-default";
}

export function getKnownIntensityPattern() {
  const pattern = getIntensityPattern();
  return new RegExp(pattern.source, pattern.flags);
}
