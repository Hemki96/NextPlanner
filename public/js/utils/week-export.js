const textEncoder = new TextEncoder();

const DEFAULT_LEGEND = [
  {
    farbe: "KLAR",
    wahrnehmung: "sehr einfach / einfach",
    rpe: "0-2",
    tempo: "n/A",
    hf10s: "n/A",
  },
  {
    farbe: "WEIß",
    wahrnehmung: "Leicht bis mittelschwer, aber nicht so einfach",
    rpe: "1-3",
    tempo: "100 m PB +17-25\"",
    hf10s: "Unter 140  <23",
  },
  {
    farbe: "ROSA",
    wahrnehmung: "Etwas hart bis hart",
    rpe: "4-5",
    tempo: "100 m PB +15-20\"",
    hf10s: "130 – 160  21-27",
  },
  {
    farbe: "ROT",
    wahrnehmung: "Hart bis sehr hart",
    rpe: "6-8",
    tempo: "100 m PB +12-15\"",
    hf10s: "150 – 170  25-29",
  },
  {
    farbe: "ORANGE",
    wahrnehmung: "Schnell geht es nicht über die Distanz",
    rpe: "8-10",
    tempo: "400m, 800m, 1500m",
    hf10s: "160 und höher  >26",
  },
  {
    farbe: "BLAU",
    wahrnehmung: "All-out Wettkampfdistanz",
    rpe: "8-10",
    tempo: "400m, 200m",
    hf10s: "100 BEP maximal maximal",
  },
  {
    farbe: "LILA",
    wahrnehmung: "Maximale Anstrengung",
    rpe: "9-10",
    tempo: "200m FEP, 100m, 50m",
    hf10s: "maximal maximal",
  },
  {
    farbe: "GRÜN",
    wahrnehmung: "Maximale Geschwindigkeit",
    rpe: "n/A",
    tempo: "50m und schneller",
    hf10s: "n/A n/A",
  },
  {
    farbe: "GOLD",
    wahrnehmung: "Explosive Geschwindigkeit !",
    rpe: "n/A",
    tempo: "Schneller als 50m",
    hf10s: "n/A n/A",
  },
];

const BLOCK_ORDER = ["Einschwimmen", "Main", "Ausschwimmen"];
const WEEKDAY_VALUES = new Set(["Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa.", "So."]);

function assertWeek(condition, message) {
  if (!condition) {
    throw new Error(`Wochenexport ungültig: ${message}`);
  }
}

function isPositiveInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function coerceDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getTime());
  }
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
}

function normaliseLegend(entries) {
  if (!Array.isArray(entries) || entries.length !== DEFAULT_LEGEND.length) {
    return ensureLegend(DEFAULT_LEGEND);
  }

  for (let index = 0; index < DEFAULT_LEGEND.length; index += 1) {
    const expected = DEFAULT_LEGEND[index];
    const candidate = entries[index] ?? {};
    if (
      expected.farbe !== candidate.farbe ||
      expected.wahrnehmung !== candidate.wahrnehmung ||
      expected.rpe !== candidate.rpe ||
      expected.tempo !== candidate.tempo ||
      expected.hf10s !== candidate.hf10s
    ) {
      return ensureLegend(DEFAULT_LEGEND);
    }
  }

  return ensureLegend(entries);
}

function validateSectionSummary(summary, label) {
  if (summary === undefined) {
    return undefined;
  }
  assertWeek(summary && typeof summary === "object", `Abschnittssumme für ${label} fehlt.`);
  if (summary.km !== undefined) {
    assertWeek(typeof summary.km === "number" && Number.isFinite(summary.km), `Abschnittssumme km für ${label} ist ungültig.`);
  }
  if (summary.min !== undefined) {
    assertWeek(Number.isInteger(summary.min) || Number.isFinite(summary.min), `Abschnittssumme Minuten für ${label} ist ungültig.`);
  }
  return summary;
}

function validateBlock(block) {
  assertWeek(block && typeof block === "object", "Blockeintrag fehlt.");
  assertWeek(BLOCK_ORDER.includes(block.type), `Blocktyp "${block?.type}" ist ungültig.`);
  assertWeek(Array.isArray(block.lines), `Serienzeilen für Block "${block.type}" fehlen.`);
  const lines = block.lines.map((line) => {
    assertWeek(typeof line === "string", `Serienzeile in Block "${block.type}" ist ungültig.`);
    return line;
  });
  assertWeek(lines.length > 0, `Block "${block.type}" enthält keine Serien.`);
  const sectionSum = validateSectionSummary(block.section_sum, block.type);
  return { type: block.type, lines, section_sum: sectionSum };
}

