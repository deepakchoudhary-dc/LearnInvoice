import { test } from 'node:test';
import assert from 'node:assert/strict';

import { 
  toPaise, fromPaise, toThousandths, fromThousandths, toBps, fromBps, calculateLineItem 
} from '../../public/js/modules/invoice-calculations.js';
import { 
  getState, activeCompany, setActiveCompany, saveState, scopeForCompany 
} from '../../public/js/modules/state.js';
import { 
  newDraft, calculateDocumentTotals, getDocumentStatus, issueDocument, recordPayment, voidDocument, createCorrection 
} from '../../public/js/modules/documents.js';
import { validateInvoiceBeforeIssue } from '../../public/js/modules/validation.js';
import { validateGSTIN, validateHSNSAC, determineTaxType } from '../../public/js/modules/gst.js';
import { saveProduct, adjustStock, lowStockProducts } from '../../public/js/modules/products.js';
import { saveCustomer } from '../../public/js/modules/customers.js';
import { exportIRPDraft } from '../../public/js/modules/backup.js';


test('Business Calculations - paise, bps, and thousandths precision', () => {
  // Test conversion
  assert.equal(toPaise('123.45'), 12345);
  assert.equal(fromPaise(12345), '123.45');
  
  assert.equal(toThousandths('1.555'), 1555);
  assert.equal(fromThousandths(1555), '1.555');

  assert.equal(toBps('18'), 1800);
  assert.equal(fromBps(1800), '18.00');

  // Test tax inclusive line calculation
  const inclusive = calculateLineItem(1000, 11800, 0, 1800, true); // qty=1.000, rate=118.00, tax=18%
  assert.equal(inclusive.taxablePaise, 10000);
  assert.equal(inclusive.taxPaise, 1800);
  assert.equal(inclusive.netPaise, 11800);

  // Test tax exclusive line calculation with discount
  const exclusive = calculateLineItem(2000, 10000, 1000, 1800, false); // qty=2.000, rate=100.00, discount=10%, tax=18%
  // gross = 2 * 10000 = 20000
  // discount = 20000 * 10% = 2000
  // taxable = 18000
  // tax = 18000 * 18% = 3240
  // net = 21240
  assert.equal(exclusive.grossPaise, 20000);
  assert.equal(exclusive.discountPaise, 2000);
  assert.equal(exclusive.taxablePaise, 18000);
  assert.equal(exclusive.taxPaise, 3240);
  assert.equal(exclusive.netPaise, 21240);
});

test('GST Validation - strict structures and HSN codes', () => {
  assert.ok(validateGSTIN('27AAAAA0000A1Z5')); // Maharashtra
  assert.ok(!validateGSTIN('99AAAAA0000A1Z5')); // Invalid state code 99
  assert.ok(!validateGSTIN('invalid'));

  assert.ok(validateHSNSAC('1234'));
  assert.ok(validateHSNSAC('123456'));
  assert.ok(validateHSNSAC('12345678'));
  assert.ok(!validateHSNSAC('123')); // short
  assert.ok(!validateHSNSAC('12345')); // odd length
  assert.ok(!validateHSNSAC('abcde')); // letters

  assert.equal(determineTaxType('27AAAAA0000A1Z5', '27'), 'INTRA_STATE');
  assert.equal(determineTaxType('27AAAAA0000A1Z5', '07'), 'INTER_STATE');
});

test('Business Flow - credit limit validation blocks invoice issuance', () => {
  const state = getState();
  state.company.taxId = '27AAAAA0000A1Z5';

  const customer = saveCustomer({
    name: 'Exceeding Customer',
    creditLimitPaise: 50000, // 500.00 limit
    companyId: state.activeCompanyId
  });

  const invoice = newDraft({
    customerId: customer.id,
    dueDate: '2099-12-31',
    items: [
      {
        description: 'Expensive Service',
        quantityThousandths: 1000,
        ratePaise: 60000, // 600.00 rate
        taxRateBps: 0,
        discountRateBps: 0
      }
    ]
  });

  // Verify validation fails due to credit limit exposure
  const validation = validateInvoiceBeforeIssue(invoice);
  assert.ok(!validation.isValid);
  assert.ok(validation.errors.some(err => err.includes('credit limit exceeded')));
});

test('Business Flow - company isolation controls access', () => {
  const state = getState();
  const originalCompanyId = state.activeCompanyId;
  const newCompanyId = crypto.randomUUID();

  // Create isolated customer in company 2
  const c2Customer = saveCustomer({
    name: 'Isolated customer',
    companyId: newCompanyId
  });

  // Active company remains original
  const filteredOriginal = scopeForCompany(state.customers);
  assert.ok(!filteredOriginal.some(c => c.id === c2Customer.id));

  // Switch company and verify access
  state.activeCompanyId = newCompanyId;
  const filteredC2 = scopeForCompany(state.customers);
  assert.ok(filteredC2.some(c => c.id === c2Customer.id));

  // Reset active company
  state.activeCompanyId = originalCompanyId;
});

test('Inventory Stock Management - adjustments and alerts', () => {
  const state = getState();
  
  const product = saveProduct({
    name: 'Tracked widget',
    sku: 'WIDGET-01',
    trackStock: true,
    stockQuantityThousandths: 5000, // 5.0 units0
    reorderLevelThousandths: 2000 // 2.0 units
  });

  // Delta of -4.0 units
  adjustStock(product.id, -4000, 'Sale deduction');
  assert.equal(product.stockQuantityThousandths, 1000); // 1.0 unit left

  // Verify product triggers low stock alert
  const alerts = lowStockProducts();
  assert.ok(alerts.some(p => p.id === product.id));
});
