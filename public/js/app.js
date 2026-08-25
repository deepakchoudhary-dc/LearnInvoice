/* Ledgerly app — router, views, actions. Domain logic lives in ./modules */
import { initializeState, getState, saveState, activeCompany, addAudit, scopeForCompany } from './modules/state.js';
import { toPaise, toThousandths, toBps, fromPaise, fromThousandths, fromBps } from './modules/invoice-calculations.js';
import {
  newDraft, calculateDocumentTotals, paidAmountPaise, getDocumentStatus,
  issueDocument, recordPayment, voidDocument, createCorrection, convertQuote, nextNumber
} from './modules/documents.js';
import { validateInvoiceBeforeIssue } from './modules/validation.js';
import { saveCustomer } from './modules/customers.js';
import { saveProduct, adjustStock, lowStockProducts } from './modules/products.js';
import { saveExpense } from './modules/expenses.js';
import { saveRecurringTemplate, generateDueRecurring, addMonthsClamped } from './modules/recurring.js';
import {
  salesRegister, outstandingReport, agingReport, monthlySales,
  taxLiability, expenseSummary, expenseByCategory
} from './modules/reports.js';
import { exportBackup, previewBackupFile, performRestore } from './modules/backup.js';
import { toCsv, downloadText } from './modules/csv.js';
import { STATE_CODES } from './modules/gst.js';
import { DB_NAME } from './modules/storage.js';

/* ---------- helpers ---------- */
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);
const fmtCache = {};
function money(paise) {
  const c = activeCompany();
  const key = `${c.currency}|${c.locale}`;
  fmtCache[key] ||= new Intl.NumberFormat(c.locale || 'en-IN', { style: 'currency', currency: c.currency || 'INR' });
  return fmtCache[key].format((Number(paise) || 0) / 100);
}
const trimNum = (n) => String(Number(n ?? 0));
const qtyStr = (thousandths) => trimNum((thousandths || 0) / 1000);
const pctStr = (bps) => `${trimNum((bps || 0) / 100)}%`;
const custName = (id) => getState().customers.find((c) => c.id === id)?.name || '—';

function parseMoney(value) {
  try { return toPaise(String(value).trim()); } catch { return null; }
}
function parseQty(value) {
  try { return toThousandths(String(value).trim()); } catch { return null; }
}
function parseRate(value) {
  try { return toBps(String(value).trim()); } catch { return null; }
}

function toast(message, type = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  $('toasts').append(el);
  setTimeout(() => el.remove(), 4000);
}

async function persist(label = 'Saved') {
  await saveState();
  const el = $('save-status');
  if (el) el.textContent = `${label} ${new Date().toLocaleTimeString()}`;
}

/* ---------- amount in words (Indian system) ---------- */
function wordsTwo(n) {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  return n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
}
function wordsBelow1000(n) {
  const out = [];
  if (n >= 100) out.push(`${wordsTwo(Math.floor(n / 100))} Hundred`);
  if (n % 100) out.push(wordsTwo(n % 100));
  return out.join(' ');
}
function amountWords(paise) {
  let n = Math.floor(Math.abs(Number(paise) || 0) / 100);
  const paisePart = Math.abs(Number(paise) || 0) % 100;
  if (!n && !paisePart) return 'Zero rupees only';
  const parts = [];
  if (Math.floor(n / 10000000)) parts.push(`${wordsBelow1000(Math.floor(n / 10000000))} Crore`);
  n %= 10000000;
  if (Math.floor(n / 100000)) parts.push(`${wordsTwo(Math.floor(n / 100000))} Lakh`);
  n %= 100000;
  if (Math.floor(n / 1000)) parts.push(`${wordsTwo(Math.floor(n / 1000))} Thousand`);
  n %= 1000;
  if (n) parts.push(wordsBelow1000(n));
  const rupees = parts.join(' ');
  return `Rupees ${rupees}${paisePart ? ` and ${wordsTwo(paisePart)} Paise` : ''} only`;
}

/* ---------- printing ---------- */
const DOC_TITLES = { invoice: 'Tax Invoice', quote: 'Quotation', proforma: 'Proforma Invoice', credit: 'Credit Note' };

function printableHTML(doc) {
  const c = activeCompany();
  const t = calculateDocumentTotals(doc);
  const customer = doc.customerSnapshot || getState().customers.find((x) => x.id === doc.customerId) || null;
  const rows = t.rows.map((item, i) => {
    const product = getState().products.find((p) => p.id === item.productId);
    const unit = product?.unit || '';
    return `<tr>
      <td>${i + 1}</td>
      <td class="wrap">${esc(item.description)}</td>
      <td>${esc(item.hsn)}</td>
      <td class="p-num">${qtyStr(item.quantityThousandths)} ${esc(unit)}</td>
      <td class="p-num">${money(item.ratePaise)}</td>
      <td class="p-num">${item.discountRateBps ? pctStr(item.discountRateBps) : '—'}</td>
      <td class="p-num">${money(item.taxablePaise)}</td>
      <td class="p-num">${pctStr(item.taxRateBps)}</td>
      <td class="p-num">${money(item.taxPaise)}</td>
      <td class="p-num"><strong>${money(item.lineTotalPaise)}</strong></td>
    </tr>`;
  }).join('');

  const taxRows = Object.entries(t.taxBreakdown).map(([rate, b]) => {
    if (t.taxType === 'INTER_STATE') {
      return `<div><span>IGST @ ${trimNum(rate / 100)}%</span><strong>${money(b.igstPaise)}</strong></div>`;
    }
    return `<div><span>CGST @ ${trimNum(rate / 100)}% + SGST @ ${trimNum(rate / 100)}%</span><strong>${money(b.cgstPaise + b.sgstPaise)}</strong></div>`;
  }).join('');
  const taxLabel = t.taxType === 'INTER_STATE' ? 'IGST' : 'CGST + SGST';

  const sellerBlock = [c.address, [c.city, c.pinCode].filter(Boolean).join(' - '), c.taxId && `GSTIN: ${c.taxId}`, c.phone, c.email].filter(Boolean).join('\n');
  const buyerBlock = customer ? [
    customer.name,
    customer.billingAddress,
    customer.taxId && `GSTIN: ${customer.taxId}`,
    customer.placeOfSupply && `Place of supply: ${customer.placeOfSupply}`
  ].filter(Boolean).join('\n') : '';

  return `<div class="paper">
    <div class="p-head">
      <div>
        <div class="p-brand">${c.logo ? `<img src="${c.logo}" alt="" class="p-logo">` : ''}${esc(c.name)}</div>
        <div class="p-block">${esc(sellerBlock)}</div>
      </div>
      <div class="p-right">
        <div class="p-title">${DOC_TITLES[doc.type] || 'Document'}</div>
        <div class="p-docnum">${esc(doc.number)}</div>
        <div>Issued: ${esc(doc.issueDate)}</div>
        <div>Due: ${esc(doc.dueDate)}</div>
      </div>
    </div>
    <div class="p-meta">
      <div class="p-grow"><strong>Bill to</strong><div class="p-block">${esc(buyerBlock)}</div></div>
      ${doc.reverseCharge ? '<div>Reverse charge applies</div>' : ''}
    </div>
    <table class="p-items">
      <thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th class="p-num">Qty</th><th class="p-num">Rate</th><th class="p-num">Disc</th><th class="p-num">Taxable</th><th class="p-num">GST</th><th class="p-num">${taxLabel}</th><th class="p-num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="p-totals">
      <div><span>Subtotal (taxable)</span><strong>${money(t.subtotal)}</strong></div>
      ${t.documentDiscountPaise ? `<div><span>Document discount</span><strong>-${money(t.documentDiscountPaise)}</strong></div>` : ''}
      ${taxRows ? `<div><span>GST</span><strong>${money(t.tax)}</strong></div>` : ''}
      ${t.shippingPaise ? `<div><span>Shipping</span><strong>${money(t.shippingPaise)}</strong></div>` : ''}
      ${t.roundOffPaise ? `<div><span>Round off</span><strong>${money(t.roundOffPaise)}</strong></div>` : ''}
      <div class="p-grand"><span>Total</span><span>${money(t.total)}</span></div>
    </div>
    <p class="p-words"><em>${esc(amountWords(t.total))}</em></p>
    ${(doc.payments || []).length ? `<p class="p-payments"><strong>Payments received:</strong> ${doc.payments.map((p) => `${esc(p.date)} ${money(p.amountPaise)} (${esc(p.method)})`).join('; ')}</p>` : ''}
    <div class="p-foot">
      <div class="p-terms-col">
        ${c.paymentDetails ? `<strong>Payment details</strong><div class="p-block">${esc(c.paymentDetails)}</div>` : ''}
        ${doc.terms ? `<div class="p-gap"><strong>Terms</strong><div class="p-block">${esc(doc.terms)}</div></div>` : ''}
      </div>
      ${c.signature ? `<img src="${c.signature}" alt="signature" class="p-sign-img">` : ''}
      <div class="p-sign">Authorised signatory</div>
    </div>
  </div>`;
}

function printDoc(doc) {
  $('print-area').innerHTML = printableHTML(doc);
  window.print();
}

/* ---------- router ---------- */
const ROUTES = {
  dashboard: ['Overview', 'Business at a glance'],
  builder: ['New document', 'Draft editor'],
  documents: ['Documents', 'Invoices, quotes and notes'],
  pos: ['Point of sale', 'Counter billing'],
  customers: ['Customers', 'Directory and credit exposure'],
  products: ['Products & stock', 'Catalog and inventory'],
  expenses: ['Expenses', 'Money going out'],
  recurring: ['Recurring', 'Automated invoicing'],
  reports: ['Reports', 'Insights and exports'],
  business: ['Business & backup', 'Identity, vault and safety']
};
let currentRoute = 'dashboard';

