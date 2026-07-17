/**
 * Integer Minor Units / Paise calculations
 * Prevents floating point errors like 0.1 + 0.2 = 0.300000004
 * Always store money as integers! (e.g. 100.50 INR is stored as 10050)
 */

export function toPaise(decimalStringOrNumber) {
    if (!decimalStringOrNumber) return 0;
    // Handle strings like "1,000.50"
    let val = typeof decimalStringOrNumber === 'string' 
        ? decimalStringOrNumber.replace(/,/g, '') 
        : String(decimalStringOrNumber);
    
    // If it's already an integer, assume it's whole rupees? No, we assume input is in major units (Rupees/Dollars)
    const parts = val.split('.');
    const major = parseInt(parts[0], 10) || 0;
    
    let minorStr = parts[1] || '00';
    minorStr = minorStr.padEnd(2, '0').slice(0, 2); // strictly 2 decimals
    const minor = parseInt(minorStr, 10);
    
    const isNegative = val.startsWith('-');
    const absolutePaise = (Math.abs(major) * 100) + minor;
    return isNegative ? -absolutePaise : absolutePaise;
}

export function fromPaise(paiseInt) {
    if (!paiseInt) return "0.00";
    const isNegative = paiseInt < 0;
    const abs = Math.abs(paiseInt);
    
    const major = Math.floor(abs / 100);
    const minor = (abs % 100).toString().padStart(2, '0');
    
    const result = `${major}.${minor}`;
    return isNegative ? `-${result}` : result;
}

export function calculateTax(basePaise, taxRatePercentString) {
    const rateStr = String(taxRatePercentString || 0);
    // Multiply by 100 to handle up to 2 decimal places in tax rates (e.g., 12.5%)
    const rateMultiplier = toPaise(rateStr); // 12.50 becomes 1250
    // formula: (base * rate) / 100 
    // since rate is now magnified by 100, we divide by 10000
    return Math.round((basePaise * rateMultiplier) / 10000);
}

export function calculateDiscount(basePaise, discountRatePercentString) {
    return calculateTax(basePaise, discountRatePercentString); // Math is the same
}

export function calculateLineItem(qtyStr, rateString, discountRateStr = "0", taxRateStr = "0", isTaxInclusive = false) {
    const qty = parseFloat(qtyStr) || 0;
    const ratePaise = toPaise(rateString); // per unit
    let grossPaise = Math.round(ratePaise * qty);
    
    const discountPaise = calculateDiscount(grossPaise, discountRateStr);
    const taxablePaise = grossPaise - discountPaise;
    
    let cgstPaise = 0, sgstPaise = 0, igstPaise = 0, totalTax = 0;
    let netPaise = 0;
    
    if (isTaxInclusive) {
        // formula: Tax = (Taxable Value * Rate) / (100 + Rate)
        const rateMultiplier = toPaise(taxRateStr); // e.g. 18.00 -> 1800
        totalTax = Math.round((taxablePaise * rateMultiplier) / (10000 + rateMultiplier));
        // Back-calculate taxable base
        const actualTaxable = taxablePaise - totalTax;
        netPaise = taxablePaise; 
        
        return {
            grossPaise,
            discountPaise,
            taxablePaise: actualTaxable,
            taxPaise: totalTax,
            netPaise
        };
    } else {
        totalTax = calculateTax(taxablePaise, taxRateStr);
        netPaise = taxablePaise + totalTax;
        return {
            grossPaise,
            discountPaise,
            taxablePaise,
            taxPaise: totalTax,
            netPaise
        };
    }
}
