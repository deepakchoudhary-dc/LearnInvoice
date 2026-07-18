import { activeCompany, addAudit, getState } from './state.js';
import { newDraft } from './documents.js';
import { toPaise, toBps, toThousandths } from './invoice-calculations.js';

export function saveRecurringTemplate(input) {
  const items = (input.items || []).map(item => ({
    id: item.id || crypto.randomUUID(),
    productId: item.productId || '',
    description: String(item.description || '').trim(),
    hsn: String(item.hsn || '').trim(),
    quantityThousandths: Number.isSafeInteger(item.quantityThousandths) ? item.quantityThousandths : toThousandths(item.quantity || 1),
    ratePaise: Number.isSafeInteger(item.ratePaise) ? item.ratePaise : toPaise(item.rate || 0),
    discountRateBps: Number.isSafeInteger(item.discountRateBps) ? item.discountRateBps : toBps(item.discountRate || 0),
    taxRateBps: Number.isSafeInteger(item.taxRateBps) ? item.taxRateBps : toBps(item.taxRate || 18),
    isService: Boolean(item.isService)
  }));

  const template = {
    id: input.id || crypto.randomUUID(),
    companyId: input.companyId || activeCompany().id,
    name: String(input.name || '').trim(),
    frequency: input.frequency || 'monthly',
    nextDate: input.nextDate || new Date().toISOString().slice(0, 10),
    customerId: input.customerId || '',
    items,
    notes: input.notes || '',
    terms: input.terms || '',
    active: input.active !== false
  };

  if (!template.name || !template.customerId || !template.items.length) {
    throw new Error('Recurring template needs a name, customer, and item.');
  }

  const state = getState();
  const index = state.recurringTemplates.findIndex((entry) => entry.id === template.id);
  if (index >= 0) {
    state.recurringTemplates[index] = template;
  } else {
    state.recurringTemplates.push(template);
  }

  addAudit('recurring.saved', 'recurring', template.id, template.name);
  return template;
}

export function generateDueRecurring(today = new Date().toISOString().slice(0, 10)) {
  const state = getState();
  const created = [];

  for (const template of state.recurringTemplates.filter(
    (entry) => entry.companyId === activeCompany().id && entry.active && entry.nextDate <= today
  )) {
    const invoice = newDraft({
      type: 'invoice',
      customerId: template.customerId,
      items: template.items,
      notes: template.notes,
      terms: template.terms
    });
    
    invoice.recurringTemplateId = template.id;
    state.documents.push(invoice);

    const next = new Date(`${template.nextDate}T00:00:00`);
    next.setMonth(
      next.getMonth() + (template.frequency === 'quarterly' ? 3 : template.frequency === 'yearly' ? 12 : 1)
    );
    template.nextDate = next.toISOString().slice(0, 10);
    created.push(invoice);
    addAudit('recurring.generated', 'document', invoice.id, template.name);
  }

  return created;
}
