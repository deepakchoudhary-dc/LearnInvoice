import { getState, saveState, addAudit, scopeForCompany, activeCompany } from '../state.js';
import { 
  money, percent, quantity, createTable, button, select, field, escapeHtml, chooseFile 
} from './shared.js';
import { 
  newDraft, calculateDocumentTotals, getDocumentStatus, issueDocument, recordPayment, voidDocument, 
  createCorrection, convertQuote, paidAmountPaise 
} from '../documents.js';
import { toPaise, toBps, toThousandths, fromPaise, fromBps, fromThousandths } from '../invoice-calculations.js';
import { validateInvoiceBeforeIssue } from '../validation.js';
import { exportIRPDraft, importIRPResponse } from '../backup.js';
import { generateQrSvg } from '../qrcode.js';

let activeDraft = null;
let registerPageNum = 1;
const registerPageSize = 15;

// Filters state
const filterState = {
  type: '',
  status: '',
  customerId: '',
  dateFrom: '',
  dateTo: '',
  search: ''
};

export function getActiveDraft() {
  return activeDraft;
}

export function setActiveDraft(draft) {
  activeDraft = draft;
}

export function renderDocuments() {
  const container = document.getElementById('page-documents');
  if (!container) return;

  // Build filter widgets
  const customers = scopeForCompany(getState().customers);
  const customerChoices = [['', 'All Customers'], ...customers.map(c => [c.id, c.name])];
  const typeChoices = [
    ['', 'All Types'],
    ['invoice', 'Invoice'],
    ['quote', 'Quotation'],
    ['proforma', 'Proforma'],
    ['challan', 'Delivery Challan'],
    ['credit', 'Credit Note'],
    ['debit', 'Debit Note'],
    ['billOfSupply', 'Bill of Supply'],
    ['export', 'Export Invoice'],
    ['receipt', 'POS Receipt']
  ];
  const statusChoices = [
    ['', 'All Statuses'],
    ['draft', 'Draft'],
    ['issued', 'Issued'],
    ['partial', 'Partial'],
    ['paid', 'Paid'],
    ['overdue', 'Overdue'],
    ['void', 'Void']
  ];

  const filterHtml = `
    <div class="panel no-print">
      <h3>Search & Filters</h3>
      <div class="grid four">
        ${select('Document Type', 'filter-type', typeChoices, filterState.type)}
        ${select('Status', 'filter-status', statusChoices, filterState.status)}
        ${select('Customer', 'filter-customer', customerChoices, filterState.customerId)}
        ${field('Search by Number', 'filter-search', filterState.search, 'text', 'placeholder="e.g. INV-2026-27-0001"')}
        ${field('Date From', 'filter-from', filterState.dateFrom, 'date')}
        ${field('Date To', 'filter-to', filterState.dateTo, 'date')}
      </div>
    </div>
  `;

  // Get matching documents
  let docs = scopeForCompany(getState().documents);
  
  if (filterState.type) docs = docs.filter(d => d.type === filterState.type);
  if (filterState.status) docs = docs.filter(d => getDocumentStatus(d) === filterState.status);
  if (filterState.customerId) docs = docs.filter(d => d.customerId === filterState.customerId);
  if (filterState.dateFrom) docs = docs.filter(d => d.issueDate >= filterState.dateFrom);
  if (filterState.dateTo) docs = docs.filter(d => d.issueDate <= filterState.dateTo);
  if (filterState.search) {
    const term = filterState.search.toLowerCase();
    docs = docs.filter(d => String(d.number).toLowerCase().includes(term));
  }

  // Sorting: newest first
  docs.sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number));

  // Pagination
  const totalCount = docs.length;
  const totalPages = Math.ceil(totalCount / registerPageSize) || 1;
  if (registerPageNum > totalPages) registerPageNum = totalPages;
  const startIdx = (registerPageNum - 1) * registerPageSize;
  const pagedDocs = docs.slice(startIdx, startIdx + registerPageSize);

  const tableHtml = renderDocsTable(pagedDocs);

  const paginationHtml = totalPages > 1 ? `
    <div class="panel-head no-print" style="margin-top: 10px;">
      <div>Showing ${startIdx + 1} to ${Math.min(startIdx + registerPageSize, totalCount)} of ${totalCount} records</div>
      <div class="actions-row">
        <button class="button small" id="prev-register-page" ${registerPageNum === 1 ? 'disabled' : ''}>Previous</button>
        <span>Page ${registerPageNum} of ${totalPages}</span>
        <button class="button small" id="next-register-page" ${registerPageNum === totalPages ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  ` : '';

  container.innerHTML = `
    <section class="panel">
      <div class="panel-head no-print">
        <h2>Document Register</h2>
        ${button('New Document', 'new-document', '', 'primary')}
      </div>
      ${filterHtml}
      ${tableHtml}
      ${paginationHtml}
    </section>
  `;

  // Attach filter event listeners
  const bindFilter = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', (e) => {
      filterState[key] = e.target.value;
      registerPageNum = 1;
      renderDocuments();
    });
  };

  bindFilter('filter-type', 'type');
  bindFilter('filter-status', 'status');
  bindFilter('filter-customer', 'customerId');
  bindFilter('filter-from', 'dateFrom');
  bindFilter('filter-to', 'dateTo');

  const searchEl = document.getElementById('filter-search');
  if (searchEl) {
    searchEl.addEventListener('input', (e) => {
      filterState.search = e.target.value;
      registerPageNum = 1;
      renderDocuments();
    });
  }

  const prevBtn = document.getElementById('prev-register-page');
  const nextBtn = document.getElementById('next-register-page');
  if (prevBtn) prevBtn.addEventListener('click', () => { registerPageNum--; renderDocuments(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { registerPageNum++; renderDocuments(); });
}

function renderDocsTable(documents) {
  if (!documents.length) {
    return '<div class="empty">No documents match the current filters.</div>';
  }

  const rows = documents.map((doc) => {
    const customer = getState().customers.find((c) => c.id === doc.customerId);
    const totals = calculateDocumentTotals(doc);
    const status = getDocumentStatus(doc);

    return `<tr>
      <td>${escapeHtml(doc.number)}</td>
      <td><span class="badge ${escapeHtml(doc.type)}">${escapeHtml(doc.type)}</span></td>
      <td>${escapeHtml(customer?.name || 'Walk-in Customer')}</td>
      <td><span class="badge ${escapeHtml(status)}">${escapeHtml(status)}</span></td>
      <td>${money(totals.total, doc.currency)}</td>
      <td>
        ${button('Open', 'open-document', doc.id)}
        ${status === 'draft' ? button('Issue', 'issue-document', doc.id, 'primary') : ''}
        ${['issued', 'partial', 'overdue'].includes(status) ? button('Record Payment', 'record-payment-trigger', doc.id) : ''}
        ${status === 'issued' ? button('Void', 'void-document-trigger', doc.id, 'danger') : ''}
      </td>
    </tr>`;
  }).join('');

  return createTable(['Number', 'Type', 'Customer', 'Status', 'Total', 'Actions'], rows);
}

export function renderInvoice() {
  if (!activeDraft) {
    activeDraft = newDraft();
  }

  const totals = calculateDocumentTotals(activeDraft);
  const readonly = activeDraft.status !== 'draft';
  
  const customers = scopeForCompany(getState().customers);
  const customerChoices = [['', 'Walk-in Customer'], ...customers.map(c => [c.id, c.name])];
  const currencyChoices = [['INR', 'INR'], ['USD', 'USD'], ['EUR', 'EUR'], ['GBP', 'GBP']];
  const pricingChoices = [['exclusive', 'Tax Exclusive'], ['inclusive', 'Tax Inclusive']];
  const typeChoices = [
    ['invoice', 'Invoice'],
    ['quote', 'Quotation'],
    ['proforma', 'Proforma'],
    ['challan', 'Delivery Challan'],
    ['credit', 'Credit Note'],
    ['debit', 'Debit Note'],
    ['billOfSupply', 'Bill of Supply'],
    ['export', 'Export Invoice'],
    ['receipt', 'POS Receipt']
  ];

  const itemsHtml = activeDraft.items.map((item, index) => {
    return `
      <div class="line-item-row no-print" style="display: flex; gap: 8px; margin-bottom: 8px; align-items: center;">
        <input style="flex: 2;" data-line="${index}" data-key="description" value="${escapeHtml(item.description)}" placeholder="Item Description" ${readonly ? 'disabled' : ''}>
        <input style="width: 100px;" data-line="${index}" data-key="hsn" value="${escapeHtml(item.hsn)}" placeholder="HSN/SAC" ${readonly ? 'disabled' : ''}>
        <input style="width: 80px;" type="number" step="0.001" data-line="${index}" data-key="quantity" value="${fromThousandths(item.quantityThousandths)}" placeholder="Qty" ${readonly ? 'disabled' : ''}>
        <input style="width: 100px;" type="number" step="0.01" data-line="${index}" data-key="rate" value="${fromPaise(item.ratePaise)}" placeholder="Rate" ${readonly ? 'disabled' : ''}>
        <input style="width: 80px;" type="number" step="0.01" data-line="${index}" data-key="discountRate" value="${fromBps(item.discountRateBps)}" placeholder="Disc %" ${readonly ? 'disabled' : ''}>
        <input style="width: 80px;" type="number" step="0.01" data-line="${index}" data-key="taxRate" value="${fromBps(item.taxRateBps)}" placeholder="Tax %" ${readonly ? 'disabled' : ''}>
        <span style="width: 120px; text-align: right; font-weight: bold;">${money(totals.rows[index]?.lineTotalPaise || 0, activeDraft.currency)}</span>
        ${readonly ? '' : button('×', 'remove-line', String(index), 'danger')}
      </div>
    `;
  }).join('');

  // Tax breakdown block
  let taxBreakdownHtml = '';
  for (const [rateBps, values] of Object.entries(totals.taxBreakdown)) {
    const ratePercent = (Number(rateBps) / 100).toFixed(2);
    taxBreakdownHtml += `
      <div class="total-row" style="font-size: 12px; color: var(--muted); padding-left: 20px;">
        <span>GST @ ${ratePercent}% (Taxable: ${money(values.taxablePaise, activeDraft.currency)})</span>
        <span>
          ${totals.taxType === 'INTRA_STATE' 
            ? `CGST: ${money(values.cgstPaise, activeDraft.currency)} | SGST: ${money(values.sgstPaise, activeDraft.currency)}` 
            : `IGST: ${money(values.igstPaise, activeDraft.currency)}`}
        </span>
      </div>
    `;
  }

  // Links to corrections or quote conversion history
  let linkedHistoryHtml = '';
  if (activeDraft.linkedDocumentId) {
    const original = getState().documents.find(d => d.id === activeDraft.linkedDocumentId);
    if (original) {
      linkedHistoryHtml = `<div class="notice no-print">Linked original document: <a href="#" data-action="open-document" data-value="${original.id}">${original.number}</a></div>`;
    }
  }
  const corrections = getState().documents.filter(d => d.linkedDocumentId === activeDraft.id);
  if (corrections.length) {
    linkedHistoryHtml += `<div class="notice no-print">Linked corrections: ${corrections.map(c => `<a href="#" data-action="open-document" data-value="${c.id}">${c.number}</a>`).join(', ')}</div>`;
  }

  // Irp Response QR code render
  let irpCodeHtml = '';
  if (activeDraft.irpMetadata) {
    const qrSvg = generateQrSvg(activeDraft.irpMetadata.qrCode);
    irpCodeHtml = `
      <div class="irp-block" style="border: 1px solid var(--line); border-radius: 8px; padding: 15px; margin-top: 20px; display: flex; gap: 20px; align-items: center;">
        <div style="width: 120px; height: 120px;">${qrSvg}</div>
        <div style="font-size: 11px; font-family: monospace; line-height: 1.5; color: var(--ink);">
          <strong>OFFICIAL E-INVOICE DETAILS (OFFLINE IMPORT)</strong><br>
          IRN: ${activeDraft.irpMetadata.irn.slice(0, 32)}...<br>
          Ack No: ${activeDraft.irpMetadata.ackNo}<br>
          Ack Date: ${activeDraft.irpMetadata.ackDt}
        </div>
      </div>
    `;
  }

  const container = document.getElementById('page-invoice');
  if (!container) return;

  container.innerHTML = `
    <div class="document-layout">
      <!-- Printable Invoice Area -->
      <article class="invoice-paper" id="invoice-printable-area">
        ${renderPrintTemplate(activeDraft, totals, irpCodeHtml)}
      </article>

      <!-- Side control sidebar -->
      <aside class="sticky-actions no-print">
        <form id="document-form" class="panel" onsubmit="return false;">
          <h2>Controls</h2>
          ${linkedHistoryHtml}
          <div class="grid two">
            ${select('Document Type', 'type', typeChoices, activeDraft.type, readonly ? 'disabled' : '')}
            ${field('Number', 'number', activeDraft.number, 'text', readonly ? 'disabled' : '')}
            ${select('Customer', 'customerId', customerChoices, activeDraft.customerId, readonly ? 'disabled' : '')}
            ${select('Currency', 'currency', currencyChoices, activeDraft.currency, readonly ? 'disabled' : '')}
            ${field('Issue Date', 'issueDate', activeDraft.issueDate, 'date', readonly ? 'disabled' : '')}
            ${field('Due Date', 'dueDate', activeDraft.dueDate, 'date', readonly ? 'disabled' : '')}
            ${select('Pricing Mode', 'pricingMode', pricingChoices, activeDraft.pricingMode, readonly ? 'disabled' : '')}
            ${field('Document Discount (%)', 'documentDiscountRate', fromBps(activeDraft.documentDiscountRateBps), 'number', `step="0.01" min="0" max="100" ${readonly ? 'disabled' : ''}`)}
            ${field('Shipping', 'shipping', fromPaise(activeDraft.shippingPaise), 'number', `step="0.01" min="0" ${readonly ? 'disabled' : ''}`)}
            ${field('Round Off', 'roundOffPaise', String(activeDraft.roundOffPaise), 'number', readonly ? 'disabled' : '')}
          </div>

          <div style="margin-top: 15px;">
            <h3>Line Items</h3>
            <div id="invoice-lines-list">
              ${itemsHtml}
            </div>
            ${readonly ? '' : button('Add Line Item', 'add-line-row', '', 'primary')}
          </div>

          <div class="grid two" style="margin-top: 15px;">
            <div class="field span-all">
              <label>Notes</label>
              <textarea name="notes" ${readonly ? 'disabled' : ''}>${escapeHtml(activeDraft.notes)}</textarea>
            </div>
            <div class="field span-all">
              <label>Terms & Conditions</label>
              <textarea name="terms" ${readonly ? 'disabled' : ''}>${escapeHtml(activeDraft.terms)}</textarea>
            </div>
          </div>

          <div class="actions-row" style="margin-top: 20px;">
            ${readonly ? '' : button('Save Draft', 'save-draft-action', '', 'primary')}
            ${readonly ? '' : button('Issue Document', 'issue-draft-action', '', 'success')}
            ${activeDraft.status === 'issued' ? button('Void Document', 'void-document-trigger', activeDraft.id, 'danger') : ''}
            ${['issued', 'partial', 'overdue'].includes(activeDraft.status) ? button('Record Payment', 'record-payment-trigger', activeDraft.id, 'success') : ''}
            ${activeDraft.status === 'issued' ? button('Credit Note', 'create-credit-note', activeDraft.id) : ''}
            ${activeDraft.status === 'issued' ? button('Debit Note', 'create-debit-note', activeDraft.id) : ''}
            ${['quote', 'proforma'].includes(activeDraft.type) && activeDraft.status !== 'void' ? button('Convert to Invoice', 'convert-quote-action', activeDraft.id, 'primary') : ''}
            ${button('Print / Save PDF', 'print-invoice-action', '', 'primary')}
          </div>

          ${readonly && activeCompany().taxId ? `
            <div style="border-top: 1px solid var(--line); margin-top: 20px; padding-top: 15px;">
              <h4>E-Invoicing (Offline)</h4>
              <div class="actions-row">
                ${button('Export IRP Draft JSON', 'export-irp-draft', activeDraft.id)}
                ${button('Import Authorized IRP Response', 'import-irp-response-trigger', activeDraft.id, 'success')}
              </div>
              <small class="muted" style="display: block; margin-top: 5px;">
                Note: Ledgerly operates completely offline. It generates IRP draft requests for manual upload and parses authorised JSON response payloads locally.
              </small>
            </div>
          ` : ''}
        </form>
      </aside>
    </div>
  `;

  // Bind change events to sync input changes to activeDraft
  const form = document.getElementById('document-form');
  if (form) {
    form.addEventListener('change', () => {
      syncDraftFromForm(form);
      renderInvoice();
    });
    form.querySelectorAll('[data-line]').forEach(el => {
      el.addEventListener('change', () => {
        syncDraftFromForm(form);
        renderInvoice();
      });
    });
  }
}

function syncDraftFromForm(form) {
  if (!activeDraft) return;
  const formData = new FormData(form);
  
  activeDraft.type = formData.get('type') || activeDraft.type;
  activeDraft.number = formData.get('number') || activeDraft.number;
  activeDraft.customerId = formData.get('customerId') || '';
  activeDraft.currency = formData.get('currency') || activeDraft.currency;
  activeDraft.issueDate = formData.get('issueDate') || activeDraft.issueDate;
  activeDraft.dueDate = formData.get('dueDate') || activeDraft.dueDate;
  activeDraft.pricingMode = formData.get('pricingMode') || 'exclusive';
  activeDraft.documentDiscountRateBps = toBps(formData.get('documentDiscountRate') || 0);
  activeDraft.shippingPaise = toPaise(formData.get('shipping') || 0);
  activeDraft.roundOffPaise = Number(formData.get('roundOffPaise') || 0);
  activeDraft.notes = formData.get('notes') || '';
  activeDraft.terms = formData.get('terms') || '';

  // Sync lines
  form.querySelectorAll('[data-line]').forEach((input) => {
    const idx = Number(input.dataset.line);
    const key = input.dataset.key;
    const item = activeDraft.items[idx];
    if (item) {
      if (key === 'description') item.description = input.value;
      if (key === 'hsn') item.hsn = input.value;
      if (key === 'quantity') item.quantityThousandths = toThousandths(input.value || 0);
      if (key === 'rate') item.ratePaise = toPaise(input.value || 0);
      if (key === 'discountRate') item.discountRateBps = toBps(input.value || 0);
      if (key === 'taxRate') item.taxRateBps = toBps(input.value || 0);
    }
  });
}

function renderPrintTemplate(doc, totals, irpCodeHtml) {
  const company = activeCompany();
  const customer = getState().customers.find((c) => c.id === doc.customerId);
  const status = getDocumentStatus(doc);

  const linesHtml = totals.rows.map((row, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td style="white-space: pre-line;">${escapeHtml(row.description)}</td>
      <td>${escapeHtml(row.hsn || '—')}</td>
      <td>${quantity(row.quantityThousandths)} ${escapeHtml(row.unit || 'NOS')}</td>
      <td>${money(row.ratePaise, doc.currency)}</td>
      <td>${percent(row.discountRateBps)}</td>
      <td>${percent(row.taxRateBps)}</td>
      <td style="text-align: right; font-weight: bold;">${money(row.lineTotalPaise, doc.currency)}</td>
    </tr>
  `).join('');

  return `
    <div style="border: 2px solid ${company.accentColor || '#16665d'}; border-radius: 8px; padding: 25px; min-height: 297mm; font-size: 12px; color: #111; line-height: 1.5; font-family: sans-serif; position: relative;">
      <!-- Company Branding Header -->
      <div style="display: flex; justify-content: space-between; border-bottom: 2px solid ${company.accentColor || '#16665d'}; padding-bottom: 15px; margin-bottom: 20px;">
        <div>
          ${company.logo ? `<img src="${company.logo}" style="max-height: 60px; margin-bottom: 10px; display: block;" alt="logo">` : ''}
          <div style="font-size: 20px; font-weight: bold; color: ${company.accentColor || '#16665d'};">${escapeHtml(company.name)}</div>
          ${company.legalName ? `<div style="font-weight: bold;">${escapeHtml(company.legalName)}</div>` : ''}
          <div style="color: #444; white-space: pre-line;">${escapeHtml(company.address)}</div>
          ${company.taxId ? `<div style="margin-top: 5px; font-weight: bold;">GSTIN: ${escapeHtml(company.taxId)}</div>` : ''}
        </div>
        <div style="text-align: right;">
          <div style="font-size: 24px; font-weight: bold; text-transform: uppercase; color: ${company.accentColor || '#16665d'};">${escapeHtml(doc.type)}</div>
          <div style="font-size: 16px; font-weight: bold; margin-top: 5px;">No: ${escapeHtml(doc.number)}</div>
          <div style="margin-top: 10px; color: #444;">
            Issue Date: <strong>${doc.issueDate}</strong><br>
            Due Date: <strong>${doc.dueDate}</strong><br>
            Status: <span style="text-transform: uppercase; font-weight: bold; color: ${status === 'paid' ? 'green' : status === 'void' ? 'red' : 'orange'};">${escapeHtml(status)}</span>
          </div>
        </div>
      </div>

      <!-- Bill To & Supply Info -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px; gap: 20px;">
        <div style="flex: 1; border: 1px solid var(--line); border-radius: 6px; padding: 12px; background: #fafafa;">
          <div style="font-weight: bold; color: ${company.accentColor || '#16665d'}; border-bottom: 1px solid var(--line); padding-bottom: 5px; margin-bottom: 5px;">BILL TO</div>
          <strong>${escapeHtml(customer?.name || 'Walk-in Customer')}</strong><br>
          ${customer?.billingAddress ? `<span style="white-space: pre-line;">${escapeHtml(customer.billingAddress)}</span><br>` : ''}
          ${customer?.phone ? `Phone: ${escapeHtml(customer.phone)}<br>` : ''}
          ${customer?.email ? `Email: ${escapeHtml(customer.email)}<br>` : ''}
          ${customer?.taxId ? `<strong>GSTIN: ${escapeHtml(customer.taxId)}</strong>` : ''}
        </div>
        <div style="flex: 1; border: 1px solid var(--line); border-radius: 6px; padding: 12px; background: #fafafa;">
          <div style="font-weight: bold; color: ${company.accentColor || '#16665d'}; border-bottom: 1px solid var(--line); padding-bottom: 5px; margin-bottom: 5px;">SHIP TO / SUPPLY INFO</div>
          ${customer?.shippingAddress ? `<span style="white-space: pre-line;">${escapeHtml(customer.shippingAddress)}</span><br>` : 'Same as Billing Address<br>'}
          Place of Supply: <strong>${escapeHtml(doc.placeOfSupply || customer?.placeOfSupply || '—')}</strong><br>
          Supply Type: <strong>${escapeHtml(doc.supplyType || 'B2B')}</strong><br>
          Reverse Charge: <strong>${doc.reverseCharge ? 'Yes' : 'No'}</strong>
        </div>
      </div>

      <!-- Eway bill details if any -->
      ${doc.ewayBill?.number ? `
        <div style="border: 1px solid var(--line); border-radius: 6px; padding: 10px; margin-bottom: 20px; font-size: 11px;">
          <strong>E-Way Bill Details:</strong> Bill No: ${escapeHtml(doc.ewayBill.number)} | Date: ${escapeHtml(doc.ewayBill.date)} | Vehicle: ${escapeHtml(doc.ewayBill.vehicleNo)} | Transporter: ${escapeHtml(doc.ewayBill.transporter)}
        </div>
      ` : ''}

      <!-- Items Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: ${company.accentColor || '#16665d'}; color: #fff; text-align: left;">
            <th style="padding: 8px; border: 1px solid var(--line);">#</th>
            <th style="padding: 8px; border: 1px solid var(--line);">Description</th>
            <th style="padding: 8px; border: 1px solid var(--line);">HSN/SAC</th>
            <th style="padding: 8px; border: 1px solid var(--line);">Qty</th>
            <th style="padding: 8px; border: 1px solid var(--line);">Rate</th>
            <th style="padding: 8px; border: 1px solid var(--line);">Disc %</th>
            <th style="padding: 8px; border: 1px solid var(--line);">GST %</th>
            <th style="padding: 8px; border: 1px solid var(--line); text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml}
        </tbody>
      </table>

      <!-- Totals & Taxes breakup -->
      <div style="display: flex; justify-content: space-between; gap: 20px;">
        <div style="flex: 1.2;">
          <!-- GST Rate Breakdowns -->
          <div style="border: 1px solid var(--line); border-radius: 6px; padding: 12px; background: #fafafa; margin-bottom: 15px;">
            <div style="font-weight: bold; border-bottom: 1px solid var(--line); padding-bottom: 5px; margin-bottom: 5px;">GST Breakdown</div>
            ${renderGstBreakdownPrint(totals, doc.currency)}
          </div>
          <!-- Bank & UPI Details -->
          <div style="font-size: 11px; border: 1px solid var(--line); border-radius: 6px; padding: 10px; background: #fafafa;">
            <strong>Bank details & UPI:</strong><br>
            <span style="white-space: pre-line;">${escapeHtml(company.bank || company.paymentDetails || 'Bank Details Not Specified')}</span>
          </div>
        </div>
        <div style="flex: 0.8; font-size: 13px;">
          <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0;">
            <span>Subtotal:</span>
            <span>${money(totals.subtotal, doc.currency)}</span>
          </div>
          ${totals.documentDiscountPaise ? `
            <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0; color: var(--danger);">
              <span>Document Discount:</span>
              <span>${money(totals.documentDiscountPaise, doc.currency)}</span>
            </div>
          ` : ''}
          <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0;">
            <span>Total GST:</span>
            <span>${money(totals.tax, doc.currency)}</span>
          </div>
          ${totals.shippingPaise ? `
            <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0;">
              <span>Shipping Charges:</span>
              <span>${money(totals.shippingPaise, doc.currency)}</span>
            </div>
          ` : ''}
          ${totals.roundOffPaise ? `
            <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0;">
              <span>Round Off:</span>
              <span>${money(totals.roundOffPaise, doc.currency)}</span>
            </div>
          ` : ''}
          <div class="total-row grand" style="display: flex; justify-content: space-between; font-size: 16px; font-weight: bold; border-top: 2px solid #000; padding: 8px 0; margin-top: 5px;">
            <span>Grand Total:</span>
            <span>${money(totals.total, doc.currency)}</span>
          </div>
          
          <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0; color: green; font-weight: bold;">
            <span>Paid to Date:</span>
            <span>${money(paidAmountPaise(doc), doc.currency)}</span>
          </div>
          <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0; font-weight: bold; border-top: 1px dashed var(--line);">
            <span>Balance Outstanding:</span>
            <span>${money(totals.total - paidAmountPaise(doc), doc.currency)}</span>
          </div>
        </div>
      </div>

      <!-- Notes, Terms & Signatures -->
      <div style="margin-top: 30px; border-top: 1px solid var(--line); padding-top: 15px; display: flex; justify-content: space-between; gap: 20px;">
        <div style="flex: 1.2; font-size: 10px; color: #555;">
          ${doc.notes ? `<strong>Notes:</strong><br>${escapeHtml(doc.notes)}<br><br>` : ''}
          ${doc.terms ? `<strong>Terms & Conditions:</strong><br>${escapeHtml(doc.terms)}` : ''}
        </div>
        <div style="flex: 0.8; text-align: right; display: flex; flex-direction: column; align-items: flex-end; justify-content: space-between; min-height: 80px;">
          <div>For <strong>${escapeHtml(company.name)}</strong></div>
          ${company.signature ? `<img src="${company.signature}" style="max-height: 50px; margin-bottom: 5px;" alt="Signature">` : ''}
          <div style="border-top: 1px solid #444; width: 150px; margin-top: 10px; font-size: 10px;">Authorised Signatory</div>
        </div>
      </div>

      <!-- Render e-invoice payload QR -->
      ${irpCodeHtml}
    </div>
  `;
}

function renderGstBreakdownPrint(totals, currency) {
  let html = '';
  for (const [rateBps, values] of Object.entries(totals.taxBreakdown)) {
    const ratePercent = (Number(rateBps) / 100).toFixed(2);
    html += `
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px; font-size: 11px;">
        <span>GST @ ${ratePercent}% (Taxable: ${money(values.taxablePaise, currency)})</span>
        <span>
          ${totals.taxType === 'INTRA_STATE' 
            ? `CGST: ${money(values.cgstPaise, currency)} | SGST: ${money(values.sgstPaise, currency)}` 
            : `IGST: ${money(values.igstPaise, currency)}`}
        </span>
      </div>
    `;
  }
  return html || 'No tax breakdown applicable';
}

export function handleDocumentAction(action, value) {
  const state = getState();
  
  if (action === 'new-document') {
    activeDraft = newDraft();
    window.location.hash = 'invoice';
    return;
  }

  if (action === 'open-document') {
    const doc = state.documents.find(d => d.id === value);
    if (doc) {
      activeDraft = doc;
      window.location.hash = 'invoice';
    }
    return;
  }

  if (action === 'add-line-row') {
    if (activeDraft) {
      activeDraft.items.push({
        id: crypto.randomUUID(),
        productId: '',
        description: '',
        hsn: '',
        quantityThousandths: 1000,
        ratePaise: 0,
        discountRateBps: 0,
        taxRateBps: 1800,
        isService: false
      });
      renderInvoice();
    }
    return;
  }

  if (action === 'remove-line') {
    if (activeDraft) {
      activeDraft.items.splice(Number(value), 1);
      renderInvoice();
    }
    return;
  }

  if (action === 'save-draft-action') {
    if (activeDraft) {
      const idx = state.documents.findIndex(d => d.id === activeDraft.id);
      if (idx >= 0) state.documents[idx] = activeDraft;
      else state.documents.push(activeDraft);
      
      addAudit('document.draft.saved', 'document', activeDraft.id, activeDraft.number);
      saveState().then(() => {
        alert('Draft saved successfully.');
        window.location.hash = 'documents';
      });
    }
    return;
  }

  if (action === 'issue-draft-action') {
    if (activeDraft) {
      const validation = validateInvoiceBeforeIssue(activeDraft);
      if (!validation.isValid) {
        alert('Validation failed:\n' + validation.errors.join('\n'));
        return;
      }
      try {
        issueDocument(activeDraft);
        const idx = state.documents.findIndex(d => d.id === activeDraft.id);
        if (idx >= 0) state.documents[idx] = activeDraft;
        else state.documents.push(activeDraft);

        saveState().then(() => {
          alert('Document issued successfully.');
          renderInvoice();
        });
      } catch (err) {
        alert(err.message || 'Issue failed.');
      }
    }
    return;
  }

  if (action === 'record-payment-trigger') {
    const doc = state.documents.find(d => d.id === value);
    if (!doc) return;

    const outstanding = calculateDocumentTotals(doc).total - paidAmountPaise(doc);
    const amountStr = prompt(`Enter payment amount (Outstanding: ${money(outstanding, doc.currency)}):`);
    if (!amountStr) return;

    try {
      const amountPaise = toPaise(amountStr);
      const method = prompt('Enter payment method (cash, UPI, bank transfer):') || 'cash';
      const reference = prompt('Enter reference number / notes:') || '';

      recordPayment(doc, { amountPaise, method, reference });
      saveState().then(() => {
        alert('Payment recorded successfully.');
        if (window.location.hash === '#invoice') renderInvoice();
        else renderDocuments();
      });
    } catch (err) {
      alert(err.message || 'Payment recording failed.');
    }
    return;
  }

  if (action === 'void-document-trigger') {
    const doc = state.documents.find(d => d.id === value);
    if (!doc) return;

    const reason = prompt('Enter void reason:');
    if (!reason) return;

    try {
      voidDocument(doc, reason);
      saveState().then(() => {
        alert('Document marked as void.');
        if (window.location.hash === '#invoice') renderInvoice();
        else renderDocuments();
      });
    } catch (err) {
      alert(err.message || 'Voiding document failed.');
    }
    return;
  }

  if (action === 'create-credit-note') {
    const doc = state.documents.find(d => d.id === value);
    if (doc) {
      const cn = createCorrection(doc, 'credit');
      state.documents.push(cn);
      saveState().then(() => {
        activeDraft = cn;
        window.location.hash = 'invoice';
        alert('Credit Note draft generated.');
      });
    }
    return;
  }

  if (action === 'create-debit-note') {
    const doc = state.documents.find(d => d.id === value);
    if (doc) {
      const dn = createCorrection(doc, 'debit');
      state.documents.push(dn);
      saveState().then(() => {
        activeDraft = dn;
        window.location.hash = 'invoice';
        alert('Debit Note draft generated.');
      });
    }
    return;
  }

  if (action === 'convert-quote-action') {
    const doc = state.documents.find(d => d.id === value);
    if (doc) {
      try {
        const inv = convertQuote(doc);
        state.documents.push(inv);
        saveState().then(() => {
          activeDraft = inv;
          window.location.hash = 'invoice';
          alert('Quotation converted to Invoice Draft.');
        });
      } catch (err) {
        alert(err.message || 'Conversion failed.');
      }
    }
    return;
  }

  if (action === 'print-invoice-action') {
    window.print();
    return;
  }

  if (action === 'export-irp-draft') {
    const doc = state.documents.find(d => d.id === value);
    if (doc) {
      try {
        exportIRPDraft(doc, calculateDocumentTotals(doc));
      } catch (err) {
        alert(err.message || 'IRP export failed.');
      }
    }
    return;
  }

  if (action === 'import-irp-response-trigger') {
    chooseFile((file) => {
      importIRPResponse(file, value)
        .then(() => {
          alert('Authorized IRP details successfully stored.');
          renderInvoice();
        })
        .catch(err => alert(err.message || 'Import failed.'));
    }, '.json,application/json');
    return;
  }
}
