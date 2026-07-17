import { getState } from './state.js';

export function validateInvoiceBeforeIssue(invoice) {
    const errors = [];
    const state = getState();

    // Check duplicate invoice number
    const isDuplicate = state.documents.some(d => d.id !== invoice.id && d.number === invoice.number);
    if (isDuplicate) {
        errors.push(`Duplicate Invoice Number: ${invoice.number} already exists.`);
    }

    // Check customer
    if (!invoice.customerId) {
        errors.push("Customer must be selected.");
    } else {
        const customer = state.customers.find(c => c.id === invoice.customerId);
        if (!customer) errors.push("Invalid customer reference.");
    }

    // Dates
    if (!invoice.issueDate) errors.push("Issue Date is required.");
    if (!invoice.dueDate) errors.push("Due Date is required.");
    if (invoice.dueDate < invoice.issueDate) errors.push("Due Date cannot be before Issue Date.");

    // Line items
    if (!invoice.items || invoice.items.length === 0) {
        errors.push("Invoice must have at least one line item.");
    } else {
        invoice.items.forEach((item, idx) => {
            if (!item.description) errors.push(`Line ${idx + 1}: Description is required.`);
            if (parseFloat(item.quantity) <= 0) errors.push(`Line ${idx + 1}: Quantity must be > 0.`);
            if (parseFloat(item.rate) < 0) errors.push(`Line ${idx + 1}: Rate cannot be negative.`);
            if (!item.hsn && parseFloat(item.rate) > 0) errors.push(`Line ${idx + 1}: HSN/SAC code is highly recommended for GST compliance.`);
        });
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}
