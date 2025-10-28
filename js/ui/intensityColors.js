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
  const parts = [
    "CLEAR",
    "WHITE(?:2|3)?",
    "PINK(?:4|5)?",
    "RED(?:6|7)?",
    "ORANGE(?:8|9|10)?",
    "PURPLE(?:9|10)?",
    "BLUE(?:8|9|10)?",
    "GREEN",
    "GOLD",
  ];
  return new RegExp(`\\b(?:${parts.join("|")})\\b`, "gi");
}
