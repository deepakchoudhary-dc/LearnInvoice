import { getState, scopeForCompany } from '../state.js';
import { money, percent, quantity, createTable, select, field, button, escapeHtml } from './shared.js';
import { 
  salesRegister, outstandingReport, agingReport, monthlySales, productSales, taxLiability, 
  expenseSummary, expenseByCategory 
} from '../reports.js';
import { toCsv, downloadText } from '../csv.js';

let activeReportTab = 'sales';

// Filters state for reporting page
const reportFilters = {
  dateFrom: '',
  dateTo: '',
  customerId: ''
};

export function renderReports() {
  const container = document.getElementById('page-reports');
  if (!container) return;

  const customers = scopeForCompany(getState().customers);
  const customerChoices = [['', 'All Customers'], ...customers.map(c => [c.id, c.name])];

  const tabs = [
    ['sales', 'Sales Register'],
    ['aging', 'Receivables Aging'],
    ['gst', 'GST Liability'],
    ['inventory', 'Stock Status'],
    ['expenses', 'Expenses summary'],
    ['audit', 'Audit Log']
  ];

  const tabsHtml = `
    <div class="panel-head no-print" style="margin-bottom: 15px; border-bottom: 1px solid var(--line); padding-bottom: 10px;">
      <div style="display: flex; gap: 10px;">
        ${tabs.map(([tab, label]) => `
          <button class="button ${activeReportTab === tab ? 'primary' : ''}" data-action="set-report-tab" data-value="${tab}">${escapeHtml(label)}</button>
        `).join('')}
      </div>
      <div>
        ${button('Export Current View as CSV', 'export-report-csv', '', 'success')}
      </div>
    </div>
  `;

  const filtersHtml = `
    <div class="panel no-print" style="margin-bottom: 20px;">
      <div class="grid three">
        ${field('Date From', 'rep-from', reportFilters.dateFrom, 'date')}
        ${field('Date To', 'rep-to', reportFilters.dateTo, 'date')}
        ${select('Filter by Customer', 'rep-customer', customerChoices, reportFilters.customerId)}
      </div>
    </div>
  `;

  let contentHtml = '';
  switch (activeReportTab) {
    case 'sales':
      contentHtml = renderSalesTab();
      break;
    case 'aging':
      contentHtml = renderAgingTab();
      break;
    case 'gst':
      contentHtml = renderGstTab();
      break;
    case 'inventory':
      contentHtml = renderInventoryTab();
      break;
    case 'expenses':
      contentHtml = renderExpensesTab();
      break;
    case 'audit':
      contentHtml = renderAuditTab();
      break;
  }

  container.innerHTML = `
    ${tabsHtml}
    ${filtersHtml}
    <div style="margin-top: 15px;">
      ${contentHtml}
    </div>
  `;

  // Bind filters
  const f = document.getElementById('rep-from');
  const t = document.getElementById('rep-to');
  const c = document.getElementById('rep-customer');
  if (f) f.addEventListener('change', (e) => { reportFilters.dateFrom = e.target.value; renderReports(); });
  if (t) t.addEventListener('change', (e) => { reportFilters.dateTo = e.target.value; renderReports(); });
  if (c) c.addEventListener('change', (e) => { reportFilters.customerId = e.target.value; renderReports(); });
}