function validateGroup(group, index) {
  assertWeek(group && typeof group === "object", `Gruppeneintrag ${index + 1} fehlt.`);
  const label = group.label === null || group.label === undefined ? null : String(group.label);
  assertWeek(Array.isArray(group.blocks) && group.blocks.length > 0, `Blöcke für Gruppe ${index + 1} fehlen.`);
  const blocks = group.blocks.map((block) => validateBlock(block));
  return { label, blocks };
}

function validateSession(session, index) {
  assertWeek(session && typeof session === "object", `Session ${index + 1} fehlt.`);
  const weekday = String(session.weekday ?? "").trim();
  assertWeek(WEEKDAY_VALUES.has(weekday), `Wochentag in Session ${index + 1} ist ungültig.`);
  const dateLabel = String(session.dateLabel ?? session.date ?? "").trim();
  assertWeek(/^\d{2}\.\d{2}\.\d{2}$/.test(dateLabel), `Datum in Session ${index + 1} ist ungültig.`);
  const focus = String(session.focus ?? "").trim();
  assertWeek(focus.length > 0, `Fokus in Session ${index + 1} fehlt.`);
  const startCompact = String(session.time_start_compact ?? "").trim();
  assertWeek(/^\d{4}$/.test(startCompact), `Startzeit in Session ${index + 1} ist ungültig.`);
  const endCompact = String(session.time_end_compact ?? "").trim() || startCompact;
  assertWeek(/^\d{4}$/.test(endCompact), `Endzeit in Session ${index + 1} ist ungültig.`);
  const equipment = Array.isArray(session.equipment) ? session.equipment.map((item) => String(item).trim()).filter(Boolean) : [];
  const totalDistance = Number.isFinite(session.total_m) ? Math.max(0, Math.round(session.total_m)) : 0;
  const groups = Array.isArray(session.groups) ? session.groups.map((group, idx) => validateGroup(group, idx)).filter(Boolean) : [];
  assertWeek(groups.length > 0, `Session ${index + 1} enthält keine Blöcke.`);

  const dryland = Array.isArray(session.dryland)
    ? session.dryland.map((line) => {
        assertWeek(typeof line === "string", `Dryland-Zeile in Session ${index + 1} ist ungültig.`);
        return line;
      })
    : [];

  const sectionSummaries = {};
  if (session.sectionSummaries && typeof session.sectionSummaries === "object") {
    for (const blockType of BLOCK_ORDER) {
      if (session.sectionSummaries[blockType]) {
        sectionSummaries[blockType] = validateSectionSummary(session.sectionSummaries[blockType], blockType);
      }
    }
  }

  const timeWindow = `${startCompact}-${endCompact}`;

  return {
    title: session.title ? String(session.title).trim() : `${focus}`,
    focus,
    weekday,
    dateLabel,
    time_window: timeWindow,
    time_start_compact: startCompact,
    time_end_compact: endCompact,
    equipment,
    total_m: totalDistance,
    groups,
    dryland,
    sectionSummaries,
  };
}

function validateOverviewRow(row, index) {
  assertWeek(row && typeof row === "object", `Zeile ${index + 1} der Wochenübersicht ist ungültig.`);
  const weekday = String(row.weekday ?? "").trim();
  if (weekday) {
    assertWeek(WEEKDAY_VALUES.has(weekday), `Wochentag in Wochenübersicht-Zeile ${index + 1} ist ungültig.`);
  }
  const date = String(row.date ?? "").trim();
  if (date) {
    assertWeek(/^\d{2}\.\d{2}\.\d{2}$/.test(date), `Datum in Wochenübersicht-Zeile ${index + 1} ist ungültig.`);
  }
  const timeWindow = String(row.timeWindow ?? row.time_window ?? "").trim();
  if (timeWindow) {
    assertWeek(/^\d{4}-\d{4}$/.test(timeWindow), `Zeitfenster in Wochenübersicht-Zeile ${index + 1} ist ungültig.`);
  }
  const total = String(row.total ?? "").trim();
  if (total) {
    assertWeek(/^\d+m$|^–$/.test(total), `Gesamtmeter in Wochenübersicht-Zeile ${index + 1} ist ungültig.`);
  }
  return {
    weekday,
    date,
    title: String(row.title ?? "").trim(),
    focus: String(row.focus ?? "").trim(),
    timeWindow,
    equipment: String(row.equipment ?? "").trim(),
    total,
  };
}

