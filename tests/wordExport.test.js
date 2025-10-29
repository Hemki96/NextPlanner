import test from 'node:test';
import assert from 'node:assert/strict';

import { createWordExportDocument } from '../js/utils/wordExport.js';

const stripWhitespace = (text) => text.replace(/\s+/g, ' ');

test('Word export renders document header metadata and block summaries', () => {
  const planText = `Datum: 2024-06-01
Uhrzeit: 07:30
Titel: Morning Session
Benötigtes Material: Fins, Snorkel

## Einschwimmen
4x50m ez @1:00 w/F

## Hauptsatz
3x100m PINK4 @1:40 w/Snorkel
`;

  const documentHtml = createWordExportDocument(planText);
  const normalized = stripWhitespace(documentHtml);

  assert.match(
    normalized,
    /<header class="document-header">.*>Datum:<\/span><span class="header-value">2024-06-01<\/span>.*<\/header>/,
  );
  assert.match(
    normalized,
    />Uhrzeit:<\/span><span class="header-value">07:30<\/span>/,
  );
  assert.match(
    normalized,
    />Titel:<\/span><span class="header-value">Morning Session<\/span>/,
  );
  assert.match(
    normalized,
    />Benötigtes Material:<\/span><span class="header-value">Fins, Snorkel<\/span>/,
  );
  assert.match(normalized, />Summe:<\/span><span class="block-summary-value">200 m \/ 4:00<\/span>/);
  assert.match(normalized, />Summe:<\/span><span class="block-summary-value">300 m \/ 5:00<\/span>/);
});

test('Word export header falls back to parsed statistics when metadata is missing', () => {
  const planText = `## Warmup
2x50m @1:00 w/F
`;

  const documentHtml = createWordExportDocument(planText);
  const normalized = stripWhitespace(documentHtml);

  assert.match(
    normalized,
    />Titel:<\/span><span class="header-value">Warmup<\/span>/,
    'should fall back to first block name as title',
  );
  assert.match(
    normalized,
    />Gesamtmeter:<\/span><span class="header-value">100 m<\/span>/,
  );
  assert.match(
    normalized,
    />Benötigtes Material:<\/span><span class="header-value">F<\/span>/,
  );
  assert.match(normalized, />Summe:<\/span><span class="block-summary-value">100 m \/ 2:00<\/span>/);
});