function renderSalesTab() {
  const register = salesRegister({
    from: reportFilters.dateFrom,
    to: reportFilters.dateTo,
    customerId: reportFilters.customerId
  });

  const rows = register.map(row => {
    const customer = getState().customers.find((c) => c.id === row.document.customerId);
    return `<tr>
      <td>${escapeHtml(row.document.number)}</td>
      <td>${escapeHtml(row.document.issueDate)}</td>
      <td>${escapeHtml(customer?.name || 'Walk-in Customer')}</td>
      <td><span class="badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
      <td style="text-align: right;">${money(row.totals.subtotal, row.document.currency)}</td>
      <td style="text-align: right;">${money(row.totals.tax, row.document.currency)}</td>
      <td style="text-align: right; font-weight: bold;">${money(row.totals.total, row.document.currency)}</td>
    </tr>`;
  }).join('');

  const monthly = monthlySales({ from: reportFilters.dateFrom, to: reportFilters.dateTo });
  const monthlyRows = monthly.map(m => `
    <tr>
      <td><strong>${escapeHtml(m.month)}</strong></td>
      <td style="text-align: right; font-weight: bold;">${money(m.totalPaise)}</td>
    </tr>
  `).join('');

  return `
    <div style="display: grid; grid-template-columns: 1.8fr 1.2fr; gap: 20px;">
      <section class="panel">
        <h2>Sales Register</h2>
        ${register.length ? createTable(['Doc No', 'Date', 'Customer', 'Status', 'Taxable', 'GST Tax', 'Total'], rows) : '<div class="empty">No sales records match.</div>'}
      </section>

      <section class="panel">
        <h2>Monthly Performance</h2>
        ${monthly.length ? createTable(['Month', 'Total Invoiced'], monthlyRows) : '<div class="empty">No sales performance records.</div>'}
      </section>
    </div>
  `;
}

function renderAgingTab() {
  const aging = agingReport();
  const outstanding = outstandingReport({
    from: reportFilters.dateFrom,
    to: reportFilters.dateTo,
    customerId: reportFilters.customerId
  });

  const agingRows = `
    <tr>
      <td><strong>Current (Not Due)</strong></td>
      <td style="text-align: right; font-weight: bold; color: green;">${money(aging.current)}</td>
    </tr>
    <tr>
      <td><strong>1–30 Days Overdue</strong></td>
      <td style="text-align: right; font-weight: bold; color: orange;">${money(aging.days30)}</td>
    </tr>
    <tr>
      <td><strong>31–60 Days Overdue</strong></td>
      <td style="text-align: right; font-weight: bold; color: orange;">${money(aging.days60)}</td>
    </tr>
    <tr>
      <td><strong>90+ Days Overdue</strong></td>
      <td style="text-align: right; font-weight: bold; color: var(--danger);">${money(aging.days90Plus)}</td>
    </tr>
  `;

  const outstandingRows = outstanding.map(row => {
    const customer = getState().customers.find((c) => c.id === row.document.customerId);
    return `<tr>
      <td>${escapeHtml(row.document.number)}</td>
      <td>${escapeHtml(row.document.dueDate)}</td>
      <td>${escapeHtml(customer?.name || 'Walk-in Customer')}</td>
      <td><span class="badge ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td>
      <td style="text-align: right; font-weight: bold;">${money(row.outstandingPaise, row.document.currency)}</td>
    </tr>`;
  }).join('');

  return `
    <div style="display: grid; grid-template-columns: 1.2fr 1.8fr; gap: 20px;">
      <section class="panel">
        <h2>A/R Aging Summary</h2>
        ${createTable(['Aging Bucket', 'Outstanding Balance'], agingRows)}
      </section>
      
      <section class="panel">
        <h2>Unpaid Invoices Register</h2>
        ${outstanding.length ? createTable(['Doc No', 'Due Date', 'Customer', 'Status', 'Outstanding'], outstandingRows) : '<div class="empty">All invoices are fully paid!</div>'}
      </section>
    </div>
  `;
}

