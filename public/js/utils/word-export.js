import { parsePlan } from "../parser/plan-parser.js";
import { formatDistance } from "./distance.js";
import { formatDuration } from "./time.js";

const INTENSITY_COLORS = {
  WHITE: "#9E9E9E",
  PINK: "#E91E63",
  RED: "#C62828",
  ORANGE: "#FB8C00",
  PURPLE: "#6A1B9A",
  BLUE: "#1565C0",
  GREEN: "#43A047",
};

const SUPERSCRIPTS = {
  0: "⁰",
  1: "¹",
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
};

function escapeHtml(value) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toSuperscript(numberString) {
  if (!numberString) {
    return "";
  }
  return numberString
    .split("")
    .map((digit) => SUPERSCRIPTS[digit] ?? digit)
    .join("");
}

function formatBlockDistance(distance) {
  if (!distance) {
    return null;
  }
  if (distance >= 1000) {
    const value = (distance / 1000).toFixed(2);
    return `(${value})`;
  }
  return `(${distance})`;
}

function formatBlockTime(seconds) {
  if (!seconds) {
    return null;
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (remainingSeconds === 0) {
    return `${minutes}min`;
  }
  const prime = "′";
  return `${minutes}${prime}${String(remainingSeconds).padStart(2, "0")}min`;
}

function formatBlockTotals(distance, time) {
  const parts = [];
  if (Number.isFinite(distance) && distance > 0) {
    parts.push(formatDistance(distance));
  }
  if (Number.isFinite(time) && time > 0) {
    parts.push(formatDuration(time));
  }
  return parts.join(" / ");
}

function createIntensitySpan(label, level) {
  const upper = label.toUpperCase();
  const color = INTENSITY_COLORS[upper];
  const superscript = level ? toSuperscript(level) : "";
  const style = color ? ` style="color:${color};"` : "";
  return `<span class="intensity-label"${style}>${upper}${superscript}</span>`;
}

function decorateIntensityLabels(text) {
  return text.replace(
    /(\b)(WHITE|PINK|RED|ORANGE|PURPLE|BLUE|GREEN)(\s*)(\d{1,2})?/gi,
    (match, boundary, label, spacing, level) => {
      const cleanedSpacing = spacing ?? "";
      const normalizedLabel = label.toUpperCase();
      const normalizedLevel = level?.trim() ?? "";
      return `${boundary}${createIntensitySpan(normalizedLabel, normalizedLevel)}${cleanedSpacing}`;
    },
  );
}

function decorateEasyTokens(text) {
  return text.replace(/\bez\b/gi, (match) => {
    const label = match === match.toUpperCase() ? "EZ" : "ez";
    return `<span class="intensity-label" style="color:${INTENSITY_COLORS.GREEN};">${label}</span>`;
  });
}

function normalizeDashes(text) {
  return text.replace(/\s+-\s+/g, " – ");
}

function formatInterval(match, minutesPart, secondsPart, extra) {
  const minutes = Number.parseInt(minutesPart ?? "0", 10) || 0;
  const seconds = Number.parseInt(secondsPart ?? "0", 10) || 0;
  const remainder = extra ? Number.parseInt(extra, 10) || 0 : 0;
  const prime = "′";
  if (extra !== undefined && extra !== null && extra !== "") {
    const hours = minutes;
    const minutesFromExtra = seconds;
    const secondsFromExtra = remainder;
    return `@${hours}${prime}${String(minutesFromExtra).padStart(2, "0")}${prime}${String(secondsFromExtra).padStart(2, "0")}`;
  }
  if (minutes === 0) {
    return seconds > 0 ? `@${prime}${String(seconds).padStart(2, "0")}` : "@";
  }
  return `@${minutes}${prime}${String(seconds).padStart(2, "0")}`;
}

function decorateIntervals(text) {
  return text.replace(/@\s*(\d+):(\d{2})(?::(\d{2}))?/g, formatInterval);
}

function decoratePrimeMinutes(text) {
  return text.replace(/@\s*'(?=\d)/g, "@′");
}

function decorateLineText(text) {
  const trimmed = text.trim();
  let result = normalizeDashes(escapeHtml(trimmed));
  result = decorateIntervals(result);
  result = decoratePrimeMinutes(result);
  result = result.replace(/\bclear\b/gi, "ez");
  result = result.replace(/\bez\b(?:\s+\bez\b)+/gi, (match) => (match === match.toUpperCase() ? "EZ" : "ez"));
  result = decorateIntensityLabels(result);
  result = decorateEasyTokens(result);
  return result;
}

function formatSetDistance(set) {
  if (!set) {
    return null;
  }
  const unit = set.displayUnit ?? "m";
  const distance = Number.isFinite(set.displayLength) ? set.displayLength : set.length;
  if (!Number.isFinite(distance)) {
    return null;
  }
  const base = unit === "m" ? `${distance}` : `${distance}${unit}`;
  if (set.quantity && set.quantity > 1) {
    return `${set.quantity}x${base}`;
  }
  return base;
}

function buildRoundSummary(sets) {
  const distances = sets
    .map((set) => formatSetDistance(set))
    .filter(Boolean);
  if (distances.length === 0) {
    return null;
  }
  const uniqueDistances = [...new Set(distances)];
  return uniqueDistances.join(" – ");
}

function renderRound(round, sets) {
  const count = round?.count ?? null;
  const headLabel = escapeHtml(count ? `${count}x` : round?.label?.replace(/[:\s]+$/, "") ?? "Runde");
  const summary = buildRoundSummary(sets);
  const body = sets
    .map((set, index) => {
      const text = decorateLineText(set.source ?? "");
      return `<p class="exercise-line level-1 circuit-item"><span class="circuit-index">${index + 1}.</span> ${text}</p>`;
    })
    .join("");
  const summaryLine = summary
    ? `<p class="exercise-line level-1 circuit-summary">${decorateLineText(summary)}</p>`
    : "";
  return `<div class="circuit"><p class="circuit-head">${headLabel}</p><div class="circuit-body">${summaryLine}${body}</div></div>`;
}

function renderSetLine(raw, set) {
  const indentMatch = raw.match(/^\s+/);
  const hasNumbering = /^\s*\d+\./.test(raw);
  const level = indentMatch || hasNumbering ? "level-1" : "level-0";
  const text = decorateLineText(set?.source ?? raw);
  return `<p class="exercise-line ${level}">${text}</p>`;
}

function renderTextLine(raw) {
  const indentMatch = raw.match(/^\s+/);
  const level = indentMatch ? "level-1" : "level-0";
  const text = decorateLineText(raw);
  return `<p class="exercise-line ${level}">${text}</p>`;
}

function buildBlockNodes(block) {
  const lines = [...(block.sourceLines ?? [])];
  let contentLines = lines;
  if (lines[0]?.trim().startsWith("##")) {
    contentLines = lines.slice(1);
  }
  const sets = (block.sets ?? []).map((set, index) => ({ ...set, __index: index, __used: false }));
  const roundsByLabel = new Map((block.rounds ?? []).map((round) => [round.label?.trim(), round]));

  const nodes = [];

  for (let i = 0; i < contentLines.length; i += 1) {
    const rawLine = contentLines[i];
    if (typeof rawLine !== "string") {
      continue;
    }
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }
    if (/^ende\s+(?:runde|runden|rounds?)$/i.test(trimmed)) {
      continue;
    }

    const roundCandidate = roundsByLabel.get(trimmed);
    if (roundCandidate && !roundCandidate.__processed) {
      roundCandidate.__processed = true;
      const roundSets = sets.filter((entry) => entry.roundId === roundCandidate.id && !entry.__used);
      roundSets.forEach((entry) => {
        entry.__used = true;
      });
      nodes.push({ type: "round", round: roundCandidate, sets: roundSets.map((entry) => entry) });
      const skipLines = roundCandidate.source ? roundCandidate.source.split(/\r?\n/).length - 1 : 0;
      if (skipLines > 0) {
        i += skipLines;
      }
      continue;
    }

    const setIndex = sets.findIndex(
      (entry) => !entry.__used && !entry.roundId && entry.source?.trim() === trimmed,
    );
    if (setIndex !== -1) {
      const entry = sets[setIndex];
      entry.__used = true;
      nodes.push({ type: "set", raw: rawLine, set: entry });
      continue;
    }

    nodes.push({ type: "text", raw: rawLine });
  }

  return nodes;
}

function renderBlock(block) {
  const distance = formatBlockDistance(block.distance);
  const time = formatBlockTime(block.time);
  const parts = [];
  if (distance && time) {
    parts.push(`${distance}/${time}`);
  } else if (distance) {
    parts.push(distance);
  } else if (time) {
    parts.push(time);
  }
  const sum = parts.length > 0 ? `<span class="block-sum"><strong>${parts.join(" ")}</strong></span>` : "";
  const label = (block.name ?? "").trim() || "Block";
  const headingLabel = escapeHtml(label.replace(/:$/u, ""));
  const heading = `<p class="section-heading"><span class="heading-text">${headingLabel}:</span>${sum}</p>`;
  const nodes = buildBlockNodes(block);
  const body = nodes
    .map((node) => {
      if (node.type === "round") {
        const roundSets = node.sets?.map((entry) => entry) ?? [];
        return renderRound(node.round, roundSets);
      }
      if (node.type === "set") {
        return renderSetLine(node.raw, node.set);
      }
      if (node.type === "text") {
        return renderTextLine(node.raw);
      }
      return "";
    })
    .join("");
  const totals = formatBlockTotals(block.distance, block.time);
  const summary = totals
    ? `<p class="block-summary"><span class="block-summary-label">Summe:</span><span class="block-summary-value">${escapeHtml(
        totals,
      )}</span></p>`
    : "";
  return `<section class="plan-block">${heading}${body}${summary}</section>`;
}

function parseTextBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let currentBlock = null;

  const pushCurrent = () => {
    if (!currentBlock) {
      return;
    }
    if (!currentBlock.sourceLines.some((line) => line && line.trim())) {
      currentBlock = null;
      return;
    }
    blocks.push(currentBlock);
    currentBlock = null;
  };

  for (const line of lines) {
    const headingMatch = line.match(/^##\s*(.+)$/);
    if (headingMatch) {
      pushCurrent();
      const headingText = headingMatch[1].trim();
      currentBlock = {
        name: headingText.replace(/:$/u, ""),
        sourceLines: [line],
      };
      continue;
    }
    if (!currentBlock) {
      currentBlock = {
        name: "Gesamt",
        sourceLines: [],
      };
    }
    currentBlock.sourceLines.push(line);
  }

  pushCurrent();
  return blocks;
}

function normalizeBlockName(name) {
  return (name ?? "").trim().toLowerCase();
}

function mergeBlocks(plan, textBlocks) {
  const planBlocks = [...(plan.blocks ?? [])];
  const used = new Set();

  const merged = textBlocks.map((textBlock) => {
    const normalized = normalizeBlockName(textBlock.name);
    const matchIndex = planBlocks.findIndex(
      (block, index) => !used.has(index) && normalizeBlockName(block.name) === normalized,
    );
    const matched = matchIndex !== -1 ? planBlocks[matchIndex] : null;
    if (matchIndex !== -1) {
      used.add(matchIndex);
    }
    return {
      name: textBlock.name,
      distance: matched?.distance ?? 0,
      time: matched?.time ?? 0,
      sets: matched?.sets ?? [],
      rounds: matched?.rounds ?? [],
      sourceLines: textBlock.sourceLines,
    };
  });

  planBlocks.forEach((block, index) => {
    if (!used.has(index)) {
      merged.push(block);
    }
  });

  return merged;
}

function buildExportBlocks(plan, text) {
  const textBlocks = parseTextBlocks(text);
  if (textBlocks.length === 0) {
    if (plan.blocks && plan.blocks.length > 0) {
      return plan.blocks;
    }
    if (!text.trim()) {
      return [];
    }
    return [
      {
        name: "Gesamt",
        distance: plan.totalDistance,
        time: plan.totalTime,
        sets: [],
        rounds: [],
        sourceLines: text.split(/\r?\n/),
      },
    ];
  }
  return mergeBlocks(plan, textBlocks);
}

function renderPlan(plan, text) {
  const blocks = buildExportBlocks(plan, text);
  if (blocks.length === 0) {
    return "<p class=\"empty-placeholder\">Kein Inhalt</p>";
  }
  return blocks.map((block) => renderBlock(block)).join("");
}

function extractPlanMetadata(text) {
  const metadata = {
    date: "",
    time: "",
    title: "",
    material: "",
  };
  if (!text) {
    return { metadata, cleanedText: "" };
  }

  const lines = text.split(/\r?\n/);
  const metadataLines = new Set();
  let inHeader = true;

  const assignMetadata = (key, value) => {
    if (!value) {
      return;
    }
    if (key.includes("datum") || key.includes("date")) {
      metadata.date = value;
    } else if (key.includes("uhr") || key.includes("zeit") || key.includes("time")) {
      metadata.time = value;
    } else if (key.includes("titel") || key.includes("title")) {
      metadata.title = value;
    } else if (key.includes("material")) {
      metadata.material = value;
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      if (inHeader) {
        metadataLines.add(index);
        continue;
      }
      continue;
    }

    if (/^##\s*/.test(trimmed) || /^#\s*/.test(trimmed) || /^(?:\d+\s*(?:x|×)\s*\d+)/i.test(trimmed) || /^P\s*:/i.test(trimmed)) {
      inHeader = false;
      continue;
    }

    if (!inHeader) {
      continue;
    }

    const match = trimmed.match(/^([\p{L}\s]+?):\s*(.+)$/u);
    if (match) {
      const [, key, value] = match;
      assignMetadata(key.toLowerCase(), value.trim());
      metadataLines.add(index);
      continue;
    }
  }

  const cleanedText = lines
    .filter((_, index) => !metadataLines.has(index))
    .join("\n")
    .replace(/^(?:\s*\n)+/, "");

  return { metadata, cleanedText };
}

function renderDocumentHeader(metadata, plan) {
  const headerTitle = metadata.title || plan.blocks?.[0]?.name || "Trainingsplan";
  const totalDistance = formatDistance(plan.totalDistance ?? 0);
  const materialList = (() => {
    if (metadata.material) {
      return metadata.material;
    }
    const equipment = Array.from(plan.equipment?.values?.() ?? [])
      .map((entry) => entry.label)
      .filter(Boolean);
    const unique = [...new Set(equipment.map((label) => label.trim()).filter(Boolean))];
    if (unique.length === 0) {
      return "—";
    }
    return unique
      .sort((a, b) => a.localeCompare(b, "de", { sensitivity: "base" }))
      .join(", ");
  })();

  const items = [
    { label: "Datum", value: metadata.date || "—" },
    { label: "Uhrzeit", value: metadata.time || "—" },
    { label: "Gesamtmeter", value: totalDistance },
    { label: "Titel", value: headerTitle },
    { label: "Benötigtes Material", value: materialList },
  ];

  const rows = items
    .map(
      (item) =>
        `<div class="header-row"><span class="header-label">${escapeHtml(item.label)}:</span><span class="header-value">${escapeHtml(
          item.value,
        )}</span></div>`,
    )
    .join("");

  return `<header class="document-header">${rows}</header>`;
}

export function createWordExportDocument(planText) {
  const { metadata, cleanedText } = extractPlanMetadata(planText ?? "");
  const plan = parsePlan(planText ?? "");
  const header = renderDocumentHeader(metadata, plan);
  const body = renderPlan(plan, cleanedText ?? "");
  const docTitle = escapeHtml(metadata.title || plan.blocks?.[0]?.name || "Swim Planner Export");
  return `<!DOCTYPE html><html lang="de"><head><meta charset="utf-8" /><title>${docTitle}</title><style>
    @page { size: A4 portrait; margin: 20mm; }
    body { font-family: 'Calibri','Segoe UI',sans-serif; font-size: 11pt; line-height: 1.15; color: #111; margin: 0; padding: 0; }
    body, p { margin-top: 0; margin-bottom: 2.5pt; }
    header, main { width: 100%; }
    .document-header { margin-bottom: 10pt; padding-bottom: 6pt; border-bottom: 1pt solid #000; }
    .header-row { display: flex; justify-content: space-between; margin-bottom: 2pt; }
    .header-label { font-weight: 600; }
    .header-value { text-align: right; }
    .document-title { font-size: 16pt; font-weight: 700; margin-bottom: 12pt; }
    .plan-block { margin-bottom: 8pt; }
    .section-heading { font-size: 12.5pt; font-weight: 700; margin-bottom: 4pt; overflow: hidden; }
    .section-heading .heading-text { float: left; }
    .section-heading .block-sum { float: right; min-width: 3cm; text-align: right; }
    .section-heading::after { content: ""; display: block; clear: both; }
    .section-heading .block-sum strong { font-weight: 700; }
    .exercise-line { margin: 0 0 2pt 0; }
    .exercise-line.level-0 { margin-left: 0; }
    .exercise-line.level-1 { margin-left: 1.4cm; }
    .intensity-label { font-weight: 600; }
    .circuit { margin: 0 0 4pt 0; position: relative; padding-left: 0; }
    .circuit-head { font-size: 11pt; font-weight: 700; margin: 0 0 2pt 0; }
    .circuit-body { position: relative; margin-left: 1.4cm; padding-left: 0.4cm; }
    .circuit-body::before { content: ""; position: absolute; left: -0.4cm; top: 0; bottom: 0; width: 0.4cm; border-left: 1.1pt solid #000; border-top: 1.1pt solid #000; border-bottom: 1.1pt solid #000; border-radius: 8pt; }
    .circuit-summary { font-style: italic; }
    .circuit-item { display: flex; }
    .circuit-item .circuit-index { min-width: 0.8cm; font-weight: 600; }
    .block-summary { margin: 4pt 0 6pt; text-align: right; font-weight: 600; }
    .block-summary-label { margin-right: 4pt; }
    .block-summary-value { font-weight: 700; }
    .empty-placeholder { font-style: italic; color: #666; }
  </style></head><body>${header}<main>${body}</main></body></html>`;
}