function route() {
  const target = (location.hash.replace(/^#\/?/, '') || 'dashboard');
  currentRoute = ROUTES[target] ? target : 'dashboard';
  if (currentRoute === 'builder') ensureDraft();
  const [kicker, title] = ROUTES[currentRoute];
  $('page-kicker').textContent = kicker;
  $('page-title').textContent = title;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.route === currentRoute));
  RENDER[currentRoute]();
  window.scrollTo(0, 0);
}

function go(name) { location.hash = `/${name}`; }

/* ---------- draft state ---------- */
let draft = null;

const newLine = () => ({
  id: crypto.randomUUID(), productId: '', description: '', hsn: '',
  quantityThousandths: 1000, ratePaise: 0, discountRateBps: 0, taxRateBps: toBps(18), isService: false
});

function ensureDraft(forceNew = false, source = {}) {
  if (forceNew || !draft) {
    draft = newDraft({ ...source });
    draft._isNew = true;
  }
  return draft;
}
function openDoc(id) {
  const doc = getState().documents.find((d) => d.id === id);
  if (!doc) return;
  draft = structuredClone(doc);
  draft._isNew = false;
  go('builder');
}

function upsertDraftToState(statusLabel) {
  const list = getState().documents;
  const idx = list.findIndex((d) => d.id === draft.id);
  if (idx >= 0) list[idx] = draft; else list.push(draft);
  draft._isNew = false;
}

function syncBuilderFromForm() {
  draft.type = $('b-type').value;
  draft.number = $('b-number').value.trim() || draft.number;
  draft.issueDate = $('b-issue').value;
  draft.dueDate = $('b-due').value;
  draft.customerId = $('b-customer').value;
  draft.pricingMode = $('b-mode').value;
  draft.documentDiscountRateBps = parseRate($('b-docdisc').value) || 0;
  draft.shippingPaise = parseMoney($('b-ship').value) ?? 0;
  draft.roundOffPaise = parseMoney($('b-round').value) ?? 0;
  draft.notes = $('b-notes').value.trim();
  draft.terms = $('b-terms').value.trim();
}

/* ============================================================ pages */

const RENDER = {};