function renderGstTab() {
  const tax = taxLiability({
    from: reportFilters.dateFrom,
    to: reportFilters.dateTo
  });

  const rows = Object.entries(tax).map(([rateBps, vals]) => {
    const percentStr = (Number(rateBps) / 100).toFixed(2);
    return `<tr>
      <td><strong>${percentStr}%</strong></td>
      <td style="text-align: right;">${money(vals.taxablePaise)}</td>
      <td style="text-align: right;">${money(vals.cgstPaise)}</td>
      <td style="text-align: right;">${money(vals.sgstPaise)}</td>
      <td style="text-align: right;">${money(vals.igstPaise)}</td>
      <td style="text-align: right; font-weight: bold;">${money(vals.cgstPaise + vals.sgstPaise + vals.igstPaise)}</td>
    </tr>`;
  }).join('');

  return `
    <section class="panel">
      <h2>GST Tax Liability Summary</h2>
      <p class="muted">Intra-state sales split equally into CGST & SGST. Inter-state sales map to IGST.</p>
      ${Object.keys(tax).length ? createTable(['Tax Rate', 'Taxable Turnover', 'CGST', 'SGST', 'IGST', 'Total GST Liability'], rows) : '<div class="empty">No GST transactions found.</div>'}
    </section>
  `;
}

function renderInventoryTab() {
  const products = scopeForCompany(getState().products).filter(p => p.trackStock);

  const rows = products.map(p => {
    const lowStock = p.stockQuantityThousandths <= p.reorderLevelThousandths;
    return `<tr style="${lowStock ? 'background: #fff5f5;' : ''}">
      <td><strong>${escapeHtml(p.name)}</strong></td>
      <td>${escapeHtml(p.sku || 'N/A')}</td>
      <td>${escapeHtml(p.unit)}</td>
      <td style="font-weight: bold; color: ${lowStock ? 'var(--danger)' : 'green'};">${quantity(p.stockQuantityThousandths)}</td>
      <td>${quantity(p.reorderLevelThousandths)}</td>
      <td><span class="badge ${lowStock ? 'overdue' : 'draft'}">${lowStock ? 'Low Stock' : 'OK'}</span></td>
    </tr>`;
  }).join('');

  return `
    <section class="panel">
      <h2>Product Catalog Stock Levels</h2>
      ${products.length ? createTable(['Product Name', 'SKU Code', 'Unit', 'Current Stock', 'Reorder Point', 'Status'], rows) : '<div class="empty">No track-stock products exist.</div>'}
    </section>
  `;
}

function renderExpensesTab() {
  const cat = expenseByCategory({
    from: reportFilters.dateFrom,
    to: reportFilters.dateTo
  });

  const total = expenseSummary({
    from: reportFilters.dateFrom,
    to: reportFilters.dateTo
  });

  const rows = Object.entries(cat).map(([category, amountPaise]) => `
    <tr>
      <td><strong>${escapeHtml(category)}</strong></td>
      <td style="text-align: right; font-weight: bold;">${money(amountPaise)}</td>
    </tr>
  `).join('');

  return `
    <div style="display: grid; grid-template-columns: 1.2fr 1.8fr; gap: 20px;">
      <section class="panel">
        <h2>Expenses by Category</h2>
        ${Object.keys(cat).length ? createTable(['Category', 'Total Amount'], rows) : '<div class="empty">No expenses category records.</div>'}
        <div style="margin-top: 15px; text-align: right; font-size: 15px;">
          Total Expenses: <strong>${money(total)}</strong>
        </div>
      </section>

      <section class="panel">
        <h2>Expense List</h2>
        ${renderExpenseListTable()}
      </section>
    </div>
  `;
}

function renderExpenseListTable() {
  let list = scopeForCompany(getState().expenses);
  if (reportFilters.dateFrom) list = list.filter(e => e.date >= reportFilters.dateFrom);
  if (reportFilters.dateTo) list = list.filter(e => e.date <= reportFilters.dateTo);

  const rows = list.map(e => `
    <tr>
      <td>${escapeHtml(e.date)}</td>
      <td>${escapeHtml(e.category)}</td>
      <td>${escapeHtml(e.vendor || '—')}</td>
      <td style="font-weight: bold; text-align: right;">${money(e.amountPaise)}</td>
    </tr>
  `).join('');

  return list.length ? createTable(['Date', 'Category', 'Vendor', 'Amount'], rows) : '<div class="empty">No expense items match filters.</div>';
}