function normaliseWeekData(week) {
  assertWeek(week && typeof week === "object", "Wochenobjekt fehlt.");
  assertWeek(isPositiveInteger(week.kw) && week.kw > 0, "Kalenderwoche fehlt oder ist ungültig.");
  assertWeek(typeof week.title === "string" && week.title.trim().length > 0, "Dokumenttitel fehlt.");
  const startDate = coerceDate(week.start);
  const creationDate = startDate ?? coerceDate(week.end) ?? new Date(Date.UTC(2000, 0, 1));
  const legend = normaliseLegend(week.legend);
  const sessions = Array.isArray(week.sessions)
    ? week.sessions.map((session, index) => validateSession(session, index))
    : [];
  assertWeek(sessions.length > 0, "Es wurden keine Sessions für den Export gefunden.");

  const overviewRows = Array.isArray(week.overviewRows)
    ? week.overviewRows.map((row, index) => validateOverviewRow(row, index))
    : [];

  return {
    ...week,
    legend,
    sessions,
    overviewRows,
    creationDate,
  };
}

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

function escapePdfText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function ensureLegend(entries) {
  if (Array.isArray(entries) && entries.length > 0) {
    return entries.map((entry) => ({ ...entry }));
  }
  return DEFAULT_LEGEND.map((entry) => ({ ...entry }));
}

function formatKmValue(value) {
  if (!Number.isFinite(value)) {
    return "";
  }
  const fixed = Number(value).toFixed(1);
  return fixed.replace(/\.0$/, "");
}

function formatSectionSummaryText(section) {
  if (!section) {
    return "";
  }
  const hasKm = Number.isFinite(section.km) && section.km > 0;
  const hasMinutes = Number.isFinite(section.min) && section.min > 0;
  const kmPart = hasKm ? `(${formatKmValue(section.km)})` : "";
  const minutePart = hasMinutes ? `${Math.round(section.min)}min` : "";
  if (kmPart && minutePart) {
    return `${kmPart}/${minutePart}`;
  }
  if (kmPart) {
    return kmPart;
  }
  if (minutePart) {
    return minutePart;
  }
  return "";
}

function formatLineHtml(line) {
  if (typeof line !== "string") {
    return "";
  }
  const trimmed = line.replace(/\s+$/u, "");
  if (!trimmed) {
    return "";
  }
  const indentMatch = trimmed.match(/^\s+/);
  if (indentMatch) {
    const indentHtml = "&nbsp;".repeat(indentMatch[0].length);
    const content = trimmed.slice(indentMatch[0].length);
    return (indentHtml + escapeHtml(content)).replace(/ {2}/g, " &nbsp;");
  }
  return escapeHtml(trimmed).replace(/ {2}/g, " &nbsp;");
}

function formatEquipmentList(equipment) {
  if (!Array.isArray(equipment) || equipment.length === 0) {
    return "–";
  }
  return equipment.join(", ");
}
function renderLegendTableHtml(legend) {
  const rows = legend
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.farbe ?? "")}</td><td>${escapeHtml(entry.wahrnehmung ?? "")}</td><td>${escapeHtml(
          entry.rpe ?? "",
        )}</td><td>${escapeHtml(entry.tempo ?? "")}</td><td>${escapeHtml(entry.hf10s ?? "")}</td></tr>`,
    )
    .join("");
  return `
    <table class="legend-table">
      <colgroup>
        <col style="width:12%" />
        <col style="width:32%" />
        <col style="width:10%" />
        <col style="width:26%" />
        <col style="width:20%" />
      </colgroup>
      <thead>
        <tr>
          <th>Farbe</th>
          <th>Subjektive Wahrnehmung</th>
          <th>RPE</th>
          <th>Tempo</th>
          <th>Herzfrequenz für 10"</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function renderOverviewTableHtml(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }
  const body = rows
    .map((row) => {
      const title = row.title || row.focus || "";
      return `<tr>
        <td>${escapeHtml(row.weekday ?? "")}</td>
        <td>${escapeHtml(row.date ?? "")}</td>
        <td>${escapeHtml(title)}</td>
        <td>${escapeHtml(row.timeWindow ?? "")}</td>
        <td>${escapeHtml(row.equipment ?? "")}</td>
        <td>${escapeHtml(row.total ?? "")}</td>
      </tr>`;
    })
    .join("");
  return `
    <section class="week-overview">
      <h2 class="overview-heading">Wochenübersicht</h2>
      <table class="overview-table">
        <colgroup>
          <col style="width:10%" />
          <col style="width:14%" />
          <col style="width:32%" />
          <col style="width:14%" />
          <col style="width:18%" />
          <col style="width:12%" />
        </colgroup>
        <thead>
          <tr>
            <th>Tag</th>
            <th>Datum</th>
            <th>Einheitstitel/Kurzfokus</th>
            <th>Zeitfenster</th>
            <th>Equipment</th>
            <th>Gesamtmeter</th>
          </tr>
        </thead>
        <tbody>
          ${body}
        </tbody>
      </table>
    </section>
  `;
}

