import { saveRecord, getRecord, getAllRecords } from './storage.js';
import { unlockVault, lockVault, isVaultUnlocked } from './crypto.js';

let state = {
    company: { name: 'My Business', email: '', phone: '', address: '', taxId: '', currency: 'INR', prefix: 'INV', bank: '' },
    customers: [],
    products: [],
    documents: [],
    payments: []
};

export async function initializeState(password) {
    await unlockVault(password);
    
    // Load from IndexedDB
    const company = await getRecord('business', 'profile');
    if (company) state.company = company;
    
    const customers = await getAllRecords('customers');
    if (customers.length) state.customers = customers;
    
    const products = await getAllRecords('products');
    if (products.length) state.products = products;
    
    const documents = await getAllRecords('invoices');
    if (documents.length) state.documents = documents;
    
    // Payments could be stored separately or within invoices. For now, keep in memory or create a store.
    // We'll store payments inside the invoice document object to keep it atomic.
}

export function getState() {
    return state;
}

export async function saveState() {
    if (!isVaultUnlocked()) throw new Error("Vault locked");
    
    // Save company
    await saveRecord('business', { id: 'profile', ...state.company });
    
    // Save customers (in a real app, only save what changed, but for simplicity we save all)
    for (const c of state.customers) {
        if (!c.id) c.id = crypto.randomUUID();
        await saveRecord('customers', c);
    }
    
    for (const p of state.products) {
        if (!p.id) p.id = crypto.randomUUID();
        await saveRecord('products', p);
    }
    
    for (const d of state.documents) {
        if (!d.id) d.id = crypto.randomUUID();
        await saveRecord('invoices', d);
    }
}
