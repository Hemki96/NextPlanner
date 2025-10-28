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
    rounds: [],
    sourceLines,
  };
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
    equipment: new Map(),
    intensities: new Map(),
    blocks: [],
  };

  let currentBlock = createBlock("Gesamt");
  let roundContext = null;

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
      return;
    }

    const repeatedDistance = set.distance * multiplier;
    const repeatedTime = set.time * multiplier;
    const repeatedPause = set.pause * multiplier;

    currentBlock.sets.push({
      ...set,
      distance: repeatedDistance,
      time: repeatedTime,
      pause: repeatedPause,
      rounds: multiplier,
      roundLabel,
      roundId,
    });

    currentBlock.distance += repeatedDistance;
    result.totalDistance += repeatedDistance;

    if (repeatedTime > 0) {
      currentBlock.time += repeatedTime;
      result.totalTime += repeatedTime;
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
        result.intensities.get(key) ?? { label: intensity, distance: 0, sets: 0, time: 0 };
      stats.distance += repeatedDistance;
      stats.time += repeatedTime + repeatedPause;
      stats.sets += multiplier;
      result.intensities.set(key, stats);
    }
  };

  const finalizeRound = () => {
    if (!roundContext) {
      return;
    }

    const { count, label, sets, pauses, sourceLines, id } = roundContext;
    if (sets.length === 0 && pauses.length === 0) {
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
    result.blocks.push(currentBlock);
  };

  for (const line of lines) {
    const raw = line.trim();

    if (!raw) {
      if (roundContext) {
        roundContext.sourceLines.push("");
      }
      if (currentBlock?.sourceLines) {
        currentBlock.sourceLines.push("");
      }
      finalizeRound();
      continue;
    }

    const headingMatch = raw.match(/^#{1,6}\s*(.+)$/);
    if (headingMatch) {
      finalizeRound();
      pushBlock();
      currentBlock = createBlock(headingMatch[1].trim(), raw);
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
        };
      }
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
      continue;
    }

    if (currentBlock?.sourceLines) {
      currentBlock.sourceLines.push(raw);
    }
    if (roundContext) {
      roundContext.sourceLines.push(raw);
    }

    const pauseMatch = raw.match(/^P\s*:\s*([0-9:]+)/i);
    if (pauseMatch) {
      const pause = parseDuration(pauseMatch[1]);
      if (pause > 0) {
        if (roundContext) {
          roundContext.pauses.push(pause);
        } else {
          accumulatePause(pause, 1);
        }
      }
      continue;
    }

    const set = parseSetLine(raw);
    if (!set) {
      continue;
    }

    const setWithSource = { ...set, source: raw };

    if (roundContext) {
      roundContext.sets.push(setWithSource);
      continue;
    }

    accumulateSet(setWithSource);
  }

  finalizeRound();
  pushBlock();
  return result;
}
