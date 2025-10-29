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

function createTokenNode(match) {
  switch (match.type) {
    case "heading": {
      const heading = document.createElement("span");
      heading.className = "plan-token plan-token-heading";
      const parts = match.text.match(/^(\s*#{1,6}\s*)(.*)$/);
      if (parts) {
        heading.append(document.createTextNode(parts[1] ?? ""));
        const title = document.createElement("span");
        title.className = "plan-heading-text";
        title.textContent = parts[2] ?? "";
        heading.append(title);
      } else {
        heading.textContent = match.text;
      }
      return heading;
    }
    case "distance":
      return createSimpleToken(match.text, "plan-token-distance");
    case "round":
      return createSimpleToken(match.text, "plan-token-round");
    case "interval":
      return createSimpleToken(match.text, "plan-token-interval");
    case "equipment":
      return createSimpleToken(match.text, "plan-token-equipment");
    case "intensity":
      return createIntensityToken(match.text);
    default:
      return document.createTextNode(match.text);
  }
}

function createSimpleToken(text, className) {
  const token = document.createElement("span");
  token.className = `plan-token ${className}`;
  token.textContent = text;
  return token;
}

function createIntensityToken(text) {
  const token = document.createElement("span");
  token.className = `plan-token intensity-token ${getIntensityColorClass(text)}`;
  token.textContent = text;
  return token;
}

function buildHighlightNodes(text) {
  const fragment = document.createDocumentFragment();
  if (!text) {
    fragment.append(document.createTextNode(""));
    return fragment;
  }

  const matches = gatherMatches(text);
  if (matches.length === 0) {
    fragment.append(document.createTextNode(text));
    return fragment;
  }

  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      fragment.append(document.createTextNode(text.slice(cursor, match.start)));
    }
    fragment.append(createTokenNode(match));
    cursor = match.end;
  }

  if (cursor < text.length) {
    fragment.append(document.createTextNode(text.slice(cursor)));
  }

  return fragment;
}

export function initPlanHighlighter({ textarea, highlightLayer }) {
  if (!textarea || !highlightLayer) {
    return {
      refresh() {},
      setText() {},
      setIssues() {},
    };
  }

  let contentEl = null;
  let issueLines = new Set();

  const syncScroll = () => {
    if (!contentEl) {
      return;
    }
    contentEl.style.transform = `translate(${-textarea.scrollLeft}px, ${-textarea.scrollTop}px)`;
  };

  const renderHighlight = () => {
    const text = textarea.value ?? "";
    const container = document.createElement("div");
    container.className = "plan-highlight-content";
    container.setAttribute("role", "presentation");

    const lines = text.split(/\n/);
    const totalLines = lines.length || 1;

    for (let index = 0; index < totalLines; index += 1) {
      const lineText = lines[index] ?? "";
      const lineNumber = index + 1;
      const lineEl = document.createElement("span");
      lineEl.className = "plan-line";
      lineEl.dataset.line = String(lineNumber);
      if (issueLines.has(lineNumber)) {
        lineEl.classList.add("has-issue");
      }

      if (lineText) {
        lineEl.append(buildHighlightNodes(lineText));
      } else {
        lineEl.append(document.createTextNode("\u00A0"));
      }

      container.append(lineEl);
    }

    highlightLayer.replaceChildren(container);
    contentEl = container;
    syncScroll();
  };

  const refresh = () => {
    renderHighlight();
  };

  const setText = (value) => {
    textarea.value = value ?? "";
    renderHighlight();
  };

  const setIssues = (issues) => {
    if (!issues || !Array.isArray(issues)) {
      issueLines = new Set();
    } else {
      issueLines = new Set(
        issues
          .map((issue) => Number.parseInt(issue?.lineNumber ?? "", 10))
          .filter((lineNumber) => Number.isFinite(lineNumber) && lineNumber > 0),
      );
    }
    renderHighlight();
  };

  textarea.addEventListener("input", refresh);
  textarea.addEventListener("scroll", syncScroll);

  refresh();

  return {
    refresh,
    setText,
    setIssues,
  };
}
