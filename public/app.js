document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let items = [{ id: Date.now(), desc: "Consulting Services", qty: 10, price: 150 }];
    let currencySymbol = "$";
    let uploadedLogo = "";
    let uploadedSignature = "";

    const inputs = {
        themeColor: document.getElementById('theme-color'),
        currency: document.getElementById('currency-select'),
        apiKey: document.getElementById('api-key'),
        companyName: document.getElementById('company-name'),
        companyEmail: document.getElementById('company-email'),
        companyAddress: document.getElementById('company-address'),
        companyTax: document.getElementById('company-tax'),
        clientName: document.getElementById('client-name'),
        clientEmail: document.getElementById('client-email'),
        clientAddress: document.getElementById('client-address'),
        invoiceNumber: document.getElementById('invoice-number'),
        issueDate: document.getElementById('issue-date'),
        dueDate: document.getElementById('due-date'),
        terms: document.getElementById('payment-terms'),
        taxRate: document.getElementById('tax-rate'),
        discountRate: document.getElementById('discount-rate'),
        notes: document.getElementById('notes')
    };

    // Tab Switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).classList.add('active');
            
            // Adjust theme color specifically for AI tab
            if(btn.dataset.target === 'tab-ai') {
                document.documentElement.style.setProperty('--primary', '#8b5cf6'); // Purple AI
            } else {
                updateThemeColor();
            }
        });
    });

    // --- Core Functions ---
    const updateThemeColor = () => document.documentElement.style.setProperty('--primary', inputs.themeColor.value);
    const formatCurrency = (amt) => `${currencySymbol}${amt.toFixed(2)}`;

    // --- Builder Logic ---
    function renderItemsForm() {
        const container = document.getElementById('items-container');
        container.innerHTML = '';
        items.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'item-row';
            row.setAttribute('draggable', 'true');
            row.ondragstart = (e) => { e.dataTransfer.effectAllowed = 'move'; window.draggedIndex = index; row.classList.add('dragging'); };
            row.ondragover = (e) => { e.preventDefault(); };
            row.ondrop = (e) => { e.preventDefault(); const moved = items.splice(window.draggedIndex, 1)[0]; items.splice(index, 0, moved); renderItemsForm(); };
            row.ondragend = () => { row.classList.remove('dragging'); window.draggedIndex = null; };

            row.innerHTML = `
                <div class="drag-handle">⋮⋮</div>
                <input type="text" placeholder="Description" value="${item.desc}" oninput="updateItem(${index}, 'desc', this.value)">
                <input type="number" placeholder="Qty" value="${item.qty}" min="1" oninput="updateItem(${index}, 'qty', this.value)">
                <input type="number" placeholder="Price" value="${item.price}" min="0" oninput="updateItem(${index}, 'price', this.value)">
                <button class="btn btn-danger btn-sm" onclick="removeItem(${index})">✕</button>
            `;
            container.appendChild(row);
        });
        paginateAndRender();
    }

    window.updateItem = (index, field, value) => { items[index][field] = field === 'desc' ? value : (parseFloat(value) || 0); paginateAndRender(); };
    window.removeItem = (index) => { items.splice(index, 1); renderItemsForm(); };
    document.getElementById('btn-add-item').addEventListener('click', () => { items.push({ id: Date.now(), desc: "", qty: 1, price: 0 }); renderItemsForm(); });

    // --- Inline Sync ---
    window.syncFromInline = (element, inputId) => {
        const input = inputs[inputId.replace('prev-', '')] || document.getElementById(inputId);
        if(input) {
            input.value = input.tagName === 'TEXTAREA' ? element.innerText : element.textContent;
            paginateAndRender();
        }
    };

    // --- A4 Pagination Logic ---
    const PAGE_MAX_HEIGHT = 1122; // approx 297mm in pixels

    function paginateAndRender() {
        currencySymbol = inputs.currency.value;
        const container = document.getElementById('invoice-preview-container');
        container.innerHTML = '';
        
        let currentPage, pageContent, table, tbody;

        function createPage() {
            currentPage = document.createElement('div');
            currentPage.className = 'a4-page';
            pageContent = document.createElement('div');
            pageContent.className = 'page-content';
            pageContent.style.width = '100%';
            pageContent.style.flexShrink = '0';
            currentPage.appendChild(pageContent);
            container.appendChild(currentPage);
        }

        function createTable() {
            table = document.createElement('table');
            table.className = 'preview-table';
            table.innerHTML = `<thead><tr><th>Description</th><th class="text-right">Qty</th><th class="text-right">Price</th><th class="text-right">Amount</th></tr></thead><tbody></tbody>`;
            tbody = table.querySelector('tbody');
            pageContent.appendChild(table);
        }

        createPage();

        // Calculate available height dynamically based on the exact CSS rendering of the A4 page
        // Padding is 20mm top + 20mm bottom, which is ~151px. We'll use 155px for safety.
        const AVAILABLE_HEIGHT = currentPage.clientHeight - 155;

        // Header
        const header = document.createElement('div');
        header.innerHTML = `
            <div class="preview-header">
                <div class="header-left">
                    <img id="preview-logo" src="${uploadedLogo}" alt="Logo" style="display:${uploadedLogo ? 'block' : 'none'};">
                    <h2 class="preview-title">INVOICE</h2>
                </div>
                <div class="header-right">
                    <h3 class="editable" contenteditable="true" onblur="syncFromInline(this, 'company-name')">${inputs.companyName.value || 'Company'}</h3>
                    <p class="editable" contenteditable="true" onblur="syncFromInline(this, 'company-address')">${inputs.companyAddress.value}</p>
                    <p class="editable" contenteditable="true" onblur="syncFromInline(this, 'company-email')">${inputs.companyEmail.value}</p>
                    <p class="editable" contenteditable="true" onblur="syncFromInline(this, 'company-tax')">${inputs.companyTax.value}</p>
                </div>
            </div>
            <div class="preview-meta">
                <div class="meta-billed-to">
                    <h4>Billed To:</h4>
                    <p class="strong editable" contenteditable="true" onblur="syncFromInline(this, 'client-name')">${inputs.clientName.value || 'Client'}</p>
                    <p class="editable" contenteditable="true" style="white-space: pre-wrap;" onblur="syncFromInline(this, 'client-address')">${inputs.clientAddress.value}</p>
                    <p class="editable" contenteditable="true" onblur="syncFromInline(this, 'client-email')">${inputs.clientEmail.value}</p>
                </div>
                <div class="meta-details">
                    <div class="meta-row"><span>Invoice No:</span><strong class="editable" contenteditable="true" onblur="syncFromInline(this, 'invoice-number')">${inputs.invoiceNumber.value}</strong></div>
                    <div class="meta-row"><span>Issue Date:</span><strong class="editable" contenteditable="true" onblur="syncFromInline(this, 'issue-date')">${inputs.issueDate.value}</strong></div>
                    <div class="meta-row"><span>Due Date:</span><strong class="editable" contenteditable="true" onblur="syncFromInline(this, 'due-date')">${inputs.dueDate.value}</strong></div>
                    <div class="meta-row"><span>Terms:</span><strong class="editable" contenteditable="true" onblur="syncFromInline(this, 'payment-terms')">${inputs.terms.value}</strong></div>
                </div>
            </div>
        `;
        pageContent.appendChild(header);

        createTable();

        let subtotal = 0;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const total = item.qty * item.price;
            subtotal += total;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${item.desc}</td><td class="text-right">${item.qty}</td><td class="text-right">${formatCurrency(item.price)}</td><td class="text-right">${formatCurrency(total)}</td>`;
            tbody.appendChild(tr);

            // Reserve space for the footer if it's the last item
            const spaceNeeded = (i === items.length - 1) ? 250 : 50; 
            
            if (pageContent.offsetHeight + spaceNeeded > AVAILABLE_HEIGHT) {
                // If the row overflows, but it's the ONLY row on the page, keep it to avoid infinite loop
                if (tbody.children.length > 1) {
                    tbody.removeChild(tr);
                    createPage();
                    createTable();
                    tbody.appendChild(tr);
                }
            }
        }

        const taxAmount = subtotal * (parseFloat(inputs.taxRate.value) || 0) / 100;
        const discountAmount = subtotal * (parseFloat(inputs.discountRate.value) || 0) / 100;
        const grandTotal = subtotal + taxAmount - discountAmount;

        const footer = document.createElement('div');
        footer.style.marginTop = 'auto';
        footer.style.width = '100%';
        footer.innerHTML = `
            <div class="totals-wrapper">
                <div class="preview-totals">
                    <div class="totals-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
                    <div class="totals-row"><span>Tax (${inputs.taxRate.value}%)</span><span>${formatCurrency(taxAmount)}</span></div>
                    <div class="totals-row"><span>Discount (${inputs.discountRate.value}%)</span><span>-${formatCurrency(discountAmount)}</span></div>
                    <div class="totals-row grand-total pulse-anim"><span>Total Due</span><span>${formatCurrency(grandTotal)}</span></div>
                </div>
            </div>
            <div class="preview-footer">
                <div class="notes-section">
                    <h4>Notes</h4>
                    <p class="editable" contenteditable="true" style="white-space: pre-wrap;" onblur="syncFromInline(this, 'notes')">${inputs.notes.value}</p>
                </div>
                <div class="signature-section">
                    <img id="prev-signature" src="${uploadedSignature}" alt="Signature" style="display:${uploadedSignature ? 'inline-block' : 'none'};">
                    <div class="signature-line"></div>
                    <p>Authorized Signature</p>
                </div>
            </div>
        `;
        pageContent.appendChild(footer);
        
        // Final check if appending the footer caused overflow
        if (pageContent.offsetHeight > AVAILABLE_HEIGHT) {
            pageContent.removeChild(footer);
            createPage();
            pageContent.appendChild(footer);
        }
    }

    // --- AI Features Implementation ---

    // Feature 1: Conversational Editing
    document.getElementById('btn-ai-chat').addEventListener('click', () => {
        const chatInput = document.getElementById('ai-chat-input').value.toLowerCase();
        const fb = document.getElementById('chat-feedback');
        if(!chatInput) return;
        
        // Mock AI parsing intent
        if(chatInput.includes('discount')) {
            const match = chatInput.match(/(\d+)%/);
            if(match) {
                inputs.discountRate.value = match[1];
                fb.textContent = `Applied ${match[1]}% discount.`;
            }
        } else if (chatInput.includes('tax')) {
            const match = chatInput.match(/(\d+)%/);
            if(match) {
                inputs.taxRate.value = match[1];
                fb.textContent = `Set tax rate to ${match[1]}%.`;
            }
        } else if (chatInput.includes('due') && chatInput.includes('today')) {
            inputs.dueDate.value = new Date().toISOString().split('T')[0];
            fb.textContent = "Set due date to today.";
        } else {
            fb.textContent = "Smart Tool: I understand you want to change something. Try 'discount 10' or 'tax 5'.";
        }
        paginateAndRender();
        setTimeout(() => fb.textContent = "", 3000);
    });

    // Feature 2: Magic Paste
    document.getElementById('btn-ai-paste').addEventListener('click', () => {
        const text = document.getElementById('ai-paste-input').value;
        const fb = document.getElementById('paste-feedback');
        if(!text) return;

        fb.textContent = "Extracting data locally...";
        
        // Simulate extraction delay
        setTimeout(() => {
            // Local Extraction logic based on keywords
            if(text.toLowerCase().includes('server') && text.includes('100')) {
                items.push({ id: Date.now(), desc: "Server Hosting", qty: 1, price: 100 });
            }
            if(text.toLowerCase().includes('dev') && text.includes('50')) {
                items.push({ id: Date.now(), desc: "Web Development", qty: 10, price: 50 });
            }
            // If random text
            if(!text.toLowerCase().includes('server') && !text.toLowerCase().includes('dev')) {
                items.push({ id: Date.now(), desc: "Extracted Service", qty: 1, price: 200 });
            }
            renderItemsForm();
            fb.textContent = "Items extracted and added successfully!";
            document.getElementById('ai-paste-input').value = '';
            setTimeout(() => fb.textContent = "", 3000);
        }, 800);
    });

    // Feature 3: Smart Auditor
    document.getElementById('btn-ai-audit').addEventListener('click', () => {
        const resBox = document.getElementById('audit-results');
        resBox.style.display = 'block';
        resBox.className = 'audit-results'; // reset class
        resBox.innerHTML = "Auditing...";

        setTimeout(() => {
            let errors = [];
            const today = new Date().toISOString().split('T')[0];
            
            if(inputs.dueDate.value < today) {
                errors.push("⚠️ Warning: Due Date is in the past.");
            }
            if(parseFloat(inputs.discountRate.value) > 50) {
                errors.push("⚠️ Warning: Unusually high discount (>50%).");
            }
            if(!inputs.companyTax.value) {
                errors.push("⚠️ Warning: Missing Company Tax ID for compliance.");
            }
            if(items.length === 0) {
                errors.push("❌ Error: No line items found.");
            }

            if(errors.length > 0) {
                resBox.innerHTML = errors.join('<br>');
            } else {
                resBox.className = 'audit-results success';
                resBox.innerHTML = "✅ Audit passed! Invoice looks perfectly professional.";
            }
        }, 600);
    });

    // Feature 4: Generative Reminder Email
    document.getElementById('btn-ai-email').addEventListener('click', () => {
        const modal = document.getElementById('ai-modal');
        const modalText = document.getElementById('modal-text');
        const client = inputs.clientName.value || 'Client';
        const invNum = inputs.invoiceNumber.value;
        const total = document.getElementById('prev-grand-total').textContent;
        const due = inputs.dueDate.value;

        modal.style.display = 'flex';
        modalText.value = `Subject: Reminder: Invoice ${invNum} is due on ${due}\n\nHi ${client},\n\nI hope this email finds you well.\n\nThis is a friendly reminder that Invoice ${invNum} for the amount of ${total} is due on ${due}. \n\nPlease let us know if you have any questions or need another copy of the invoice.\n\nBest regards,\n${inputs.companyName.value}`;
    });

    document.getElementById('close-modal').addEventListener('click', () => document.getElementById('ai-modal').style.display = 'none');
    document.getElementById('modal-copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(document.getElementById('modal-text').value);
        document.getElementById('modal-copy-btn').textContent = "Copied!";
        setTimeout(() => document.getElementById('modal-copy-btn').textContent = "Copy to Clipboard", 2000);
    });

    // --- Standard Event Listeners ---
    Object.keys(inputs).forEach(key => {
        if(inputs[key] && key !== 'themeColor' && key !== 'apiKey') {
            inputs[key].addEventListener('input', paginateAndRender);
        }
    });
    inputs.themeColor.addEventListener('input', () => {
        // Only update if not on AI tab
        if(document.querySelector('.tab-btn.active').dataset.target !== 'tab-ai') {
            updateThemeColor();
        }
    });

    // File Uploads
    const handleImageUpload = (id, callback) => {
        document.getElementById(id).addEventListener('change', (e) => {
            if(e.target.files && e.target.files[0]) {
                const reader = new FileReader();
                reader.onload = (ev) => callback(ev.target.result);
                reader.readAsDataURL(e.target.files[0]);
            }
        });
    };
    handleImageUpload('logo-upload', (res) => { uploadedLogo = res; paginateAndRender(); });
    handleImageUpload('signature-upload', (res) => { uploadedSignature = res; paginateAndRender(); });

    // PDF Download
    document.getElementById('btn-download-pdf').addEventListener('click', () => {
        const pages = document.querySelectorAll('.a4-page');
        pages.forEach(p => { p.style.margin = '0'; p.style.boxShadow = 'none'; });
        const tempContainer = document.createElement('div');
        pages.forEach(p => tempContainer.appendChild(p.cloneNode(true)));

        const opt = {
            margin: 0,
            filename: `${inputs.invoiceNumber.value}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: 'css', before: '.a4-page' }
        };
        html2pdf().set(opt).from(tempContainer).save().then(() => paginateAndRender());
    });

    // Load Default Dates
    inputs.issueDate.value = today;
    inputs.dueDate.value = nextMonth.toISOString().split('T')[0];

    // Initialize
    updateThemeColor();
    renderItemsForm();
});