/* ---------- dashboard ---------- */
RENDER.dashboard = () => {
  const s = getState();
  const startOfMonth = today().slice(0, 7) + '-01';
  const sales = salesRegister({ type: 'invoice' });
  const received = sales.reduce((sum, r) => sum + Math.min(paidAmountPaise(r.document), r.totals.total), 0);
  const outstandingRows = outstandingReport({ type: 'invoice' });
  const outstanding = outstandingRows.reduce((sum, r) => sum + r.outstandingPaise, 0);
  const monthSales = salesRegister({ type: 'invoice', from: startOfMonth }).reduce((sum, r) => sum + r.totals.total, 0);
  const monthExpenses = expenseSummary({ from: startOfMonth });
  const overdueCount = outstandingRows.filter((r) => r.status === 'overdue').length;
  const low = lowStockProducts();

  const recent = [...scopeForCompany(s.documents)]
    .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.number || '').localeCompare(a.number || ''))
    .slice(0, 8);

  $('page').innerHTML = `
    <div class="cards">
      <div class="tilt kpi"><div class="kpi-label">Received</div><div class="kpi-value good">${money(received)}</div><div class="kpi-sub">across all invoices</div></div>
      <div class="tilt kpi"><div class="kpi-label">Outstanding</div><div class="kpi-value ${outstanding > 0 ? 'bad' : ''}">${money(outstanding)}</div><div class="kpi-sub">${overdueCount} overdue document${overdueCount === 1 ? '' : 's'}</div></div>
      <div class="tilt kpi"><div class="kpi-label">Sales this month</div><div class="kpi-value accent">${money(monthSales)}</div><div class="kpi-sub">since ${startOfMonth}</div></div>
      <div class="tilt kpi"><div class="kpi-label">Expenses this month</div><div class="kpi-value">${money(monthExpenses)}</div><div class="kpi-sub">since ${startOfMonth}</div></div>
    </div>

    ${low.length ? `<div class="notice warn"><strong>Low stock:</strong> ${low.map((p) => esc(p.name)).join(', ')} — consider reordering.</div>` : ''}

    <div class="panel">
      <div class="panel-head"><h2>Quick actions</h2></div>
      <div class="actions-row">
        <button class="btn primary" data-action="new-doc" data-value="invoice">+ Invoice</button>
        <button class="btn" data-action="new-doc" data-value="quote">+ Quotation</button>
        <button class="btn" data-route-jump="pos">Point of sale</button>
        <button class="btn" data-route-jump="expenses">Log an expense</button>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head"><h2>Recent documents</h2><button class="btn sm" data-route-jump="documents">View all</button></div>
      ${recent.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Number</th><th>Customer</th><th>Issued</th><th>Due</th><th class="right">Total</th><th>Status</th></tr></thead>
        <tbody>${recent.map((d) => `
          <tr class="clickable" data-action="open-doc" data-value="${d.id}">
            <td><strong>${esc(d.number)}</strong></td>
            <td class="wrap">${esc(custName(d.customerId))}</td>
            <td>${esc(d.issueDate)}</td>
            <td>${esc(d.dueDate)}</td>
            <td class="right">${money((d.totalPaise ?? calculateDocumentTotals(d).total))}</td>
            <td><span class="pill ${getDocumentStatus(d)}">${getDocumentStatus(d)}</span></td>
          </tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">No documents yet. Create your first invoice.</div>'}
    </div>`;
};

/* ---------- builder ---------- */
RENDER.builder = () => {
  const s = getState();
  const d = draft;
  const status = d.status === 'draft' ? 'draft' : getDocumentStatus(d);
  const canPay = ['issued', 'partial', 'overdue'].includes(status);
  const canVoid = d.status === 'issued' && paidAmountPaise(d) === 0;
  const canConvert = ['quote', 'proforma'].includes(status);
  const customerOptions = s.customers.map((c) => `<option value="${c.id}" ${c.id === d.customerId ? 'selected' : ''}>${esc(c.name)}${c.taxId ? ` · ${esc(c.taxId)}` : ''}</option>`).join('');

  $('page').innerHTML = `
  <div id="builder-errors"></div>
  <div class="split">
    <div>
      <div class="panel">
        <div class="grid four">
          <div><label>Type</label><select id="b-type" data-b="header">
            ${['invoice', 'quote', 'proforma', 'credit'].map((t) => `<option value="${t}" ${d.type === t ? 'selected' : ''}>${DOC_TITLES[t]}</option>`).join('')}
          </select></div>
          <div><label>Number</label><input id="b-number" data-b="header" value="${esc(d.number)}" placeholder="INV-0001"></div>
          <div><label>Issue date</label><input id="b-issue" type="date" data-b="header" value="${esc(d.issueDate)}"></div>
          <div><label>Due date</label><input id="b-due" type="date" data-b="header" value="${esc(d.dueDate)}"></div>
          <div><label>Customer</label><select id="b-customer" data-b="header"><option value="">— select —</option>${customerOptions}</select></div>
          <div><label>Prices</label><select id="b-mode" data-b="header">
            <option value="exclusive" ${d.pricingMode !== 'inclusive' ? 'selected' : ''}>Exclude tax</option>
            <option value="inclusive" ${d.pricingMode === 'inclusive' ? 'selected' : ''}>Include tax</option>
          </select></div>
          <div><label>Discount %</label><input id="b-docdisc" data-b="total" value="${d.documentDiscountRateBps ? fromBps(d.documentDiscountRateBps) : ''}" placeholder="0 = none"></div>
          <div><label>Shipping</label><input id="b-ship" data-b="total" value="${d.shippingPaise ? fromPaise(d.shippingPaise) : ''}" placeholder="0.00"></div>
          <div><label>Round off ±</label><input id="b-round" data-b="total" value="${d.roundOffPaise ? fromPaise(d.roundOffPaise) : ''}" placeholder="0.00"></div>
        </div>
        ${!d.customerId ? `<p class="muted hint">No customer yet — pick one or <button class="btn sm ghost" data-action="quickadd-toggle">quick-add</button>.</p>
        <div id="quickadd" class="grid four">
          <div><label>Name *</label><input id="qa-name" placeholder="Customer or business name"></div>
          <div><label>Phone</label><input id="qa-phone" placeholder="Phone number"></div>
          <div><label>GSTIN</label><input id="qa-gstin" placeholder="27AAAAA0000A1Z5"></div>
          <div class="cell-end"><button class="btn primary" data-action="quickadd-save">Add customer</button></div>
        </div>` : ''}
      </div>

      <div class="panel">
        <div class="panel-head">
          <h2>Items</h2>
          <datalist id="product-list">${s.products.map((p) => `<option value="${esc(p.name)}">`).join('')}</datalist>
          <button class="btn sm" data-action="add-line">+ Add line</button>
        </div>
        <div class="table-wrap"><table class="data items-table"><tbody id="items-body"></tbody></table></div>
      </div>

      <div class="panel">
        <div class="grid two">
          <div><label>Notes</label><textarea id="b-notes" data-b="meta" placeholder="Visible on the printed document">${esc(d.notes)}</textarea></div>
          <div><label>Terms</label><textarea id="b-terms" data-b="meta" placeholder="Payment due within 30 days.">${esc(d.terms)}</textarea></div>
        </div>
      </div>
    </div>

    <div class="sticky">
      <div class="panel">
        <div class="panel-head"><h2>Status</h2><span class="pill ${status}">${status}</span></div>
        <div class="totals" id="totals-box"></div>
        <div class="actions-row mt-16">
          ${d.status === 'draft' ? '<button class="btn primary" data-action="issue-doc">Save &amp; issue</button><button class="btn" data-action="save-draft">Save draft</button>' : ''}
          <button class="btn" data-action="print-doc">Print</button>
          ${canPay ? '<button class="btn" data-action="pay-toggle">Record payment</button>' : ''}
          ${canConvert ? '<button class="btn" data-action="convert-quote">Convert to invoice</button>' : ''}
          ${d.status === 'issued' ? `<button class="btn" data-action="correction" data-value="credit">Credit note</button>` : ''}
          ${canVoid ? '<button class="btn danger" data-action="void-toggle">Void</button>' : ''}
          ${d.status === 'draft' && !d._isNew ? '<button class="btn danger" data-action="delete-draft">Delete draft</button>' : ''}
        </div>
        <div id="void-strip" class="grid">
          <div><label>Reason (required)</label><input id="void-reason" placeholder="e.g. cancelled order"></div>
          <button class="btn danger" data-action="void-confirm">Confirm void</button>
        </div>
        <div id="pay-strip"></div>
      </div>
    </div>
  </div>`;

  renderItemsBody();
  refreshTotals();

  $('page').querySelectorAll('[data-b]').forEach((el) => {
    el.addEventListener(el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input', () => {
      if (el.dataset.b === 'header' && el.id === 'b-type' && draft._isNew) {
        syncBuilderFromForm();
        draft.number = nextNumber(draft.type, draft.issueDate);
        $('b-number').value = draft.number;
      }
      syncField(el);
      refreshTotals();
    });
  });
};

function renderItemsBody() {
  const body = $('items-body');
  body.innerHTML = draft.items.map((item, i) => `
    <tr>
      <td class="col-desc"><input list="product-list" data-li="${i}" data-f="description" value="${esc(item.description)}" placeholder="Description or pick a product"></td>
      <td class="col-num"><input data-li="${i}" data-f="hsn" value="${esc(item.hsn)}" placeholder="HSN"></td>
      <td class="col-num"><input data-li="${i}" data-f="qty" value="${qtyStr(item.quantityThousandths)}" inputmode="decimal"></td>
      <td class="col-rate"><input data-li="${i}" data-f="rate" value="${fromPaise(item.ratePaise)}" inputmode="decimal"></td>
      <td class="col-num"><input data-li="${i}" data-f="disc" value="${fromBps(item.discountRateBps)}" inputmode="decimal" placeholder="%"></td>
      <td class="col-num"><input data-li="${i}" data-f="tax" value="${fromBps(item.taxRateBps)}" inputmode="decimal" placeholder="%"></td>
      <td class="line-amt right" data-amt="${i}">—</td>
      <td><button class="icon-btn" data-action="remove-line" data-value="${i}" title="Remove line">✕</button></td>
    </tr>`).join('');
  if (!draft.items.length) body.innerHTML = '<tr><td colspan="8"><div class="empty">No lines yet — add your first item.</div></td></tr>';

  body.querySelectorAll('[data-li]').forEach((el) => {
    el.addEventListener('input', () => {
      const i = Number(el.dataset.li);
      const f = el.dataset.f;
      let v = null;
      if (f === 'description') { draft.items[i].description = el.value; return; }
      v = f === 'qty' ? parseQty(el.value) : f === 'rate' ? parseMoney(el.value) : parseRate(el.value);
      el.classList.toggle('invalid', el.value.trim() !== '' && v === null);
      if (v === null) return;
      if (f === 'qty') draft.items[i].quantityThousandths = v;
      if (f === 'rate') draft.items[i].ratePaise = v;
      if (f === 'disc') draft.items[i].discountRateBps = v;
      if (f === 'tax') draft.items[i].taxRateBps = v;
      refreshTotals();
    });
    el.addEventListener('change', () => {
      if (el.dataset.f !== 'description') return;
      const match = getState().products.find((p) =>
        p.name.toLowerCase() === el.value.trim().toLowerCase() ||
        (p.sku && p.sku.toLowerCase() === el.value.trim().toLowerCase()));
      if (!match) return;
      const i = Number(el.dataset.li);
      Object.assign(draft.items[i], {
        productId: match.id, description: match.name, hsn: match.hsn,
        ratePaise: match.pricePaise, taxRateBps: match.taxRateBps, isService: match.isService
      });
      renderItemsBody();
      refreshTotals();
      toast(`Filled from catalog: ${match.name}`);
    });
  });
}

function refreshTotals() {
  const box = $('totals-box');
  if (!box) return;
  let t;
  try { t = calculateDocumentTotals(draft); } catch (err) {
    box.innerHTML = `<div class="notice error">${esc(err.message)}</div>`;
    return;
  }
  draft.items.forEach((_, i) => {
    const cell = document.querySelector(`[data-amt="${i}"]`);
    if (cell && t.rows[i]) cell.textContent = money(t.rows[i].lineTotalPaise);
  });

  const taxRows = Object.entries(t.taxBreakdown).map(([rate, b]) => {
    const label = t.taxType === 'INTER_STATE' ? 'IGST' : 'CGST+SGST';
    const amount = t.taxType === 'INTER_STATE' ? b.igstPaise : b.cgstPaise + b.sgstPaise;
    return `<div class="total-row"><span>${label} @ ${trimNum(rate / 100)}%</span><strong>${money(amount)}</strong></div>`;
  }).join('');

  const shipInput = $('b-ship');
  const roundInput = $('b-round');
  const discInput = $('b-docdisc');
  box.innerHTML = `
    <div class="total-row"><span>Taxable subtotal</span><strong>${money(t.subtotal)}</strong></div>
    ${t.documentDiscountPaise ? `<div class="total-row"><span>Discount</span><strong>-${money(t.documentDiscountPaise)}</strong></div>` : ''}
    ${taxRows}
    ${t.shippingPaise ? `<div class="total-row"><span>Shipping</span><strong>${money(t.shippingPaise)}</strong></div>` : ''}
    ${t.roundOffPaise ? `<div class="total-row"><span>Round off</span><strong>${money(t.roundOffPaise)}</strong></div>` : ''}
    <div class="total-row grand"><span>Total</span><strong>${money(t.total)}</strong></div>
    <p class="tax-note">${draft.pricingMode === 'inclusive' ? 'Prices include tax.' : 'Tax added on top of prices.'}</p>
  </div>`;
}

function syncField(el) {
  if (el.dataset.b === 'header') {
    if (el.id === 'b-type') draft.type = el.value;
    if (el.id === 'b-number') draft.number = el.value.trim() || draft.number;
    if (el.id === 'b-issue') draft.issueDate = el.value;
    if (el.id === 'b-due') draft.dueDate = el.value;
    if (el.id === 'b-customer') draft.customerId = el.value;
    if (el.id === 'b-mode') draft.pricingMode = el.value;
  } else if (el.dataset.b === 'total') {
    if (el.id === 'b-docdisc') { const v = parseRate(el.value); el.classList.toggle('invalid', v === null); draft.documentDiscountRateBps = v ?? 0; }
    if (el.id === 'b-ship') { const v = parseMoney(el.value); el.classList.toggle('invalid', v === null); draft.shippingPaise = v ?? 0; }
    if (el.id === 'b-round') { const v = parseMoney(el.value); el.classList.toggle('invalid', v === null); draft.roundOffPaise = v ?? 0; }
  } else if (el.dataset.b === 'meta') {
    if (el.id === 'b-notes') draft.notes = el.value;
    if (el.id === 'b-terms') draft.terms = el.value;
  }
}

function showBuilderErrors(errors) {
  $('builder-errors').innerHTML = errors.length
    ? `<div class="notice error"><strong>Cannot issue yet:</strong><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`
    : '';
  if (errors.length) window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderPayStrip() {
  const strip = $('pay-strip');
  if (!strip) return;
  const t = calculateDocumentTotals(draft);
  const due = Math.max(0, t.total - paidAmountPaise(draft));
  strip.innerHTML = `
    <div class="notice info">Balance due: <strong>${money(due)}</strong></div>
    <div class="grid">
      <div><label>Amount</label><input id="pay-amount" value="${fromPaise(due)}" inputmode="decimal"></div>
      <div><label>Date</label><input id="pay-date" type="date" value="${today()}"></div>
      <div><label>Method</label><select id="pay-method"><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank transfer</option><option value="card">Card</option><option value="cheque">Cheque</option></select></div>
      <div><label>Reference</label><input id="pay-ref" placeholder="UTR / cheque no."></div>
      <button class="btn primary" data-action="pay-confirm">Save payment</button>
    </div>
    ${(draft.payments || []).length ? `<div class="muted mt-12">Received: ${draft.payments.map((p) => `${esc(p.date)} · ${money(p.amountPaise)} · ${esc(p.method)}`).join('<br>')}</div>` : ''}`;
}

/* ---------- documents register ---------- */
let docFilter = { q: '', type: '', status: '' };
RENDER.documents = () => {
  const q = docFilter.q.toLowerCase();
  const rows = scopeForCompany(getState().documents)
    .filter((doc) => !docFilter.type || doc.type === docFilter.type)
    .filter((doc) => {
      if (!docFilter.status) return true;
      if (docFilter.status === '!draft') return doc.status !== 'draft' && doc.status !== 'void';
      return getDocumentStatus(doc) === docFilter.status;
    })
    .filter((doc) => !q || doc.number.toLowerCase().includes(q) || custName(doc.customerId).toLowerCase().includes(q))
    .sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '') || (b.number || '').localeCompare(a.number || ''));

  $('page').innerHTML = `
    <div class="filters">
      <div><label>Search</label><input id="doc-q" value="${esc(docFilter.q)}" placeholder="Number or customer…"></div>
      <div><label>Type</label><select id="doc-type"><option value="">All types</option>${['invoice', 'quote', 'proforma', 'credit'].map((t) => `<option value="${t}" ${docFilter.type === t ? 'selected' : ''}>${DOC_TITLES[t]}</option>`).join('')}</select></div>
      <div><label>Status</label><select id="doc-status">
        <option value="">Any status</option>
        ${['issued', 'partial', 'paid', 'overdue', 'draft', 'quote', 'proforma', 'void'].map((st) => `<option value="${st}" ${docFilter.status === st ? 'selected' : ''}>${st}</option>`).join('')}
      </select></div>
      <div class="cell-end"><button class="btn primary" data-action="new-doc" data-value="invoice">+ New</button></div>
    </div>
    <div class="panel">
      ${rows.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>Number</th><th>Type</th><th>Customer</th><th>Issued</th><th>Due</th><th class="right">Total</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows.map((d) => {
          const st = getDocumentStatus(d);
          return `<tr class="clickable" data-action="open-doc" data-value="${d.id}">
            <td><strong>${esc(d.number)}</strong></td>
            <td><span class="pill ${d.type}">${DOC_TITLES[d.type] || d.type}</span></td>
            <td class="wrap">${esc(custName(d.customerId))}</td>
            <td>${esc(d.issueDate)}</td>
            <td>${esc(d.dueDate)}</td>
            <td class="right">${money(d.totalPaise ?? calculateDocumentTotals(d).total)}</td>
            <td><span class="pill ${st}">${st}</span></td>
            <td><button class="btn sm ghost" data-action="print-doc-id" data-value="${d.id}">Print</button></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>` : '<div class="empty">Nothing matches these filters.</div>'}
    </div>`;

  $('doc-q').addEventListener('input', (e) => { docFilter.q = e.target.value; RENDER.documents(); $('doc-q').focus(); });
  $('doc-q').setSelectionRange(docFilter.q.length, docFilter.q.length);
  $('doc-type').addEventListener('change', (e) => { docFilter.type = e.target.value; RENDER.documents(); });
  $('doc-status').addEventListener('change', (e) => { docFilter.status = e.target.value; RENDER.documents(); });
};

/* ---------- POS ---------- */
let cart = [];
RENDER.pos = () => {
  const products = scopeForCompany(getState().products);
  const walkInReady = getState().customers.some((c) => c.name === 'Walk-in Customer');

  const tiles = products.map((p) => `
    <button class="prod-tile" data-action="pos-add" data-value="${p.id}">
      <div class="name">${esc(p.name)}</div>
      <div class="price">${money(p.pricePaise)}</div>
      <div class="muted">${p.isService ? 'service' : esc(p.unit || '')}${p.trackStock ? ` · stock ${qtyStr(p.stockQuantityThousandths)}` : ''}</div>
    </button>`).join('');

  const cartTotals = (() => {
    if (!cart.length) return null;
    const pseudo = newDraft({
      type: 'invoice',
      customerId: '',
      items: cart.map((line) => {
        const p = getState().products.find((x) => x.id === line.id);
        return { productId: p.id, description: p.name, hsn: p.hsn, quantityThousandths: line.qty, ratePaise: p.pricePaise, discountRateBps: 0, taxRateBps: p.taxRateBps, isService: p.isService };
      })
    });
    return { pseudo, t: calculateDocumentTotals(pseudo) };
  })();

  $('page').innerHTML = `
  <div class="split">
    <div>
      <div class="panel">
        <div class="panel-head"><h2>Catalog</h2></div>
        <div class="mb-12"><input id="pos-search" placeholder="Scan barcode or search…" autocomplete="off"></div>
        ${products.length ? `<div class="pos-grid">${tiles}</div>` : '<div class="empty">Add products first.</div>'}
      </div>
    </div>
    <div class="sticky">
      <div class="panel">
        <div class="panel-head"><h2>Cart</h2>${cart.length ? '<button class="btn sm ghost" data-action="pos-clear">Clear</button>' : ''}</div>
        <div id="cart-lines">${cart.map((line) => {
          const p = getState().products.find((x) => x.id === line.id);
          return `<div class="cart-line">
            <span class="nm">${esc(p?.name || '?')}</span>
            <span class="stepper">
              <button class="qty-btn" data-action="pos-dec" data-value="${line.id}">−</button>
              <strong class="qty-num">${qtyStr(line.qty)}</strong>
              <button class="qty-btn" data-action="pos-inc" data-value="${line.id}">+</button>
            </span>
            <span class="line-amt">${money((p?.pricePaise || 0) * line.qty / 1000)}</span>
            <button class="icon-btn" data-action="pos-rm" data-value="${line.id}">✕</button>
          </div>`;
        }).join('') || '<div class="empty">Tap products to add them.</div>'}</div>
        ${cartTotals ? `
          <div class="totals">
            <div class="total-row"><span>Taxable</span><strong>${money(cartTotals.t.subtotal)}</strong></div>
            <div class="total-row"><span>GST</span><strong>${money(cartTotals.t.tax)}</strong></div>
            <div class="total-row grand"><span>Total</span><strong>${money(cartTotals.t.total)}</strong></div>
          </div>
          <button class="btn primary lg wide mt-16" data-action="pos-checkout">Charge ${money(cartTotals.t.total)} &amp; print</button>
          ${walkInReady ? '' : '<p class="muted fineprint">First sale creates a Walk-in Customer automatically.</p>'}` : ''}
      </div>
    </div>
  </div>`;

  const search = $('pos-search');
  search.addEventListener('input', () => {
    const v = search.value.trim();
    if (!v) return;
    const exact = getState().products.find((p) => p.barcode && p.barcode === v);
    if (exact) { addToCart(exact.id); search.value = ''; RENDER.pos(); $('pos-search').focus(); }
  });
};

function addToCart(productId) {
  const line = cart.find((l) => l.id === productId);
  if (line) line.qty += 1000; else cart.push({ id: productId, qty: 1000 });
}

/* ---------- customers ---------- */
let editingCustomerId = '';
RENDER.customers = () => {
  const list = [...scopeForCompany(getState().customers)].sort((a, b) => a.name.localeCompare(b.name));
  const edit = list.find((c) => c.id === editingCustomerId);
  $('page').innerHTML = `
  <div class="split">
    <div class="panel">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Name</th><th>Phone</th><th>GSTIN</th><th class="right">Outstanding</th><th></th></tr></thead>
        <tbody>${list.map((c) => `
          <tr>
            <td class="wrap"><strong>${esc(c.name)}</strong>${c.contactName ? `<br><span class="muted">${esc(c.contactName)}</span>` : ''}</td>
            <td>${esc(c.phone)}</td>
            <td>${esc(c.taxId)}</td>
            <td class="right">${money(customerOutstandingSafe(c.id))}</td>
            <td><button class="btn sm ghost" data-action="cust-edit" data-value="${c.id}">Edit</button></td>
          </tr>`).join('') || '<tr><td colspan="5"><div class="empty">No customers yet.</div></td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="sticky panel" id="cust-form-panel">
      <h2>${edit ? `Edit ${esc(edit.name)}` : 'Add customer'}</h2>
      <form id="cust-form" class="grid">
        <div><label>Name *</label><input name="name" required placeholder="Customer or business name" value="${esc(edit?.name)}"></div>
        <div><label>Contact person</label><input name="contactName" placeholder="Who to reach, if any" value="${esc(edit?.contactName)}"></div>
        <div class="grid two">
          <div><label>Phone</label><input name="phone" placeholder="+91 98765 43210" value="${esc(edit?.phone)}"></div>
          <div><label>Email</label><input name="email" type="email" placeholder="name@example.com" value="${esc(edit?.email)}"></div>
        </div>
        <div><label>GSTIN</label><input name="taxId" placeholder="27AAAAA0000A1Z5" value="${esc(edit?.taxId)}"></div>
        <div><label>Billing address</label><textarea name="billingAddress" placeholder="Street, area, city, PIN code">${esc(edit?.billingAddress)}</textarea></div>
        <div class="grid two">
          <div><label>Place of supply</label><select name="placeOfSupply"><option value=""></option>${Object.entries(STATE_CODES).map(([code, name]) => `<option value="${code}" ${edit?.placeOfSupply === code ? 'selected' : ''}>${code} · ${esc(name)}</option>`).join('')}</select></div>
          <div><label>Payment terms (days)</label><input name="paymentTermsDays" type="number" min="0" max="365" value="${esc(edit?.paymentTermsDays ?? 30)}"></div>
        </div>
        <div><label>Credit limit</label><input name="creditLimit" inputmode="decimal" placeholder="0 = none" value="${edit?.creditLimitPaise ? fromPaise(edit.creditLimitPaise) : ''}"></div>
        <div class="actions-row">
          <button class="btn primary" type="submit">${edit ? 'Save changes' : 'Add customer'}</button>
          ${edit ? '<button class="btn ghost" type="button" data-action="cust-clear">Cancel</button>' : ''}
        </div>
      </form>
    </div>
  </div>`;

  $('cust-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const saved = saveCustomer({
        id: editingCustomerId || undefined,
        name: fd.get('name'),
        contactName: fd.get('contactName'),
        phone: fd.get('phone'),
        email: fd.get('email'),
        taxId: fd.get('taxId'),
        billingAddress: fd.get('billingAddress'),
        placeOfSupply: fd.get('placeOfSupply'),
        paymentTermsDays: Number(fd.get('paymentTermsDays')) || 0,
        creditLimitPaise: parseMoney(fd.get('creditLimit')) ?? 0
      });
      editingCustomerId = '';
      await persist();
      toast(`Customer saved: ${saved.name}`);
      RENDER.customers();
    } catch (err) { toast(err.message, 'err'); }
  });
};
function customerOutstandingSafe(id) {
  return getState().documents
    .filter((d) => d.customerId === id && !['draft', 'void'].includes(d.status))
    .reduce((sum, d) => sum + Math.max(0, (d.totalPaise ?? calculateDocumentTotals(d).total) - paidAmountPaise(d)), 0);
}

/* ---------- products ---------- */
let editingProductId = '';
const UNITS = ['NOS', 'PCS', 'KGS', 'GMS', 'LTR', 'MTR', 'BOX', 'SET', 'HRS', 'DAY'];
RENDER.products = () => {
  const list = [...scopeForCompany(getState().products)].sort((a, b) => a.name.localeCompare(b.name));
  const edit = list.find((p) => p.id === editingProductId);
  $('page').innerHTML = `
  <div class="split">
    <div class="panel">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Item</th><th>SKU</th><th class="right">Price</th><th class="right">GST</th><th class="right">Stock</th><th></th></tr></thead>
        <tbody>${list.map((p) => {
          const isLow = p.trackStock && !p.isService && p.stockQuantityThousandths <= p.reorderLevelThousandths;
          return `<tr>
            <td class="wrap"><strong>${esc(p.name)}</strong>${p.hsn ? `<br><span class="muted">HSN ${esc(p.hsn)}</span>` : ''}</td>
            <td>${esc(p.sku)}</td>
            <td class="right">${money(p.pricePaise)}</td>
            <td class="right">${pctStr(p.taxRateBps)}</td>
            <td class="right">${p.isService ? '<span class="muted">service</span>' : p.trackStock ? `${qtyStr(p.stockQuantityThousandths)} ${esc(p.unit)} ${isLow ? '<span class="pill low">low</span>' : ''}` : '<span class="muted">—</span>'}</td>
            <td class="nowrap">
              ${p.trackStock && !p.isService ? `<button class="qty-btn" data-action="stock-step" data-value="${p.id}" data-delta="-1">−</button>
              <button class="qty-btn" data-action="stock-step" data-value="${p.id}" data-delta="1">+</button> ` : ''}
              <button class="btn sm ghost" data-action="prod-edit" data-value="${p.id}">Edit</button>
            </td>
          </tr>`;
        }).join('') || '<tr><td colspan="6"><div class="empty">No products or services yet.</div></td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="sticky panel">
      <h2>${edit ? `Edit ${esc(edit.name)}` : 'Add product or service'}</h2>
      <form id="prod-form" class="grid">
        <div><label>Name *</label><input name="name" required placeholder="Product or service name" value="${esc(edit?.name)}"></div>
        <div class="grid two">
          <div><label>SKU</label><input name="sku" placeholder="SKU-001" value="${esc(edit?.sku)}"></div>
          <div><label>Barcode</label><input name="barcode" placeholder="Scan or type barcode" value="${esc(edit?.barcode)}"></div>
        </div>
        <div class="grid three">
          <div><label>HSN/SAC</label><input name="hsn" placeholder="Code" value="${esc(edit?.hsn)}"></div>
          <div><label>Unit</label><input name="unit" list="unit-list" placeholder="NOS" value="${esc(edit?.unit || 'NOS')}"><datalist id="unit-list">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist></div>
          <div><label>GST %</label><input name="taxRate" inputmode="decimal" placeholder="18" value="${fromBps(edit?.taxRateBps ?? 1800)}"></div>
        </div>
        <div><label>Price</label><input name="price" inputmode="decimal" required placeholder="0.00" value="${fromPaise(edit?.pricePaise ?? 0)}"></div>
        <div class="check"><input id="p-service" name="isService" type="checkbox" ${edit?.isService ? 'checked' : ''}><label for="p-service">Service (no stock)</label></div>
        <div class="check"><input id="p-track" name="trackStock" type="checkbox" ${edit?.trackStock ? 'checked' : ''}><label for="p-track">Track stock</label></div>
        <div class="grid two">
          <div><label>Stock on hand</label><input name="stockQuantity" inputmode="decimal" placeholder="0" value="${fromThousandths(edit?.stockQuantityThousandths ?? 0)}"></div>
          <div><label>Reorder level</label><input name="reorderLevel" inputmode="decimal" placeholder="0" value="${fromThousandths(edit?.reorderLevelThousandths ?? 0)}"></div>
        </div>
        <div class="actions-row">
          <button class="btn primary" type="submit">${edit ? 'Save changes' : 'Add item'}</button>
          ${edit ? '<button class="btn ghost" type="button" data-action="prod-clear">Cancel</button>' : ''}
        </div>
      </form>
    </div>
  </div>`;

  $('prod-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const saved = saveProduct({
        id: editingProductId || undefined,
        name: fd.get('name'), sku: fd.get('sku'), barcode: fd.get('barcode'),
        hsn: fd.get('hsn'), unit: fd.get('unit') || 'NOS',
        price: fd.get('price'), taxRate: fd.get('taxRate'),
        isService: fd.get('isService') === 'on',
        trackStock: fd.get('trackStock') === 'on',
        stockQuantity: fd.get('stockQuantity'), reorderLevel: fd.get('reorderLevel')
      });
      editingProductId = '';
      await persist();
      toast(`Saved: ${saved.name}`);
      RENDER.products();
    } catch (err) { toast(err.message, 'err'); }
  });
};

/* ---------- expenses ---------- */
RENDER.expenses = () => {
  const list = [...scopeForCompany(getState().expenses)].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const monthStart = today().slice(0, 7) + '-01';
  const categories = [...new Set(['Rent', 'Salaries', 'Transport', 'Utilities', 'Purchases', 'Marketing', 'Repairs', 'Other', ...list.map((e) => e.category)])];
  $('page').innerHTML = `
  <div class="cards">
    <div class="tilt kpi"><div class="kpi-label">This month</div><div class="kpi-value bad">${money(expenseSummary({ from: monthStart }))}</div><div class="kpi-sub">since ${monthStart}</div></div>
    <div class="tilt kpi"><div class="kpi-label">All time</div><div class="kpi-value">${money(expenseSummary({}))}</div><div class="kpi-sub">${list.length} entries</div></div>
  </div>
  <div class="split">
    <div class="panel">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Date</th><th>Category</th><th>Vendor</th><th class="wrap">Notes</th><th class="right">Amount</th><th></th></tr></thead>
        <tbody>${list.map((e) => `
          <tr>
            <td>${esc(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.vendor)}</td>
            <td class="wrap muted">${esc(e.notes)}</td>
            <td class="right">${money(e.amountPaise)}</td>
            <td><button class="icon-btn" data-action="exp-del" data-value="${e.id}" title="Delete">✕</button></td>
          </tr>`).join('') || '<tr><td colspan="6"><div class="empty">No expenses logged.</div></td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="sticky panel">
      <h2>Log expense</h2>
      <form id="exp-form" class="grid">
        <div><label>Date</label><input name="date" type="date" value="${today()}" required></div>
        <div><label>Category</label><input name="category" list="cat-list" required placeholder="e.g. Rent or Transport"><datalist id="cat-list">${categories.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div><label>Paid to</label><input name="vendor" placeholder="Vendor or shop name"></div>
        <div><label>Amount *</label><input name="amount" inputmode="decimal" required placeholder="0.00"></div>
        <div><label>Notes</label><textarea name="notes" placeholder="Optional note for your records"></textarea></div>
        <button class="btn primary" type="submit">Save expense</button>
      </form>
    </div>
  </div>`;

  $('exp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const amount = parseMoney(fd.get('amount'));
    if (amount === null || amount <= 0) return toast('Enter a valid positive amount.', 'err');
    try {
      saveExpense({ date: fd.get('date'), category: fd.get('category'), vendor: fd.get('vendor'), notes: fd.get('notes'), amountPaise: amount });
      await persist();
      toast('Expense saved.');
      RENDER.expenses();
    } catch (err) { toast(err.message, 'err'); }
  });
};

/* ---------- recurring ---------- */
let recItems = [];
RENDER.recurring = () => {
  const templates = scopeForCompany(getState().recurringTemplates);
  $('page').innerHTML = `
  <div class="split">
    <div class="panel">
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Template</th><th>Customer</th><th>Frequency</th><th>Next date</th><th>Active</th><th></th></tr></thead>
        <tbody>${templates.map((t) => `
          <tr>
            <td class="wrap"><strong>${esc(t.name)}</strong><br><span class="muted">${t.items.length} item${t.items.length === 1 ? '' : 's'}</span></td>
            <td class="wrap">${esc(custName(t.customerId))}</td>
            <td>${esc(t.frequency)}</td>
            <td>${esc(t.nextDate)}</td>
            <td><input type="checkbox" data-rec-active="${t.id}" ${t.active ? 'checked' : ''}></td>
            <td class="nowrap">
              <button class="btn sm" data-action="rec-gen" data-value="${t.id}">Generate now</button>
              <button class="icon-btn neutral" data-action="rec-edit" data-value="${t.id}" title="Edit">✎</button>
              <button class="icon-btn" data-action="rec-del" data-value="${t.id}" title="Delete">✕</button>
            </td>
          </tr>`).join('') || '<tr><td colspan="6"><div class="empty">No templates. Due templates generate invoice drafts automatically at unlock.</div></td></tr>'}</tbody>
      </table></div>
    </div>
    <div class="sticky panel">
      <h2>New template</h2>
      <form id="rec-form" class="grid">
        <div><label>Template name *</label><input name="name" required placeholder="Monthly rent invoice"></div>
        <div class="grid two">
          <div><label>Customer *</label><select name="customerId" required><option value=""></option>${getState().customers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div><label>Frequency</label><select name="frequency"><option value="weekly">Weekly</option><option value="monthly" selected>Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></div>
        </div>
        <div><label>Next date</label><input name="nextDate" type="date" value="${today()}"></div>
        <fieldset><legend>Items</legend>
          <div class="grid">
            <div id="rec-items">${recItemRows()}</div>
            <button class="btn sm" type="button" data-action="rec-add-line">+ Add line</button>
          </div>
        </fieldset>
        <div><label>Terms</label><textarea name="terms" placeholder="Payment due within 30 days."></textarea></div>
        <button class="btn primary" type="submit">Save template</button>
      </form>
    </div>
  </div>`;

  bindRecItems();
  $('rec-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      saveRecurringTemplate({
        id: e.target.dataset.editing || undefined,
        name: fd.get('name'), customerId: fd.get('customerId'), frequency: fd.get('frequency'),
        nextDate: fd.get('nextDate'), terms: fd.get('terms'), active: true, items: recItems
      });
      recItems = [];
      delete e.target.dataset.editing;
      await persist();
      toast('Template saved.');
      RENDER.recurring();
    } catch (err) { toast(err.message, 'err'); }
  });
};
function recItemRows() {
  if (!recItems.length) recItems = [{ description: '', quantityThousandths: 1000, ratePaise: 0, taxRateBps: 1800 }];
  return recItems.map((it, i) => `
    <div class="cart-line" data-ri="${i}">
      <input data-ri="${i}" data-rf="description" value="${esc(it.description)}" placeholder="Description">
      <input data-ri="${i}" data-rf="qty" value="${qtyStr(it.quantityThousandths)}" inputmode="decimal" placeholder="Qty" aria-label="Quantity">
      <input data-ri="${i}" data-rf="rate" value="${fromPaise(it.ratePaise)}" inputmode="decimal" placeholder="0.00" aria-label="Rate">
      <input data-ri="${i}" data-rf="tax" value="${fromBps(it.taxRateBps)}" inputmode="decimal" placeholder="%" aria-label="Tax percent">
      <button class="icon-btn" type="button" data-action="rec-rm-line" data-value="${i}">✕</button>
    </div>`).join('');
}
function bindRecItems() {
  $('rec-items').querySelectorAll('[data-ri]').forEach((el) => {
    el.addEventListener('input', () => {
      const i = Number(el.dataset.ri);
      const f = el.dataset.rf;
      if (f === 'description') { recItems[i].description = el.value; return; }
      const v = f === 'qty' ? parseQty(el.value) : f === 'rate' ? parseMoney(el.value) : parseRate(el.value);
      el.classList.toggle('invalid', v === null);
      if (v === null) return;
      if (f === 'qty') recItems[i].quantityThousandths = v;
      if (f === 'rate') recItems[i].ratePaise = v;
      if (f === 'tax') recItems[i].taxRateBps = v;
    });
  });
}

/* ---------- reports ---------- */
let reportTab = 'overview';
let reportRange = { from: '', to: '' };
RENDER.reports = () => {
  const tabs = [['overview', 'Overview'], ['outstanding', 'Outstanding'], ['gst', 'GST'], ['inventory', 'Inventory'], ['audit', 'Audit']];
  $('page').innerHTML = `
    <div class="tabs">${tabs.map(([id, label]) => `<button class="tab ${reportTab === id ? 'active' : ''}" data-action="tab-set" data-value="${id}">${label}</button>`).join('')}</div>
    <div class="filters">
      <div><label>From</label><input id="rep-from" type="date" value="${reportRange.from}"></div>
      <div><label>To</label><input id="rep-to" type="date" value="${reportRange.to}"></div>
    </div>
    <div id="report-body"></div>`;

  $('rep-from').addEventListener('change', (e) => { reportRange.from = e.target.value; renderReportTab(); });
  $('rep-to').addEventListener('change', (e) => { reportRange.to = e.target.value; renderReportTab(); });
  renderReportTab();
};

function bars(rows, format = money) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return rows.map((r) => `
    <div class="bar-row">
      <span>${esc(r.label)}</span>
      <div class="bar-track"><div class="bar-fill" data-w="${Math.max(2, Math.round((r.value / max) * 100))}"></div></div>
      <span class="bar-val">${format(r.value)}</span>
    </div>`).join('') || '<div class="empty">No data in this range.</div>';
}

function applyBarWidths(scope) {
  scope.querySelectorAll('.bar-fill').forEach((el) => { el.style.width = `${el.dataset.w}%`; });
}

function renderReportTab() {
  const body = $('report-body');
  const range = reportRange;

  if (reportTab === 'overview') {
    const months = monthlySales(range).slice(-12);
    const expenses = Object.entries(expenseByCategory(range)).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    const sales = salesRegister(range);
    const total = sales.reduce((s, r) => s + r.totals.total, 0);
    body.innerHTML = `
      <div class="cards">
        <div class="tilt kpi"><div class="kpi-label">Sales</div><div class="kpi-value accent">${money(total)}</div><div class="kpi-sub">${sales.length} documents</div></div>
        <div class="tilt kpi"><div class="kpi-label">Expenses</div><div class="kpi-value bad">${money(expenseSummary(range))}</div></div>
        <div class="tilt kpi"><div class="kpi-label">Net (sales − expenses)</div><div class="kpi-value ${total - expenseSummary(range) >= 0 ? 'good' : 'bad'}">${money(total - expenseSummary(range))}</div></div>
      </div>
      <div class="grid two">
        <div class="panel"><div class="panel-head"><h2>Sales by month</h2><button class="btn sm ghost" data-action="export-csv" data-value="sales">CSV</button></div>
          ${bars(months.map((m) => ({ label: m.month, value: m.totalPaise })))}</div>
        <div class="panel"><div class="panel-head"><h2>Expenses by category</h2><button class="btn sm ghost" data-action="export-csv" data-value="expenses">CSV</button></div>
          ${bars(expenses)}</div>
      </div>`;
    applyBarWidths(body);
  } else if (reportTab === 'outstanding') {
    const rows = outstandingReport(range);
    const aging = agingReport(today());
    body.innerHTML = `
      <div class="cards">
        <div class="tilt kpi"><div class="kpi-label">Current</div><div class="kpi-value">${money(aging.current)}</div></div>
        <div class="tilt kpi"><div class="kpi-label">1–30 days late</div><div class="kpi-value ${aging.days30 ? 'bad' : ''}">${money(aging.days30)}</div></div>
        <div class="tilt kpi"><div class="kpi-label">31–60 days late</div><div class="kpi-value ${aging.days60 ? 'bad' : ''}">${money(aging.days60)}</div></div>
        <div class="tilt kpi"><div class="kpi-label">90+ days late</div><div class="kpi-value ${aging.days90Plus ? 'bad' : ''}">${money(aging.days90Plus)}</div></div>
      </div>
      <div class="panel"><div class="panel-head"><h2>Open balances</h2><button class="btn sm ghost" data-action="export-csv" data-value="outstanding">CSV</button></div>
        ${rows.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>Number</th><th>Customer</th><th>Due date</th><th>Status</th><th class="right">Outstanding</th></tr></thead>
          <tbody>${rows.map((r) => `<tr><td><strong>${esc(r.document.number)}</strong></td><td class="wrap">${esc(custName(r.document.customerId))}</td><td>${esc(r.document.dueDate)}</td><td><span class="pill ${r.status}">${r.status}</span></td><td class="right">${money(r.outstandingPaise)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<div class="empty">Everything is collected. 🎉</div>'}
      </div>`;
  } else if (reportTab === 'gst') {
    const liability = taxLiability(range);
    const rates = Object.entries(liability).sort((a, b) => Number(a[0]) - Number(b[0]));
    body.innerHTML = `
      <div class="panel"><div class="panel-head"><h2>GST liability by rate</h2><button class="btn sm ghost" data-action="export-csv" data-value="gst">CSV</button></div>
      ${rates.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th class="right">Rate</th><th class="right">Taxable</th><th class="right">CGST</th><th class="right">SGST</th><th class="right">IGST</th></tr></thead>
        <tbody>${rates.map(([rate, r]) => `<tr>
          <td class="right">${trimNum(rate / 100)}%</td>
          <td class="right">${money(r.taxablePaise)}</td>
          <td class="right">${money(r.cgstPaise)}</td>
          <td class="right">${money(r.sgstPaise)}</td>
          <td class="right">${money(r.igstPaise)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">No taxable sales in this range.</div>'}</div>`;
  } else if (reportTab === 'inventory') {
    const soldMap = new Map();
    for (const { document } of salesRegister(range)) {
      for (const it of calculateDocumentTotals(document).rows) {
        const key = it.productId || it.description;
        const cur = soldMap.get(key) || { label: it.description, quantityThousandths: 0, amountPaise: 0 };
        cur.quantityThousandths += it.quantityThousandths;
        cur.amountPaise += it.lineTotalPaise;
        soldMap.set(key, cur);
      }
    }
    const sold = [...soldMap.values()].sort((a, b) => b.amountPaise - a.amountPaise);
    const low = lowStockProducts();
    body.innerHTML = `
      <div class="grid two">
        <div class="panel"><h2>Best sellers</h2>
          ${sold.length ? `<div class="table-wrap"><table class="data">
            <thead><tr><th>Item</th><th class="right">Qty sold</th><th class="right">Revenue</th></tr></thead>
            <tbody>${sold.slice(0, 15).map((p) => `<tr><td class="wrap">${esc(p.label)}</td><td class="right">${qtyStr(p.quantityThousandths)}</td><td class="right">${money(p.amountPaise)}</td></tr>`).join('')}</tbody>
          </table></div>` : '<div class="empty">No sales in this range.</div>'}</div>
        <div class="panel"><h2>Reorder soon</h2>
          ${low.length ? `<ul>${low.map((p) => `<li>${esc(p.name)} — ${qtyStr(p.stockQuantityThousandths)} ${esc(p.unit)} left (reorder at ${qtyStr(p.reorderLevelThousandths)})</li>`).join('')}</ul>` : '<div class="empty">Stock levels are healthy.</div>'}</div>
      </div>`;
  } else if (reportTab === 'audit') {
    const events = getState().audit.filter((a) => !a.companyId || a.companyId === activeCompany().id).slice(0, 100);
    body.innerHTML = `
      <div class="panel"><h2>Audit trail (latest 100)</h2>
      ${events.length ? `<div class="table-wrap"><table class="data">
        <thead><tr><th>When</th><th>Action</th><th>Details</th></tr></thead>
        <tbody>${events.map((e) => `<tr><td class="nowrap">${new Date(e.at).toLocaleString()}</td><td>${esc(e.action)}</td><td class="wrap muted">${esc(e.details)}</td></tr>`).join('')}</tbody>
      </table></div>` : '<div class="empty">No activity recorded yet.</div>'}</div>`;
  }
}

function exportCsv(kind) {
  const range = reportRange;
  if (kind === 'sales') {
    downloadText(toCsv(
      ['number', 'type', 'customer', 'issueDate', 'dueDate', 'total', 'paid', 'status'],
      salesRegister(range).map(({ document, totals, status }) => ({
        number: document.number, type: document.type, customer: custName(document.customerId),
        issueDate: document.issueDate, dueDate: document.dueDate,
        total: fromPaise(totals.total), paid: fromPaise(paidAmountPaise(document)), status
      }))
    ), `sales-${today()}.csv`);
  } else if (kind === 'outstanding') {
    downloadText(toCsv(
      ['number', 'customer', 'dueDate', 'status', 'outstanding'],
      outstandingReport(range).map((r) => ({
        number: r.document.number, customer: custName(r.document.customerId),
        dueDate: r.document.dueDate, status: r.status, outstanding: fromPaise(r.outstandingPaise)
      }))
    ), `outstanding-${today()}.csv`);
  } else if (kind === 'gst') {
    downloadText(toCsv(
      ['ratePercent', 'taxable', 'cgst', 'sgst', 'igst'],
      Object.entries(taxLiability(range)).map(([rate, r]) => ({
        ratePercent: trimNum(rate / 100), taxable: fromPaise(r.taxablePaise),
        cgst: fromPaise(r.cgstPaise), sgst: fromPaise(r.sgstPaise), igst: fromPaise(r.igstPaise)
      }))
    ), `gst-${today()}.csv`);
  } else if (kind === 'expenses') {
    downloadText(toCsv(
      ['date', 'category', 'vendor', 'amount', 'notes'],
      scopeForCompany(getState().expenses)
        .filter((e) => (!range.from || e.date >= range.from) && (!range.to || e.date <= range.to))
        .map((e) => ({ date: e.date, category: e.category, vendor: e.vendor, amount: fromPaise(e.amountPaise), notes: e.notes }))
    ), `expenses-${today()}.csv`);
  }
  toast('CSV downloaded.');
}

/* ---------- business & backup ---------- */
let backupFile = null;
let backupPreviewState = null;
RENDER.business = () => {
  const c = activeCompany();
  $('page').innerHTML = `
  <div class="grid two">
    <div class="panel">
      <h2>Business identity</h2>
      <form id="biz-form" class="grid">
        <div class="grid two">
          <div><label>Display name *</label><input name="name" required placeholder="Your shop or firm name" value="${esc(c.name)}"></div>
          <div><label>Legal name</label><input name="legalName" placeholder="Registered legal name" value="${esc(c.legalName)}"></div>
        </div>
        <div class="grid two">
          <div><label>GSTIN</label><input name="taxId" placeholder="27AAAAA0000A1Z5" value="${esc(c.taxId)}"></div>
          <div><label>Invoice prefix</label><input name="prefix" placeholder="INV" value="${esc(c.prefix || 'INV')}"></div>
        </div>
        <div><label>Address</label><textarea name="address" placeholder="Street, area, landmark">${esc(c.address)}</textarea></div>
        <div class="grid two">
          <div><label>City</label><input name="city" placeholder="City" value="${esc(c.city)}"></div>
          <div><label>PIN code</label><input name="pinCode" placeholder="6-digit PIN" value="${esc(c.pinCode)}"></div>
        </div>
        <div class="grid two">
          <div><label>Phone</label><input name="phone" placeholder="+91 98765 43210" value="${esc(c.phone)}"></div>
          <div><label>Email</label><input name="email" type="email" placeholder="business@example.com" value="${esc(c.email)}"></div>
        </div>
        <div><label>Payment details (printed)</label><textarea name="paymentDetails" placeholder="Bank, account, UPI ID…">${esc(c.paymentDetails || c.bank)}</textarea></div>
        <div><label>Default terms</label><textarea name="terms" placeholder="Payment due within 30 days.">${esc(c.terms)}</textarea></div>
        <div class="grid two">
          <div><label>Logo</label><input type="file" id="biz-logo" accept="image/png,image/jpeg,image/webp,image/svg+xml">${c.logo ? `<img class="logo-chip" src="${c.logo}" alt="logo">` : ''}</div>
          <div><label>Signature</label><input type="file" id="biz-sign" accept="image/png,image/jpeg,image/webp,image/svg+xml">${c.signature ? `<img class="logo-chip" src="${c.signature}" alt="signature">` : ''}</div>
        </div>
        <div><button class="btn primary" type="submit">Save identity</button></div>
      </form>
    </div>

    <div>
      <div class="panel">
        <h2>Encrypted backup</h2>
        <p class="muted">Backups are AES-GCM encrypted with their own password. Store them somewhere safe — the vault password cannot be recovered.</p>
        <div class="grid two">
          <div><label>Backup password</label><input id="bk-pass" type="password" minlength="12" placeholder="min 12 chars"></div>
          <div class="cell-end"><button class="btn primary" data-action="backup-export">Download backup</button></div>
        </div>
        <hr class="rule">
        <div class="grid two">
          <div><label>Backup file</label><input type="file" id="bk-file" accept="application/json,.json"></div>
          <div><label>Backup password</label><input id="bk-pass2" type="password" placeholder="Password used to encrypt it"></div>
        </div>
        <div id="bk-preview"></div>
      </div>
      <div class="panel">
        <h2>Vault</h2>
        <p class="muted mb-12">Data lives encrypted in this browser (IndexedDB + AES-GCM). Locking clears the key from memory.</p>
        <div class="actions-row">
          <button class="btn" data-action="lock-now">Lock vault now</button>
          <button class="btn danger" data-action="wipe-vault">Erase all data…</button>
        </div>
        <p class="muted fineprint">Erasing removes every record from this browser permanently. Export an encrypted backup first if in doubt.</p>
      </div>
    </div>
  </div>`;

  $('biz-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    Object.assign(activeCompany(), {
      name: String(fd.get('name')).trim() || activeCompany().name,
      legalName: fd.get('legalName'), taxId: String(fd.get('taxId')).trim().toUpperCase(),
      prefix: String(fd.get('prefix')).trim() || 'INV',
      address: fd.get('address'), city: fd.get('city'), pinCode: fd.get('pinCode'),
      phone: fd.get('phone'), email: fd.get('email'),
      paymentDetails: fd.get('paymentDetails'), bank: fd.get('paymentDetails'), terms: fd.get('terms')
    });
    addAudit('company.updated', 'company', activeCompany().id, activeCompany().name);
    await persist();
    toast('Business identity saved.');
  });

  const readImage = (file, cb) => {
    if (!file) return;
    if (file.size > 300 * 1024) return toast('Image must be under 300 KB.', 'err');
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsDataURL(file);
  };
  $('biz-logo').addEventListener('change', (e) => readImage(e.target.files[0], async (dataUrl) => {
    activeCompany().logo = dataUrl; await persist(); toast('Logo saved.'); RENDER.business();
  }));
  $('biz-sign').addEventListener('change', (e) => readImage(e.target.files[0], async (dataUrl) => {
    activeCompany().signature = dataUrl; await persist(); toast('Signature saved.'); RENDER.business();
  }));

  $('bk-file').addEventListener('change', async (e) => {
    backupFile = e.target.files[0];
    backupPreviewState = null;
    $('bk-preview').innerHTML = backupFile ? '<p class="muted">Enter the backup password and press Preview.</p><button class="btn" data-action="backup-preview">Preview contents</button>' : '';
  });
};

async function doBackupPreview() {
  try {
    const pass = $('bk-pass2').value;
    if (!backupFile) return toast('Choose a backup file first.', 'err');
    const { state, summary } = await previewBackupFile(backupFile, pass);
    backupPreviewState = state;
    $('bk-preview').innerHTML = `
      <div class="notice info">${summary.companies.map((co) => `<strong>${esc(co.name)}</strong>: ${co.documentCount} documents, ${co.customerCount} customers, ${co.productCount} products`).join('<br>')}</div>
      <button class="btn danger" data-action="restore-confirm">Overwrite current data with this backup</button>`;
    toast('Backup decrypted.');
  } catch (err) { toast(err.message, 'err'); }
}

/* ============================================================ actions */
const ACTIONS = {
  'new-doc': (type) => { draft = newDraft({ type: type || 'invoice' }); draft._isNew = true; go('builder'); },
  'open-doc': (id) => openDoc(id),
  'print-doc': () => { syncBuilderFromForm(); printDoc(draft); },
  'print-doc-id': (id) => { const doc = getState().documents.find((d) => d.id === id); if (doc) printDoc(doc); },

  'add-line': () => {
    draft.items.push(newLine());
    renderItemsBody(); refreshTotals();
  },
  'remove-line': (i) => { draft.items.splice(Number(i), 1); renderItemsBody(); refreshTotals(); },

  'save-draft': async () => {
    syncBuilderFromForm();
    upsertDraftToState();
    addAudit('document.saved', 'document', draft.id, draft.number);
    await persist();
    toast(`Draft ${draft.number} saved.`);
    route();
  },
  'issue-doc': async () => {
    syncBuilderFromForm();
    const check = validateInvoiceBeforeIssue(draft);
    if (!check.isValid) return showBuilderErrors(check.errors);
    try {
      issueDocument(draft);
      upsertDraftToState();
      await persist();
      showBuilderErrors([]);
      toast(`${draft.number} issued.`);
      route();
    } catch (err) { showBuilderErrors([err.message]); }
  },
  'delete-draft': async () => {
    const list = getState().documents;
    const idx = list.findIndex((d) => d.id === draft.id);
    if (idx >= 0) list.splice(idx, 1);
    addAudit('document.deleted', 'document', draft.id, draft.number);
    await persist();
    toast('Draft deleted.');
    draft = null;
    go('documents');
  },
  'convert-quote': async () => {
    const live = getState().documents.find((d) => d.id === draft.id);
    if (!live) return toast('Save the quote first.', 'err');
    const invoice = convertQuote(live);
    draft = invoice; draft._isNew = true;
    await persist();
    toast(`Converted to ${invoice.number}.`);
    route();
  },
  'correction': async (type) => {
    const live = getState().documents.find((d) => d.id === draft.id);
    if (!live) return toast('Save and issue the original first.', 'err');
    draft = createCorrection(live, type || 'credit');
    draft._isNew = true;
    go('builder');
  },
  'void-toggle': () => { const s = $('void-strip'); s.style.display = s.style.display === 'grid' ? 'none' : 'grid'; },
  'void-confirm': async () => {
    const live = getState().documents.find((d) => d.id === draft.id);
    if (!live) return toast('Save first.', 'err');
    try {
      voidDocument(live, $('void-reason').value);
      await persist();
      toast(`${live.number} voided.`);
      route();
    } catch (err) { toast(err.message, 'err'); }
  },
  'pay-toggle': () => {
    const s = $('pay-strip');
    if (s.style.display === 'none' || !s.innerHTML) { renderPayStrip(); s.style.display = 'grid'; }
    else s.style.display = 'none';
  },
  'pay-confirm': async () => {
    const live = getState().documents.find((d) => d.id === draft.id);
    if (!live) return toast('Save the document first.', 'err');
    const amount = parseMoney($('pay-amount').value);
    if (amount === null || amount <= 0) return toast('Enter a valid payment amount.', 'err');
    try {
      recordPayment(live, { amountPaise: amount, date: $('pay-date').value || today(), method: $('pay-method').value, reference: $('pay-ref').value });
      await persist();
      toast('Payment recorded.');
      route();
    } catch (err) { toast(err.message, 'err'); }
  },

  'quickadd-toggle': () => { const q = $('quickadd'); q.style.display = q.style.display === 'grid' ? 'none' : 'grid'; },
  'quickadd-save': async () => {
    try {
      const saved = saveCustomer({ name: $('qa-name').value, phone: $('qa-phone').value, taxId: $('qa-gstin').value });
      draft.customerId = saved.id;
      await persist();
      toast(`Customer added: ${saved.name}`);
      route();
    } catch (err) { toast(err.message, 'err'); }
  },

  'cust-edit': (id) => { editingCustomerId = id; RENDER.customers(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  'cust-clear': () => { editingCustomerId = ''; RENDER.customers(); },

  'prod-edit': (id) => { editingProductId = id; RENDER.products(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  'prod-clear': () => { editingProductId = ''; RENDER.products(); },
  'stock-step': async (id, el) => {
    const delta = Number(el.dataset.delta) * 1000;
    adjustStock(id, delta, 'counter adjustment');
    await persist();
    RENDER.products();
  },

  'exp-del': async (id) => {
    const list = getState().expenses;
    const idx = list.findIndex((e) => e.id === id);
    if (idx >= 0) { addAudit('expense.deleted', 'expense', id, list[idx].category); list.splice(idx, 1); }
    await persist();
    toast('Expense removed.');
    RENDER.expenses();
  },

  'rec-add-line': () => { recItems.push({ description: '', quantityThousandths: 1000, ratePaise: 0, taxRateBps: 1800 }); $('rec-items').innerHTML = recItemRows(); bindRecItems(); },
  'rec-rm-line': (i) => { recItems.splice(Number(i), 1); $('rec-items').innerHTML = recItemRows(); bindRecItems(); },
  'rec-edit': (id) => {
    const t = getState().recurringTemplates.find((x) => x.id === id);
    if (!t) return;
    recItems = structuredClone(t.items);
    RENDER.recurring();
    const form = $('rec-form');
    form.dataset.editing = t.id;
    form.elements.name.value = t.name;
    form.elements.customerId.value = t.customerId;
    form.elements.frequency.value = t.frequency;
    form.elements.nextDate.value = t.nextDate;
    form.elements.terms.value = t.terms || '';
    form.querySelector('button[type=submit]').textContent = 'Save changes';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  'rec-del': async (id) => {
    const list = getState().recurringTemplates;
    const idx = list.findIndex((t) => t.id === id);
    if (idx >= 0) list.splice(idx, 1);
    addAudit('recurring.deleted', 'recurring', id, '');
    await persist();
    toast('Template deleted.');
    RENDER.recurring();
  },
  'rec-gen': async (id) => {
    const t = getState().recurringTemplates.find((x) => x.id === id);
    if (!t) return;
    const months = t.frequency === 'quarterly' ? 3 : t.frequency === 'yearly' ? 12 : t.frequency === 'weekly' ? 0 : 1;
    const inv = newDraft({ type: 'invoice', customerId: t.customerId, items: t.items, notes: t.notes, terms: t.terms });
    inv.recurringTemplateId = t.id;
    getState().documents.push(inv);
    t.nextDate = addMonthsClamped(t.nextDate, months);
    addAudit('recurring.generated', 'document', inv.id, t.name);
    await persist();
    toast(`Created draft ${inv.number}. Next: ${t.nextDate}`);
    RENDER.recurring();
  },

  'tab-set': (tab) => { reportTab = tab; RENDER.reports(); },
  'export-csv': (kind) => exportCsv(kind),

  'pos-add': (id) => { addToCart(id); RENDER.pos(); },
  'pos-inc': (id) => { addToCart(id); RENDER.pos(); },
  'pos-dec': (id) => {
    const line = cart.find((l) => l.id === id);
    if (line) { line.qty -= 1000; if (line.qty <= 0) cart = cart.filter((l) => l.id !== id); }
    RENDER.pos();
  },
  'pos-rm': (id) => { cart = cart.filter((l) => l.id !== id); RENDER.pos(); },
  'pos-clear': () => { cart = []; RENDER.pos(); },
  'pos-checkout': async () => {
    if (!cart.length) return toast('Cart is empty.', 'err');
    try {
      let walkIn = getState().customers.find((c) => c.name === 'Walk-in Customer');
      if (!walkIn) walkIn = saveCustomer({ name: 'Walk-in Customer' });
      const items = cart.map((line) => {
        const p = getState().products.find((x) => x.id === line.id);
        return { productId: p.id, description: p.name, hsn: p.hsn, quantityThousandths: line.qty, ratePaise: p.pricePaise, discountRateBps: 0, taxRateBps: p.taxRateBps, isService: p.isService };
      });
      const doc = newDraft({ type: 'invoice', customerId: walkIn.id, issueDate: today(), dueDate: today(), terms: 'Paid at point of sale.', items });
      issueDocument(doc);
      getState().documents.push(doc);
      const total = calculateDocumentTotals(doc).total;
      if (total > 0) recordPayment(doc, { amountPaise: total, method: 'cash', date: today(), reference: 'POS' });
      for (const line of cart) adjustStock(line.id, -line.qty, 'POS sale');
      await persist();
      cart = [];
      toast(`Sale complete — ${doc.number}`);
      RENDER.pos();
      printDoc(getState().documents.find((d) => d.id === doc.id));
    } catch (err) { toast(err.message, 'err'); }
  },

  'backup-export': async () => {
    try {
      await exportBackup($('bk-pass').value);
      toast('Encrypted backup downloaded.');
    } catch (err) { toast(err.message, 'err'); }
  },
  'backup-preview': () => doBackupPreview(),
  'restore-confirm': async () => {
    if (!backupPreviewState) return;
    try {
      await performRestore(backupPreviewState, false);
      toast('Vault restored. Reloading…');
      setTimeout(() => location.reload(), 900);
    } catch (err) { toast(err.message, 'err'); }
  },
  'lock-now': () => location.reload(),
  'wipe-vault': async () => {
    if (!confirm('Erase ALL data stored in this browser — every invoice, customer, product and expense? This cannot be undone.')) return;
    if (!confirm('Last chance. Download a backup first if you might need this data. Erase everything now?')) return;
    indexedDB.deleteDatabase(DB_NAME);
    localStorage.removeItem('vault_salt');
    localStorage.removeItem('vault_kdf_iterations');
    location.reload();
  }
};

document.addEventListener('click', async (event) => {
  const jump = event.target.closest('[data-route-jump]');
  if (jump) return go(jump.dataset.routeJump);
  const el = event.target.closest('[data-action]');
  if (!el) return;
  const handler = ACTIONS[el.dataset.action];
  if (!handler) return;
  event.preventDefault?.();
  try { await handler(el.dataset.value, el); } catch (err) { toast(err.message || 'Something went wrong.', 'err'); console.error(err); }
});

document.addEventListener('change', (event) => {
  const el = event.target.closest('[data-rec-active]');
  if (!el) return;
  const t = getState().recurringTemplates.find((x) => x.id === el.dataset.recActive);
  if (t) { t.active = el.checked; persist().then(() => toast(t.active ? 'Template enabled.' : 'Template paused.')); }
});

/* nav */
document.querySelectorAll('.nav-btn').forEach((btn) => btn.addEventListener('click', () => go(btn.dataset.route)));
$('quick-new').addEventListener('click', () => ACTIONS['new-doc']('invoice'));
$('lock-vault').addEventListener('click', () => location.reload());

/* ============================================================ boot */
async function boot(password) {
  $('gate-message').textContent = 'Decrypting local vault…';
  await initializeState(password);
  const generated = generateDueRecurring();
  if (generated.length) await persist(`${generated.length} recurring draft(s)`);
  $('gate').classList.add('open');
  $('app').hidden = false;
  route();
}

/* first visit vs returning */
if (!localStorage.getItem('vault_salt')) {
  $('gate-title').textContent = 'Create your invoice vault';
  $('gate-copy').textContent = 'All data stays encrypted on this device. Pick a strong password of at least 12 characters — it cannot be recovered if lost.';
  $('vault-submit').textContent = 'Create vault';
}
$('vault-reveal').addEventListener('click', () => {
  const input = $('vault-password');
  const show = input.type === 'password';
  input.type = show ? 'text' : 'password';
  $('vault-reveal').textContent = show ? 'Hide' : 'Show';
  $('vault-reveal').setAttribute('aria-label', show ? 'Hide password' : 'Show password');
});
$('vault-submit').addEventListener('click', async () => {
  const password = $('vault-password').value;
  if (password.length < 12) {
    $('gate-message').textContent = 'Password must be at least 12 characters.';
    return;
  }
  try { await boot(password); } catch (err) {
    $('gate-message').textContent = err.message.includes('Decryption') || err.message.includes('decrypt')
      ? 'Wrong password, or the vault is corrupt.'
      : err.message;
  }
});
$('vault-password').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('vault-submit').click(); });
$('vault-demo').addEventListener('click', () => {
  $('vault-password').value = 'temporary-demo-password';
  $('vault-submit').click();
});
window.addEventListener('hashchange', route);
