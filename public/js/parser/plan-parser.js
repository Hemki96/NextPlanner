import { intensityLevels, focusTags } from "../config/constants.js";
import { parseDuration } from "../utils/time.js";

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Hilfsfunktion zum Erzeugen eines Blockobjektes mit Standardwerten.
 */
function createBlock(name, headingLine = null) {
  const sourceLines = [];
  if (headingLine) {
    sourceLines.push(headingLine);
  }
  return {
    name,
    sets: [],
    distance: 0,
    time: 0,
    timedDistance: 0,
    timedTime: 0,
    averagePaceSeconds: null,
    rounds: [],
    sourceLines,
  };
}

function isSetHintLine(line) {
  if (!line) {
    return false;
  }

  if (/^(?:hinweis|notiz|note)[:\s]/i.test(line)) {
    return true;
  }

  if (/^[*•\-–—]\s+\S/.test(line)) {
    return true;
  }

  if (/^\(?\d+\)?\s*(?:[.)\-:]|->)\s*\S/.test(line)) {
    return true;
  }

  return false;
}

/**
 * Versucht, eine Zeile als Trainings-Set zu interpretieren und die wichtigsten Attribute auszulesen.
 */
function parseSetLine(line) {
  const distanceMatch = line.match(/(?:(\d+)\s*(?:x|×)\s*)?(\d+)\s*(m|meter|meters|mtr|yd|yards?)/i);
  if (!distanceMatch) {
    return null;
  }

  const quantity = distanceMatch[1] ? Number.parseInt(distanceMatch[1], 10) : 1;
  const rawLength = Number.parseInt(distanceMatch[2], 10);
  if (!Number.isFinite(quantity) || !Number.isFinite(rawLength)) {
    return null;
  }

  const unitToken = distanceMatch[3].toLowerCase();
  const isYards = unitToken.startsWith("y");
  const convertedLength = isYards ? Math.round(rawLength * 0.9144) : rawLength;
  const distance = quantity * convertedLength;
  const displayLength = rawLength;
  const displayUnit = isYards ? "yd" : "m";

  const intervalMatch = line.match(/@\s*([0-9:]+)/);
  const interval = intervalMatch ? parseDuration(intervalMatch[1]) : 0;
  const time = interval > 0 ? interval * quantity : 0;

  const pauseMatch = line.match(/P\s*:\s*([0-9:]+)/i);
  const pause = pauseMatch ? parseDuration(pauseMatch[1]) : 0;

  const equipment = [];
  for (const match of line.matchAll(/w\/([^@P]+)/gi)) {
    const items = match[1]
      .split(/[,+]/)
      .map((item) => item.trim())
      .filter(Boolean);
    equipment.push(...items);
  }

  const focusMatches = line.match(/\b(Ar|Be|GSA)\b/gi) ?? [];
  const intensities = intensityLevels.filter((intensity) =>
    line.toUpperCase().includes(intensity.toUpperCase()),
  );

  return {
    quantity,
    length: convertedLength,
    displayLength,
    displayUnit,
    distance,
    interval,
    time,
    pause,
    equipment,
    intensities,
    focus: [...new Set(focusMatches.map((f) => f.toUpperCase()).filter((tag) => focusTags.includes(tag)))],
  };
}

/**
 * Zerlegt den kompletten Trainingsplan in Blöcke und Sets und aggregiert Kennzahlen.
 */
