import { getRecord, getAllRecords, replaceRecords } from './storage.js';
import { unlockVault, isVaultUnlocked } from './crypto.js';

const companyDefaults = () => ({
  id: crypto.randomUUID(),
  name: 'My Business',
  legalName: '',
  logo: '',
  signature: '',
  email: '',
  phone: '',
  address: '',
  city: '',
  pinCode: '',
  taxId: '',
  currency: 'INR',
  locale: 'en-IN',
  prefix: 'INV',
  bank: '',
  paymentDetails: '',
  terms: '',
  accentColor: '#16665d'
});

const defaultState = () => {
  const company = companyDefaults();
  return {
    activeCompanyId: company.id,
    companies: [company],
    company,
    customers: [],
    products: [],
    documents: [],
    expenses: [],
    recurringTemplates: [],
    audit: [],
    snapshots: [],
    settings: { language: 'en', lastSnapshotAt: 0 }
  };
};

let state = defaultState();

function hydrateBusiness(record) {
  if (record?.companies?.length) {
    state.companies = record.companies;
    state.activeCompanyId = record.activeCompanyId || record.companies[0].id;
  } else if (record?.name) {
    const company = { ...companyDefaults(), ...record, id: record.companyId || crypto.randomUUID() };
    state.companies = [company];
    state.activeCompanyId = company.id;
  }
  state.company = state.companies.find((company) => company.id === state.activeCompanyId) || state.companies[0];
}

