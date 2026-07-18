import { activeCompany, addAudit, getState } from './state.js';
import { toPaise, toBps, toThousandths } from './invoice-calculations.js';

export function normalizeProduct(input = {}) {
  const pricePaise = Number.isSafeInteger(input.pricePaise) ? input.pricePaise : toPaise(input.price || 0);
  const taxRateBps = Number.isSafeInteger(input.taxRateBps) ? input.taxRateBps : toBps(input.taxRate || 18);
  const stockQuantityThousandths = Number.isSafeInteger(input.stockQuantityThousandths) ? input.stockQuantityThousandths : toThousandths(input.stockQuantity || 0);
  const reorderLevelThousandths = Number.isSafeInteger(input.reorderLevelThousandths) ? input.reorderLevelThousandths : toThousandths(input.reorderLevel || 0);

  const product = {
    id: input.id || crypto.randomUUID(),
    companyId: input.companyId || activeCompany().id,
    name: String(input.name || '').trim(),
    sku: String(input.sku || '').trim(),
    barcode: String(input.barcode || '').trim(),
    hsn: String(input.hsn || '').trim(),
    unit: String(input.unit || 'NOS').trim(),
    pricePaise,
    taxRateBps,
    isService: Boolean(input.isService),
    trackStock: Boolean(input.trackStock),
    stockQuantityThousandths,
    reorderLevelThousandths
  };

  if (!product.name) throw new Error('Product or service name is required.');
  if (product.pricePaise < 0 || product.taxRateBps < 0 || product.stockQuantityThousandths < 0 || product.reorderLevelThousandths < 0) {
    throw new Error('Product pricing, tax, and inventory stock values cannot be negative.');
  }

  return product;
}

export function saveProduct(input) {
  const state = getState();
  const product = normalizeProduct(input);

  // Check unique SKU within company
  const duplicateSku = product.sku && state.products.some(
    (entry) => entry.companyId === product.companyId && entry.id !== product.id && entry.sku === product.sku
  );
  if (duplicateSku) throw new Error('SKU must be unique within a company.');

  const index = state.products.findIndex((entry) => entry.id === product.id);
  if (index >= 0) {
    state.products[index] = product;
  } else {
    state.products.push(product);
  }

  addAudit(
    index >= 0 ? 'product.updated' : 'product.created',
    'product',
    product.id,
    `${product.name} (SKU: ${product.sku})`
  );
  return product;
}

export function adjustStock(productId, quantityDeltaThousandths, reason = 'manual adjustment') {
  const product = getState().products.find((entry) => entry.id === productId);
  if (!product || !product.trackStock) return;
  product.stockQuantityThousandths += Number(quantityDeltaThousandths);
  addAudit('inventory.adjusted', 'product', productId, `${reason} - delta: ${quantityDeltaThousandths / 1000}`);
}

export function lowStockProducts() {
  return getState().products.filter(
    (product) =>
      product.companyId === activeCompany().id &&
      product.trackStock &&
      product.stockQuantityThousandths <= product.reorderLevelThousandths
  );
}
