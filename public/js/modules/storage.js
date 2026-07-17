/**
 * IndexedDB wrapper for local storage
 * All data inserted or retrieved is passed through the Crypto module if the vault is locked/unlocked
 */
import { encryptData, decryptData, isVaultUnlocked } from './crypto.js';

const DB_NAME = 'OfflineInvoiceDB';
const DB_VERSION = 1;

let dbPromise = null;

function initDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Create stores
                if (!db.objectStoreNames.contains('business')) db.createObjectStore('business', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('customers')) db.createObjectStore('customers', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('products')) db.createObjectStore('products', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('invoices')) db.createObjectStore('invoices', { keyPath: 'id' });
            };
            
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }
    return dbPromise;
}

async function performTransaction(storeName, mode, callback) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = (event) => reject(event.target.error);
        
        result = callback(store);
    });
}

export async function saveRecord(storeName, record) {
    if (!isVaultUnlocked()) throw new Error("Vault is locked");
    
    // The ID must be unencrypted so IndexedDB can index it, the payload is encrypted
    const encryptedPayload = await encryptData(record);
    const dbRecord = {
        id: record.id,
        payload: encryptedPayload,
        updatedAt: Date.now()
    };
    
    return performTransaction(storeName, 'readwrite', (store) => {
        return store.put(dbRecord);
    });
}

export async function getRecord(storeName, id) {
    if (!isVaultUnlocked()) throw new Error("Vault is locked");
    
    return performTransaction(storeName, 'readonly', (store) => {
        const request = store.get(id);
        request.onsuccess = async () => {
            if (request.result && request.result.payload) {
                try {
                    request.result.data = await decryptData(request.result.payload);
                } catch(e) {
                    console.error("Failed to decrypt record", id);
                }
            }
        };
        return request;
    }).then(request => request.result ? request.result.data : null);
}

export async function getAllRecords(storeName) {
    if (!isVaultUnlocked()) throw new Error("Vault is locked");
    
    const records = await performTransaction(storeName, 'readonly', (store) => {
        return new Promise((resolve, reject) => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    });
    
    const decryptedRecords = [];
    for (const record of records) {
        if (record.payload) {
            try {
                const data = await decryptData(record.payload);
                decryptedRecords.push(data);
            } catch(e) {
                console.error("Failed to decrypt a record in", storeName);
            }
        }
    }
    return decryptedRecords;
}