export async function initializeState(password) {
  await unlockVault(password);
  state = defaultState();
  const [business, customers, products, documents, expenses, recurringTemplates, audit, snapshots] = await Promise.all([
    getRecord('companies', 'profile'),
    getAllRecords('customers'),
    getAllRecords('products'),
    getAllRecords('documents'),
    getAllRecords('expenses'),
    getAllRecords('recurring'),
    getAllRecords('audit'),
    getAllRecords('snapshots')
  ]);

  hydrateBusiness(business);

  // Map and upgrade customers to stable contracts
  state.customers = (customers || []).map(cust => {
    let creditLimitPaise = cust.creditLimitPaise;
    if (creditLimitPaise === undefined && cust.creditLimit !== undefined) {
      creditLimitPaise = Math.round(Number(cust.creditLimit || 0) * 100);
    }
    return {
      id: cust.id || crypto.randomUUID(),
      companyId: cust.companyId || state.activeCompanyId,
      name: String(cust.name || '').trim(),
      contactName: String(cust.contactName || '').trim(),
      phone: String(cust.phone || '').trim(),
      email: String(cust.email || '').trim(),
      taxId: String(cust.taxId || '').trim().toUpperCase(),
      billingAddress: String(cust.billingAddress || cust.address || '').trim(),
      shippingAddress: String(cust.shippingAddress || '').trim(),
      placeOfSupply: String(cust.placeOfSupply || '').trim(),
      paymentTermsDays: Number(cust.paymentTermsDays || 30),
      creditLimitPaise: Number(creditLimitPaise || 0),
      tags: Array.isArray(cust.tags) ? cust.tags : []
    };
  });

  // Map and upgrade products to stable contracts
  state.products = (products || []).map(prod => {
    let pricePaise = prod.pricePaise;
    if (pricePaise === undefined && prod.price !== undefined) {
      pricePaise = Math.round(Number(prod.price || 0) * 100);
    }
    let taxRateBps = prod.taxRateBps;
    if (taxRateBps === undefined && prod.taxRate !== undefined) {
      taxRateBps = Math.round(Number(prod.taxRate || 0) * 100);
    }
    let stockQuantityThousandths = prod.stockQuantityThousandths;
    if (stockQuantityThousandths === undefined && prod.stockQuantity !== undefined) {
      stockQuantityThousandths = Math.round(Number(prod.stockQuantity || 0) * 1000);
    }
    let reorderLevelThousandths = prod.reorderLevelThousandths;
    if (reorderLevelThousandths === undefined && prod.reorderLevel !== undefined) {
      reorderLevelThousandths = Math.round(Number(prod.reorderLevel || 0) * 1000);
    }
    return {
      id: prod.id || crypto.randomUUID(),
      companyId: prod.companyId || state.activeCompanyId,
      name: String(prod.name || '').trim(),
      sku: String(prod.sku || '').trim(),
      barcode: String(prod.barcode || '').trim(),
      hsn: String(prod.hsn || '').trim(),
      unit: String(prod.unit || 'NOS').trim(),
      pricePaise: Number(pricePaise || 0),
      taxRateBps: Number(taxRateBps || 1800),
      isService: Boolean(prod.isService),
      trackStock: Boolean(prod.trackStock),
      stockQuantityThousandths: Number(stockQuantityThousandths || 0),
      reorderLevelThousandths: Number(reorderLevelThousandths || 0)
    };
  });

  // Map and upgrade documents to stable contracts
  state.documents = (documents || []).map(doc => {
    const items = (doc.items || []).map(item => {
      let quantityThousandths = item.quantityThousandths;
      if (quantityThousandths === undefined && item.quantity !== undefined) {
        quantityThousandths = Math.round(Number(item.quantity || 0) * 1000);
      }
      let ratePaise = item.ratePaise;
      if (ratePaise === undefined && item.rate !== undefined) {
        ratePaise = Math.round(Number(item.rate || 0) * 100);
      }
      let discountRateBps = item.discountRateBps;
      if (discountRateBps === undefined && item.discountRate !== undefined) {
        discountRateBps = Math.round(Number(item.discountRate || 0) * 100);
      }
      let taxRateBps = item.taxRateBps;
      if (taxRateBps === undefined && item.taxRate !== undefined) {
        taxRateBps = Math.round(Number(item.taxRate || 0) * 100);
      }
      return {
        id: item.id || crypto.randomUUID(),
        productId: item.productId || '',
        description: String(item.description || '').trim(),
        hsn: String(item.hsn || '').trim(),
        quantityThousandths: Number(quantityThousandths || 0),
        ratePaise: Number(ratePaise || 0),
        discountRateBps: Number(discountRateBps || 0),
        taxRateBps: Number(taxRateBps || 0),
        isService: Boolean(item.isService)
      };
    });

    const payments = (doc.payments || []).map(p => {
      let amountPaise = p.amountPaise;
      if (amountPaise === undefined && p.amount !== undefined) {
        amountPaise = Math.round(Number(p.amount || 0) * 100);
      }
      return {
        id: p.id || crypto.randomUUID(),
        amountPaise: Number(amountPaise || 0),
        date: p.date || new Date().toISOString().slice(0, 10),
        method: p.method || 'cash',
        reference: p.reference || '',
        auditMetadata: p.auditMetadata || { at: new Date().toISOString() }
      };
    });

    let documentDiscountRateBps = doc.documentDiscountRateBps;
    if (documentDiscountRateBps === undefined && doc.documentDiscountRate !== undefined) {
      documentDiscountRateBps = Math.round(Number(doc.documentDiscountRate || 0) * 100);
    }
    let shippingPaise = doc.shippingPaise;
    if (shippingPaise === undefined && doc.shipping !== undefined) {
      shippingPaise = Math.round(Number(doc.shipping || 0) * 100);
    }

    return {
      id: doc.id || crypto.randomUUID(),
      companyId: doc.companyId || state.activeCompanyId,
      type: doc.type || 'invoice',
      number: doc.number || '',
      status: doc.status || 'draft',
      customerId: doc.customerId || '',
      customerSnapshot: doc.customerSnapshot || null,
      issueDate: doc.issueDate || '',
      dueDate: doc.dueDate || '',
      currency: doc.currency || 'INR',
      locale: doc.locale || 'en-IN',
      pricingMode: doc.pricingMode || 'exclusive',
      documentDiscountRateBps: Number(documentDiscountRateBps || 0),
      shippingPaise: Number(shippingPaise || 0),
      roundOffPaise: Number(doc.roundOffPaise || 0),
      advancePaidPaise: Number(doc.advancePaidPaise || 0),
      notes: doc.notes || '',
      terms: doc.terms || '',
      items,
      payments,
      history: doc.history || [],
      linkedDocumentId: doc.linkedDocumentId || '',
      reverseCharge: Boolean(doc.reverseCharge),
      supplyType: doc.supplyType || 'B2B',
      ewayBill: doc.ewayBill || {},
      irpMetadata: doc.irpMetadata || null,
      tags: Array.isArray(doc.tags) ? doc.tags : []
    };
  });

  // Map expenses
  state.expenses = (expenses || []).map(exp => {
    let amountPaise = exp.amountPaise;
    if (amountPaise === undefined && exp.amount !== undefined) {
      amountPaise = Math.round(Number(exp.amount || 0) * 100);
    }
    return {
      id: exp.id || crypto.randomUUID(),
      companyId: exp.companyId || state.activeCompanyId,
      date: exp.date || '',
      category: exp.category || 'General',
      vendor: exp.vendor || '',
      notes: exp.notes || '',
      amountPaise: Number(amountPaise || 0)
    };
  });

  // Map recurring templates
  state.recurringTemplates = (recurringTemplates || []).map(rec => {
    const items = (rec.items || []).map(item => {
      let quantityThousandths = item.quantityThousandths;
      if (quantityThousandths === undefined && item.quantity !== undefined) {
        quantityThousandths = Math.round(Number(item.quantity || 0) * 1000);
      }
      let ratePaise = item.ratePaise;
      if (ratePaise === undefined && item.rate !== undefined) {
        ratePaise = Math.round(Number(item.rate || 0) * 100);
      }
      let taxRateBps = item.taxRateBps;
      if (taxRateBps === undefined && item.taxRate !== undefined) {
        taxRateBps = Math.round(Number(item.taxRate || 0) * 100);
      }
      let discountRateBps = item.discountRateBps;
      if (discountRateBps === undefined && item.discountRate !== undefined) {
        discountRateBps = Math.round(Number(item.discountRate || 0) * 100);
      }
      return {
        id: item.id || crypto.randomUUID(),
        productId: item.productId || '',
        description: String(item.description || '').trim(),
        hsn: String(item.hsn || '').trim(),
        quantityThousandths: Number(quantityThousandths || 0),
        ratePaise: Number(ratePaise || 0),
        discountRateBps: Number(discountRateBps || 0),
        taxRateBps: Number(taxRateBps || 0),
        isService: Boolean(item.isService)
      };
    });
    return {
      id: rec.id || crypto.randomUUID(),
      companyId: rec.companyId || state.activeCompanyId,
      name: rec.name || '',
      frequency: rec.frequency || 'monthly',
      nextDate: rec.nextDate || '',
      customerId: rec.customerId || '',
      items,
      notes: rec.notes || '',
      terms: rec.terms || '',
      active: rec.active !== false
    };
  });

  // Map audit
  state.audit = (audit || []).map(evt => ({
    id: evt.id || crypto.randomUUID(),
    companyId: evt.companyId || state.activeCompanyId,
    at: evt.at || new Date().toISOString(),
    action: evt.action || '',
    entityType: evt.entityType || '',
    entityId: evt.entityId || '',
    details: evt.details || ''
  }));

  state.snapshots = snapshots || [];
}

