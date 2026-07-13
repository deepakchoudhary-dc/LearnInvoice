document.addEventListener('DOMContentLoaded', () => {
    // --- State & DOM Elements ---
    let items = [{ id: Date.now(), desc: "Web Development Services", qty: 1, price: 1500 }];
    let currencySymbol = "$";
    
    // UI Elements
    const container = document.getElementById('invoice-preview-container');
    const itemsFormContainer = document.getElementById('items-container');
    
    const inputs = {
        themeColor: document.getElementById('theme-color'),
        currency: document.getElementById('currency-select'),
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

    let uploadedLogo = "";
    let uploadedSignature = "";

    // Set default dates
    const today = new Date().toISOString().split('T')[0];
    inputs.issueDate.value = today;
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    inputs.dueDate.value = nextMonth.toISOString().split('T')[0];

    // --- Core Functions ---

    function formatCurrency(amount) {
        return `${currencySymbol}${amount.toFixed(2)}`;
    }

    function updateThemeColor() {
        document.documentElement.style.setProperty('--primary', inputs.themeColor.value);
    }

    // --- Drag and Drop Logic ---
    let draggedItemIndex = null;

    window.handleDragStart = (e, index) => {
        draggedItemIndex = index;
        e.target.closest('.item-row').classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    };

    window.handleDragOver = (e, index) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    window.handleDrop = (e, dropIndex) => {
        e.preventDefault();
        if (draggedItemIndex !== null && draggedItemIndex !== dropIndex) {
            // Swap or Move
            const movedItem = items.splice(draggedItemIndex, 1)[0];
            items.splice(dropIndex, 0, movedItem);
            renderItemsForm();
        }
    };

    window.handleDragEnd = (e) => {
        e.target.closest('.item-row').classList.remove('dragging');
        draggedItemIndex = null;
    };

    function renderItemsForm() {
        itemsFormContainer.innerHTML = '';
        items.forEach((item, index) => {
            const row = document.createElement('div');
            row.className = 'item-row';
            row.setAttribute('draggable', 'true');
            row.ondragstart = (e) => handleDragStart(e, index);
            row.ondragover = (e) => handleDragOver(e, index);
            row.ondrop = (e) => handleDrop(e, index);
            row.ondragend = handleDragEnd;

            row.innerHTML = `
                <div class="drag-handle">⋮⋮</div>
                <input type="text" placeholder="Description" value="${item.desc}" oninput="updateItem(${index}, 'desc', this.value)">
                <input type="number" placeholder="Qty" value="${item.qty}" min="1" oninput="updateItem(${index}, 'qty', this.value)">
                <input type="number" placeholder="Price" value="${item.price}" min="0" oninput="updateItem(${index}, 'price', this.value)">
                <button class="btn btn-danger btn-sm" onclick="removeItem(${index})">✕</button>
            `;
            itemsFormContainer.appendChild(row);
        });
        paginateAndRender();
    }

    window.updateItem = (index, field, value) => {
        items[index][field] = field === 'desc' ? value : (parseFloat(value) || 0);
        paginateAndRender();
    };

    window.removeItem = (index) => {
        items.splice(index, 1);
        renderItemsForm();
    };

    document.getElementById('btn-add-item').addEventListener('click', () => {
        items.push({ id: Date.now(), desc: "", qty: 1, price: 0 });
        renderItemsForm();
    });

    // --- Inline Editing Sync ---
    window.syncFromInline = (element, inputId) => {
        const input = document.getElementById(inputId);
        if(input) {
            if(input.tagName === 'TEXTAREA') {
                input.value = element.innerText; // preserves line breaks better
            } else {
                input.value = element.textContent;
            }
            if(inputId === 'tax-rate' || inputId === 'discount-rate') {
                paginateAndRender(); // requires recalculation
            }
        }
    };

    // --- Pagination & Rendering (A4 Multi-page Logic) ---
    const PAGE_MAX_HEIGHT = 1122; // 297mm approx in pixels at 96dpi

    function createNewPage() {
        const page = document.createElement('div');
        page.className = 'a4-page';
        return page;
    }

    function createHeaderNode() {
        const div = document.createElement('div');
        div.innerHTML = `
            <div class="preview-header">
                <div class="header-left">
                    <img id="preview-logo" src="${uploadedLogo}" alt="Logo" style="display:${uploadedLogo ? 'block' : 'none'};">
                    <h2 class="preview-title">INVOICE</h2>
                </div>
                <div class="header-right">
                    <h3 class="editable" contenteditable="true" onblur="syncFromInline(this, 'company-name')">${inputs.companyName.value || 'Company Name'}</h3>
                    <p class="editable" contenteditable="true" onblur="syncFromInline(this, 'company-address')">${inputs.companyAddress.value || 'Address'}</p>
                    <p class="editable" contenteditable="true" onblur="syncFromInline(this, 'company-email')">${inputs.companyEmail.value || 'Email'}</p>
                    <p class="editable" contenteditable="true" onblur="syncFromInline(this, 'company-tax')">${inputs.companyTax.value ? `Tax ID: ${inputs.companyTax.value}` : 'Tax ID'}</p>
                </div>
            </div>
            <div class="preview-meta">
                <div class="meta-billed-to">
                    <h4>Billed To:</h4>
                    <p class="strong editable" contenteditable="true" onblur="syncFromInline(this, 'client-name')">${inputs.clientName.value || 'Client Name'}</p>
                    <p class="editable" contenteditable="true" style="white-space: pre-wrap;" onblur="syncFromInline(this, 'client-address')">${inputs.clientAddress.value || 'Address'}</p>
                    <p class="editable" contenteditable="true" onblur="syncFromInline(this, 'client-email')">${inputs.clientEmail.value || 'Email'}</p>
                </div>
                <div class="meta-details">
                    <div class="meta-row"><span>Invoice No:</span><strong class="editable" contenteditable="true" onblur="syncFromInline(this, 'invoice-number')">${inputs.invoiceNumber.value || '001'}</strong></div>
                    <div class="meta-row"><span>Issue Date:</span><strong class="editable" contenteditable="true" onblur="syncFromInline(this, 'issue-date')">${inputs.issueDate.value}</strong></div>
                    <div class="meta-row"><span>Due Date:</span><strong class="editable" contenteditable="true" onblur="syncFromInline(this, 'due-date')">${inputs.dueDate.value}</strong></div>
                    <div class="meta-row"><span>Terms:</span><strong class="editable" contenteditable="true" onblur="syncFromInline(this, 'payment-terms')">${inputs.terms.value || 'Terms'}</strong></div>
                </div>
            </div>
        `;
        return div;
    }

    function createTableBase() {
        const table = document.createElement('table');
        table.className = 'preview-table';
        table.innerHTML = `
            <thead>
                <tr>
                    <th>Description</th>
                    <th class="text-right">Qty</th>
                    <th class="text-right">Price</th>
                    <th class="text-right">Amount</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        return table;
    }

    function createFooterNode(subtotal, taxAmount, discountAmount, grandTotal) {
        const div = document.createElement('div');
        div.style.marginTop = 'auto'; // push to bottom
        div.style.width = '100%';
        
        div.innerHTML = `
            <div class="totals-wrapper">
                <div class="preview-totals">
                    <div class="totals-row"><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></div>
                    <div class="totals-row"><span>Tax (${inputs.taxRate.value || 0}%)</span><span>${formatCurrency(taxAmount)}</span></div>
                    <div class="totals-row"><span>Discount (${inputs.discountRate.value || 0}%)</span><span>-${formatCurrency(discountAmount)}</span></div>
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
        return div;
    }

    function paginateAndRender() {
        currencySymbol = inputs.currency.value;
        container.innerHTML = ''; // clear existing pages

        let currentPage = createNewPage();
        container.appendChild(currentPage);

        // Calculate Totals
        let subtotal = 0;
        items.forEach(i => subtotal += (i.qty * i.price));
        const taxRate = parseFloat(inputs.taxRate.value) || 0;
        const discountRate = parseFloat(inputs.discountRate.value) || 0;
        const taxAmount = subtotal * (taxRate / 100);
        const discountAmount = subtotal * (discountRate / 100);
        const grandTotal = subtotal + taxAmount - discountAmount;

        // Add Header to Page 1
        currentPage.appendChild(createHeaderNode());
        let currentTable = createTableBase();
        let currentTbody = currentTable.querySelector('tbody');
        currentPage.appendChild(currentTable);

        // Add Items one by one and check height
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const total = item.qty * item.price;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.desc}</td>
                <td class="text-right">${item.qty}</td>
                <td class="text-right">${formatCurrency(item.price)}</td>
                <td class="text-right">${formatCurrency(total)}</td>
            `;
            currentTbody.appendChild(tr);

            // Check if page overflows (leaving room for footer if it's the last page, or just margin)
            // If it's the last item, we need to leave ~250px for the footer.
            const requiredSpace = (i === items.length - 1) ? 250 : 50; 
            
            if (currentPage.scrollHeight + requiredSpace > PAGE_MAX_HEIGHT) {
                // Remove row, create new page
                currentTbody.removeChild(tr);
                
                currentPage = createNewPage();
                container.appendChild(currentPage);
                
                currentTable = createTableBase();
                currentTbody = currentTable.querySelector('tbody');
                currentPage.appendChild(currentTable);
                
                // Add the row to the new page
                currentTbody.appendChild(tr);
            }
        }

        // Add Footer to the last page. Check if footer fits.
        const footer = createFooterNode(subtotal, taxAmount, discountAmount, grandTotal);
        currentPage.appendChild(footer);
        
        // If appending footer caused overflow, move footer to a new page
        if (currentPage.scrollHeight > PAGE_MAX_HEIGHT) {
            currentPage.removeChild(footer);
            currentPage = createNewPage();
            container.appendChild(currentPage);
            currentPage.appendChild(footer);
        }
    }


    // --- Event Listeners ---
    Object.keys(inputs).forEach(key => {
        if(inputs[key]) {
            inputs[key].addEventListener('input', () => {
                if(key === 'themeColor') updateThemeColor();
                paginateAndRender();
            });
        }
    });

    // Image Uploads
    document.getElementById('logo-upload').addEventListener('change', function(e) {
        if(e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                uploadedLogo = ev.target.result;
                paginateAndRender();
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    document.getElementById('signature-upload').addEventListener('change', function(e) {
        if(e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                uploadedSignature = ev.target.result;
                paginateAndRender();
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    });

    // Export JSON
    document.getElementById('btn-export-json').addEventListener('click', () => {
        const data = {
            themeColor: inputs.themeColor.value,
            currency: inputs.currency.value,
            companyName: inputs.companyName.value,
            companyEmail: inputs.companyEmail.value,
            companyAddress: inputs.companyAddress.value,
            companyTax: inputs.companyTax.value,
            clientName: inputs.clientName.value,
            clientEmail: inputs.clientEmail.value,
            clientAddress: inputs.clientAddress.value,
            invoiceNumber: inputs.invoiceNumber.value,
            terms: inputs.terms.value,
            notes: inputs.notes.value,
            taxRate: inputs.taxRate.value,
            discountRate: inputs.discountRate.value,
            items: items,
            logo: uploadedLogo,
            signature: uploadedSignature
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'invoice_template.json';
        a.click();
    });

    // Import JSON
    document.getElementById('btn-import-json').addEventListener('change', (e) => {
        if(e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const data = JSON.parse(ev.target.result);
                    Object.keys(data).forEach(key => {
                        if(inputs[key] && key !== 'items' && key !== 'logo' && key !== 'signature') {
                            inputs[key].value = data[key];
                        }
                    });
                    if(data.items) items = data.items;
                    if(data.logo) uploadedLogo = data.logo;
                    if(data.signature) uploadedSignature = data.signature;
                    
                    updateThemeColor();
                    renderItemsForm();
                } catch(err) {
                    alert("Invalid template file");
                }
            };
            reader.readAsText(e.target.files[0]);
        }
    });

    // PDF Download
    document.getElementById('btn-download-pdf').addEventListener('click', () => {
        const pages = document.querySelectorAll('.a4-page');
        
        // Temporarily prepare pages for PDF (remove margins, shadows)
        pages.forEach(page => {
            page.style.margin = '0';
            page.style.boxShadow = 'none';
        });

        // We wrap them in a temporary div to feed to html2pdf
        const tempContainer = document.createElement('div');
        pages.forEach(p => tempContainer.appendChild(p.cloneNode(true)));

        const opt = {
            margin:       0,
            filename:     `${inputs.invoiceNumber.value}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true },
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: 'css', before: '.a4-page' }
        };
        
        html2pdf().set(opt).from(tempContainer).save().then(() => {
            // Restore visual layout
            paginateAndRender();
        });
    });

    // Init
    updateThemeColor();
    renderItemsForm();
});
