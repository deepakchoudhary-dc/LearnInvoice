/**
 * Main Application Initializer and Route Coordinator.
 */

import { initializeState, getState, saveState, setActiveCompany, snapshot } from './modules/state.js';
import { generateDueRecurring } from './modules/recurring.js';
import { renderShell, getActivePage, setActivePage, handleGlobalAction } from './modules/ui.js';

const $ = (id) => document.getElementById(id);

async function persist(action = 'saved') {
  await snapshot(action);
  await saveState();
  const statusEl = $('save-status');
  if (statusEl) {
    statusEl.textContent = `Saved locally ${new Date().toLocaleTimeString()}`;
  }
}

// Global router matching hash changes
function routePage() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const validPages = ['dashboard', 'invoice', 'documents', 'customers', 'products', 'reports', 'backup', 'pos'];
  if (validPages.includes(hash)) {
    setActivePage(hash);
    renderShell();
  }
}

// Initial unlock configuration
async function unlockAndStart(password) {
  try {
    $('gate-message').textContent = 'Decrypting local vault...';
    await initializeState(password);
    
    // Auto-process due recurring templates
    const generated = generateDueRecurring();
    if (generated.length > 0) {
      await saveState();
      console.log(`${generated.length} recurring draft(s) generated.`);
    }

    // Set up active page from hash
    routePage();
    window.addEventListener('hashchange', routePage);

    // Dynamic switcher listeners
    const switcher = $('company-switcher');
    if (switcher) {
      switcher.addEventListener('change', async (event) => {
        setActiveCompany(event.target.value);
        await persist('company switch');
        renderShell();
      });
    }

    // Bind navigation buttons
    document.querySelectorAll('.nav').forEach((node) => {
      node.addEventListener('click', () => {
        const targetPage = node.dataset.page;
        window.location.hash = targetPage;
      });
    });

    $('new-invoice').addEventListener('click', () => {
      import('./modules/ui/documents.js').then(mod => {
        mod.setActiveDraft(null);
        window.location.hash = 'invoice';
      });
    });

  } catch (error) {
    $('gate-message').textContent = error.message || 'Decryption failed. Invalid password.';
    throw error;
  }
}

// Bind Gate Events
$('vault-submit').addEventListener('click', async () => {
  const password = $('vault-password').value;
  if (password.length < 12) {
    $('gate-message').textContent = 'Password must be at least 12 characters.';
    return;
  }
  try {
    await unlockAndStart(password);
  } catch (err) {
    console.error(err);
  }
});

$('vault-demo').addEventListener('click', async () => {
  $('vault-password').value = 'temporary-demo-password';
  $('vault-submit').click();
});

$('lock-vault').addEventListener('click', () => {
  location.reload();
});

// Capture action-dispatch clicks globally
document.addEventListener('click', (event) => {
  handleGlobalAction(event);
  
  // Custom persist trigger for edit/updates
  const node = event.target.closest('[data-action]');
  if (node) {
    const action = node.dataset.action;
    if ([
      'save-draft-action', 'issue-draft-action', 'record-payment-trigger', 
      'void-document-trigger', 'create-credit-note', 'create-debit-note', 
      'convert-quote-action', 'save-customer-action', 'save-product-action', 
      'adjust-stock-action', 'save-identity-action', 'pos-pay-and-print'
    ].includes(action)) {
      persist(action).then(() => {
        // Redraw current view
        routePage();
      });
    }
  }
});