export function parsePlan(text) {
  const lines = text.split(/\r?\n/);
  const result = {
    totalDistance: 0,
    totalTime: 0,
    timedDistance: 0,
    timedTime: 0,
    activeTime: 0,
    equipment: new Map(),
    intensities: new Map(),
    blocks: [],
    issues: [],
    averagePaceSeconds: null,
  };

  let currentBlock = createBlock("Gesamt");
  let roundContext = null;
  let lastSetTarget = null;

  const accumulatePause = (pauseSeconds, multiplier = 1) => {
    if (!pauseSeconds || pauseSeconds <= 0 || !multiplier || multiplier <= 0) {
      return;
    }
    const totalPause = pauseSeconds * multiplier;
    currentBlock.time += totalPause;
    result.totalTime += totalPause;
  };

  const accumulateSet = (set, multiplier = 1, roundLabel = null, roundId = null) => {
    if (!set || !multiplier || multiplier <= 0) {
      return null;
    }

    const repeatedDistance = set.distance * multiplier;
    const repeatedTime = set.time * multiplier;
    const repeatedPause = set.pause * multiplier;

    const paceSecondsPer100 =
      repeatedDistance > 0 && repeatedTime > 0 ? (repeatedTime / repeatedDistance) * 100 : null;

    const aggregatedSet = {
      ...set,
      notes: Array.isArray(set.notes) ? [...set.notes] : [],
      distance: repeatedDistance,
      time: repeatedTime,
      pause: repeatedPause,
      rounds: multiplier,
      roundLabel,
      roundId,
      paceSecondsPer100,
    };

    currentBlock.sets.push(aggregatedSet);

    currentBlock.distance += repeatedDistance;
    result.totalDistance += repeatedDistance;

    if (repeatedTime > 0) {
      currentBlock.time += repeatedTime;
      result.totalTime += repeatedTime;
      currentBlock.timedTime += repeatedTime;
      currentBlock.timedDistance += repeatedDistance;
      result.timedTime += repeatedTime;
      result.timedDistance += repeatedDistance;
      result.activeTime += repeatedTime;
    }

    if (repeatedPause > 0) {
      accumulatePause(set.pause, multiplier);
    }

    for (const item of set.equipment) {
      const key = item.toLowerCase();
      const stats = result.equipment.get(key) ?? { label: item, count: 0 };
      stats.count += multiplier;
      result.equipment.set(key, stats);
    }

    for (const intensity of set.intensities) {
      const key = intensity.toUpperCase();
      const stats =
        result.intensities.get(key) ?? { label: intensity, distance: 0, sets: 0, time: 0, activeTime: 0 };
      stats.distance += repeatedDistance;
      stats.time += repeatedTime + repeatedPause;
      stats.sets += multiplier;
      stats.activeTime += repeatedTime;
      result.intensities.set(key, stats);
    }
    return aggregatedSet;
  };

  const finalizeRound = () => {
    if (!roundContext) {
      return;
    }

    lastSetTarget = null;

    const { count, label, sets, pauses, sourceLines, id, startLine } = roundContext;
    if (sets.length === 0 && pauses.length === 0) {
      if (startLine) {
        result.issues.push({
          type: "round",
          lineNumber: startLine,
          message: "Runden-Block ohne Sets oder Pausen.",
          line: (sourceLines ?? []).join(" ").trim(),
        });
      }
      roundContext = null;
      return;
    }

    for (const set of sets) {
      accumulateSet(set, count, label, id);
    }
    for (const pause of pauses) {
      accumulatePause(pause, count);
    }

    if (currentBlock) {
      const source = sourceLines.length > 0 ? sourceLines.join("\n").trim() : "";
      currentBlock.rounds.push({
        id,
        label,
        count,
        source,
      });
    }

    roundContext = null;
  };

  const pushBlock = () => {
    if (currentBlock.sets.length === 0 && currentBlock.distance === 0 && currentBlock.time === 0) {
      return;
    }
    if (currentBlock.timedDistance > 0 && currentBlock.timedTime > 0) {
      currentBlock.averagePaceSeconds = (currentBlock.timedTime / currentBlock.timedDistance) * 100;
    } else {
      currentBlock.averagePaceSeconds = null;
    }
    result.blocks.push(currentBlock);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const raw = line.trim();
    const lineNumber = index + 1;

    if (!raw) {
      if (roundContext) {
        roundContext.sourceLines.push("");
      }
      if (currentBlock?.sourceLines) {
        currentBlock.sourceLines.push("");
      }
      finalizeRound();
      lastSetTarget = null;
      continue;
    }

    const headingMatch = raw.match(/^#{1,6}\s*(.+)$/);
    if (headingMatch) {
      finalizeRound();
      pushBlock();
      currentBlock = createBlock(headingMatch[1].trim(), raw);
      lastSetTarget = null;
      continue;
    }

    const roundMatch = raw.match(
      /^(?:(\d+)\s*(?:x\s*)?(?:runde|runden|rounds?)|(?:runde|runden|rounds?)\s*(?:x\s*(\d+)))\s*:?$/i,
    );
    if (roundMatch) {
      finalizeRound();
      const countRaw = roundMatch[1] ?? roundMatch[2];
      const count = Number.parseInt(countRaw ?? "", 10);
      if (currentBlock?.sourceLines) {
        currentBlock.sourceLines.push(raw);
      }
      if (Number.isFinite(count) && count > 0) {
        roundContext = {
          id: createId(),
          count,
          label: raw,
          sets: [],
          pauses: [],
          sourceLines: [raw],
          startLine: lineNumber,
        };
      } else {
        result.issues.push({
          type: "round",
          lineNumber,
          message: "Rundenanzahl konnte nicht interpretiert werden.",
          line: raw,
        });
      }
      lastSetTarget = null;
      continue;
    }

    if (/^(?!\s*ende\s+(?:runde|runden|rounds?))/i.test(raw) && /^\s*(?:\d+\s*(?:x\s*)?)?(?:runde|runden|rounds?)/i.test(raw)) {
      result.issues.push({
        type: "round",
        lineNumber,
        message: "Rundenstruktur erkannt, aber ohne gültige Anzahl.",
        line: raw,
      });
      lastSetTarget = null;
      continue;
    }

    if (/^ende\s+(?:runde|runden|rounds?)$/i.test(raw)) {
      if (currentBlock?.sourceLines) {
        currentBlock.sourceLines.push(raw);
      }
      if (roundContext) {
        roundContext.sourceLines.push(raw);
      }
      finalizeRound();
      lastSetTarget = null;
      continue;
    }

    if (currentBlock?.sourceLines) {
      currentBlock.sourceLines.push(raw);
    }
    if (roundContext) {
      roundContext.sourceLines.push(raw);
    }

    let hintTarget = lastSetTarget;
    if (!hintTarget) {
      if (roundContext && roundContext.sets.length > 0) {
        hintTarget = roundContext.sets[roundContext.sets.length - 1];
      } else if (!roundContext && currentBlock?.sets?.length > 0) {
        hintTarget = currentBlock.sets[currentBlock.sets.length - 1];
      }
    }

    if (isSetHintLine(raw) && hintTarget) {
      if (!Array.isArray(hintTarget.notes)) {
        hintTarget.notes = [];
      }
      hintTarget.notes.push(raw);
      lastSetTarget = hintTarget;
      continue;
    }

    const pauseMatch = raw.match(/^P\s*:\s*(.+)$/i);
    if (pauseMatch) {
      const pause = parseDuration(pauseMatch[1]);
      if (pause > 0) {
        if (roundContext) {
          roundContext.pauses.push(pause);
        } else {
          accumulatePause(pause, 1);
        }
      } else {
        result.issues.push({
          type: "pause",
          lineNumber,
          message: "Pause konnte nicht in Sekunden umgerechnet werden.",
          line: raw,
        });
      }
      lastSetTarget = null;
      continue;
    }

    const set = parseSetLine(raw);
    if (!set) {
      result.issues.push({
        type: "unknown",
        lineNumber,
        message: "Zeile konnte nicht als Set, Pause oder Struktur erkannt werden.",
        line: raw,
      });
      lastSetTarget = null;
      continue;
    }

    const setWithSource = { ...set, source: raw, notes: [] };

    if (roundContext) {
      roundContext.sets.push(setWithSource);
      lastSetTarget = setWithSource;
      continue;
    }

    lastSetTarget = accumulateSet(setWithSource);
  }

  finalizeRound();
  pushBlock();
  if (result.timedDistance > 0 && result.timedTime > 0) {
    result.averagePaceSeconds = (result.timedTime / result.timedDistance) * 100;
  } else {
    result.averagePaceSeconds = null;
  }
  return result;
}
