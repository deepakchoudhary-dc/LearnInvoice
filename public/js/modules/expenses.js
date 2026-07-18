import { activeCompany, addAudit, getState } from './state.js';
import { toPaise } from './invoice-calculations.js';

export function saveExpense(input) {
  const expense = {
    id: input.id || crypto.randomUUID(),
    companyId: input.companyId || activeCompany().id,
    date: input.date || new Date().toISOString().slice(0, 10),
    category: String(input.category || 'General'),
    vendor: String(input.vendor || ''),
    notes: String(input.notes || ''),
    amountPaise: Number.isSafeInteger(input.amountPaise) ? input.amountPaise : toPaise(input.amount || 0)
  };

  if (expense.amountPaise <= 0) throw new Error('Expense amount must be positive.');

  const state = getState();
  const index = state.expenses.findIndex((entry) => entry.id === expense.id);
  if (index >= 0) {
    state.expenses[index] = expense;
  } else {
    state.expenses.push(expense);
  }

  addAudit('expense.saved', 'expense', expense.id, expense.category);
  return expense;
}
