/**
 * Main UI Orchestration Layer.
 * Imports page components and routes layout views.
 */

import { activeCompany, getState } from './state.js';
import { escapeHtml } from './ui/shared.js';
import { renderDashboard } from './ui/dashboard.js';
import { renderInvoice, handleDocumentAction } from './ui/documents.js';
import { renderCustomers, handleCustomerAction } from './ui/customers.js';
import { renderProducts, handleProductAction } from './ui/products.js';
import { renderReports, handleReportsAction } from './ui/reports.js';
import { renderSettings, handleSettingsAction } from './ui/settings.js';
import { renderPos, handlePosAction } from './ui/pos.js';

let activePage = 'dashboard';

export function getActivePage() {
  return activePage;
}

export function setActivePage(page) {
  activePage = page;
}

function companyOptions(selected = activeCompany()?.id) {
  return getState().companies.map((company) =>
    `<option value="${escapeHtml(company.id)}" ${company.id === selected ? 'selected' : ''}>${escapeHtml(company.name)}</option>`
  ).join('');
}

export function renderShell() {
  const gate = document.getElementById('vault-gate');
  if (gate) gate.classList.add('hidden');
  
  const app = document.getElementById('app');
  if (app) app.hidden = false;

  const switcher = document.getElementById('company-switcher');
  if (switcher) switcher.innerHTML = companyOptions();

  // Highlight sidebar navigation tab
  document.querySelectorAll('.nav').forEach((node) => {
    node.classList.toggle('active', node.dataset.page === activePage);
  });

  // Display active page section container
  document.querySelectorAll('.page').forEach((node) => {
    node.classList.toggle('active', node.id === `page-${activePage}`);
  });

  const titleMeta = {
    dashboard: ['OVERVIEW', 'Business at a glance'],
    invoice: ['BUILDER', 'Create a business document'],
    documents: ['DOCUMENTS', 'Invoices and records'],
    customers: ['CUSTOMERS', 'Customer directory'],
    products: ['CATALOG', 'Products and inventory'],
    reports: ['REPORTS', 'Local reports'],
    expenses: ['EXPENSES', 'Purchases and expenses'],
    recurring: ['RECURRING', 'Local invoice templates'],
    backup: ['SETTINGS', 'Business, backup and audit'],
    pos: ['POINT OF SALE', 'POS Quick checkout mode']
  }[activePage] || ['OVERVIEW', 'Business at a glance'];

  const kicker = document.getElementById('page-kicker');
  const title = document.getElementById('page-title');
  if (kicker) kicker.textContent = titleMeta[0];
  if (title) title.textContent = titleMeta[1];

  // Dispatch page rendering
  switch (activePage) {
    case 'dashboard':
      renderDashboard();
      break;
    case 'invoice':
      renderInvoice();
      break;
    case 'documents':
      renderDocuments();
      break;
    case 'customers':
      renderCustomers();
      break;
    case 'products':
      renderProducts();
      break;
    case 'reports':
      renderReports();
      break;
    case 'expenses':
      // Reuse expenses panel embedded in other templates or standard CRUD renderer
      // Let's ensure standard renderer or delegate
      import('./ui/reports.js').then(mod => {
        // If they click expenses nav tab, render the reports page on expenses tab directly!
        activePage = 'reports';
        window.location.hash = 'reports';
        renderReports();
      });
      break;
    case 'recurring':
      // Similarly for recurring templates, render inside settings or documents.
      // Wait, let's redirect to reports/documents or handle directly.
      // Since reports/settings has snapshots, let's redirect to reports/audit or documents.
      alert('Recurring templates are managed inside the document registers.');
      activePage = 'documents';
      window.location.hash = 'documents';
      renderDocuments();
      break;
    case 'backup':
      renderSettings();
      break;
    case 'pos':
      renderPos();
      break;
  }
}

/**
 * Centrally coordinates all actions from data-action clicks
 */
export function handleGlobalAction(event) {
  const node = event.target.closest('[data-action]');
  if (!node) return;

  const action = node.dataset.action;
  const value = node.dataset.value;

  try {
    // Page level delegation
    handleDocumentAction(action, value);
    handleCustomerAction(action, value);
    handleProductAction(action, value);
    handleReportsAction(action, value);
    handleSettingsAction(action, value);
    handlePosAction(action, value);

    // Global navigation shortcut actions
    if (action === 'new-document') {
      import('./ui/documents.js').then(mod => {
        mod.setActiveDraft(null);
        activePage = 'invoice';
        window.location.hash = 'invoice';
        renderShell();
      });
    }
  } catch (error) {
    alert(error.message || 'Action failed.');
  }
}
export { escapeHtml };
