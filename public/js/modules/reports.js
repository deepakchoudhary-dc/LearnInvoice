import { activeCompany, getState, scopeForCompany } from './state.js';
import { calculateDocumentTotals, getDocumentStatus, paidAmountPaise } from './documents.js';

const issued = (document) => ['issued', 'partial', 'paid', 'overdue'].includes(getDocumentStatus(document));

/**
 * Generates the central sales register with multi-level filtering
 */
export function salesRegister({ from = '', to = '', customerId = '', type = '', status = '' } = {}) {
  let docs = scopeForCompany(getState().documents);

  // Apply filters
  if (from) docs = docs.filter(d => d.issueDate >= from);
  if (to) docs = docs.filter(d => d.issueDate <= to);
  if (customerId) docs = docs.filter(d => d.customerId === customerId);
  if (type) docs = docs.filter(d => d.type === type);
  if (status) {
    docs = docs.filter(d => getDocumentStatus(d) === status);
  } else {
    // Default sales register includes issued non-draft non-void invoices
    docs = docs.filter(issued);
  }

  return docs.map((document) => ({
    document,
    totals: calculateDocumentTotals(document),
    status: getDocumentStatus(document)
  }));
}

export function outstandingReport({ from = '', to = '', customerId = '' } = {}) {
  return salesRegister({ from, to, customerId })
    .filter(({ status }) => ['issued', 'partial', 'overdue'].includes(status))
    .map(({ document, totals, status }) => ({
      document,
      status,
      outstandingPaise: Math.max(0, totals.total - paidAmountPaise(document))
    }));
}

export function agingReport(asOf = new Date().toISOString().slice(0, 10)) {
  const buckets = { current: 0, days30: 0, days60: 0, days90Plus: 0 };
  
  for (const row of outstandingReport()) {
    const dueDate = new Date(`${row.document.dueDate}T00:00:00`);
    const anchorDate = new Date(`${asOf}T00:00:00`);
    const diffTime = anchorDate.getTime() - dueDate.getTime();
    const days = Math.max(0, Math.floor(diffTime / 86400000));
    
    if (days <= 0) {
      buckets.current += row.outstandingPaise;
    } else if (days <= 30) {
      buckets.days30 += row.outstandingPaise;
    } else if (days <= 60) {
      buckets.days60 += row.outstandingPaise;
    } else {
      buckets.days90Plus += row.outstandingPaise;
    }
  }
  return buckets;
}

export function customerStatement(customerId, { from = '', to = '' } = {}) {
  return salesRegister({ customerId, from, to }).map(({ document, totals, status }) => ({
    number: document.number,
    date: document.issueDate,
    dueDate: document.dueDate,
    status,
    totalPaise: totals.total,
    paidPaise: paidAmountPaise(document),
    outstandingPaise: Math.max(0, totals.total - paidAmountPaise(document))
  }));
}

export function monthlySales({ from = '', to = '' } = {}) {
  const result = new Map();
  for (const { document, totals } of salesRegister({ from, to })) {
    const month = document.issueDate.slice(0, 7);
    result.set(month, (result.get(month) || 0) + totals.total);
  }
  return [...result.entries()]
    .map(([month, totalPaise]) => ({ month, totalPaise }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export function productSales({ from = '', to = '' } = {}) {
  const totals = new Map();
  for (const { document } of salesRegister({ from, to })) {
    for (const item of document.items || []) {
      const key = item.productId || item.description;
      const current = totals.get(key) || { label: item.description, quantityThousandths: 0, amountPaise: 0 };
      current.quantityThousandths += Number(item.quantityThousandths || 0);
      current.amountPaise += Number(item.lineTotalPaise || 0);
      totals.set(key, current);
    }
  }
  return [...totals.values()].sort((a, b) => b.amountPaise - a.amountPaise);
}

export function taxLiability({ from = '', to = '' } = {}) {
  const result = {};
  for (const { totals } of salesRegister({ from, to })) {
    for (const [rateBps, values] of Object.entries(totals.taxBreakdown)) {
      const row = result[rateBps] || { taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 };
      row.taxablePaise += values.taxablePaise;
      row.cgstPaise += values.cgstPaise;
      row.sgstPaise += values.sgstPaise;
      row.igstPaise += values.igstPaise;
      result[rateBps] = row;
    }
  }
  return result;
}

export function expenseSummary({ from = '', to = '' } = {}) {
  let list = scopeForCompany(getState().expenses);
  if (from) list = list.filter(e => e.date >= from);
  if (to) list = list.filter(e => e.date <= to);
  return list.reduce((sum, expense) => sum + expense.amountPaise, 0);
}

export function expenseByCategory({ from = '', to = '' } = {}) {
  const result = {};
  let list = scopeForCompany(getState().expenses);
  if (from) list = list.filter(e => e.date >= from);
  if (to) list = list.filter(e => e.date <= to);
  
  for (const exp of list) {
    result[exp.category] = (result[exp.category] || 0) + exp.amountPaise;
  }
  return result;
}
