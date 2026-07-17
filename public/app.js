document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const KEY = 'ledgerly.local.v2';
  const $ = (id) => document.getElementById(id);
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
  const today = () => new Date().toISOString().slice(0, 10);
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const amount = (value) => Math.round((Number(value) || 0) * 100);
  const money = (minor, currency = 'INR') => new Intl.NumberFormat(undefined, { style: 'currency', currency }).format((minor || 0) / 100);
  const clone = (value) => JSON.parse(JSON.stringify(value));

  const initialState = () => ({
    company: { name: 'My Business', email: '', phone: '', address: '', taxId: '', currency: 'INR', prefix: 'INV', bank: '' },
    customers: [],
    products: [],
    documents: [],
    payments: []
  });

  let state;
  try { state = JSON.parse(localStorage.getItem(KEY)) || initialState(); } catch { state = initialState(); }
  if (!state.company || !Array.isArray(state.documents)) state = initialState();

  let page = 'dashboard';
  let draft;

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    $('save-status').textContent = 'Saved locally';
  }

  function nextNumber(type = 'invoice') {
    const prefix = type === 'quote' ? 'QTE' : type === 'credit' ? 'CRN' : (state.company.prefix || 'INV');
    const year = new Date().getFullYear();
    const highest = state.documents
      .filter((doc) => doc.number.startsWith(prefix + '-' + year + '-'))
      .map((doc) => Number(doc.number.split('-').pop()) || 0)
      .reduce((max, value) => Math.max(max, value), 0);
    return prefix + '-' + year + '-' + String(highest + 1).padStart(4, '0');
  }

  function newDraft(source = {}) {
    return {
      id: source.id || '',
      type: source.type || 'invoice',
      number: source.number || nextNumber(source.type || 'invoice'),
      status: source.status || 'draft',
      customerId: source.customerId || '',
      issueDate: source.issueDate || today(),
      dueDate: source.dueDate || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      currency: source.currency || state.company.currency || 'INR',
      notes: source.notes || '',
      terms: source.terms || 'Payment due within 30 days.',
      items: source.items?.length ? clone(source.items) : [{ id: uid(), description: '', hsn: '', quantity: 1, rate: 0, taxRate: 18 }]
    };
  }

  function customerFor(document) {
    return state.customers.find((customer) => customer.id === document.customerId);
  }

  function totals(document) {
    const multiplier = document.type === 'credit' ? -1 : 1;
    let subtotal = 0;
    let tax = 0;
    const rows = document.items.map((item) => {
      const line = Math.round(amount(item.rate) * Math.max(0, Number(item.quantity) || 0));
      const lineTax = Math.round(line * Math.max(0, Number(item.taxRate) || 0) / 100);
      subtotal += line;
      tax += lineTax;
      return { ...item, line: line * multiplier, tax: lineTax * multiplier, total: (line + lineTax) * multiplier };
    });
    return { rows, subtotal: subtotal * multiplier, tax: tax * multiplier, total: (subtotal + tax) * multiplier };
  }

  function paid(document) {
    return state.payments.filter((payment) => payment.documentId === document.id).reduce((sum, payment) => sum + payment.amount, 0);
  }

  function status(document) {
    if (document.status === 'draft' || document.status === 'void' || document.type === 'quote') return document.status;
    const outstanding = totals(document).total - paid(document);
    if (outstanding <= 0) return 'paid';
    if (paid(document) > 0) return 'partial';
    return document.dueDate < today() ? 'overdue' : 'issued';
  }

  function table(headers, rows) {
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      headers.map((header) => '<th>' + header + '</th>').join('') +
      '</tr></thead><tbody>' + (Array.isArray(rows) ? rows.join('') : String(rows)) + '</tbody></table></div>';
  }

  function renderShell() {
    $('vault-gate').classList.add('hidden');
    $('app').hidden = false;
    $('company-switcher').innerHTML = '<option>' + escapeHtml(state.company.name || 'My Business') + '</option>';
    document.querySelectorAll('.nav').forEach((node) => node.classList.toggle('active', node.dataset.page === page));
    document.querySelectorAll('.page').forEach((node) => node.classList.toggle('active', node.id === 'page-' + page));
    const titles = {
      dashboard: ['OVERVIEW', 'Business at a glance'],
      invoice: ['NEW DOCUMENT', 'Create invoice, quote, or credit note'],
      documents: ['DOCUMENTS', 'Invoices, quotes, and credit notes'],
      customers: ['CUSTOMERS', 'Customer address book'],
      products: ['PRODUCTS', 'Products and services'],
      reports: ['REPORTS', 'Local business summary'],
      backup: ['SETTINGS', 'Business details and local backup']
    };
    $('page-kicker').textContent = titles[page][0];
    $('page-title').textContent = titles[page][1];
  }

  function renderDashboard() {
    const open = state.documents.filter((doc) => ['issued', 'partial', 'overdue'].includes(status(doc))).reduce((sum, doc) => sum + Math.max(0, totals(doc).total - paid(doc)), 0);
    const overdue = state.documents.filter((doc) => status(doc) === 'overdue').reduce((sum, doc) => sum + Math.max(0, totals(doc).total - paid(doc)), 0);
    $('page-dashboard').innerHTML =
      '<div class="cards">' +
      '<article class="card"><p>Outstanding</p><div class="metric">' + money(open, state.company.currency) + '</div><small class="muted">Open receivables</small></article>' +
      '<article class="card"><p>Overdue</p><div class="metric">' + money(overdue, state.company.currency) + '</div><small class="muted">Needs follow-up</small></article>' +
      '<article class="card"><p>Customers</p><div class="metric">' + state.customers.length + '</div><small class="muted">Saved locally</small></article>' +
      '<article class="card"><p>Documents</p><div class="metric">' + state.documents.length + '</div><small class="muted">Your billing history</small></article>' +
      '</div><section class="panel"><div class="panel-head"><h2>Recent documents</h2><button class="button small" data-action="new-document">New document</button></div>' +
      (state.documents.length ? table(['Number', 'Customer', 'Status', 'Total'], state.documents.slice(0, 8).map((doc) => '<tr><td>' + escapeHtml(doc.number) + '</td><td>' + escapeHtml(customerFor(doc)?.name || 'Walk-in customer') + '</td><td><span class="badge ' + status(doc) + '">' + status(doc) + '</span></td><td>' + money(totals(doc).total, doc.currency) + '</td></tr>')) : '<div class="empty">Create your first invoice to begin.</div>') +
      '</section>';
  }

  function renderInvoice() {
    const total = totals(draft);
    const customerOptions = state.customers.map((customer) => '<option value="' + customer.id + '"' + (customer.id === draft.customerId ? ' selected' : '') + '>' + escapeHtml(customer.name) + '</option>').join('');
    const rows = total.rows.map((row, index) =>
      '<tr><td><input data-line="' + index + '" data-field="description" value="' + escapeHtml(draft.items[index].description) + '"></td>' +
      '<td><input data-line="' + index + '" data-field="hsn" value="' + escapeHtml(draft.items[index].hsn) + '"></td>' +
      '<td><input data-line="' + index + '" data-field="quantity" type="number" min="0" step="0.001" value="' + draft.items[index].quantity + '"></td>' +
      '<td><input data-line="' + index + '" data-field="rate" type="number" min="0" step="0.01" value="' + draft.items[index].rate + '"></td>' +
      '<td><input data-line="' + index + '" data-field="taxRate" type="number" min="0" max="100" value="' + draft.items[index].taxRate + '"></td>' +
      '<td>' + money(row.total, draft.currency) + '</td><td><button class="button small danger" data-action="remove-line" data-index="' + index + '">Remove</button></td></tr>'
    ).join('');

    $('page-invoice').innerHTML =
      '<div class="document-layout"><article class="invoice-paper"><div class="invoice-head"><div><div class="invoice-brand">' + escapeHtml(state.company.name) + '</div><div class="address-block">' + escapeHtml([state.company.address, state.company.email, state.company.taxId ? 'Tax ID: ' + state.company.taxId : ''].filter(Boolean).join('\n')) + '</div></div><div><div class="doc-type">' + escapeHtml(draft.type) + '</div><div class="doc-number">' + escapeHtml(draft.number) + '</div></div></div>' +
      '<div class="invoice-meta"><div><h3>Bill to</h3><div class="address-block">' + escapeHtml(customerFor(draft)?.name || 'Walk-in customer') + '</div></div><div><h3>Dates</h3><div class="address-block">Issue: ' + draft.issueDate + '\nDue: ' + draft.dueDate + '</div></div></div>' +
      table(['Description', 'HSN/SAC', 'Qty', 'Rate', 'Tax %', 'Total', ''], rows) +
      '<button class="button small" data-action="add-line">Add line item</button><div class="totals"><div class="total-row"><span>Subtotal</span><span>' + money(total.subtotal, draft.currency) + '</span></div><div class="total-row"><span>Tax</span><span>' + money(total.tax, draft.currency) + '</span></div><div class="total-row grand"><span>Total</span><span>' + money(total.total, draft.currency) + '</span></div></div></article>' +
      '<aside class="sticky-actions stack"><section class="panel"><h2>Document controls</h2><div class="grid two">' +
      '<div class="field"><label>Type</label><select data-draft="type"><option value="invoice">Invoice</option><option value="quote">Quotation</option><option value="credit">Credit note</option></select></div>' +
      '<div class="field"><label>Number</label><input data-draft="number" value="' + escapeHtml(draft.number) + '"></div>' +
      '<div class="field"><label>Customer</label><select data-draft="customerId"><option value="">Walk-in customer</option>' + customerOptions + '</select></div>' +
      '<div class="field"><label>Currency</label><select data-draft="currency"><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></div>' +
      '<div class="field"><label>Issue date</label><input data-draft="issueDate" type="date" value="' + draft.issueDate + '"></div>' +
      '<div class="field"><label>Due date</label><input data-draft="dueDate" type="date" value="' + draft.dueDate + '"></div>' +
      '<div class="field span-all"><label>Notes</label><textarea data-draft="notes">' + escapeHtml(draft.notes) + '</textarea></div></div>' +
      '<div class="actions-row"><button class="button" data-action="save-draft">Save draft</button><button class="button primary" data-action="issue">Issue document</button><button class="button" data-action="print">Print / Save PDF</button></div></section></aside></div>';
    document.querySelector('[data-draft="type"]').value = draft.type;
    document.querySelector('[data-draft="currency"]').value = draft.currency;
  }

  function renderDocuments() {
    $('page-documents').innerHTML = '<section class="panel"><div class="panel-head"><h2>Document register</h2><button class="button primary small" data-action="new-document">New document</button></div>' +
      (state.documents.length ? table(['Number', 'Customer', 'Status', 'Total', 'Actions'], state.documents.map((doc) => '<tr><td>' + escapeHtml(doc.number) + '</td><td>' + escapeHtml(customerFor(doc)?.name || 'Walk-in customer') + '</td><td><span class="badge ' + status(doc) + '">' + status(doc) + '</span></td><td>' + money(totals(doc).total, doc.currency) + '</td><td><button class="button small" data-action="open-document" data-id="' + doc.id + '">Open</button> <button class="button small" data-action="payment" data-id="' + doc.id + '">Payment</button></td></tr>')) : '<div class="empty">No documents saved yet.</div>') + '</section>';
  }

  function renderCustomers() {
    $('page-customers').innerHTML = '<section class="panel"><h2>Add customer</h2><div class="grid two"><div class="field"><label>Name</label><input data-customer="name"></div><div class="field"><label>Email</label><input data-customer="email"></div><div class="field"><label>GSTIN / Tax ID</label><input data-customer="taxId"></div><div class="field"><label>Address</label><input data-customer="address"></div></div><button class="button primary" data-action="add-customer">Save customer</button></section><section class="panel"><h2>Customers</h2>' + (state.customers.length ? table(['Name', 'Email', 'Tax ID'], state.customers.map((customer) => '<tr><td>' + escapeHtml(customer.name) + '</td><td>' + escapeHtml(customer.email) + '</td><td>' + escapeHtml(customer.taxId) + '</td></tr>')) : '<div class="empty">No customers saved yet.</div>') + '</section>';
  }

  function renderProducts() {
    $('page-products').innerHTML = '<section class="panel"><h2>Add product or service</h2><div class="grid three"><div class="field"><label>Name</label><input data-product="name"></div><div class="field"><label>HSN / SAC</label><input data-product="hsn"></div><div class="field"><label>Rate</label><input data-product="rate" type="number" value="0"></div><div class="field"><label>Tax rate</label><input data-product="taxRate" type="number" value="18"></div></div><button class="button primary" data-action="add-product">Save product</button></section><section class="panel"><h2>Catalog</h2>' + (state.products.length ? table(['Name', 'HSN/SAC', 'Rate', 'Use'], state.products.map((product) => '<tr><td>' + escapeHtml(product.name) + '</td><td>' + escapeHtml(product.hsn) + '</td><td>' + money(amount(product.rate), state.company.currency) + '</td><td><button class="button small" data-action="use-product" data-id="' + product.id + '">Use in invoice</button></td></tr>')) : '<div class="empty">No products saved yet.</div>') + '</section>';
  }

  function renderReports() {
    const total = state.documents.filter((doc) => doc.status !== 'void' && doc.type !== 'quote').reduce((sum, doc) => sum + totals(doc).total, 0);
    const received = state.payments.reduce((sum, payment) => sum + payment.amount, 0);
    $('page-reports').innerHTML = '<div class="cards"><article class="card"><p>Invoiced</p><div class="metric">' + money(total, state.company.currency) + '</div></article><article class="card"><p>Payments recorded</p><div class="metric">' + money(received, state.company.currency) + '</div></article><article class="card"><p>Documents</p><div class="metric">' + state.documents.length + '</div></article><article class="card"><p>Products</p><div class="metric">' + state.products.length + '</div></article></div>';
  }

  function renderSettings() {
    const c = state.company;
    $('page-backup').innerHTML = '<section class="panel"><h2>Business identity</h2><div class="grid two"><div class="field"><label>Business name</label><input data-company="name" value="' + escapeHtml(c.name) + '"></div><div class="field"><label>Email</label><input data-company="email" value="' + escapeHtml(c.email) + '"></div><div class="field"><label>Phone</label><input data-company="phone" value="' + escapeHtml(c.phone) + '"></div><div class="field"><label>Tax ID / GSTIN</label><input data-company="taxId" value="' + escapeHtml(c.taxId) + '"></div><div class="field"><label>Currency</label><select data-company="currency"><option>INR</option><option>USD</option><option>EUR</option><option>GBP</option></select></div><div class="field"><label>Invoice prefix</label><input data-company="prefix" value="' + escapeHtml(c.prefix) + '"></div><div class="field span-all"><label>Address</label><textarea data-company="address">' + escapeHtml(c.address) + '</textarea></div><div class="field span-all"><label>Bank / payment details</label><textarea data-company="bank">' + escapeHtml(c.bank) + '</textarea></div></div><button class="button primary" data-action="save-company">Save business details</button></section><section class="panel"><h2>Backup</h2><p class="muted">Export your local invoice data before moving devices.</p><div class="actions-row"><button class="button" data-action="export">Export backup</button><button class="button danger" data-action="clear-data">Clear all local data</button></div></section>';
    document.querySelector('[data-company="currency"]').value = c.currency;
  }

  function render() {
    renderDashboard();
    renderInvoice();
    renderDocuments();
    renderCustomers();
    renderProducts();
    renderReports();
    renderSettings();
    renderShell();
  }

  function saveDocument(issue) {
    if (!draft.number.trim() || !draft.items.some((item) => item.description.trim())) {
      alert('Add a document number and at least one line item.');
      return;
    }
    const document = clone(draft);
    document.id = document.id || uid();
    document.status = issue ? (document.type === 'quote' ? 'quote' : 'issued') : 'draft';
    const index = state.documents.findIndex((item) => item.id === document.id);
    if (index >= 0) state.documents[index] = document; else state.documents.unshift(document);
    save();
    page = 'documents';
    draft = newDraft();
    render();
  }

  function downloadBackup() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'ledgerly-backup-' + today() + '.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const record = state.documents.find((item) => item.id === button.dataset.id);

    if (action === 'new-document') { draft = newDraft(); page = 'invoice'; render(); }
    if (action === 'add-line') { draft.items.push({ id: uid(), description: '', hsn: '', quantity: 1, rate: 0, taxRate: 18 }); renderInvoice(); }
    if (action === 'remove-line' && draft.items.length > 1) { draft.items.splice(Number(button.dataset.index), 1); renderInvoice(); }
    if (action === 'save-draft') saveDocument(false);
    if (action === 'issue') saveDocument(true);
    if (action === 'print') window.print();
    if (action === 'open-document' && record) { draft = clone(record); page = 'invoice'; render(); }
    if (action === 'payment' && record) {
      const outstanding = Math.max(0, totals(record).total - paid(record));
      const value = prompt('Payment amount. Outstanding: ' + money(outstanding, record.currency));
      const valueMinor = amount(value);
      if (valueMinor > 0 && valueMinor <= outstanding) { state.payments.push({ id: uid(), documentId: record.id, amount: valueMinor, date: today() }); save(); render(); }
    }
    if (action === 'add-customer') {
      const fields = {};
      document.querySelectorAll('[data-customer]').forEach((node) => fields[node.dataset.customer] = node.value.trim());
      if (!fields.name) return alert('Customer name is required.');
      state.customers.push({ id: uid(), ...fields }); save(); render();
    }
    if (action === 'add-product') {
      const fields = {};
      document.querySelectorAll('[data-product]').forEach((node) => fields[node.dataset.product] = node.value.trim());
      if (!fields.name) return alert('Product name is required.');
      state.products.push({ id: uid(), ...fields }); save(); render();
    }
    if (action === 'use-product') {
      const product = state.products.find((item) => item.id === button.dataset.id);
      if (product) { draft.items.push({ id: uid(), description: product.name, hsn: product.hsn, quantity: 1, rate: product.rate, taxRate: product.taxRate }); page = 'invoice'; render(); }
    }
    if (action === 'save-company') {
      document.querySelectorAll('[data-company]').forEach((node) => state.company[node.dataset.company] = node.value.trim());
      save(); render();
    }
    if (action === 'export') downloadBackup();
    if (action === 'clear-data' && confirm('Clear all Ledgerly data from this browser?')) { state = initialState(); save(); draft = newDraft(); render(); }
  });

  document.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.draft) {
      draft[target.dataset.draft] = target.value;
      if (target.dataset.draft === 'type') draft.number = nextNumber(target.value);
      renderInvoice();
    }
    if (target.dataset.line !== undefined) {
      draft.items[Number(target.dataset.line)][target.dataset.field] = target.value;
      renderInvoice();
    }
  });

  document.querySelectorAll('.nav').forEach((node) => node.addEventListener('click', () => { page = node.dataset.page; render(); }));
  $('new-invoice').addEventListener('click', () => { draft = newDraft(); page = 'invoice'; render(); });
  $('lock-vault').addEventListener('click', () => { page = 'backup'; render(); });
  $('vault-demo').addEventListener('click', () => { $('vault-gate').classList.add('hidden'); $('app').hidden = false; });

  draft = newDraft();
  render();
});
