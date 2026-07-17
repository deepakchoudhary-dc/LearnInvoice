import { test } from 'node:test';
import assert from 'node:assert';
import { validateGSTIN, getStateCodeFromGSTIN, determineTaxType, validateHSNSAC } from '../../public/js/modules/gst.js';

test('GST - GSTIN Validation', (t) => {
    assert.strictEqual(validateGSTIN("27AAAAA0000A1Z5"), true);
    assert.strictEqual(validateGSTIN("invalid_gstin"), false);
    assert.strictEqual(validateGSTIN(""), false);
});

test('GST - State Code Extraction', (t) => {
    assert.strictEqual(getStateCodeFromGSTIN("27AAAAA0000A1Z5"), "27"); // Maharashtra
});

test('GST - Determine Tax Type (IGST vs CGST/SGST)', (t) => {
    // Intra-state (Supplier in MH, PoS in MH)
    assert.strictEqual(determineTaxType("27AAAAA0000A1Z5", "27"), "INTRA_STATE");
    
    // Inter-state (Supplier in MH, PoS in Delhi)
    assert.strictEqual(determineTaxType("27AAAAA0000A1Z5", "07"), "INTER_STATE");
});

test('GST - HSN/SAC Validation', (t) => {
    assert.strictEqual(validateHSNSAC("9983"), true);
    assert.strictEqual(validateHSNSAC("123"), false); // too short
    assert.strictEqual(validateHSNSAC("123456789"), false); // too long
    assert.strictEqual(validateHSNSAC("ABCD"), false); // numeric only
});