function renderAuditTab() {
  const events = scopeForCompany(getState().audit);
  
  const rows = events.map(e => `
    <tr>
      <td>${escapeHtml(e.at)}</td>
      <td><strong>${escapeHtml(e.action)}</strong></td>
      <td>${escapeHtml(e.entityType)}</td>
      <td>${escapeHtml(e.details)}</td>
    </tr>
  `).join('');

  return `
    <section class="panel">
      <h2>Local Vault Audit History</h2>
      ${events.length ? createTable(['Timestamp', 'Action', 'Entity Type', 'Metadata Detail'], rows) : '<div class="empty">No audit records found.</div>'}
    </section>
  `;
}

export function handleReportsAction(action, value) {
  if (action === 'set-report-tab') {
    activeReportTab = value;
    renderReports();
    return;
  }

  if (action === 'export-report-csv') {
    exportCurrentReportCSV();
    return;
  }
}

function exportCurrentReportCSV() {
  let headers = [];
  let rows = [];
  let filename = `report-${activeReportTab}.csv`;

  if (activeReportTab === 'sales') {
    const register = salesRegister({
      from: reportFilters.dateFrom,
      to: reportFilters.dateTo,
      customerId: reportFilters.customerId
    });
    headers = ['documentNumber', 'issueDate', 'customerName', 'status', 'subtotalPaise', 'taxPaise', 'totalPaise'];
    rows = register.map(row => {
      const customer = getState().customers.find((c) => c.id === row.document.customerId);
      return {
        documentNumber: row.document.number,
        issueDate: row.document.issueDate,
        customerName: customer?.name || 'Walk-in Customer',
        status: row.status,
        subtotalPaise: row.totals.subtotal,
        taxPaise: row.totals.tax,
        totalPaise: row.totals.total
      };
    });
  } else if (activeReportTab === 'aging') {
    const outstanding = outstandingReport({
      from: reportFilters.dateFrom,
      to: reportFilters.dateTo,
      customerId: reportFilters.customerId
    });
    headers = ['documentNumber', 'dueDate', 'customerName', 'status', 'outstandingPaise'];
    rows = outstanding.map(row => {
      const customer = getState().customers.find((c) => c.id === row.document.customerId);
      return {
        documentNumber: row.document.number,
        dueDate: row.document.dueDate,
        customerName: customer?.name || 'Walk-in Customer',
        status: row.status,
        outstandingPaise: row.outstandingPaise
      };
    });
  } else if (activeReportTab === 'gst') {
    const tax = taxLiability({
      from: reportFilters.dateFrom,
      to: reportFilters.dateTo
    });
    headers = ['taxRateBps', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'totalGstPaise'];
    rows = Object.entries(tax).map(([rateBps, vals]) => ({
      taxRateBps: rateBps,
      taxablePaise: vals.taxablePaise,
      cgstPaise: vals.cgstPaise,
      sgstPaise: vals.sgstPaise,
      igstPaise: vals.igstPaise,
      totalGstPaise: vals.cgstPaise + vals.sgstPaise + vals.igstPaise
    }));
  } else if (activeReportTab === 'inventory') {
    const products = scopeForCompany(getState().products).filter(p => p.trackStock);
    headers = ['name', 'sku', 'unit', 'stockQuantityThousandths', 'reorderLevelThousandths'];
    rows = products;
  } else if (activeReportTab === 'expenses') {
    let list = scopeForCompany(getState().expenses);
    if (reportFilters.dateFrom) list = list.filter(e => e.date >= reportFilters.dateFrom);
    if (reportFilters.dateTo) list = list.filter(e => e.date <= reportFilters.dateTo);
    headers = ['date', 'category', 'vendor', 'amountPaise', 'notes'];
    rows = list;
  } else if (activeReportTab === 'audit') {
    const events = scopeForCompany(getState().audit);
    headers = ['at', 'action', 'entityType', 'details'];
    rows = events;
  }

  if (rows.length === 0) {
    alert('No data to export.');
    return;
  }

  const csvText = toCsv(headers, rows);
  downloadText(csvText, filename);
}
