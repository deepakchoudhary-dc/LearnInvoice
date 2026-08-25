import { encryptData, decryptData, isVaultUnlocked } from './crypto.js';

export const DB_NAME = 'OfflineInvoiceDB';
const DB_VERSION = 3;
const STORE_NAMES = ['companies', 'customers', 'products', 'documents', 'expenses', 'recurring', 'audit', 'snapshots'];
let dbPromise;

function initDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        const transaction = event.currentTarget.transaction;

        // Create new stores if they do not exist
        for (const store of STORE_NAMES) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, { keyPath: 'id' });
          }
        }

        // Migrate 'business' to 'companies'
        if (db.objectStoreNames.contains('business')) {
          const oldBusinessStore = transaction.objectStore('business');
          const newCompaniesStore = transaction.objectStore('companies');
          oldBusinessStore.getAll().onsuccess = (e) => {
            const records = e.target.result;
            for (const rec of records) {
              newCompaniesStore.put(rec);
            }
          };
        }

        // Migrate 'invoices' to 'documents'
        if (db.objectStoreNames.contains('invoices')) {
          const oldInvoicesStore = transaction.objectStore('invoices');
          const newDocumentsStore = transaction.objectStore('documents');
          oldInvoicesStore.getAll().onsuccess = (e) => {
            const records = e.target.result;
            for (const rec of records) {
              newDocumentsStore.put(rec);
            }
          };
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onabort = () => reject(transaction.error || new Error('Database transaction aborted'));
    transaction.onerror = () => reject(transaction.error || new Error('Database transaction failed'));
  });
}

async function transact(storeName, mode, operation) {
  const db = await initDB();
  const tx = db.transaction(storeName, mode);
  const result = await operation(tx.objectStore(storeName));
  await transactionComplete(tx);
  return result;
}

export async function saveRecord(storeName, record) {
  if (!isVaultUnlocked()) throw new Error('Vault is locked');
  if (!record?.id) throw new Error('Records require an id');
  const payload = await encryptData(record);
  return transact(storeName, 'readwrite', (store) =>
    requestResult(store.put({ id: record.id, payload, updatedAt: Date.now() }))
  );
}

export async function getRecord(storeName, id) {
  if (!isVaultUnlocked()) throw new Error('Vault is locked');
  const record = await transact(storeName, 'readonly', (store) => requestResult(store.get(id)));
  return record?.payload ? decryptData(record.payload) : null;
}

export async function getAllRecords(storeName) {
  if (!isVaultUnlocked()) throw new Error('Vault is locked');
  const records = await transact(storeName, 'readonly', (store) => requestResult(store.getAll()));
  return Promise.all(
    records.filter((record) => record.payload).map((record) => decryptData(record.payload))
  );
}

export async function replaceRecords(storeName, records) {
  if (!isVaultUnlocked()) throw new Error('Vault is locked');
  const encrypted = await Promise.all(
    records.map(async (record) => ({
      id: record.id,
      payload: await encryptData(record),
      updatedAt: Date.now()
    }))
  );
  return transact(storeName, 'readwrite', async (store) => {
    await requestResult(store.clear());
    await Promise.all(encrypted.map((record) => requestResult(store.put(record))));
  });
}