export function getState() {
  return state;
}

export function activeCompany() {
  return state.company;
}

export function setActiveCompany(companyId) {
  const company = state.companies.find((entry) => entry.id === companyId);
  if (!company) throw new Error('Company not found.');
  state.activeCompanyId = companyId;
  state.company = company;
}

export function scopeForCompany(records) {
  return records.filter((record) => !record.companyId || record.companyId === state.activeCompanyId);
}

export function addAudit(action, entityType, entityId, details = '') {
  state.audit.unshift({
    id: crypto.randomUUID(),
    companyId: state.activeCompanyId,
    at: new Date().toISOString(),
    action,
    entityType,
    entityId,
    details: String(details).slice(0, 500)
  });
  state.audit = state.audit.slice(0, 5000);
}

export async function saveState() {
  if (!isVaultUnlocked()) throw new Error('Vault locked');

  // Enforce company ID and valid UUIDs
  for (const collection of [
    state.customers,
    state.products,
    state.documents,
    state.expenses,
    state.recurringTemplates,
    state.audit,
    state.snapshots
  ]) {
    for (const record of collection) {
      if (!record.id) record.id = crypto.randomUUID();
      if (!record.companyId) record.companyId = state.activeCompanyId;
    }
  }

  await Promise.all([
    replaceRecords('companies', [
      { id: 'profile', activeCompanyId: state.activeCompanyId, companies: state.companies, settings: state.settings }
    ]),
    replaceRecords('customers', state.customers),
    replaceRecords('products', state.products),
    replaceRecords('documents', state.documents),
    replaceRecords('expenses', state.expenses),
    replaceRecords('recurring', state.recurringTemplates),
    replaceRecords('audit', state.audit),
    replaceRecords('snapshots', state.snapshots)
  ]);
}

export async function snapshot(reason = 'automatic') {
  const now = Date.now();
  if (now - (state.settings.lastSnapshotAt || 0) < 60000) return;
  state.snapshots.unshift({
    id: crypto.randomUUID(),
    at: new Date(now).toISOString(),
    reason,
    companyId: state.activeCompanyId,
    documents: structuredClone(state.documents),
    customers: structuredClone(state.customers),
    products: structuredClone(state.products)
  });
  state.snapshots = state.snapshots.slice(0, 12);
  state.settings.lastSnapshotAt = now;
}
