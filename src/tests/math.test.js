import { test } from 'node:test';
import assert from 'node:assert';
import { toPaise, fromPaise, calculateLineItem } from '../../public/js/modules/math.js';

test('Math - Minor Units Conversion', (t) => {
    assert.strictEqual(toPaise("100.50"), 10050);
    assert.strictEqual(toPaise("1,000.99"), 100099);
    assert.strictEqual(toPaise("0.10"), 10);
    assert.strictEqual(toPaise("0.05"), 5);
    
    assert.strictEqual(fromPaise(10050), "100.50");
    assert.strictEqual(fromPaise(5), "0.05");
});

test('Math - Line Item Calculation (Tax Exclusive)', (t) => {
    const result = calculateLineItem("2", "50.00", "10", "18");
    // gross: 100.00 (10000)
    // discount: 10% of 10000 = 1000
    // taxable: 9000
    // tax: 18% of 9000 = 1620
    // net: 10620
    
    assert.strictEqual(result.grossPaise, 10000);
    assert.strictEqual(result.discountPaise, 1000);
    assert.strictEqual(result.taxablePaise, 9000);
    assert.strictEqual(result.taxPaise, 1620);
    assert.strictEqual(result.netPaise, 10620);
});

test('Math - Line Item Calculation (Tax Inclusive)', (t) => {
    // 100 total, 10% discount, 18% tax
    // rate = 50, qty = 2, gross = 100.00
    // disc = 10.00, taxable + tax = 90.00
    // tax = (90 * 18) / 118 = 13.72... -> 1373 paise
    // actual taxable = 9000 - 1373 = 7627 paise
    
    const result = calculateLineItem("2", "50.00", "10", "18", true);
    
    assert.strictEqual(result.grossPaise, 10000);
    assert.strictEqual(result.discountPaise, 1000);
    assert.strictEqual(result.taxablePaise, 7627);
    assert.strictEqual(result.taxPaise, 1373);
    assert.strictEqual(result.netPaise, 9000);
});
