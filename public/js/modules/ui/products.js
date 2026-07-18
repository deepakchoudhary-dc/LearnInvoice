import { getState, saveState } from '../state.js';
import { money, percent, quantity, createTable, button, field, select, escapeHtml } from './shared.js';
import { saveProduct, adjustStock, lowStockProducts } from '../products.js';
import { fromPaise, fromBps, fromThousandths } from '../invoice-calculations.js';

let selectedProductId = null;

export function renderProducts() {
  const container = document.getElementById('page-products');
  if (!container) return;

  const products = scopeProducts();
  const unitChoices = [['NOS', 'NOS (Numbers)'], ['PCS', 'PCS (Pieces)'], ['KGS', 'KGS (Kilograms)'], ['BOX', 'BOX (Boxes)'], ['HRS', 'HRS (Hours)'], ['MTR', 'MTR (Meters)']];

  // Stock movements ledger for selected product
  let stockLedgerHtml = '';
  if (selectedProductId) {
    const prod = getState().products.find(p => p.id === selectedProductId);
    if (prod && prod.trackStock) {
      stockLedgerHtml = renderStockLedger(prod);
    }
  }

  container.innerHTML = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <!-- Catalog CRUD -->
      <section class="panel">
        <h2>Save Catalog Item</h2>
        <form id="product-form" class="grid two" onsubmit="return false;">
          <input type="hidden" name="id" id="prod-id" value="">
          ${field('Item Name', 'name', '', 'text', 'required')}
          ${field('SKU Code', 'sku')}
          ${field('Barcode', 'barcode')}
          ${field('HSN / SAC Code', 'hsn')}
          ${select('Unit of Measure', 'unit', unitChoices, 'NOS')}
          ${field('Standard Price (Paise/Rate)', 'price', '0.00', 'number', 'step="0.01" min="0"')}
          ${field('Standard GST (%)', 'taxRate', '18.00', 'number', 'step="0.01" min="0" max="100"')}
          ${field('Initial Stock', 'stockQuantity', '0', 'number', 'step="0.001" min="0"')}
          ${field('Reorder Alert Level', 'reorderLevel', '0', 'number', 'step="0.001" min="0"')}
          
          <div class="field span-all" style="display: flex; gap: 20px;">
            <label style="display: inline-flex; align-items: center; gap: 6px;">
              <input type="checkbox" name="trackStock" id="prod-trackStock"> Track Stock Levels
            </label>
            <label style="display: inline-flex; align-items: center; gap: 6px;">
              <input type="checkbox" name="isService" id="prod-isService"> Is Service (No physical stock)
            </label>
          </div>

          <div class="field span-all">
            ${button('Save Item', 'save-product-action', '', 'primary')}
            ${button('Clear Form', 'clear-product-form')}
          </div>
        </form>

        <h3 style="margin-top: 30px;">Catalog List</h3>
        ${renderCatalogTable(products)}
      </section>

      <!-- Stock Adjustments & Ledger -->
      <section class="panel" id="product-stock-section">
        ${stockLedgerHtml || '<div class="empty">Select a track-stock item from the catalog to view details, alerts, and record stock movements.</div>'}
      </section>
    </div>
  `;
}

function scopeProducts() {
  const compId = getState().activeCompanyId;
  return getState().products.filter(p => p.companyId === compId);
}

function renderCatalogTable(products) {
  if (!products.length) {
    return '<div class="empty">No products saved yet.</div>';
  }

  const rows = products.map((p) => {
    const stockVal = p.trackStock ? quantity(p.stockQuantityThousandths) : '—';
    const lowStockAlert = p.trackStock && p.stockQuantityThousandths <= p.reorderLevelThousandths;

    return `<tr style="${lowStockAlert ? 'background: #fff5f5;' : ''}">
      <td><strong>${escapeHtml(p.name)}</strong><br><small class="muted">SKU: ${escapeHtml(p.sku || 'N/A')}</small></td>
      <td>${money(p.pricePaise)}</td>
      <td>${percent(p.taxRateBps)}</td>
      <td style="font-weight: bold; color: ${lowStockAlert ? 'var(--danger)' : 'inherit'};">${stockVal}</td>
      <td>
        ${p.trackStock ? button('Stock', 'view-product-stock', p.id) : ''}
        ${button('Edit', 'edit-product-action', p.id)}
      </td>
    </tr>`;
  }).join('');

  return createTable(['Item Details', 'Price', 'GST', 'Stock', 'Actions'], rows);
}

function renderStockLedger(product) {
  const lowStock = product.stockQuantityThousandths <= product.reorderLevelThousandths;
  
  // Filter audit trail events for stock movements for this product
  const movements = getState().audit.filter(
    (evt) => evt.entityType === 'product' && evt.entityId === product.id && evt.action === 'inventory.adjusted'
  );

  const movementRows = movements.map(m => `
    <tr>
      <td>${escapeHtml(m.at)}</td>
      <td>${escapeHtml(m.details)}</td>
    </tr>
  `).join('');

  return `
    <h2>Inventory Stock Ledger</h2>
    <div style="border: 1px solid var(--line); border-radius: 8px; padding: 15px; background: #fafafa; margin-bottom: 20px;">
      <div style="font-size: 18px; font-weight: bold; color: var(--brand);">${escapeHtml(product.name)}</div>
      <small class="muted">SKU: ${escapeHtml(product.sku)} | HSN: ${escapeHtml(product.hsn || 'N/A')}</small>
      <div style="display: flex; justify-content: space-between; margin-top: 15px; border-top: 1px solid var(--line); padding-top: 10px;">
        <div>Current Stock: <strong style="font-size: 16px; color: ${lowStock ? 'var(--danger)' : 'green'};">${quantity(product.stockQuantityThousandths)} ${escapeHtml(product.unit)}</strong></div>
        <div>Reorder Level: <strong>${quantity(product.reorderLevelThousandths)} ${escapeHtml(product.unit)}</strong></div>
      </div>
      ${lowStock ? `<div class="notice error" style="margin-top: 10px;">Warning: Stock level has fallen below the reorder threshold!</div>` : ''}
    </div>

    <h3>Record Stock Adjustment</h3>
    <form id="stock-adjustment-form" class="grid two" onsubmit="return false;" style="margin-bottom: 20px;">
      ${field('Quantity Delta (e.g. +10, -5)', 'delta', '', 'number', 'step="0.001" required')}
      ${field('Reason / Note', 'reason', '', 'text', 'placeholder="e.g. Stock count / purchase" required')}
      <div class="span-all">
        ${button('Submit Adjustment', 'adjust-stock-action', product.id, 'primary')}
      </div>
    </form>

    <h3>Movement History</h3>
    ${movements.length ? createTable(['Date', 'Description / Movement Details'], movementRows) : '<div class="empty">No stock movements recorded yet.</div>'}
  `;
}

export function handleProductAction(action, value) {
  const form = document.getElementById('product-form');

  if (action === 'clear-product-form') {
    if (form) form.reset();
    document.getElementById('prod-id').value = '';
    return;
  }

  if (action === 'save-product-action') {
    if (!form) return;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.name || !data.name.trim()) {
      alert('Product name is required.');
      return;
    }

    try {
      saveProduct({
        id: data.id || undefined,
        name: data.name,
        sku: data.sku,
        barcode: data.barcode,
        hsn: data.hsn,
        unit: data.unit,
        pricePaise: Math.round(Number(data.price || 0) * 100),
        taxRateBps: Math.round(Number(data.taxRate || 0) * 100),
        stockQuantityThousandths: Math.round(Number(data.stockQuantity || 0) * 1000),
        reorderLevelThousandths: Math.round(Number(data.reorderLevel || 0) * 1000),
        trackStock: document.getElementById('prod-trackStock').checked,
        isService: document.getElementById('prod-isService').checked
      });

      saveState().then(() => {
        alert('Catalog item saved successfully.');
        renderProducts();
      });
    } catch (error) {
      alert(error.message || 'Saving catalog item failed.');
    }
    return;
  }

  if (action === 'view-product-stock') {
    selectedProductId = value;
    renderProducts();
    return;
  }

  if (action === 'edit-product-action') {
    const prod = getState().products.find(p => p.id === value);
    if (prod && form) {
      document.getElementById('prod-id').value = prod.id;
      form.name.value = prod.name;
      form.sku.value = prod.sku;
      form.barcode.value = prod.barcode;
      form.hsn.value = prod.hsn;
      form.unit.value = prod.unit;
      form.price.value = (prod.pricePaise / 100).toFixed(2);
      form.taxRate.value = (prod.taxRateBps / 100).toFixed(2);
      form.stockQuantity.value = (prod.stockQuantityThousandths / 1000).toFixed(3);
      form.reorderLevel.value = (prod.reorderLevelThousandths / 1000).toFixed(3);
      document.getElementById('prod-trackStock').checked = prod.trackStock;
      document.getElementById('prod-isService').checked = prod.isService;
    }
    return;
  }

  if (action === 'adjust-stock-action') {
    const adjForm = document.getElementById('stock-adjustment-form');
    if (!adjForm) return;

    const delta = Number(adjForm.delta.value);
    const reason = adjForm.reason.value;

    if (isNaN(delta) || delta === 0) {
      alert('Enter a valid non-zero stock adjustment quantity.');
      return;
    }

    try {
      adjustStock(value, delta * 1000, reason);
      saveState().then(() => {
        alert('Stock adjusted successfully.');
        renderProducts();
      });
    } catch (err) {
      alert(err.message || 'Stock adjustment failed.');
    }
    return;
  }
}
