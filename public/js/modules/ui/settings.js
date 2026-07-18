import { getState, activeCompany, saveState, addAudit, setActiveCompany, snapshot } from '../state.js';
import { money, percent, createTable, button, field, select, escapeHtml, chooseFile } from './shared.js';
import { exportBackup, previewBackupFile, performRestore } from '../backup.js';

let activeBackupPreview = null; // { state, summary }

export function renderSettings() {
  const container = document.getElementById('page-backup');
  if (!container) return;

  const company = activeCompany();
  const companies = getState().companies;
  const companyChoices = companies.map(c => [c.id, c.name]);
  const snapshots = getState().snapshots || [];

  // Render Backup preview section if active
  let previewHtml = '';
  if (activeBackupPreview) {
    previewHtml = `
      <div class="panel notice warn no-print" style="margin-bottom: 20px;">
        <h3>Encrypted Backup Restore Preview</h3>
        <p>A valid backup envelope was decrypted. Verify details below before writing to database:</p>
        <div style="font-size: 13px; line-height: 1.6; margin-bottom: 15px;">
          ${activeBackupPreview.summary.companies.map(c => `
            <strong>• Business Copy: ${escapeHtml(c.name)}</strong><br>
            Documents: ${c.documentCount} | Customers: ${c.customerCount} | Catalog Items: ${c.productCount}<br>
          `).join('')}
        </div>
        <div class="actions-row">
          ${button('Overwrite Active Vault Completely', 'restore-confirm-overwrite', '', 'danger')}
          ${button('Restore as Mapped Copy (Isolate)', 'restore-confirm-copy', '', 'primary')}
          ${button('Cancel Restore', 'restore-cancel')}
        </div>
      </div>
    `;
  }

  container.innerHTML = `
    ${previewHtml}

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <!-- Profile settings -->
      <section class="panel">
        <h2>Business Profile Identity</h2>
        <form id="business-form" class="grid two" onsubmit="return false;">
          ${field('Business Name', 'name', company.name, 'text', 'required')}
          ${field('Legal / Trade Name', 'legalName', company.legalName)}
          ${field('GSTIN', 'taxId', company.taxId, 'text', 'placeholder="e.g. 27AAAAA0000A1Z5"')}
          ${field('Primary Email', 'email', company.email, 'email')}
          ${field('Contact Phone', 'phone', company.phone)}
          ${field('City / Locality', 'city', company.city)}
          ${field('Postal PIN Code', 'pinCode', company.pinCode)}
          ${field('Invoice Prefix', 'prefix', company.prefix || 'INV')}
          ${field('Standard Base Currency', 'currency', company.currency || 'INR')}
          ${field('System Locale Format', 'locale', company.locale || 'en-IN')}
          ${field('Print Theme Accent Color', 'accentColor', company.accentColor || '#16665d', 'color')}
          
          <div class="field span-all">
            <label>Payment / Bank Transfer / UPI Details</label>
            <textarea name="paymentDetails">${escapeHtml(company.bank || company.paymentDetails)}</textarea>
          </div>
          
          <div class="field span-all">
            <label>Invoice Standard Terms & Conditions</label>
            <textarea name="terms">${escapeHtml(company.terms)}</textarea>
          </div>

          <div style="display: flex; gap: 20px;" class="field span-all">
            <div style="flex: 1;">
              <label>Business Logo (< 500KB PNG/JPG)</label>
              ${company.logo ? `<img src="${company.logo}" style="max-height: 40px; display: block; margin-bottom: 5px;">` : ''}
              ${button('Upload Logo', 'upload-logo-action')}
              ${company.logo ? button('Remove Logo', 'remove-logo-action', '', 'danger') : ''}
            </div>
            <div style="flex: 1;">
              <label>Authorised Signature Image (< 500KB PNG/JPG)</label>
              ${company.signature ? `<img src="${company.signature}" style="max-height: 40px; display: block; margin-bottom: 5px;">` : ''}
              ${button('Upload Signature', 'upload-signature-action')}
              ${company.signature ? button('Remove Signature', 'remove-signature-action', '', 'danger') : ''}
            </div>
          </div>

          <div class="field span-all">
            ${button('Save Identity Profile', 'save-identity-action', '', 'primary')}
            ${button('Create Mapped Business Company', 'add-company-action')}
          </div>
        </form>
      </section>

      <!-- Backups and snapshot controls -->
      <div>
        <section class="panel">
          <h2>Encrypted Vault Backups</h2>
          <p class="muted">All operations occur entirely on your device. Ensure you back up your files regularly as passwords cannot be recovered.</p>
          <div class="actions-row">
            ${button('Export Encrypted Backup File', 'export-backup-action', '', 'primary')}
            ${button('Import Encrypted Backup File', 'import-backup-action')}
          </div>
        </section>

        <section class="panel">
          <h2>Automatic Local Snapshots</h2>
          <p class="muted">Ledgerly takes automated encrypted snapshots of your transactions in memory. You can restore previous snapshots below.</p>
          ${renderSnapshotsTable(snapshots)}
        </section>
      </div>
    </div>
  `;
}

