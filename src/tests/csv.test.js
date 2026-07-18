import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, toCsv } from '../../public/js/modules/csv.js';

test('CSV export/import preserves commas and quoted text', () => {
  const text = toCsv(['name', 'notes'], [{ name: 'A, B Traders', notes: 'Said "paid"' }]);
  assert.deepEqual(parseCsv(text), [{ name: 'A, B Traders', notes: 'Said "paid"' }]);
});

test('CSV parser rejects malformed quoted input', () => {
  assert.throws(() => parseCsv('name\n"unclosed'));
});
