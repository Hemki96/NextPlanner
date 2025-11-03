const textEncoder = new TextEncoder();

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
  const sessions = Array.isArray(week.sessions)
    ? week.sessions.map((session, index) => validateSession(session, index))
    : [];
  assertWeek(sessions.length > 0, "Es wurden keine Sessions für den Export gefunden.");

  const overviewRows = Array.isArray(week.overviewRows)
    ? week.overviewRows.map((row, index) => validateOverviewRow(row, index))
    : [];

  return {
    ...week,
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
    const blockParts = [
      '<section class="training-block">',
      '<div class="training-block__header">',
      `<h3 class="block-heading">${escapeHtml(blockType)}</h3>`,
      '</div>',
      '<div class="training-block__body">',
    ];
    for (const entry of groupEntries) {
      if (entry.label) {
        blockParts.push(`<p class="group-heading">${escapeHtml(entry.label)}</p>`);
      }
      for (const line of entry.block.lines) {
        const formatted = formatLineHtml(line);
        if (formatted) {
          blockParts.push(`<p class="block-line">${formatted}</p>`);
        }
      }
    }
    const summaryText = formatSectionSummaryText(
      session?.sectionSummaries?.[blockType] ?? groupEntries[0]?.block?.section_sum,
    );
    if (summaryText) {
      blockParts.push('</div>');
      blockParts.push(`<footer class="training-block__footer"><p class="block-total">${escapeHtml(summaryText)}</p></footer>`);
    } else {
      blockParts.push('</div>');
    }
    blockParts.push('</section>');
    parts.push(blockParts.join(""));
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

function renderSessionHtml(week, session, forcePageBreak) {
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
      <div class="session-card">
        <header class="session-header">
          <p class="session-header-line1">${headerLine1}</p>
          <p class="session-header-line2">${headerLine2}</p>
        </header>
        <div class="session-body">
          ${drylandHtml}
          ${contentBody}
        </div>
      </div>
    </section>
  `;
}

export function createWeekWordDocument(week) {
  const safeWeek = normaliseWeekData(week);
  const sessions = safeWeek.sessions;
  const overviewRows = safeWeek.overviewRows;
  const hasOverview = overviewRows.length > 0;
  const title = escapeHtml(safeWeek.title ?? "Wochenplan");
  const subtitle = safeWeek.subtitle ? escapeHtml(safeWeek.subtitle) : "";
  const overviewHtml = hasOverview ? renderOverviewTableHtml(overviewRows) : "";
  const sessionHtml = sessions
    .map((session, index) => renderSessionHtml(safeWeek, session, hasOverview && index === 0))
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
          padding: 0;
        }
        .session-page:last-of-type {
          page-break-after: auto;
        }
        .session-page--with-break {
          page-break-before: always;
        }
        .session-card {
          border: 1pt solid #d7dbe2;
          border-radius: 8pt;
          background: #ffffff;
          overflow: hidden;
          box-shadow: 0 2pt 6pt rgba(0, 0, 0, 0.05);
        }
        .session-header {
          padding: 12pt 16pt 10pt;
          background: linear-gradient(120deg, #f0f3ff, #ffffff);
          border-bottom: 1pt solid #d7dbe2;
        }
        .session-header-line1 {
          font-size: 14pt;
          font-weight: 700;
          letter-spacing: 0.3pt;
          margin-bottom: 2pt;
        }
        .session-header-line2 {
          font-size: 12pt;
          color: #324154;
          margin-bottom: 0;
        }
        .session-body {
          padding: 14pt 16pt 18pt;
        }
        .dryland-block {
          margin-bottom: 12pt;
          padding: 10pt 12pt;
          border: 1pt dashed #b7bfd1;
          border-radius: 6pt;
          background: #fbfcff;
        }
        .dryland-line {
          font-style: italic;
          font-size: 10pt;
          margin: 2pt 0;
        }
        .training-block {
          border-left: 3pt solid #5c6bc0;
          padding: 10pt 0 6pt 12pt;
          margin-bottom: 12pt;
          background: linear-gradient(90deg, rgba(92, 107, 192, 0.08), transparent);
        }
        .training-block__header {
          margin-bottom: 6pt;
        }
        .training-block__body {
          padding-right: 8pt;
        }
        .training-block__footer {
          margin-top: 8pt;
          padding-right: 8pt;
          padding-left: 12pt;
          text-align: right;
          border-top: 1pt solid #d7dbe2;
          padding-top: 6pt;
        }
        .block-heading {
          font-size: 11pt;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.4pt;
        }
        .group-heading {
          font-size: 10pt;
          font-style: italic;
          margin: 4pt 0;
          color: #3b4a60;
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
          margin: 0;
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

function renderSessionPage(builder, week, session) {
  const page = builder.createPage();
  const contentWidth = builder.pageWidth - builder.margin * 2;
  let y = builder.pageHeight - builder.margin;
  const leftColumn = builder.margin + 10;

  const headerLine1 = formatSessionHeaderLine1(week, session);
  builder.addText(page, { text: headerLine1, x: builder.margin, y, font: builder.fontBold, size: 14 });
  y -= 18;

  const headerLine2 = formatSessionHeaderLine2(session);
  builder.addText(page, { text: headerLine2, x: builder.margin, y, size: 12 });
  y -= 16;
  builder.drawLine(page, builder.margin, y, builder.margin + contentWidth, y);
  y -= 12;

  if (Array.isArray(session?.dryland) && session.dryland.length > 0) {
    for (const line of session.dryland) {
      const wrapped = builder.wrapText(line, contentWidth, 10, { preserveIndent: true });
      for (const item of wrapped) {
        if (y - 14 < builder.margin) {
          return page;
        }
        builder.addText(page, { text: item, x: leftColumn, y, font: builder.fontItalic, size: 10 });
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
    builder.drawLine(page, builder.margin, y - 4, builder.margin + 24, y - 4);
    y -= 16;

    for (const entry of groups) {
      if (entry.label) {
        if (y - 14 < builder.margin) {
          return page;
        }
        builder.addText(page, {
          text: entry.label,
          x: leftColumn,
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
          builder.addText(page, { text: item, x: leftColumn, y, size: 10 });
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
      const summaryX = builder.margin + contentWidth - textWidth - 2;
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
  const sessions = safeWeek.sessions;
  const overviewRows = safeWeek.overviewRows;

  renderOverviewPage(builder, safeWeek, overviewRows);

  sessions.forEach((session) => {
    renderSessionPage(builder, safeWeek, session);
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