function renderSnapshotsTable(snapshots) {
  if (!snapshots.length) {
    return '<div class="empty">No local snapshots generated yet.</div>';
  }

  const rows = snapshots.map((s, index) => `
    <tr>
      <td>${escapeHtml(s.at)}</td>
      <td><small>${escapeHtml(s.reason)}</small></td>
      <td>
        ${button('Restore', 'restore-snapshot-action', String(index), 'primary')}
      </td>
    </tr>
  `).join('');

  return createTable(['Timestamp', 'Reason / Trigger', 'Actions'], rows);
}

function handleImageUpload(fieldKey) {
  chooseFile((file) => {
    // Limits: Size < 500KB
    if (file.size > 500 * 1024) {
      alert('File exceeds size limit of 500 KB.');
      return;
    }
    // MIME type check
    const allowedMime = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedMime.includes(file.type)) {
      alert('Only PNG and JPEG images are allowed.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      
      // Perform safe decode check by loading it into an image element
      const img = new Image();
      img.onload = () => {
        const comp = activeCompany();
        comp[fieldKey] = dataUrl;
        saveState().then(() => {
          alert('Image uploaded and decoded successfully.');
          renderSettings();
        });
      };
      img.onerror = () => {
        alert('Corrupted image payload. Upload failed.');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }, 'image/png,image/jpeg,image/jpg');
}

export function handleSettingsAction(action, value) {
  const comp = activeCompany();

  if (action === 'upload-logo-action') {
    handleImageUpload('logo');
    return;
  }
  if (action === 'upload-signature-action') {
    handleImageUpload('signature');
    return;
  }
  if (action === 'remove-logo-action') {
    comp.logo = '';
    saveState().then(() => renderSettings());
    return;
  }
  if (action === 'remove-signature-action') {
    comp.signature = '';
    saveState().then(() => renderSettings());
    return;
  }

  if (action === 'save-identity-action') {
    const form = document.getElementById('business-form');
    if (!form) return;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.name || !data.name.trim()) {
      alert('Business name is required.');
      return;
    }

    Object.assign(comp, data, {
      bank: data.paymentDetails
    });

    addAudit('company.updated', 'company', comp.id, comp.name);
    saveState().then(() => {
      alert('Identity profile saved successfully.');
      // Reload switcher list
      const sw = document.getElementById('company-switcher');
      if (sw) sw.innerHTML = getState().companies.map(c => `<option value="${c.id}" ${c.id === comp.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
      renderSettings();
    });
    return;
  }

  if (action === 'add-company-action') {
    const name = prompt('Enter new business profile company name:');
    if (!name) return;

    const newComp = {
      ...companyDefaults(),
      id: crypto.randomUUID(),
      name: name.trim()
    };
    
    getState().companies.push(newComp);
    setActiveCompany(newComp.id);
    addAudit('company.created', 'company', newComp.id, newComp.name);
    
    saveState().then(() => {
      alert('New company created and activated.');
      window.location.reload();
    });
    return;
  }

  if (action === 'export-backup-action') {
    const p = prompt('Choose an export password (min 12 characters):');
    if (!p) return;
    if (p.length < 12) {
      alert('Password must be at least 12 characters.');
      return;
    }
    const confirmPass = prompt('Confirm export password:');
    if (p !== confirmPass) {
      alert('Passwords do not match.');
      return;
    }

    exportBackup(p)
      .then(() => alert('Backup file downloaded successfully.'))
      .catch(err => alert(err.message || 'Backup failed.'));
    return;
  }

  if (action === 'import-backup-action') {
    chooseFile((file) => {
      const p = prompt('Enter backup password:');
      if (!p) return;

      previewBackupFile(file, p)
        .then((preview) => {
          activeBackupPreview = preview;
          renderSettings();
        })
        .catch((err) => alert(err.message || 'Decryption failed.'));
    }, '.json,application/json');
    return;
  }

  // Restore confirmations
  if (action === 'restore-confirm-overwrite') {
    if (activeBackupPreview && confirm('WARNING: This will completely replace your active vault database. Are you sure you want to proceed?')) {
      performRestore(activeBackupPreview.state, false)
        .then(() => {
          alert('Database restored successfully.');
          activeBackupPreview = null;
          window.location.reload();
        })
        .catch(err => alert(err.message || 'Restore failed.'));
    }
    return;
  }

  if (action === 'restore-confirm-copy') {
    if (activeBackupPreview) {
      performRestore(activeBackupPreview.state, true)
        .then(() => {
          alert('Backup restored as copy. Mapped profile is now active.');
          activeBackupPreview = null;
          window.location.reload();
        })
        .catch(err => alert(err.message || 'Restore failed.'));
    }
    return;
  }

  if (action === 'restore-cancel') {
    activeBackupPreview = null;
    renderSettings();
    return;
  }

  if (action === 'restore-snapshot-action') {
    const idx = Number(value);
    const snap = getState().snapshots[idx];
    if (snap && confirm(`Restore snapshot taken at ${snap.at}? This will overwrite active document, product, and customer registers.`)) {
      getState().documents = snap.documents;
      getState().customers = snap.customers;
      getState().products = snap.products;
      addAudit('snapshot.restored', 'company', getState().activeCompanyId, `Timestamp: ${snap.at}`);
      saveState().then(() => {
        alert('Snapshot restored.');
        window.location.reload();
      });
    }
    return;
  }
}
