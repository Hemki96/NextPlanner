import test from 'node:test';
import assert from 'node:assert/strict';

import { parseDuration, formatDuration } from '../public/js/utils/time.js';

test('parseDuration supports seconds, minutes and hours', () => {
  assert.equal(parseDuration('45'), 45);
  assert.equal(parseDuration('1:30'), 90);
  assert.equal(parseDuration('01:02:03'), 3723);
});

test('parseDuration gracefully handles invalid tokens', () => {
  assert.equal(parseDuration(''), 0);
  assert.equal(parseDuration('abc'), 0);
  assert.equal(parseDuration('1:two'), 0);
});

test('formatDuration renders compact output', () => {
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(59), '0:59');
  assert.equal(formatDuration(3723), '1:02:03');
});
