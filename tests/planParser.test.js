import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePlan } from '../public/js/parser/plan-parser.js';

const stripCarriageReturn = (text) => text.replace(/\r/g, '');

test('parsePlan aggregates distances, time and metadata across blocks and rounds', () => {
  const plan = stripCarriageReturn(`
# Warmup
4x50m Ar @1:00 w/Snorkel
P:0:30

# Main
Runde x2:
6x100m GSA RED6 @1:40 w/Kickboard
P:1:00
Ende Runde
`);

  const result = parsePlan(plan);

  assert.equal(result.totalDistance, 1400);
  assert.equal(result.totalTime, 1590);
  assert.equal(result.blocks.length, 2);

  const warmup = result.blocks[0];
  assert.equal(warmup.name, 'Warmup');
  assert.equal(warmup.distance, 200);
  assert.equal(warmup.time, 270);
  assert.equal(warmup.sets.length, 1);
  assert.deepEqual(warmup.sets[0].focus, ['AR']);
  assert.equal(warmup.sets[0].rounds, 1);

  const main = result.blocks[1];
  assert.equal(main.name, 'Main');
  assert.equal(main.distance, 1200);
  assert.equal(main.time, 1320);
  assert.equal(main.sets.length, 1);

  const [mainSet] = main.sets;
  assert.equal(mainSet.distance, 1200);
  assert.equal(mainSet.time, 1200);
  assert.equal(mainSet.rounds, 2);
  assert.equal(mainSet.roundLabel, 'Runde x2:');
  assert.deepEqual(mainSet.focus, ['GSA']);
  assert.deepEqual(mainSet.intensities, ['RED6']);

  const snorkel = result.equipment.get('snorkel');
  assert.ok(snorkel, 'equipment statistics should include snorkel');
  assert.equal(snorkel.label, 'Snorkel');
  assert.equal(snorkel.count, 1);

  const kickboard = result.equipment.get('kickboard');
  assert.ok(kickboard, 'equipment statistics should include kickboard');
  assert.equal(kickboard.count, 2);

  const red6 = result.intensities.get('RED6');
  assert.ok(red6, 'intensity statistics should include RED6');
  assert.equal(red6.distance, 1200);
  assert.equal(red6.time, 1200);
  assert.equal(red6.sets, 2);
});

test('parsePlan converts yard distances and skips unknown content', () => {
  const plan = stripCarriageReturn(`
# Yard Test
3x25yd WHITE2
Das ist ein Kommentar, der ignoriert werden sollte.
`);

  const result = parsePlan(plan);

  assert.equal(result.totalDistance, 69);
  assert.equal(result.blocks.length, 1);

  const [block] = result.blocks;
  assert.equal(block.distance, 69);
  assert.equal(block.sets.length, 1);
  assert.equal(block.sets[0].length, 23);
  assert.deepEqual(block.sets[0].intensities, ['White2']);
});

test('parsePlan erstellt Hinweise für unbekannte Zeilen und fehlerhafte Angaben', () => {
  const plan = stripCarriageReturn(`
## Testblock
4x50m GSA @0:50
Unbekannte Anweisung
P:abc
Runde xZ:
6x100m GSA @1:30
Ende Runde
`);

  const result = parsePlan(plan);

  assert.equal(result.blocks.length, 1);
  assert.ok(Array.isArray(result.issues));
  assert.equal(result.issues.length, 3);

  const [unknown, pause, round] = result.issues;
  assert.equal(unknown.type, 'unknown');
  assert.equal(unknown.lineNumber, 4);
  assert.match(unknown.message, /nicht als Set/);

  assert.equal(pause.type, 'pause');
  assert.equal(pause.lineNumber, 5);
  assert.match(pause.message, /Pause konnte nicht/);

  assert.equal(round.type, 'round');
  assert.equal(round.lineNumber, 6);
  assert.match(round.message, /Runden/);
});

test('parsePlan erlaubt zusätzliche Hinweistexte nach Sets', () => {
  const plan = stripCarriageReturn(`
4x50m Ar @1:00
1. in Kraul
2. in Delfin
- Beinkick locker
Hinweis: letzte Wiederholung mit Paddles
`);

  const result = parsePlan(plan);

  assert.equal(result.totalDistance, 200);
  assert.equal(result.issues.length, 0);
  assert.equal(result.blocks.length, 1);

  const [block] = result.blocks;
  assert.equal(block.sets.length, 1);

  const [set] = block.sets;
  assert.deepEqual(set.notes, [
    '1. in Kraul',
    '2. in Delfin',
    '- Beinkick locker',
    'Hinweis: letzte Wiederholung mit Paddles',
  ]);
});

test('parsePlan erlaubt Hinweise nach leerer Zeile weiterzuführen', () => {
  const plan = stripCarriageReturn(`
4x100m @1:30

- 1. Kraul
- 2. Delfin
Hinweis zusätzliche Technik
`);

  const result = parsePlan(plan);

  assert.equal(result.issues.length, 0);
  assert.equal(result.blocks.length, 1);

  const [block] = result.blocks;
  assert.equal(block.sets.length, 1);

  const [set] = block.sets;
  assert.deepEqual(set.notes, [
    '- 1. Kraul',
    '- 2. Delfin',
    'Hinweis zusätzliche Technik',
  ]);
});
