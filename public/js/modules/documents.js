import { activeCompany, addAudit, getState } from './state.js';
import { calculateLineItem, toPaise, toBps, toThousandths } from './invoice-calculations.js';
import { determineTaxType } from './gst.js';

const DOCUMENT_PREFIXES = {
  invoice: 'INV',
  quote: 'QTE',
  proforma: 'PRO',
  challan: 'DCH',
  credit: 'CRN',
  debit: 'DBN',
  billOfSupply: 'BOS',
  export: 'EXP',
  receipt: 'RCT'
};

const MONEY_DOCUMENT_TYPES = new Set(['invoice', 'credit', 'debit', 'billOfSupply', 'export', 'receipt']);

export function financialYear(date = new Date()) {
  const value = typeof date === 'string' ? new Date(`${date}T00:00:00`) : date;
  if (Number.isNaN(value.getTime())) throw new TypeError('Invalid document date');
  const start = value.getMonth() >= 3 ? value.getFullYear() : value.getFullYear() - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function nextNumber(type = 'invoice', issueDate = new Date().toISOString().slice(0, 10)) {
  const company = activeCompany();
  const prefix = type === 'invoice' ? (company.prefix || 'INV') : (DOCUMENT_PREFIXES[type] || 'INV');
  const year = financialYear(issueDate);
  const matcher = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-${year}-(\\d+)$`);
  
  const highest = getState().documents
    .filter((doc) => !doc.companyId || doc.companyId === company.id)
    .reduce((max, doc) => {
      const match = String(doc.number || '').match(matcher);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);

  return `${prefix}-${year}-${String(highest + 1).padStart(4, '0')}`;
}

export function newDraft(source = {}) {
  const company = activeCompany();
  const issueDate = source.issueDate || new Date().toISOString().slice(0, 10);
  
  // Format items into clean integer values
  const items = (source.items || []).map(item => ({
    id: item.id || crypto.randomUUID(),
    productId: item.productId || '',
    description: String(item.description || '').trim(),
    hsn: String(item.hsn || '').trim(),
    quantityThousandths: Number.isSafeInteger(item.quantityThousandths) ? item.quantityThousandths : toThousandths(item.quantity || 1),
    ratePaise: Number.isSafeInteger(item.ratePaise) ? item.ratePaise : toPaise(item.rate || 0),
    discountRateBps: Number.isSafeInteger(item.discountRateBps) ? item.discountRateBps : toBps(item.discountRate || 0),
    taxRateBps: Number.isSafeInteger(item.taxRateBps) ? item.taxRateBps : toBps(item.taxRate || 18),
    isService: Boolean(item.isService)
  }));

  // Handle document level discount, shipping, round-off, advance
  const documentDiscountRateBps = Number.isSafeInteger(source.documentDiscountRateBps) 
    ? source.documentDiscountRateBps 
    : toBps(source.documentDiscountRate || 0);

  const shippingPaise = Number.isSafeInteger(source.shippingPaise) 
    ? source.shippingPaise 
    : toPaise(source.shipping || 0);

  const roundOffPaise = Number.isSafeInteger(source.roundOffPaise) ? source.roundOffPaise : 0;
  const advancePaidPaise = Number.isSafeInteger(source.advancePaidPaise) ? source.advancePaidPaise : 0;

  return {
    id: source.id || crypto.randomUUID(),
    companyId: source.companyId || company.id,
    type: source.type || 'invoice',
    number: source.number || nextNumber(source.type || 'invoice', issueDate),
    status: source.status || 'draft',
    customerId: source.customerId || '',
    customerSnapshot: source.customerSnapshot || null,
    issueDate,
    dueDate: source.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    currency: source.currency || company.currency || 'INR',
    locale: source.locale || company.locale || 'en-IN',
    pricingMode: source.pricingMode || 'exclusive',
    notes: source.notes || '',
    terms: source.terms || company.terms || 'Payment due within 30 days.',
    items,
    payments: source.payments ? structuredClone(source.payments) : [],
    documentDiscountRateBps,
    shippingPaise,
    roundOffPaise,
    advancePaidPaise,
    reverseCharge: Boolean(source.reverseCharge),
    supplyType: source.supplyType || 'B2B',
    ewayBill: source.ewayBill || {},
    linkedDocumentId: source.linkedDocumentId || '',
    irpMetadata: source.irpMetadata || null,
    tags: Array.isArray(source.tags) ? source.tags : []
  };
}

export function calculateDocumentTotals(document) {
  const state = getState();
  const company = state.companies.find((entry) => entry.id === document.companyId) || activeCompany();
  const customer = state.customers.find((entry) => entry.id === document.customerId);
  const place = document.placeOfSupply || customer?.placeOfSupply || customer?.taxId?.slice(0, 2) || '';
  const taxType = determineTaxType(company.taxId, place);
  const creditMultiplier = document.type === 'credit' ? -1 : 1;

  let subtotal = 0;
  let tax = 0;
  const taxBreakdown = {};

  const rows = (document.items || []).map((item) => {
    const qtyThousandths = item.quantityThousandths !== undefined ? item.quantityThousandths : toThousandths(item.quantity);
    const ratePaise = item.ratePaise !== undefined ? item.ratePaise : toPaise(item.rate);
    const discBps = item.discountRateBps !== undefined ? item.discountRateBps : toBps(item.discountRate || 0);
    const taxBps = item.taxRateBps !== undefined ? item.taxRateBps : toBps(item.taxRate || 0);

    const calculated = calculateLineItem(
      qtyThousandths,
      ratePaise,
      discBps,
      taxBps,
      document.pricingMode === 'inclusive'
    );

    subtotal += calculated.taxablePaise;
    tax += calculated.taxPaise;

    const rateKey = String(taxBps);
    const bucket = taxBreakdown[rateKey] || { taxablePaise: 0, taxPaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
    bucket.taxablePaise += calculated.taxablePaise;
    bucket.taxPaise += calculated.taxPaise;

    if (taxType === 'INTRA_STATE') {
      bucket.cgstPaise += Math.floor(calculated.taxPaise / 2);
      bucket.sgstPaise += calculated.taxPaise - Math.floor(calculated.taxPaise / 2);
    } else if (taxType === 'INTER_STATE') {
      bucket.igstPaise += calculated.taxPaise;
    }
    taxBreakdown[rateKey] = bucket;

    return {
      ...item,
      grossPaise: calculated.grossPaise * creditMultiplier,
      discountPaise: calculated.discountPaise * creditMultiplier,
      taxablePaise: calculated.taxablePaise * creditMultiplier,
      taxPaise: calculated.taxPaise * creditMultiplier,
      lineTotalPaise: calculated.netPaise * creditMultiplier
    };
  });

  const docDiscountRateBps = document.documentDiscountRateBps !== undefined 
    ? document.documentDiscountRateBps 
    : toBps(document.documentDiscountRate || 0);

  const documentDiscountPaise = Math.round(
    subtotal * Math.max(0, Math.min(10000, Number(docDiscountRateBps || 0))) / 10000
  );
  
  const shipping = document.shippingPaise !== undefined 
    ? document.shippingPaise 
    : toPaise(document.shipping || 0);

  const roundOff = Number.isSafeInteger(document.roundOffPaise) ? document.roundOffPaise : 0;
  const total = subtotal - documentDiscountPaise + tax + shipping + roundOff;

  return {
    rows,
    taxType,
    taxBreakdown,
    subtotal: subtotal * creditMultiplier,
    documentDiscountPaise: documentDiscountPaise * creditMultiplier,
    tax: tax * creditMultiplier,
    shippingPaise: shipping * creditMultiplier,
    roundOffPaise: roundOff * creditMultiplier,
    total: total * creditMultiplier
  };
}

export function paidAmountPaise(document) {
  return (document.payments || []).reduce(
    (sum, payment) => sum + (Number.isSafeInteger(payment.amountPaise) ? payment.amountPaise : 0),
    Number.isSafeInteger(document.advancePaidPaise) ? document.advancePaidPaise : 0
  );
}

export function getDocumentStatus(document) {
  if (document.status === 'draft' || document.status === 'void') return document.status;
  if (!['invoice', 'credit', 'debit', 'billOfSupply', 'export', 'receipt'].includes(document.type)) {
    return document.status;
  }
  const outstanding = calculateDocumentTotals(document).total - paidAmountPaise(document);
  if (outstanding <= 0) return 'paid';
  if (paidAmountPaise(document) > 0) return 'partial';
  return document.dueDate < new Date().toISOString().slice(0, 10) ? 'overdue' : 'issued';
}

export function issueDocument(document) {
  if (document.status !== 'draft') throw new Error('Only draft documents can be issued.');
  const state = getState();
  const totals = calculateDocumentTotals(document);
  const customer = state.customers.find((entry) => entry.id === document.customerId);

  // Capture customer details snapshot at issuance to ensure historical audit integrity
  document.customerSnapshot = customer ? { ...customer } : null;

  document.status = ['quote', 'proforma', 'challan'].includes(document.type) ? document.type : 'issued';
  document.issuedAt = new Date().toISOString();
  
  // Enforce duplicate check at issuance
  const isDuplicate = state.documents.some(
    (doc) => doc.id !== document.id && doc.number === document.number && doc.companyId === document.companyId
  );
  if (isDuplicate) {
    throw new Error(`Duplicate document number: ${document.number} already exists.`);
  }

  // Create immutable snapshot
  document.issuedSnapshot = structuredClone({ ...document, totals });
  document.totalPaise = totals.total;
  document.paidPaise = paidAmountPaise(document);

  addAudit('document.issued', 'document', document.id, document.number);
  return document;
}

export function recordPayment(document, payment) {
  const currentStatus = getDocumentStatus(document);
  if (!['issued', 'partial', 'overdue'].includes(currentStatus)) {
    throw new Error('Payments can only be recorded against issued open documents.');
  }

  const amountPaise = Number.isSafeInteger(payment.amountPaise) ? payment.amountPaise : toPaise(payment.amount || 0);
  const outstanding = calculateDocumentTotals(document).total - paidAmountPaise(document);

  if (amountPaise <= 0 || amountPaise > outstanding) {
    throw new Error('Payment must be positive and cannot exceed the outstanding balance.');
  }

  document.payments.push({
    id: crypto.randomUUID(),
    amountPaise,
    date: payment.date || new Date().toISOString().slice(0, 10),
    method: String(payment.method || 'cash'),
    reference: String(payment.reference || ''),
    auditMetadata: { at: new Date().toISOString() }
  });

  document.paidPaise = paidAmountPaise(document);
  addAudit('payment.recorded', 'document', document.id, `${amountPaise / 100} amount recorded`);
  return document;
}

export function voidDocument(document, reason) {
  if (document.status !== 'issued' || paidAmountPaise(document) > 0) {
    throw new Error('Only unpaid issued documents can be voided. Use a credit/debit note for corrections.');
  }
  if (!String(reason || '').trim()) {
    throw new Error('A void reason is required.');
  }
  document.status = 'void';
  document.voidedAt = new Date().toISOString();
  document.voidReason = String(reason).trim();
  addAudit('document.voided', 'document', document.id, document.voidReason);
  return document;
}

export function createCorrection(source, type = 'credit') {
  if (!source.issuedAt) throw new Error('Only issued documents can be corrected.');
  const correction = newDraft({
    type,
    customerId: source.customerId,
    currency: source.currency,
    items: source.items,
    linkedDocumentId: source.id,
    notes: `Correction for ${source.number}`
  });
  addAudit('document.correction.created', 'document', correction.id, source.number);
  return correction;
}

export function convertQuote(quote) {
  if (!['quote', 'proforma'].includes(quote.type) || quote.status === 'void') {
    throw new Error('Only an active quotation or proforma can be converted.');
  }
  const invoice = newDraft({
    type: 'invoice',
    customerId: quote.customerId,
    currency: quote.currency,
    items: quote.items,
    notes: quote.notes,
    terms: quote.terms,
    linkedDocumentId: quote.id
  });
  quote.convertedToId = invoice.id;
  addAudit('quote.converted', 'document', quote.id, invoice.number);
  return invoice;
}

export function isMoneyDocument(document) {
  return MONEY_DOCUMENT_TYPES.has(document.type);
}
