import { getState } from './state.js';
import { validateGSTIN, validateHSNSAC } from './gst.js';
import { calculateDocumentTotals } from './documents.js';
import { customerOutstanding } from './customers.js';

export function validateInvoiceBeforeIssue(invoice) {
  const errors = [];
  const state = getState();

  if (invoice.status && invoice.status !== 'draft') {
    errors.push('Only draft documents can be issued.');
  }

  // Prevent duplicate document numbers per company and document type
  const isDuplicate = state.documents.some(
    (doc) => doc.id !== invoice.id && doc.number === invoice.number && doc.companyId === invoice.companyId
  );
  if (isDuplicate) {
    errors.push(`Duplicate document number: ${invoice.number} already exists.`);
  }

  if (!invoice.customerId) {
    errors.push('Customer must be selected.');
  }

  const customer = state.customers.find((entry) => entry.id === invoice.customerId);
  if (invoice.customerId && !customer) {
    errors.push('Invalid customer reference.');
  }

  if (!invoice.issueDate || !invoice.dueDate) {
    errors.push('Issue date and due date are required.');
  }

  if (invoice.issueDate && invoice.dueDate && invoice.dueDate < invoice.issueDate) {
    errors.push('Due date cannot be before issue date.');
  }

  if (state.company.taxId && !validateGSTIN(state.company.taxId)) {
    errors.push('Business GSTIN format is invalid.');
  }

  if (customer?.taxId && !validateGSTIN(customer.taxId)) {
    errors.push('Customer GSTIN format is invalid.');
  }

  if (!invoice.items?.length) {
    errors.push('Document must have at least one line item.');
  }

  for (const [index, item] of (invoice.items || []).entries()) {
    const line = index + 1;
    if (!String(item.description || '').trim()) {
      errors.push(`Line ${line}: description is required.`);
    }
    if (!Number.isInteger(item.quantityThousandths) || item.quantityThousandths <= 0) {
      errors.push(`Line ${line}: quantity must be greater than zero.`);
    }
    if (!Number.isInteger(item.ratePaise) || item.ratePaise < 0) {
      errors.push(`Line ${line}: rate must be a non-negative amount.`);
    }
    if (!Number.isInteger(item.taxRateBps) || item.taxRateBps < 0 || item.taxRateBps > 10000) {
      errors.push(`Line ${line}: tax rate must be between 0% and 100%.`);
    }
    if (!Number.isInteger(item.discountRateBps) || item.discountRateBps < 0 || item.discountRateBps > 10000) {
      errors.push(`Line ${line}: discount rate must be between 0% and 100%.`);
    }
    if (state.company.taxId && !validateHSNSAC(item.hsn)) {
      errors.push(`Line ${line}: a valid 4–8 digit HSN/SAC is required for GST documents.`);
    }
  }

  let docTotal = 0;
  try {
    const totals = calculateDocumentTotals(invoice);
    docTotal = totals.total;
    if (docTotal <= 0 && invoice.type !== 'credit') {
      errors.push('Document total must be greater than zero.');
    }
  } catch (error) {
    errors.push(error.message || 'Document amounts are invalid.');
  }

  // Credit limit enforcement
  if (customer && customer.creditLimitPaise > 0) {
    const outstanding = customerOutstanding(customer.id);
    if (outstanding + docTotal > customer.creditLimitPaise) {
      errors.push(
        `Issue blocked: Customer credit limit exceeded. Limit: ${(customer.creditLimitPaise / 100).toFixed(2)}, Outstanding + Current Document: ${((outstanding + docTotal) / 100).toFixed(2)}.`
      );
    }
  }

  return { isValid: errors.length === 0, errors };
}
