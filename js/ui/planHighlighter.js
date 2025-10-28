import { getIntensityColorClass, getKnownIntensityPattern } from "./intensityColors.js";

const intensityPattern = getKnownIntensityPattern();

const highlightPatterns = [
  {
    type: "heading",
    priority: 6,
    regex: /^(?:\s*#{1,6}[^\S\n]*)[^\n]+$/gm,
  },
  {
    type: "distance",
    priority: 5,
    regex: /\b\d+\s*(?:x|×)\s*\d+(?:[.,]\d+)?\s*(?:m|meter|km|yd|y)?\b/gi,
  },
  {
    type: "distance",
    priority: 4,
    regex: /\b\d+(?:[.,]\d+)?\s*(?:m|meter|km|yd|y)\b/gi,
  },
  {
    type: "round",
    priority: 3,
    regex: /\b\d+\s*(?:Runden?|Rd)\b:?/gi,
  },
  {
    type: "round",
    priority: 3,
    regex: /\bRunde\s*(?:x|×)\s*\d+\b:?/gi,
  },
  {
    type: "interval",
    priority: 3,
    regex: /@\s*\d+:\d+(?::\d+)?/g,
  },
  {
    type: "equipment",
    priority: 2,
    regex: /w\/\s*[^@\n]*?(?=\s+(?:@\s*\d|P:|\b(?:CLEAR|WHITE\d*|PINK\d*|RED\d*|ORANGE\d*|PURPLE\d*|BLUE\d*|GREEN|GOLD))|\s*$|\n)/gi,
  },
  {
    type: "intensity",
    priority: 4,
    regex: intensityPattern,
  },
];

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function gatherMatches(text) {
  const matches = [];
  for (const pattern of highlightPatterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    for (const match of text.matchAll(regex)) {
      matches.push({
        type: pattern.type,
        priority: pattern.priority,
        start: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        text: match[0],
      });
    }
  }
  matches.sort((a, b) => {
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    const lengthDiff = b.end - b.start - (a.end - a.start);
    if (lengthDiff !== 0) {
      return lengthDiff;
    }
    return a.start - b.start;
  });

  const chosen = [];
  for (const match of matches) {
    const overlaps = chosen.some((existing) => match.start < existing.end && match.end > existing.start);
    if (!overlaps) {
      chosen.push(match);
    }
  }

  return chosen.sort((a, b) => a.start - b.start);
}

function wrapToken(match) {
  const escaped = escapeHtml(match.text);
  switch (match.type) {
    case "heading": {
      const trimmed = escaped.replace(/^(\s*#{1,6}\s*)(.*)$/, (_, hashes, title) => {
        return `${hashes}<span class="plan-heading-text">${title}</span>`;
      });
      return `<strong class="plan-token plan-token-heading">${trimmed}</strong>`;
    }
    case "distance":
      return `<strong class="plan-token plan-token-distance">${escaped}</strong>`;
    case "round":
      return `<strong class="plan-token plan-token-round">${escaped}</strong>`;
    case "interval":
      return `<em class="plan-token plan-token-interval">${escaped}</em>`;
    case "equipment":
      return `<em class="plan-token plan-token-equipment">${escaped}</em>`;
    case "intensity":
      return `<span class="plan-token intensity-token ${getIntensityColorClass(match.text)}">${escaped}</span>`;
    default:
      return escaped;
  }
}

function highlightPlanText(text) {
  if (!text) {
    return "";
  }

  const matches = gatherMatches(text);
  if (matches.length === 0) {
    return escapeHtml(text);
  }

  let cursor = 0;
  let result = "";
  for (const match of matches) {
    if (match.start > cursor) {
      result += escapeHtml(text.slice(cursor, match.start));
    }
    result += wrapToken(match);
    cursor = match.end;
  }

  if (cursor < text.length) {
    result += escapeHtml(text.slice(cursor));
  }

  return result || "";
}

export function initPlanHighlighter({ textarea, highlightLayer }) {
  if (!textarea || !highlightLayer) {
    return {
      refresh() {},
      setText() {},
    };
  }

  let contentEl = null;

  const syncScroll = () => {
    if (!contentEl) {
      return;
    }
    contentEl.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
  };

  const renderHighlight = () => {
    const markup = highlightPlanText(textarea.value ?? "");
    highlightLayer.innerHTML = `<pre class="plan-highlight-content">${markup || "&nbsp;"}</pre>`;
    contentEl = highlightLayer.firstElementChild;
    syncScroll();
  };

  const refresh = () => {
    renderHighlight();
  };

  const setText = (value) => {
    textarea.value = value ?? "";
    renderHighlight();
  };

  textarea.addEventListener("input", refresh);
  textarea.addEventListener("scroll", syncScroll);

  refresh();

  return {
    refresh,
    setText,
  };
}
