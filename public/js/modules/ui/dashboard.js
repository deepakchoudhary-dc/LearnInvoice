import { getState, scopeForCompany } from '../state.js';
import { money, createTable, button, escapeHtml } from './shared.js';
import { calculateDocumentTotals, getDocumentStatus } from '../documents.js';
import { outstandingReport, expenseSummary } from '../reports.js';
import { lowStockProducts } from '../products.js';

export function renderDashboard() {
  const open = outstandingReport().reduce((sum, row) => sum + row.outstandingPaise, 0);
  const overdue = outstandingReport()
    .filter((row) => row.status === 'overdue')
    .reduce((sum, row) => sum + row.outstandingPaise, 0);
  const lowStock = lowStockProducts();
  const exp = expenseSummary();

  const recentDocs = scopeForCompany(getState().documents).slice(0, 8);

  const container = document.getElementById('page-dashboard');
  if (!container) return;

  container.innerHTML = `
    <div class="cards">
      <article class="card">
        <p>Open Receivables</p>
        <div class="metric">${money(open)}</div>
      </article>
      <article class="card">
        <p>Overdue Receivables</p>
        <div class="metric">${money(overdue)}</div>
      </article>
      <article class="card">
        <p>Low Stock Alerts</p>
        <div class="metric">${lowStock.length}</div>
      </article>
      <article class="card">
        <p>Expense Summary</p>
        <div class="metric">${money(exp)}</div>
      </article>
    </div>

    <section class="panel">
      <div class="panel-head">
        <h2>Recent Billing Records</h2>
        ${button('New Document', 'new-document', '', 'primary')}
      </div>
      ${renderRecentDocsTable(recentDocs)}
    </section>
  `;
}

function renderRecentDocsTable(documents) {
  if (!documents.length) {
    return '<div class="empty">No documents created yet.</div>';
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
      </td>
    </tr>`;
  }).join('');

  return createTable(['Number', 'Type', 'Customer', 'Status', 'Total', 'Actions'], rows);
}
