import {
  toPaise,
  fromPaise,
  toThousandths,
  fromThousandths,
  toBps,
  fromBps,
  calculateTax as calcTax,
  calculateDiscount as calcDiscount,
  calculateLineItem as calcLineItem
} from './invoice-calculations.js';

export { toPaise, fromPaise, toThousandths, fromThousandths, toBps, fromBps };

export function calculateTax(basePaise, taxRatePercent) {
  return calcTax(basePaise, toBps(taxRatePercent));
}

export function calculateDiscount(basePaise, discountRatePercent) {
  return calcDiscount(basePaise, toBps(discountRatePercent));
}

export function calculateLineItem(quantity, rate, discountRate = '0', taxRate = '0', isTaxInclusive = false) {
  const qtyThousandths = toThousandths(quantity);
  const pricePaise = toPaise(rate);
  const discBps = toBps(discountRate);
  const taxBps = toBps(taxRate);
  return calcLineItem(qtyThousandths, pricePaise, discBps, taxBps, isTaxInclusive);
}
