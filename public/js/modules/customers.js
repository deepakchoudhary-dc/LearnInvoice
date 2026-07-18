import { activeCompany, addAudit, getState } from './state.js';
import { validateGSTIN } from './gst.js';

export function normalizeCustomer(input = {}) {
  const customer = { id: input.id || crypto.randomUUID(), companyId: input.companyId || activeCompany().id, name: String(input.name || '').trim(), contactName: String(input.contactName || '').trim(), phone: String(input.phone || '').trim(), email: String(input.email || '').trim(), taxId: String(input.taxId || '').trim().toUpperCase(), billingAddress: String(input.billingAddress || input.address || '').trim(), shippingAddress: String(input.shippingAddress || '').trim(), placeOfSupply: String(input.placeOfSupply || '').trim(), paymentTermsDays: Number(input.paymentTermsDays || 30), creditLimitPaise: Number.isSafeInteger(input.creditLimitPaise) ? input.creditLimitPaise : 0, tags: Array.isArray(input.tags) ? input.tags.slice(0, 20) : [] };
  if (!customer.name) throw new Error('Customer name is required.');
  if (customer.taxId && !validateGSTIN(customer.taxId)) throw new Error('Customer GSTIN format is invalid.');
  if (!Number.isInteger(customer.paymentTermsDays) || customer.paymentTermsDays < 0 || customer.paymentTermsDays > 365) throw new Error('Payment terms must be between 0 and 365 days.');
  return customer;
}
export function customerOutstanding(customerId) { const state = getState(); return state.documents.filter((document) => document.customerId === customerId && !['draft', 'void'].includes(document.status)).reduce((sum, document) => sum + Math.max(0, (document.totalPaise || 0) - (document.paidPaise || 0)), 0); }
export function saveCustomer(input) { const state = getState(); const customer = normalizeCustomer(input); const index = state.customers.findIndex((entry) => entry.id === customer.id); if (index >= 0) state.customers[index] = customer; else state.customers.push(customer); addAudit(index >= 0 ? 'customer.updated' : 'customer.created', 'customer', customer.id, customer.name); return customer; }