function renderDrylandHtml(lines) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return "";
  }
  const body = lines
    .map((line) => {
      const content = formatLineHtml(line);
      return content ? `<p class="dryland-line">${content}</p>` : "";
    })
    .join("");
  return body ? `<div class="dryland-block">${body}</div>` : "";
}

function renderSessionBlocksHtml(session) {
  if (!session || !Array.isArray(session.groups)) {
    return "";
  }
  const parts = [];
  for (const blockType of BLOCK_ORDER) {
    const groupEntries = session.groups
      .map((group) => {
        const block = group?.blocks?.find((entry) => entry?.type === blockType);
        if (!block || !Array.isArray(block.lines) || block.lines.length === 0) {
          return null;
        }
        return { label: group.label, block };
      })
      .filter(Boolean);
    if (groupEntries.length === 0) {
      continue;
    }
    parts.push(`<h3 class="block-heading">${escapeHtml(blockType)}</h3>`);
    for (const entry of groupEntries) {
      if (entry.label) {
        parts.push(`<p class="group-heading">${escapeHtml(entry.label)}</p>`);
      }
      for (const line of entry.block.lines) {
        const formatted = formatLineHtml(line);
        if (formatted) {
          parts.push(`<p class="block-line">${formatted}</p>`);
        }
      }
    }
    const summaryText = formatSectionSummaryText(
      session?.sectionSummaries?.[blockType] ?? groupEntries[0]?.block?.section_sum,
    );
    if (summaryText) {
      parts.push(`<p class="block-total">${escapeHtml(summaryText)}</p>`);
    }
  }
  return parts.join("");
}

function formatSessionHeaderLine1(week, session) {
  const kwValue = Number.isFinite(week?.kw) && week.kw > 0 ? `KW${week.kw}` : String(week?.title ?? "KW").trim();
  const parts = [kwValue];
  if (session?.focus) {
    parts.push(String(session.focus));
  }
  if (session?.dateLabel) {
    parts.push(String(session.dateLabel));
  }
  return parts.filter(Boolean).join(" ");
}

function formatSessionHeaderLine2(session) {
  const weekdayPart = session?.weekday ? `${session.weekday}:` : "";
  const timePart = session?.time_window ? session.time_window : "";
  const equipmentPart = formatEquipmentList(session?.equipment);
  const totalPart = session?.total_m ? `${session.total_m}m` : "–";
  return [weekdayPart, timePart, equipmentPart, totalPart].filter(Boolean).join(" ");
}

function renderSessionHtml(week, session, forcePageBreak, legend) {
  const legendHtml = renderLegendTableHtml(legend);
  const drylandHtml = renderDrylandHtml(session?.dryland ?? []);
  const blocksHtml = renderSessionBlocksHtml(session);
  const classes = ["session-page"];
  if (forcePageBreak) {
    classes.push("session-page--with-break");
  }
  const headerLine1 = escapeHtml(formatSessionHeaderLine1(week, session));
  const headerLine2 = escapeHtml(formatSessionHeaderLine2(session));
  const contentBody = blocksHtml || '<p class="session-empty">Keine Inhalte hinterlegt.</p>';
  return `
    <section class="${classes.join(" ")}">
      <header class="session-header">
        <p class="session-header-line1">${headerLine1}</p>
        <p class="session-header-line2">${headerLine2}</p>
      </header>
      ${legendHtml}
      ${drylandHtml}
      ${contentBody}
    </section>
  `;
}

