import { getState, saveState } from '../state.js';
import { money, createTable, button, field, select, escapeHtml } from './shared.js';
import { saveCustomer, customerOutstanding } from '../customers.js';
import { customerStatement } from '../reports.js';
import { STATE_CODES } from '../gst.js';

let activeCustomerId = null;

export function renderCustomers() {
  const container = document.getElementById('page-customers');
  if (!container) return;

  const customers = scopeCustomers();
  const stateChoices = [['', 'Select Place of Supply'], ...Object.entries(STATE_CODES).map(([code, name]) => [code, `${code} - ${name}`])];

  // If a customer is selected, show details and statements
  let detailsHtml = '';
  if (activeCustomerId) {
    const cust = getState().customers.find(c => c.id === activeCustomerId);
    if (cust) {
      detailsHtml = renderCustomerDetails(cust);
    }
  }

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <!-- Customer CRUD Directory -->
      <section class="panel">
        <h2>Add/Edit Customer</h2>
        <form id="customer-form" class="grid two" onsubmit="return false;">
          <input type="hidden" name="id" id="cust-id" value="">
          ${field('Customer Name', 'name', '', 'text', 'required')}
          ${field('Primary Contact Person', 'contactName')}
          ${field('Phone Number', 'phone')}
          ${field('Email Address', 'email', '', 'email')}
          ${field('GSTIN', 'taxId', '', 'text', 'placeholder="e.g. 27AAAAA0000A1Z5"')}
          ${select('Place of Supply', 'placeOfSupply', stateChoices, '')}
          <div class="field span-all">
            <label>Billing Address</label>
            <textarea name="billingAddress"></textarea>
          </div>
          <div class="field span-all">
            <label>Shipping Address</label>
            <textarea name="shippingAddress" placeholder="Leave empty if same as Billing"></textarea>
          </div>
          ${field('Payment Terms (Days)', 'paymentTermsDays', '30', 'number', 'min="0" max="365"')}
          ${field('Credit Limit', 'creditLimit', '0.00', 'number', 'step="0.01" min="0"')}
          <div class="field span-all">
            ${button('Save Customer Details', 'save-customer-action', '', 'primary')}
            ${button('Clear Form', 'clear-customer-form')}
          </div>
        </form>

        <h3 style="margin-top: 30px;">Customer Directory</h3>
        ${renderDirectoryTable(customers)}
      </section>

      <!-- Customer Details & Statements -->
      <section class="panel" id="customer-details-section">
        ${detailsHtml || '<div class="empty">Select a customer from the directory to view details, statements, and credit exposure.</div>'}
      </section>
    </div>
  `;
}

function scopeCustomers() {
  const compId = getState().activeCompanyId;
  return getState().customers.filter(c => c.companyId === compId);
}

function renderDirectoryTable(customers) {
  if (!customers.length) {
    return '<div class="empty">No customers saved yet.</div>';
  }

  const rows = customers.map((c) => {
    const outstanding = customerOutstanding(c.id);
    return `<tr>
      <td><strong>${escapeHtml(c.name)}</strong></td>
      <td>${escapeHtml(c.taxId || 'Walk-in')}</td>
      <td>${money(outstanding)}</td>
      <td>
        ${button('Select', 'view-customer-details', c.id)}
        ${button('Edit', 'edit-customer-action', c.id)}
      </td>
    </tr>`;
  }).join('');

  return createTable(['Name', 'GSTIN', 'Outstanding', 'Actions'], rows);
}

function renderCustomerDetails(customer) {
  const outstanding = customerOutstanding(customer.id);
  const creditLimit = customer.creditLimitPaise || 0;
  const creditAvailable = Math.max(0, creditLimit - outstanding);
  const percentUsed = creditLimit > 0 ? Math.min(100, (outstanding / creditLimit) * 100) : 0;
  
  const statement = customerStatement(customer.id);
  const statementRows = statement.map(row => `
    <tr>
      <td>${escapeHtml(row.number)}</td>
      <td>${escapeHtml(row.date)}</td>
      <td><span class="badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
      <td style="text-align: right;">${money(row.totalPaise)}</td>
      <td style="text-align: right;">${money(row.paidPaise)}</td>
      <td style="text-align: right; font-weight: bold;">${money(row.outstandingPaise)}</td>
    </tr>
  `).join('');

  return `
    <h2>Customer Profile</h2>
    <div style="border: 1px solid var(--line); border-radius: 8px; padding: 15px; background: #fafafa; margin-bottom: 20px; font-size: 13px;">
      <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: var(--brand);">${escapeHtml(customer.name)}</div>
      ${customer.contactName ? `<strong>Contact:</strong> ${escapeHtml(customer.contactName)}<br>` : ''}
      ${customer.phone ? `<strong>Phone:</strong> ${escapeHtml(customer.phone)} | ` : ''}
      ${customer.email ? `<strong>Email:</strong> ${escapeHtml(customer.email)}<br>` : '<br>'}
      ${customer.taxId ? `<strong>GSTIN:</strong> ${escapeHtml(customer.taxId)} | ` : ''}
      Place of Supply: <strong>${escapeHtml(customer.placeOfSupply || '—')}</strong><br>
      <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--line);">
        <strong>Billing Address:</strong><br>
        <span style="white-space: pre-line; color: #555;">${escapeHtml(customer.billingAddress || 'No Address')}</span>
      </div>
      ${customer.shippingAddress ? `
        <div style="margin-top: 10px;">
          <strong>Shipping Address:</strong><br>
          <span style="white-space: pre-line; color: #555;">${escapeHtml(customer.shippingAddress)}</span>
        </div>
      ` : ''}
    </div>

    <h3>Credit Risk & Exposure</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
      <div class="card" style="padding: 10px;">
        <small style="color: var(--muted);">Outstanding Balance</small>
        <div style="font-size: 18px; font-weight: bold; color: var(--danger);">${money(outstanding)}</div>
      </div>
      <div class="card" style="padding: 10px;">
        <small style="color: var(--muted);">Credit Limit Available</small>
        <div style="font-size: 18px; font-weight: bold; color: green;">
          ${creditLimit > 0 ? money(creditAvailable) : 'Unlimited'}
        </div>
      </div>
    </div>
    ${creditLimit > 0 ? `
      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
          <span>Credit limit exposure: ${percentUsed.toFixed(1)}%</span>
          <span>Limit: ${money(creditLimit)}</span>
        </div>
        <div style="height: 8px; background: #e9eff2; border-radius: 4px; overflow: hidden;">
          <div style="height: 100%; background: ${percentUsed > 85 ? 'var(--danger)' : 'var(--brand)'}; width: ${percentUsed}%;"></div>
        </div>
      </div>
    ` : ''}

    <h3>Statement of Accounts</h3>
    ${statement.length ? createTable(['Doc No', 'Date', 'Status', 'Total', 'Paid', 'Outstanding'], statementRows) : '<div class="empty">No transactions found.</div>'}
  `;
}

export function handleCustomerAction(action, value) {
  const form = document.getElementById('customer-form');

  if (action === 'clear-customer-form') {
    if (form) form.reset();
    document.getElementById('cust-id').value = '';
    return;
  }

  if (action === 'save-customer-action') {
    if (!form) return;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.name || !data.name.trim()) {
      alert('Customer name is required.');
      return;
    }

    try {
      saveCustomer({
        id: data.id || undefined,
        name: data.name,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
        taxId: data.taxId,
        placeOfSupply: data.placeOfSupply,
        billingAddress: data.billingAddress,
        shippingAddress: data.shippingAddress,
        paymentTermsDays: Number(data.paymentTermsDays || 30),
        creditLimitPaise: Math.round(Number(data.creditLimit || 0) * 100)
      });

      saveState().then(() => {
        alert('Customer saved successfully.');
        renderCustomers();
      });
    } catch (error) {
      alert(error.message || 'Saving customer failed.');
    }
    return;
  }

  if (action === 'view-customer-details') {
    activeCustomerId = value;
    renderCustomers();
    return;
  }

  if (action === 'edit-customer-action') {
    const cust = getState().customers.find(c => c.id === value);
    if (cust && form) {
      document.getElementById('cust-id').value = cust.id;
      form.name.value = cust.name;
      form.contactName.value = cust.contactName;
      form.phone.value = cust.phone;
      form.email.value = cust.email;
      form.taxId.value = cust.taxId;
      form.placeOfSupply.value = cust.placeOfSupply;
      form.billingAddress.value = cust.billingAddress;
      form.shippingAddress.value = cust.shippingAddress;
      form.paymentTermsDays.value = cust.paymentTermsDays;
      form.creditLimit.value = (cust.creditLimitPaise / 100).toFixed(2);
    }
    return;
  }
}
