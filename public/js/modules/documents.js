import { getState } from './state.js';
import { calculateLineItem, toPaise, fromPaise } from './math.js';
import { determineTaxType, validateGSTIN } from './gst.js';

export function nextNumber(type = 'invoice') {
    const state = getState();
    const prefix = type === 'quote' ? 'QTE' : type === 'credit' ? 'CRN' : (state.company.prefix || 'INV');
    const year = new Date().getFullYear();
    const highest = state.documents
      .filter((doc) => doc.number.startsWith(prefix + '-' + year + '-'))
      .map((doc) => Number(doc.number.split('-').pop()) || 0)
      .reduce((max, value) => Math.max(max, value), 0);
    return prefix + '-' + year + '-' + String(highest + 1).padStart(4, '0');
}

export function newDraft(source = {}) {
    const state = getState();
    return {
      id: source.id || crypto.randomUUID(),
      type: source.type || 'invoice',
      number: source.number || nextNumber(source.type || 'invoice'),
      status: source.status || 'draft', // draft -> issued -> partial -> paid -> void
      customerId: source.customerId || '',
      issueDate: source.issueDate || new Date().toISOString().slice(0, 10),
      dueDate: source.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      currency: source.currency || state.company.currency || 'INR',
      notes: source.notes || '',
      terms: source.terms || 'Payment due within 30 days.',
      items: source.items ? JSON.parse(JSON.stringify(source.items)) : [],
      payments: source.payments ? JSON.parse(JSON.stringify(source.payments)) : []
    };
}

export function calculateDocumentTotals(document) {
    const state = getState();
    const customer = state.customers.find(c => c.id === document.customerId);
    
    let taxType = "UNKNOWN";
    if (customer && customer.taxId && state.company.taxId) {
        // Only determine tax type if both GSTINs are present (B2B)
        // If B2C, place of supply might default to customer state or company state
        const posCode = customer.placeOfSupply || customer.taxId.substring(0, 2);
        taxType = determineTaxType(state.company.taxId, posCode);
    }

    const multiplier = document.type === 'credit' ? -1 : 1;
    let subtotalPaise = 0;
    let totalTaxPaise = 0;
    
    const rows = document.items.map((item) => {
        // item.rate is string, item.quantity is string
        const calc = calculateLineItem(item.quantity, item.rate, item.discountRate, item.taxRate, item.isTaxInclusive);
        
        subtotalPaise += calc.taxablePaise;
        totalTaxPaise += calc.taxPaise;
        
        return { 
            ...item, 
            gross: calc.grossPaise * multiplier, 
            taxable: calc.taxablePaise * multiplier,
            taxAmount: calc.taxPaise * multiplier, 
            net: calc.netPaise * multiplier 
        };
    });
    
    const grandTotalPaise = subtotalPaise + totalTaxPaise;
    
    return { 
        rows, 
        taxType,
        subtotal: subtotalPaise * multiplier, 
        tax: totalTaxPaise * multiplier, 
        total: grandTotalPaise * multiplier 
    };
}

export function getDocumentStatus(document) {
    if (document.status === 'draft' || document.status === 'void' || document.type === 'quote') return document.status;
    
    const totals = calculateDocumentTotals(document);
    const totalPaidPaise = (document.payments || []).reduce((sum, p) => sum + p.amountPaise, 0);
    const outstandingPaise = totals.total - totalPaidPaise;
    
    if (outstandingPaise <= 0) return 'paid';
    if (totalPaidPaise > 0) return 'partial';
    
    const today = new Date().toISOString().slice(0, 10);
    return document.dueDate < today ? 'overdue' : 'issued';
}