export function createWeekWordDocument(week) {
  const safeWeek = normaliseWeekData(week);
  const legend = safeWeek.legend;
  const sessions = safeWeek.sessions;
  const overviewRows = safeWeek.overviewRows;
  const hasOverview = overviewRows.length > 0;
  const title = escapeHtml(safeWeek.title ?? "Wochenplan");
  const subtitle = safeWeek.subtitle ? escapeHtml(safeWeek.subtitle) : "";
  const overviewHtml = hasOverview ? renderOverviewTableHtml(overviewRows) : "";
  const sessionHtml = sessions
    .map((session, index) => renderSessionHtml(safeWeek, session, hasOverview && index === 0, legend))
    .join("");
  return `<!DOCTYPE html>
  <html lang="de">
    <head>
      <meta charset="utf-8" />
      <title>${title}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 15mm;
          @bottom-right {
            content: "Seite " counter(page) " / " counter(pages);
            font-size: 9pt;
          }
        }
        body {
          margin: 0;
          font-family: 'Calibri', 'Segoe UI', sans-serif;
          font-size: 11pt;
          line-height: 1.4;
          color: #111;
        }
        h1, h2, h3, p {
          margin: 0;
        }
        .document-header {
          margin-bottom: 18pt;
        }
        .document-title {
          font-size: 18pt;
          font-weight: 700;
          margin-bottom: 4pt;
        }
        .document-subtitle {
          font-size: 12pt;
          color: #333;
        }
        .week-overview {
          margin-bottom: 18pt;
        }
        .overview-heading {
          font-size: 13pt;
          font-weight: 700;
          margin-bottom: 8pt;
        }
        .overview-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10pt;
        }
        .overview-table th,
        .overview-table td {
          border: 1pt solid #cccccc;
          padding: 4pt 6pt;
          text-align: left;
          vertical-align: top;
        }
        .overview-table th {
          background: #f2f2f2;
          font-weight: 700;
        }
        .session-page {
          page-break-after: always;
        }
        .session-page:last-of-type {
          page-break-after: auto;
        }
        .session-page--with-break {
          page-break-before: always;
        }
        .session-header-line1 {
          font-size: 14pt;
          font-weight: 700;
          margin-bottom: 0;
        }
        .session-header-line2 {
          font-size: 12pt;
          margin-bottom: 4pt;
        }
        .legend-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 9.5pt;
          margin-bottom: 12pt;
        }
        .legend-table th,
        .legend-table td {
          border: 1pt solid #d0d0d0;
          padding: 4pt;
          text-align: left;
          vertical-align: top;
        }
        .legend-table th {
          background: #f7f7f7;
          font-weight: 700;
        }
        .dryland-block {
          margin-bottom: 10pt;
        }
        .dryland-line {
          font-style: italic;
          font-size: 10pt;
          margin: 2pt 0;
        }
        .block-heading {
          font-size: 11pt;
          font-weight: 700;
          margin: 8pt 0 4pt;
        }
        .group-heading {
          font-size: 10pt;
          font-style: italic;
          margin: 6pt 0 4pt;
        }
        .block-line {
          font-size: 10pt;
          margin: 2pt 0;
          line-height: 1.15;
        }
        .block-total {
          font-size: 10pt;
          font-style: italic;
          text-align: right;
          margin: 6pt 0 0;
        }
        .session-empty {
          font-style: italic;
          color: #666;
        }
        .week-empty {
          font-style: italic;
          color: #666;
        }
      </style>
    </head>
    <body>
      <header class="document-header">
        <h1 class="document-title">${title}</h1>
        ${subtitle ? `<p class="document-subtitle">${subtitle}</p>` : ""}
      </header>
      ${overviewHtml}
      ${sessionHtml}
    </body>
  </html>`;
}
class PdfPage {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.commands = [];
  }

  add(command) {
    if (command) {
      this.commands.push(command);
    }
  }

  toStream() {
    return this.commands.join("\n");
  }
}

class PdfDocumentBuilder {
  constructor(options = {}) {
    this.title = options.title || "Wochenplan";
    this.creationDate = coerceDate(options.creationDate) ?? new Date(Date.UTC(2000, 0, 1));
    this.pageWidth = 595;
    this.pageHeight = 842;
    this.margin = 42.52;
    this.fontRegular = "/F1";
    this.fontBold = "/F2";
    this.fontItalic = "/F3";
    this.pages = [];
  }

  createPage() {
    const page = new PdfPage(this.pageWidth, this.pageHeight);
    page.add("0.75 w");
    this.pages.push(page);
    return page;
  }

  addText(page, { text, x, y, font = this.fontRegular, size = 10 }) {
    const safeText = escapePdfText(text ?? "");
    page.add(`BT ${font} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${safeText}) Tj ET`);
  }

