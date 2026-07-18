import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encryptBackup, decryptBackup } from '../../public/js/modules/crypto.js';

test('Encrypted backup round-trip requires the correct password', async () => {
  const original = { company: { name: 'Local Shop' }, documents: [] };
  const envelope = await encryptBackup(original, 'correct horse battery staple');
  assert.equal(envelope.format, 'ledgerly-encrypted-backup');
  assert.ok(!JSON.stringify(envelope).includes('Local Shop'));
  assert.deepEqual(await decryptBackup(envelope, 'correct horse battery staple'), original);
  await assert.rejects(() => decryptBackup(envelope, 'wrong password'));
});
