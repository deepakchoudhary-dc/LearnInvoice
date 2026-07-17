/**
 * Web Crypto API wrapper for AES-GCM encryption
 * Encrypts and decrypts data using a master password derived key (PBKDF2)
 */

const SALT_KEY = 'vault_salt';
const ITERATIONS = 100000;
const HASH = 'SHA-256';

// The key resides only in memory (RAM Key Pattern)
let sessionKey = null;

function getSalt() {
    let saltHex = localStorage.getItem(SALT_KEY);
    if (!saltHex) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(SALT_KEY, saltHex);
    }
    return new Uint8Array(saltHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
}

export async function unlockVault(password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        "PBKDF2",
        false,
        ["deriveBits", "deriveKey"]
    );
    
    sessionKey = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: getSalt(),
            iterations: ITERATIONS,
            hash: HASH
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
    );
    return true;
}

export function lockVault() {
    sessionKey = null;
}

export function isVaultUnlocked() {
    return sessionKey !== null;
}

export async function encryptData(dataObject) {
    if (!sessionKey) throw new Error("Vault is locked");
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encoded = enc.encode(JSON.stringify(dataObject));
    
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        sessionKey,
        encoded
    );
    
    // Concatenate IV and Ciphertext for storage
    const encryptedBlob = new Uint8Array(iv.length + ciphertext.byteLength);
    encryptedBlob.set(iv, 0);
    encryptedBlob.set(new Uint8Array(ciphertext), iv.length);
    
    return encryptedBlob;
}

export async function decryptData(encryptedBlob) {
    if (!sessionKey) throw new Error("Vault is locked");
    if (!(encryptedBlob instanceof Uint8Array)) throw new Error("Expected Uint8Array");
    
    const iv = encryptedBlob.slice(0, 12);
    const ciphertext = encryptedBlob.slice(12);
    
    try {
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: iv },
            sessionKey,
            ciphertext
        );
        const dec = new TextDecoder();
        return JSON.parse(dec.decode(decrypted));
    } catch (e) {
        throw new Error("Decryption failed. Incorrect password or corrupt data.");
    }
}
