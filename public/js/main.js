import { initializeState, getState, saveState } from './modules/state.js';
import { newDraft, calculateDocumentTotals, getDocumentStatus } from './modules/documents.js';
import { fromPaise } from './modules/math.js';
import { escapeHtml, createTable, printDocument } from './modules/ui.js';
import { validateInvoiceBeforeIssue } from './modules/validation.js';
import { exportBackup, importBackup, exportIRPDraft } from './modules/backup.js';

window.onerror = function(msg, url, line, col, error) {
    document.body.innerHTML += '<div class="error-banner-1">' + escape(msg) + '</div>';
    return false;
};
window.addEventListener('unhandledrejection', function(event) {
    document.body.innerHTML += '<div class="error-banner-2">' + escape(event.reason) + '</div>';
});

    const $ = (id) => document.getElementById(id);
    let page = 'dashboard';
    let currentInvoice = null;

    function renderShell() {
        $('vault-gate').classList.add('hidden');
        $('app').hidden = false;
        
        const state = getState();
        $('company-switcher').innerHTML = '<option>' + escapeHtml(state.company.name || 'My Business') + '</option>';
        document.querySelectorAll('.nav').forEach((node) => node.classList.toggle('active', node.dataset.page === page));
        document.querySelectorAll('.page').forEach((node) => node.classList.toggle('active', node.id === 'page-' + page));
        
        const kicker = $('page-kicker');
        const title = $('page-title');

        if (page === 'dashboard') {
            kicker.textContent = 'OVERVIEW';
            title.textContent = 'Business at a glance';
            renderDashboard();
        } else if (page === 'customers') {
            kicker.textContent = 'DIRECTORY';
            title.textContent = 'Customers';
            renderCustomers();
        } else if (page === 'products') {
            kicker.textContent = 'CATALOG';
            title.textContent = 'Products & services';
            renderProducts();
        } else if (page === 'documents') {
            kicker.textContent = 'HISTORY';
            title.textContent = 'Documents';
            renderDocuments();
        } else if (page === 'invoice') {
            kicker.textContent = 'BUILDER';
            title.textContent = 'New Document';
            renderInvoiceBuilder();
        } else if (page === 'backup') {
            kicker.textContent = 'VAULT';
            title.textContent = 'Vault & Backup';
            renderBackup();
        }
    }

    // --- DASHBOARD ---
    function renderDashboard() {
        const state = getState();
        const html = `
            <div class="card">
                <h2>Welcome to Ledgerly Invoice Vault</h2>
                <p>Your secure, offline-first data is unlocked.</p>
                <div class="flex-dashboard">
                    <div class="card flex-1"><h3>${state.documents.length}</h3><p>Invoices</p></div>
                    <div class="card flex-1"><h3>${state.customers.length}</h3><p>Customers</p></div>
                    <div class="card flex-1"><h3>${state.products.length}</h3><p>Products</p></div>
                </div>
            </div>
        `;
        $('page-dashboard').innerHTML = html;
    }

    // --- BACKUP ---
    function renderBackup() {
        $('page-backup').innerHTML = `
            <div class="card">
                <h2>Local Data Vault</h2>
                <p>Your data is securely stored offline.</p>
                <button id="btn-export-backup" class="button primary">Export Backup (.json)</button>
                <div class="mt-1">
                    <label for="import-backup" class="button secondary inline-block">Import Backup</label>
                    <input type="file" id="import-backup" accept=".json" hidden>
                </div>
            </div>
        `;
        $('btn-export-backup').addEventListener('click', () => {
            exportBackup();
        });
        $('import-backup').addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                try {
                    await importBackup(e.target.files[0]);
                    alert("Backup imported successfully!");
                    renderShell();
                } catch(err) {
                    alert("Import failed: " + err.message);
                }
            }
        });
    }

    // --- CUSTOMERS ---
    function renderCustomers() {
        const state = getState();
        const rows = state.customers.map(c => `
            <tr>
                <td><strong>${escapeHtml(c.name)}</strong></td>
                <td>${escapeHtml(c.email)}</td>
                <td>${escapeHtml(c.taxId)}</td>
                <td>${escapeHtml(c.placeOfSupply)}</td>
            </tr>
        `);
        const table = createTable(['Name', 'Email', 'GSTIN/Tax ID', 'Place of Supply (State Code)'], rows.length ? rows : ['<tr><td colspan="4">No customers found.</td></tr>']);
        
        $('page-customers').innerHTML = `
            <div class="actions mb-1">
                <button id="add-customer-btn" class="button primary">Add Customer</button>
            </div>
            ${table}
        `;
        
        $('add-customer-btn').addEventListener('click', async () => {
            const name = prompt("Customer Name:");
            if (!name) return;
            const state = getState();
            state.customers.push({
                id: crypto.randomUUID(),
                name,
                email: prompt("Email:") || '',
                taxId: prompt("GSTIN (Optional):") || '',
                placeOfSupply: prompt("Place of Supply State Code (e.g., 27 for Maharashtra):") || ''
            });
            await saveState();
            renderCustomers();
        });
    }

    // --- PRODUCTS ---
    function renderProducts() {
        const state = getState();
        const rows = state.products.map(p => `
            <tr>
                <td><strong>${escapeHtml(p.name)}</strong></td>
                <td>${escapeHtml(p.hsn)}</td>
                <td>${escapeHtml(fromPaise(p.pricePaise))}</td>
                <td>${escapeHtml(p.taxRate)}%</td>
            </tr>
        `);
        const table = createTable(['Name', 'HSN/SAC', 'Default Price', 'Tax Rate'], rows.length ? rows : ['<tr><td colspan="4">No products found.</td></tr>']);
        
        $('page-products').innerHTML = `
            <div class="actions mb-1">
                <button id="add-product-btn" class="button primary">Add Product</button>
            </div>
            ${table}
        `;

        $('add-product-btn').addEventListener('click', async () => {
            const name = prompt("Product Name:");
            if (!name) return;
            const price = parseFloat(prompt("Default Price (in Rupees/Dollars):") || 0);
            const state = getState();
            state.products.push({
                id: crypto.randomUUID(),
                name,
                hsn: prompt("HSN/SAC Code:") || '',
                pricePaise: Math.round(price * 100),
                taxRate: prompt("Tax Rate (%):") || '18'
            });
            await saveState();
            renderProducts();
        });
    }

    // --- DOCUMENTS (HISTORY) ---
    function renderDocuments() {
        const state = getState();
        const rows = state.documents.map(d => {
            const status = getDocumentStatus(d);
            const totals = calculateDocumentTotals(d);
            return `
            <tr>
                <td><strong>${escapeHtml(d.number)}</strong></td>
                <td>${escapeHtml(d.issueDate)}</td>
                <td><span class="badge ${status}">${escapeHtml(status)}</span></td>
                <td>${escapeHtml(fromPaise(totals.total))}</td>
                <td>
                    <button class="button subtle view-doc-btn" data-id="${d.id}">View</button>
                </td>
            </tr>
            `;
        });
        const table = createTable(['Number', 'Issue Date', 'Status', 'Total', 'Actions'], rows.length ? rows : ['<tr><td colspan="5">No documents yet.</td></tr>']);
        
        $('page-documents').innerHTML = table;

        document.querySelectorAll('.view-doc-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.dataset.id;
                currentInvoice = state.documents.find(d => d.id === id);
                page = 'invoice';
                renderShell();
            });
        });
    }

    // --- INVOICE BUILDER ---
    function renderInvoiceBuilder() {
        if (!currentInvoice) {
            currentInvoice = newDraft();
        }
        
        const state = getState();
        const totals = calculateDocumentTotals(currentInvoice);
        const status = getDocumentStatus(currentInvoice);
        const isReadonly = status === 'issued' || status === 'paid' || status === 'void';

        const customerOptions = state.customers.map(c => 
            `<option value="${c.id}" ${currentInvoice.customerId === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
        ).join('');

        const itemRows = currentInvoice.items.map((item, index) => {
            return `
            <div class="line-item line-item-row" data-index="${index}">
                <input type="text" class="item-desc flex-2" value="${escapeHtml(item.description)}" placeholder="Description" ${isReadonly?'disabled':''}>
                <input type="text" class="item-hsn flex-1" value="${escapeHtml(item.hsn)}" placeholder="HSN/SAC" ${isReadonly?'disabled':''}>
                <input type="number" class="item-qty flex-1" value="${escapeHtml(item.quantity)}" placeholder="Qty" ${isReadonly?'disabled':''}>
                <input type="number" class="item-rate flex-1" value="${escapeHtml(item.rate)}" placeholder="Rate" ${isReadonly?'disabled':''}>
                <input type="number" class="item-tax flex-1" value="${escapeHtml(item.taxRate)}" placeholder="Tax %" ${isReadonly?'disabled':''}>
                ${!isReadonly ? `<button class="button danger remove-item-btn" data-index="${index}">X</button>` : ''}
            </div>
            `;
        }).join('');

        const html = `
            <div class="builder-layout">
                <div class="builder-form no-print">
                    <div class="mb-1">
                        <span class="badge ${status}">Status: ${status.toUpperCase()}</span>
                    </div>
                    
                    <div class="flex-dashboard mb-1">
                        <div class="flex-1">
                            <label>Document Number</label>
                            <input type="text" id="inv-number" value="${escapeHtml(currentInvoice.number)}" ${isReadonly?'disabled':''}>
                        </div>
                        <div class="flex-1">
                            <label>Customer</label>
                            <select id="inv-customer" ${isReadonly?'disabled':''}>
                                <option value="">-- Select Customer --</option>
                                ${customerOptions}
                            </select>
                        </div>
                    </div>

                    <h3>Line Items</h3>
                    <div id="inv-items">${itemRows}</div>
                    ${!isReadonly ? `<button id="add-item-btn" class="button secondary mt-1">+ Add Line Item</button>` : ''}

                    <div class="mt-2">
                        <button id="save-doc-btn" class="button primary" ${isReadonly?'disabled':''}>Save Draft</button>
                        ${status === 'draft' ? `<button id="issue-doc-btn" class="button secondary">Issue Invoice (Locks edits)</button>` : ''}
                        <button id="print-doc-btn" class="button secondary">Print / Save as PDF</button>
                    </div>
                </div>

                <div class="builder-preview print-only-layout builder-preview-box">
                    <h2>TAX INVOICE</h2>
                    <div class="preview-header">
                        <div>
                            <strong>${escapeHtml(state.company.name)}</strong><br>
                            GSTIN: ${escapeHtml(state.company.taxId)}
                        </div>
                        <div class="text-right">
                            <strong>Invoice #:</strong> ${escapeHtml(currentInvoice.number)}<br>
                            <strong>Date:</strong> ${escapeHtml(currentInvoice.issueDate)}<br>
                            <strong>Tax Type:</strong> ${escapeHtml(totals.taxType)}
                        </div>
                    </div>
                    <table class="preview-table" border="1">
                        <thead>
                            <tr>
                                <th>Description</th>
                                <th>HSN/SAC</th>
                                <th>Qty</th>
                                <th>Rate</th>
                                <th>Tax %</th>
                                <th>Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${totals.rows.map(r => `
                            <tr>
                                <td>${escapeHtml(r.description)}</td>
                                <td>${escapeHtml(r.hsn)}</td>
                                <td>${escapeHtml(r.quantity)}</td>
                                <td>${escapeHtml(r.rate)}</td>
                                <td>${escapeHtml(r.taxRate)}%</td>
                                <td>${escapeHtml(fromPaise(r.net))}</td>
                            </tr>
                            `).join('')}
                        </tbody>
                    </table>
                    <div class="preview-totals">
                        <p>Subtotal: ${escapeHtml(fromPaise(totals.subtotal))}</p>
                        <p>Tax: ${escapeHtml(fromPaise(totals.tax))}</p>
                        <strong>Grand Total: ${escapeHtml(fromPaise(totals.total))}</strong>
                    </div>
                </div>
            </div>
        `;
        
        $('page-invoice').innerHTML = html;

        // Bind events if not readonly
        if (!isReadonly) {
            $('add-item-btn').addEventListener('click', () => {
                syncFormToInvoice();
                currentInvoice.items.push({ id: crypto.randomUUID(), description: '', hsn: '', quantity: 1, rate: '0', taxRate: '18' });
                renderInvoiceBuilder();
            });

            document.querySelectorAll('.remove-item-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    syncFormToInvoice();
                    const index = parseInt(e.target.dataset.index, 10);
                    currentInvoice.items.splice(index, 1);
                    renderInvoiceBuilder();
                });
            });

            // Live update on input blur
            document.querySelectorAll('#page-invoice input, #page-invoice select').forEach(input => {
                input.addEventListener('blur', () => {
                    syncFormToInvoice();
                    renderInvoiceBuilder(); // re-render to update preview
                });
            });

            $('save-doc-btn').addEventListener('click', async () => {
                syncFormToInvoice();
                const idx = state.documents.findIndex(d => d.id === currentInvoice.id);
                if (idx > -1) state.documents[idx] = currentInvoice;
                else state.documents.push(currentInvoice);
                await saveState();
                alert("Saved as Draft!");
            });

            const issueBtn = $('issue-doc-btn');
            if (issueBtn) {
                issueBtn.addEventListener('click', async () => {
                    syncFormToInvoice();
                    const validation = validateInvoiceBeforeIssue(currentInvoice);
                    if (!validation.isValid) {
                        alert("Cannot issue invoice:\n" + validation.errors.join("\n"));
                        return;
                    }
                    if (confirm("Issuing this invoice will make it immutable. Continue?")) {
                        currentInvoice.status = 'issued';
                        const idx = state.documents.findIndex(d => d.id === currentInvoice.id);
                        if (idx > -1) state.documents[idx] = currentInvoice;
                        else state.documents.push(currentInvoice);
                        await saveState();
                        renderInvoiceBuilder();
                    }
                });
            }
        }

        $('print-doc-btn').addEventListener('click', () => {
            printDocument();
        });

        // IRP Export for issued GST invoices
        if (isReadonly) {
            const btnWrap = document.createElement('div');
            btnWrap.innerHTML = `<button id="irp-export-btn" class="button secondary mt-1">Generate IRP JSON Draft</button>`;
            $('inv-items').parentElement.appendChild(btnWrap);
            $('irp-export-btn').addEventListener('click', () => {
                exportIRPDraft(currentInvoice, totals);
            });
        }
    }

    function syncFormToInvoice() {
        if (!currentInvoice) return;
        currentInvoice.number = $('inv-number').value;
        currentInvoice.customerId = $('inv-customer').value;
        
        const itemRows = document.querySelectorAll('.line-item');
        currentInvoice.items = Array.from(itemRows).map(row => {
            return {
                id: crypto.randomUUID(), // simplify for now
                description: row.querySelector('.item-desc').value,
                hsn: row.querySelector('.item-hsn').value,
                quantity: row.querySelector('.item-qty').value,
                rate: row.querySelector('.item-rate').value,
                taxRate: row.querySelector('.item-tax').value,
                discountRate: "0"
            };
        });
    }

    // Vault Login
    $('vault-submit').addEventListener('click', async () => {
        const password = $('vault-password').value;
        if (password.length < 12) {
            $('gate-message').textContent = 'Password must be at least 12 characters.';
            return;
        }
        
        $('gate-message').textContent = 'Decrypting vault...';
        try {
            await initializeState(password);
            $('gate-message').textContent = '';
            renderShell();
        } catch (e) {
            $('gate-message').textContent = e.message;
        }
    });

    $('vault-demo').addEventListener('click', async () => {
        $('vault-password').value = 'demopassword123';
        $('vault-submit').click();
    });
    
    $('lock-vault').addEventListener('click', () => {
        window.location.reload(); // Hard reset memory state
    });

    $('new-invoice').addEventListener('click', () => {
        currentInvoice = null;
        page = 'invoice';
        renderShell();
    });

    // Navigation
    document.querySelectorAll('.nav').forEach((node) => {
        node.addEventListener('click', () => {
            page = node.dataset.page;
            renderShell();
        });
    });
