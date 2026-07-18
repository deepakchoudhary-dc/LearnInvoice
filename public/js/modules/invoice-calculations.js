/**
 * Decimal-safe money and financial calculations.
 * Persistent representations:
 * - Money/Amounts: integer minor units (e.g. Paise for INR, Cents for USD).
 * - Rates (Tax, Discount): integer basis points (bps, 1% = 100 bps).
 * - Quantities: integer thousandths (qty * 1000).
 */

const MONEY_SCALE = 100n;
const QUANTITY_SCALE = 1000n;
const BPS_SCALE = 100n; // 1% = 100 bps, so parseDecimal with scale 100 converts 18.5% to 1850 bps

function parseDecimal(value, scale, label = 'value') {
  const raw = String(value ?? '').trim().replace(/,/g, '');
  if (!raw) return 0n;
  if (!/^[+-]?(?:\d+|\d*\.\d+)$/.test(raw)) {
    throw new TypeError(`Invalid ${label}: ${value}`);
  }
  const negative = raw.startsWith('-');
  const unsigned = raw.replace(/^[+-]/, '');
  const [whole, fraction = ''] = unsigned.split('.');
  const precision = String(scale).length - 1;
  const padded = (fraction + '0'.repeat(precision)).slice(0, precision);
  const remainder = fraction.slice(precision, precision + 1);
  let result = BigInt(whole || '0') * BigInt(scale) + BigInt(padded || '0');
  if (remainder >= '5') {
    result += 1n;
  }
  return negative ? -result : result;
}

function formatDecimal(value, scale) {
  const val = BigInt(value || 0);
  const negative = val < 0n;
  const absolute = negative ? -val : val;
  const scaleInt = BigInt(scale);
  const whole = absolute / scaleInt;
  const fractionLength = String(scale).length - 1;
  const fraction = String(absolute % scaleInt).padStart(fractionLength, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}

function asSafeNumber(value, label = 'value') {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${label} is outside the supported safe range`);
  }
  return Number(value);
}

function roundDivide(numerator, denominator) {
  if (denominator <= 0n) throw new RangeError('Division denominator must be positive');
  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;
  return sign * ((absolute + denominator / 2n) / denominator);
}

// Convert display values (string/number) to persistent integer values
export function toPaise(value) {
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  return asSafeNumber(parseDecimal(value, MONEY_SCALE, 'amount'), 'amount');
}

export function fromPaise(paiseInt) {
  return formatDecimal(paiseInt, MONEY_SCALE);
}

export function toThousandths(value) {
  if (typeof value === 'number') {
    return Math.round(value * 1000);
  }
  return asSafeNumber(parseDecimal(value, QUANTITY_SCALE, 'quantity'), 'quantity');
}

export function fromThousandths(qtyInt) {
  return formatDecimal(qtyInt, QUANTITY_SCALE);
}

export function toBps(value) {
  if (typeof value === 'number') {
    return Math.round(value * 100);
  }
  return asSafeNumber(parseDecimal(value, BPS_SCALE, 'rate'), 'rate');
}

export function fromBps(bpsInt) {
  return formatDecimal(bpsInt, BPS_SCALE);
}

// Calculations using persistent integer values
export function calculateTax(basePaise, taxRateBps) {
  return asSafeNumber(roundDivide(BigInt(basePaise) * BigInt(taxRateBps), 10000n), 'tax');
}

export function calculateDiscount(basePaise, discountRateBps) {
  if (discountRateBps < 0 || discountRateBps > 10000) {
    throw new RangeError('Discount rate must be between 0 and 100%');
  }
  return asSafeNumber(roundDivide(BigInt(basePaise) * BigInt(discountRateBps), 10000n), 'discount');
}

/**
 * Calculate line item totals.
 * @param {number} quantityThousandths - Quantity in thousandths
 * @param {number} ratePaise - Price per unit in paise
 * @param {number} discountRateBps - Line discount rate in basis points
 * @param {number} taxRateBps - Line tax rate in basis points
 * @param {boolean} isTaxInclusive - Is price tax inclusive
 */
export function calculateLineItem(quantityThousandths, ratePaise, discountRateBps = 0, taxRateBps = 0, isTaxInclusive = false) {
  const qty = BigInt(quantityThousandths);
  const rate = BigInt(ratePaise);
  const discBps = BigInt(discountRateBps);
  const taxBps = BigInt(taxRateBps);

  if (qty < 0n || rate < 0n || discBps < 0n || taxBps < 0n) {
    throw new RangeError('Negative values not allowed in line item calculations');
  }

  // grossPaise = (rate * qty) / 1000
  const grossPaise = roundDivide(rate * qty, QUANTITY_SCALE);
  // discountPaise = (grossPaise * discBps) / 10000
  const discountPaise = roundDivide(grossPaise * discBps, 10000n);
  const discountedPaise = grossPaise - discountPaise;

  let taxPaise = 0n;
  let taxablePaise = discountedPaise;

  if (isTaxInclusive) {
    // taxPaise = (discountedPaise * taxBps) / (10000 + taxBps)
    taxPaise = roundDivide(discountedPaise * taxBps, 10000n + taxBps);
    taxablePaise = discountedPaise - taxPaise;
  } else {
    // taxPaise = (discountedPaise * taxBps) / 10000
    taxPaise = roundDivide(discountedPaise * taxBps, 10000n);
  }

  const netPaise = taxablePaise + taxPaise;

  return {
    grossPaise: asSafeNumber(grossPaise, 'gross amount'),
    discountPaise: asSafeNumber(discountPaise, 'discount amount'),
    taxablePaise: asSafeNumber(taxablePaise, 'taxable amount'),
    taxPaise: asSafeNumber(taxPaise, 'tax amount'),
    netPaise: asSafeNumber(netPaise, 'net amount')
  };
}
