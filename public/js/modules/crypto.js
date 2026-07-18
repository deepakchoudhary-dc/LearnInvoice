/** Web Crypto AES-GCM vault and independently password-encrypted backup helpers. */
const SALT_KEY = 'vault_salt';
const VAULT_ITERATIONS_KEY = 'vault_kdf_iterations';
const LEGACY_VAULT_ITERATIONS = 100000;
const ITERATIONS = 310000;
const HASH = 'SHA-256';
let sessionKey = null;

function bytesToBase64(bytes) {
  let output = '';
  for (let index = 0; index < bytes.length; index += 0x8000) output += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(output);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getVaultKdf() {
  let value = localStorage.getItem(SALT_KEY);
  let iterations = Number(localStorage.getItem(VAULT_ITERATIONS_KEY));
  if (!value) {
    value = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
    iterations = ITERATIONS;
    localStorage.setItem(SALT_KEY, value);
    localStorage.setItem(VAULT_ITERATIONS_KEY, String(iterations));
  } else if (!Number.isInteger(iterations) || iterations < 100000) {
    // Vaults created before KDF metadata used the original 100,000 iterations.
    iterations = LEGACY_VAULT_ITERATIONS;
    localStorage.setItem(VAULT_ITERATIONS_KEY, String(iterations));
  }
  return { salt: base64ToBytes(value), iterations };
}

async function deriveKey(password, salt, iterations = ITERATIONS) {
  if (typeof password !== 'string' || password.length < 12) throw new Error('Password must be at least 12 characters.');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: HASH }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function unlockVault(password) {
  const vaultKdf = getVaultKdf();
  sessionKey = await deriveKey(password, vaultKdf.salt, vaultKdf.iterations);
  return true;
}
export function lockVault() { sessionKey = null; }
export function isVaultUnlocked() { return sessionKey !== null; }

export async function encryptData(dataObject) {
  if (!sessionKey) throw new Error('Vault is locked');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, new TextEncoder().encode(JSON.stringify(dataObject)));
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv); packed.set(new Uint8Array(ciphertext), iv.length);
  return packed;
}

export async function decryptData(encryptedBlob) {
  if (!sessionKey) throw new Error('Vault is locked');
  const packed = encryptedBlob instanceof Uint8Array ? encryptedBlob : new Uint8Array(encryptedBlob);
  if (packed.length < 13) throw new Error('Encrypted record is corrupt.');
  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: packed.slice(0, 12) }, sessionKey, packed.slice(12));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch { throw new Error('Decryption failed. Incorrect password or corrupt data.'); }
}

export async function encryptBackup(dataObject, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(dataObject)));
  return { format: 'ledgerly-encrypted-backup', version: 1, kdf: { name: 'PBKDF2', hash: HASH, iterations: ITERATIONS }, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptBackup(envelope, password) {
  if (!envelope || envelope.format !== 'ledgerly-encrypted-backup' || envelope.version !== 1 || envelope.kdf?.name !== 'PBKDF2' || envelope.kdf?.hash !== HASH || !Number.isInteger(envelope.kdf?.iterations)) throw new Error('Unsupported or corrupt encrypted backup.');
  try {
    const key = await deriveKey(password, base64ToBytes(envelope.salt), envelope.kdf.iterations);
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(envelope.iv) }, key, base64ToBytes(envelope.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext));
  } catch { throw new Error('Backup could not be decrypted. Check the password or recovery copy.'); }
}