  drawLine(page, x1, y1, x2, y2) {
    page.add(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  estimateTextWidth(text, fontSize) {
    if (!text) {
      return 0;
    }
    return String(text).length * fontSize * 0.55;
  }

  wrapText(text, width, fontSize, options = {}) {
    const preserveIndent = options.preserveIndent === true;
    const safe = String(text ?? "");
    const trimmed = preserveIndent ? safe.replace(/\s+$/u, "") : safe.trim();
    if (!trimmed) {
      return preserveIndent ? [safe.replace(/\S/g, "").slice(0, 1)] : [""];
    }
    if (width <= 0) {
      return [trimmed];
    }
    const indentMatch = preserveIndent ? safe.match(/^\s+/) : null;
    const indent = indentMatch ? indentMatch[0] : "";
    const indentWidth = indent.length * fontSize * 0.55;
    const effectiveWidth = Math.max(width - indentWidth, fontSize);
    const maxChars = Math.max(1, Math.floor(effectiveWidth / (fontSize * 0.55)));
    const content = preserveIndent ? safe.trimStart() : trimmed;
    if (content.length <= maxChars) {
      return [preserveIndent ? `${indent}${content}` : content];
    }
    const words = content.split(/\s+/);
    const lines = [];
    let current = preserveIndent ? indent : "";
    const baseLength = preserveIndent ? indent.length : 0;
    for (const word of words) {
      const candidate = current.length > baseLength ? `${current} ${word}` : `${preserveIndent ? indent : ""}${word}`;
      if (candidate.length - baseLength > maxChars && current.length > baseLength) {
        lines.push(current);
        current = `${preserveIndent ? indent : ""}${word}`;
      } else if (candidate.length - baseLength > maxChars) {
        lines.push(candidate);
        current = preserveIndent ? indent : "";
      } else {
        current = candidate;
      }
    }
    if (current && (!preserveIndent || current.length > baseLength)) {
      lines.push(current);
    }
    return lines.length > 0 ? lines : [preserveIndent ? indent : ""];
  }

  drawTable(page, startX, startY, columns, rows, options = {}) {
    const padding = options.padding ?? 4;
    const lineGap = options.lineGap ?? 2;
    const minY = options.minY ?? this.margin;
    let y = startY;
    const colPositions = [];
    let cursorX = startX;
    for (const column of columns) {
      colPositions.push(cursorX);
      cursorX += column.width;
    }
    colPositions.push(cursorX);
    const totalWidth = cursorX - startX;
    const rowBoundaries = [y];

    for (const row of rows) {
      const font = row.font ?? this.fontRegular;
      const fontSize = row.fontSize ?? 10;
      const lineHeight = fontSize + lineGap;
      const cellLines = row.cells.map((cell, index) => {
        const colWidth = columns[index]?.width ?? 0;
        return this.wrapText(cell ?? "", Math.max(colWidth - padding * 2, fontSize), fontSize, {
          preserveIndent: row.preserveIndent || false,
        });
      });
      const maxLines = cellLines.reduce((max, lines) => Math.max(max, lines.length), 1);
      const rowHeight = maxLines * lineHeight + padding * 2;
      if (y - rowHeight < minY) {
        break;
      }
      const textStartY = y - padding - fontSize;
      cellLines.forEach((lines, colIndex) => {
        const align = columns[colIndex]?.align ?? "left";
        let textY = textStartY;
        for (const line of lines) {
          let textX = colPositions[colIndex] + padding;
          if (align === "right") {
            const approxWidth = this.estimateTextWidth(line, fontSize);
            textX = colPositions[colIndex + 1] - padding - approxWidth;
          }
          this.addText(page, { text: line, x: textX, y: textY, font, size: fontSize });
          textY -= lineHeight;
        }
      });
      y -= rowHeight;
      rowBoundaries.push(y);
    }

    for (const boundaryY of rowBoundaries) {
      this.drawLine(page, startX, boundaryY, startX + totalWidth, boundaryY);
    }
    for (const colX of colPositions) {
      this.drawLine(page, colX, startY, colX, y);
    }

    return y;
  }

  build() {
    return buildPdfDocument(this.pages, this.title, this.creationDate);
  }
}
function renderOverviewPage(builder, week, rows) {
  const page = builder.createPage();
  const contentWidth = builder.pageWidth - builder.margin * 2;
  let y = builder.pageHeight - builder.margin;

  const title = week?.title || "Wochenplan";
  builder.addText(page, { text: title, x: builder.margin, y, font: builder.fontBold, size: 18 });
  y -= 28;

  const subtitle = week?.subtitle || week?.longRangeLabel || "";
  if (subtitle) {
    builder.addText(page, { text: subtitle, x: builder.margin, y, size: 12 });
    y -= 20;
  }

  const rangeLine = week?.longRangeLabel && subtitle !== week.longRangeLabel ? week.longRangeLabel : week?.rangeLabel;
  if (rangeLine) {
    builder.addText(page, { text: rangeLine, x: builder.margin, y, size: 10 });
    y -= 18;
  }

  if (rows.length > 0) {
    const columns = [
      { width: contentWidth * 0.1 },
      { width: contentWidth * 0.14 },
      { width: contentWidth * 0.32 },
      { width: contentWidth * 0.14 },
      { width: contentWidth * 0.18 },
      { width: contentWidth * 0.12 },
    ];
    const header = {
      font: builder.fontBold,
      fontSize: 10,
      cells: ["Tag", "Datum", "Einheitstitel/Kurzfokus", "Zeitfenster", "Equipment", "Gesamtmeter"],
    };
    const bodyRows = rows.map((row) => ({
      fontSize: 10,
      cells: [
        row.weekday ?? "",
        row.date ?? "",
        row.title || row.focus || "",
        row.timeWindow ?? "",
        row.equipment ?? "",
        row.total ?? "",
      ],
    }));
    y = builder.drawTable(page, builder.margin, y, columns, [header, ...bodyRows], { padding: 5, lineGap: 2 });
    y -= 18;
  } else {
    builder.addText(page, {
      text: "In dieser Woche sind keine Einheiten hinterlegt.",
      x: builder.margin,
      y,
      size: 11,
    });
    y -= 18;
  }

  return page;
}

function renderSessionPage(builder, week, session, legend) {
  const page = builder.createPage();
  const contentWidth = builder.pageWidth - builder.margin * 2;
  let y = builder.pageHeight - builder.margin;

  const headerLine1 = formatSessionHeaderLine1(week, session);
  builder.addText(page, { text: headerLine1, x: builder.margin, y, font: builder.fontBold, size: 14 });
  y -= 18;

  const headerLine2 = formatSessionHeaderLine2(session);
  builder.addText(page, { text: headerLine2, x: builder.margin, y, size: 12 });
  y -= 16;

  const legendColumns = [
    { width: contentWidth * 0.12 },
    { width: contentWidth * 0.32 },
    { width: contentWidth * 0.1 },
    { width: contentWidth * 0.26 },
    { width: contentWidth * 0.2 },
  ];
  const legendRows = [
    {
      font: builder.fontBold,
      fontSize: 9,
      cells: ["Farbe", "Subjektive Wahrnehmung", "RPE", "Tempo", "Herzfrequenz für 10\""],
    },
    ...legend.map((entry) => ({
      fontSize: 9,
      cells: [entry.farbe ?? "", entry.wahrnehmung ?? "", entry.rpe ?? "", entry.tempo ?? "", entry.hf10s ?? ""],
    })),
  ];
  y = builder.drawTable(page, builder.margin, y, legendColumns, legendRows, { padding: 4, lineGap: 1, minY: builder.margin });
  y -= 12;

  if (Array.isArray(session?.dryland) && session.dryland.length > 0) {
    for (const line of session.dryland) {
      const wrapped = builder.wrapText(line, contentWidth, 10, { preserveIndent: true });
      for (const item of wrapped) {
        if (y - 14 < builder.margin) {
          return page;
        }
        builder.addText(page, { text: item, x: builder.margin, y, font: builder.fontItalic, size: 10 });
        y -= 14;
      }
    }
    y -= 6;
  }

  for (const blockType of BLOCK_ORDER) {
    const groups = Array.isArray(session?.groups)
      ? session.groups
          .map((group) => {
            const block = group?.blocks?.find((entry) => entry?.type === blockType);
            if (!block || !Array.isArray(block.lines) || block.lines.length === 0) {
              return null;
            }
            return { label: group.label, block };
          })
          .filter(Boolean)
      : [];
    if (groups.length === 0) {
      continue;
    }

    if (y - 16 < builder.margin) {
      return page;
    }
    builder.addText(page, { text: blockType, x: builder.margin, y, font: builder.fontBold, size: 11 });
    y -= 16;

    for (const entry of groups) {
      if (entry.label) {
        if (y - 14 < builder.margin) {
          return page;
        }
        builder.addText(page, {
          text: entry.label,
          x: builder.margin,
          y,
          font: builder.fontItalic,
          size: 10,
        });
        y -= 14;
      }
      for (const line of entry.block.lines) {
        const wrapped = builder.wrapText(line, contentWidth, 10, { preserveIndent: true });
        for (const item of wrapped) {
          if (y - 14 < builder.margin) {
            return page;
          }
          builder.addText(page, { text: item, x: builder.margin, y, size: 10 });
          y -= 14;
        }
      }
    }

    const summaryText = formatSectionSummaryText(
      session?.sectionSummaries?.[blockType] ?? groups[0]?.block?.section_sum,
    );
    if (summaryText) {
      if (y - 14 < builder.margin) {
        return page;
      }
      const textWidth = builder.estimateTextWidth(summaryText, 10);
      const summaryX = builder.margin + contentWidth - textWidth;
      builder.addText(page, {
        text: summaryText,
        x: summaryX,
        y,
        font: builder.fontItalic,
        size: 10,
      });
      y -= 14;
    }

    if (y - 6 < builder.margin) {
      return page;
    }
    y -= 6;
  }

  return page;
}

function reserveObject(objects) {
  const index = objects.length + 1;
  objects.push({ body: "" });
  return index;
}

function setObjectBody(objects, id, body) {
  objects[id - 1].body = body;
}

function buildPdfDocument(pages, title, creationDate) {
  const objects = [];
  const catalogId = reserveObject(objects);
  const pagesId = reserveObject(objects);
  const fontRegularId = reserveObject(objects);
  const fontBoldId = reserveObject(objects);
  const fontItalicId = reserveObject(objects);
  const contentIds = pages.map(() => reserveObject(objects));
  const pageIds = pages.map(() => reserveObject(objects));
  const infoId = reserveObject(objects);

  setObjectBody(objects, fontRegularId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  setObjectBody(objects, fontBoldId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  setObjectBody(objects, fontItalicId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>");

  pages.forEach((page, index) => {
    const stream = page.toStream();
    const length = textEncoder.encode(stream).length;
    setObjectBody(objects, contentIds[index], `<< /Length ${length} >>\nstream\n${stream}\nendstream`);
    setObjectBody(
      objects,
      pageIds[index],
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontRegularId} 0 R /F2 ${fontBoldId} 0 R /F3 ${fontItalicId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`,
    );
  });

  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  setObjectBody(objects, pagesId, `<< /Type /Pages /Count ${pageIds.length} /Kids [${kids}] >>`);
  setObjectBody(objects, catalogId, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const safeTitle = title && String(title).trim() ? String(title).trim() : "Wochenplan";
  const escapedTitle = escapePdfText(safeTitle);
  const effectiveDate = creationDate instanceof Date && !Number.isNaN(creationDate.getTime())
    ? new Date(Date.UTC(
        creationDate.getUTCFullYear(),
        creationDate.getUTCMonth(),
        creationDate.getUTCDate(),
        creationDate.getUTCHours(),
        creationDate.getUTCMinutes(),
        creationDate.getUTCSeconds(),
      ))
    : new Date(Date.UTC(2000, 0, 1));
  const pad = (value, size = 2) => String(value).padStart(size, "0");
  const creationString = `D:${pad(effectiveDate.getUTCFullYear(), 4)}${pad(effectiveDate.getUTCMonth() + 1)}${pad(
    effectiveDate.getUTCDate(),
  )}${pad(effectiveDate.getUTCHours())}${pad(effectiveDate.getUTCMinutes())}${pad(effectiveDate.getUTCSeconds())}+00'00'`;
  setObjectBody(
    objects,
    infoId,
    `<< /Title (${escapedTitle}) /Creator (NextPlanner) /Producer (NextPlanner) /CreationDate (${creationString}) >>`,
  );

  let pdf = "%PDF-1.4\n%\xC2\xC3\xCF\xD3\n";
  const offsets = [0];
  let offsetPointer = textEncoder.encode(pdf).length;
  const objectCount = objects.length;

  for (let index = 0; index < objectCount; index += 1) {
    const id = index + 1;
    const body = objects[index].body ?? "";
    const objectString = `${id} 0 obj\n${body}\nendobj\n`;
    offsets[id] = offsetPointer;
    pdf += objectString;
    offsetPointer += textEncoder.encode(objectString).length;
  }

  const xrefOffset = offsetPointer;
  pdf += `xref\n0 ${objectCount + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objectCount; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += "trailer\n";
  pdf += `<< /Size ${objectCount + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\n`;
  pdf += "startxref\n";
  pdf += `${xrefOffset}\n`;
  pdf += "%%EOF";
  return textEncoder.encode(pdf);
}

export function createWeekPdfDocument(week) {
  const safeWeek = normaliseWeekData(week);
  const builder = new PdfDocumentBuilder({ title: safeWeek.title ?? "Wochenplan", creationDate: safeWeek.creationDate });
  const legend = safeWeek.legend;
  const sessions = safeWeek.sessions;
  const overviewRows = safeWeek.overviewRows;

  renderOverviewPage(builder, safeWeek, overviewRows);

  sessions.forEach((session) => {
    renderSessionPage(builder, safeWeek, session, legend);
  });

  const totalPages = builder.pages.length;
  builder.pages.forEach((page, index) => {
    const text = `Seite ${index + 1} / ${totalPages}`;
    const size = 9;
    const textWidth = builder.estimateTextWidth(text, size);
    const x = builder.pageWidth - builder.margin - textWidth;
    const y = builder.margin / 2;
    builder.addText(page, { text, x, y, size });
  });

  return builder.build();
}
