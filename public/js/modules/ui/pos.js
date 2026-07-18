import { getState, saveState } from '../state.js';
import { money, percent, quantity, createTable, button, select, field, escapeHtml } from './shared.js';
import { newDraft, calculateDocumentTotals, issueDocument, recordPayment } from '../documents.js';
import { toPaise, toBps, toThousandths, fromPaise } from '../invoice-calculations.js';

let posCart = []; // array of { product, quantityThousandths }
let posCustomerId = '';
let posPaymentMethod = 'cash';
let posSearchQuery = '';

export function renderPos() {
  const container = document.getElementById('page-pos');
  if (!container) return;

  const products = scopeProducts();
  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(posSearchQuery.toLowerCase()) || 
    p.sku.toLowerCase().includes(posSearchQuery.toLowerCase()) ||
    p.barcode.toLowerCase().includes(posSearchQuery.toLowerCase())
  );

  const customers = scopeCustomers();
  const customerChoices = [['', 'Walk-in Customer'], ...customers.map(c => [c.id, c.name])];
  const paymentChoices = [['cash', 'Cash'], ['UPI', 'UPI QR Code'], ['card', 'Debit/Credit Card'], ['bank', 'Bank Transfer']];

  // Temp POS document draft for totals calculation
  const tempDoc = buildTempPosDocument();
  const totals = calculateDocumentTotals(tempDoc);

  const cartRows = posCart.map((item, idx) => {
    const itemTotal = (item.product.pricePaise * item.quantityThousandths) / 1000;
    return `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--line); font-size: 13px;">
        <div style="flex: 2;">
          <strong>${escapeHtml(item.product.name)}</strong><br>
          <small class="muted">${money(item.product.pricePaise)} x ${(item.quantityThousandths / 1000)}</small>
        </div>
        <div style="flex: 1; display: flex; gap: 4px; align-items: center;">
          ${button('-', 'pos-qty-minus', String(idx))}
          <span style="font-weight: bold; width: 30px; text-align: center;">${(item.quantityThousandths / 1000)}</span>
          ${button('+', 'pos-qty-plus', String(idx))}
        </div>
        <div style="flex: 1; text-align: right; font-weight: bold;">
          ${money(itemTotal)}
        </div>
        <div style="margin-left: 8px;">
          ${button('×', 'pos-remove-cart-item', String(idx), 'danger')}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1.6fr 1.4fr; gap: 20px; height: calc(100vh - 180px);">
      <!-- Left side: catalog selection -->
      <section class="panel" style="display: flex; flex-direction: column; overflow: hidden; height: 100%;">
        <div style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center;">
          <input type="text" id="pos-search" value="${escapeHtml(posSearchQuery)}" placeholder="Search catalog by name, SKU, or scan barcode..." style="flex: 1;">
          ${button('Clear', 'pos-clear-search')}
        </div>
        <div style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 12px; padding: 4px;">
          ${filteredProducts.map(p => `
            <div class="card" style="padding: 12px; cursor: pointer; text-align: center; border: 1px solid var(--line); display: flex; flex-direction: column; justify-content: space-between;" data-action="pos-add-to-cart" data-value="${p.id}">
              <div>
                <strong style="font-size: 13px; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.name)}</strong>
                <small class="muted" style="font-size: 11px;">SKU: ${escapeHtml(p.sku || 'N/A')}</small>
              </div>
              <div style="margin-top: 10px;">
                <div style="font-size: 15px; font-weight: bold; color: var(--brand);">${money(p.pricePaise)}</div>
              </div>
            </div>
          `).join('') || '<div class="empty span-all">No matching products found.</div>'}
        </div>
      </section>

      <!-- Right side: Cart checkout -->
      <section class="panel" style="display: flex; flex-direction: column; overflow: hidden; height: 100%;">
        <h2>Quick Cart Checkout</h2>
        <div style="display: flex; gap: 10px; margin-bottom: 15px;">
          ${select('Select Customer', 'pos-customer-select', customerChoices, posCustomerId, 'style="flex: 1;"')}
          ${select('Payment Mode', 'pos-payment-select', paymentChoices, posPaymentMethod, 'style="width: 130px;"')}
        </div>

        <div style="flex: 1; overflow-y: auto; padding-right: 5px; margin-bottom: 15px;">
          ${cartRows || '<div class="empty">Cart is empty. Click catalog cards to add items.</div>'}
        </div>

        <div style="border-top: 2px solid var(--line); padding-top: 15px; font-size: 13px;">
          <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0;">
            <span>Subtotal (Before Tax):</span>
            <span>${money(totals.subtotal)}</span>
          </div>
          <div class="total-row" style="display: flex; justify-content: space-between; padding: 4px 0;">
            <span>GST Tax:</span>
            <span>${money(totals.tax)}</span>
          </div>
          <div class="total-row grand" style="display: flex; justify-content: space-between; font-size: 18px; font-weight: bold; border-top: 1px solid var(--ink); padding: 8px 0; margin-top: 5px;">
            <span>Grand Total:</span>
            <span>${money(totals.total)}</span>
          </div>
        </div>

        <div style="margin-top: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
          ${button('Empty Cart', 'pos-empty-cart', '', 'danger')}
          ${button('Instant Pay & Print', 'pos-pay-and-print', '', 'primary')}
        </div>
      </section>
    </div>
  `;

  // Attach search change listener
  const searchEl = document.getElementById('pos-search');
  if (searchEl) {
    searchEl.focus();
    searchEl.addEventListener('input', (e) => {
      posSearchQuery = e.target.value;
      // Auto add if barcode matches exactly
      const match = products.find(p => p.barcode && p.barcode.trim() === posSearchQuery.trim());
      if (match) {
        addToCart(match.id);
        posSearchQuery = '';
      }
      renderPos();
    });
  }

  // Attach selectors change listener
  const custSel = document.getElementById('pos-customer-select');
  const paySel = document.getElementById('pos-payment-select');
  if (custSel) custSel.addEventListener('change', (e) => { posCustomerId = e.target.value; });
  if (paySel) paySel.addEventListener('change', (e) => { posPaymentMethod = e.target.value; });
}

function scopeProducts() {
  const compId = getState().activeCompanyId;
  return getState().products.filter(p => p.companyId === compId);
}

function scopeCustomers() {
  const compId = getState().activeCompanyId;
  return getState().customers.filter(c => c.companyId === compId);
}

function buildTempPosDocument() {
  const items = posCart.map(c => ({
    productId: c.product.id,
    description: c.product.name,
    hsn: c.product.hsn,
    quantityThousandths: c.quantityThousandths,
    ratePaise: c.product.pricePaise,
    discountRateBps: 0,
    taxRateBps: c.product.taxRateBps,
    isService: c.product.isService
  }));

  return newDraft({
    type: 'receipt',
    customerId: posCustomerId,
    items,
    pricingMode: 'exclusive'
  });
}

function addToCart(productId) {
  const products = scopeProducts();
  const prod = products.find(p => p.id === productId);
  if (!prod) return;

  const existing = posCart.find(c => c.product.id === productId);
  if (existing) {
    existing.quantityThousandths += 1000;
  } else {
    posCart.push({ product: prod, quantityThousandths: 1000 });
  }
}

export function handlePosAction(action, value) {
  if (action === 'pos-add-to-cart') {
    addToCart(value);
    renderPos();
    return;
  }

  if (action === 'pos-clear-search') {
    posSearchQuery = '';
    renderPos();
    return;
  }

  if (action === 'pos-qty-plus') {
    const idx = Number(value);
    if (posCart[idx]) {
      posCart[idx].quantityThousandths += 1000;
      renderPos();
    }
    return;
  }

  if (action === 'pos-qty-minus') {
    const idx = Number(value);
    if (posCart[idx]) {
      posCart[idx].quantityThousandths -= 1000;
      if (posCart[idx].quantityThousandths <= 0) {
        posCart.splice(idx, 1);
      }
      renderPos();
    }
    return;
  }

  if (action === 'pos-remove-cart-item') {
    const idx = Number(value);
    posCart.splice(idx, 1);
    renderPos();
    return;
  }

  if (action === 'pos-empty-cart') {
    posCart = [];
    renderPos();
    return;
  }

  if (action === 'pos-pay-and-print') {
    if (!posCart.length) {
      alert('Your checkout cart is empty!');
      return;
    }

    try {
      const state = getState();
      const documentDraft = buildTempPosDocument();
      // Auto-issue POS receipt
      issueDocument(documentDraft);
      
      // Auto-record the full payment immediately
      const totals = calculateDocumentTotals(documentDraft);
      recordPayment(documentDraft, {
        amountPaise: totals.total,
        method: posPaymentMethod,
        reference: 'POS Checkout transaction'
      });

      state.documents.push(documentDraft);
      
      // Reduce product stock levels locally
      posCart.forEach(cartItem => {
        if (cartItem.product.trackStock) {
          const productInState = state.products.find(p => p.id === cartItem.product.id);
          if (productInState) {
            productInState.stockQuantityThousandths -= cartItem.quantityThousandths;
            addAudit('inventory.adjusted', 'product', productInState.id, `POS sale: ${documentDraft.number} - delta: -${cartItem.quantityThousandths/1000}`);
          }
        }
      });

      saveState().then(() => {
        // Render print layout of this checkout receipt
        import('./documents.js').then(mod => {
          mod.setActiveDraft(documentDraft);
          window.location.hash = 'invoice';
          setTimeout(() => {
            window.print();
            // Clear cart
            posCart = [];
            posCustomerId = '';
          }, 300);
        });
      });
    } catch (err) {
      alert(err.message || 'POS Checkout failed.');
    }
    return;
  }
}
