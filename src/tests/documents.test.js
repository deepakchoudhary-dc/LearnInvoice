import { test } from 'node:test';
import assert from 'node:assert/strict';
import { financialYear, nextNumber, calculateDocumentTotals, getDocumentStatus, newDraft, issueDocument, recordPayment, voidDocument, createCorrection, convertQuote } from '../../public/js/modules/documents.js';
import { getState } from '../../public/js/modules/state.js';

test('Document numbers use the Indian financial year and remain sequential', () => {
  const state = getState(); state.company.prefix = 'INV'; state.documents = [{ id: 'first', number: 'INV-2025-26-0009' }];
  assert.equal(financialYear('2026-03-31'), '2025-26'); assert.equal(financialYear('2026-04-01'), '2026-27');
  assert.equal(nextNumber('invoice', '2026-03-31'), 'INV-2025-26-0010'); assert.equal(nextNumber('invoice', '2026-04-01'), 'INV-2026-27-0001');
});

test('Document totals are paise-safe and status tracks payment state', () => {
  const state = getState(); state.company.taxId = ''; state.customers = [];
  const document = { id: 'doc', type: 'invoice', status: 'issued', dueDate: '2099-01-01', items: [{ description: 'Work', quantity: '1.125', rate: '99.99', discountRate: '0', taxRate: '18' }], payments: [] };
  const totals = calculateDocumentTotals(document); assert.equal(totals.subtotal, 11249); assert.equal(totals.tax, 2025); assert.equal(totals.total, 13274); assert.equal(getDocumentStatus(document), 'issued'); document.payments.push({ amountPaise: 100 }); assert.equal(getDocumentStatus(document), 'partial'); document.payments.push({ amountPaise: 13174 }); assert.equal(getDocumentStatus(document), 'paid');
});

test('Issued documents lock, payments cannot overpay, and corrections retain history', () => {
  const state = getState(); state.documents = []; state.customers = []; state.company.taxId = '';
  const invoice = newDraft({ customerId: 'walk-in', dueDate: '2099-01-01', items: [{ description: 'Service', hsn: '', quantity: '1', rate: '100.00', taxRate: '0', discountRate: '0' }] });
  invoice.customerId = ''; issueDocument(invoice); assert.equal(invoice.status, 'issued'); assert.ok(invoice.issuedSnapshot);
  recordPayment(invoice, { amount: '40.00' }); assert.equal(getDocumentStatus(invoice), 'partial'); assert.throws(() => recordPayment(invoice, { amount: '70.00' }));
  assert.throws(() => voidDocument(invoice, 'late'));
  const credit = createCorrection(invoice); assert.equal(credit.type, 'credit'); assert.equal(credit.linkedDocumentId, invoice.id);
  const quote = newDraft({ type: 'quote', items: invoice.items }); quote.status = 'quote'; const converted = convertQuote(quote); assert.equal(converted.type, 'invoice'); assert.equal(quote.convertedToId, converted.id);
});
