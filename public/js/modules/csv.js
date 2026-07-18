/**
 * CSV Import/Export Engine with Row-Level Validation, Schemas, Templates,
 * and Duplicate Policy Handling.
 */

export const CSV_SCHEMAS = {
  customers: {
    headers: ['name', 'contactName', 'phone', 'email', 'taxId', 'billingAddress', 'shippingAddress', 'placeOfSupply', 'paymentTermsDays', 'creditLimit'],
    required: ['name'],
    validateRow: (row) => {
      const errors = [];
      if (!row.name || !row.name.trim()) errors.push('Name is required.');
      if (row.taxId && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(row.taxId.toUpperCase().trim())) {
        errors.push('GSTIN format is invalid.');
      }
      if (row.paymentTermsDays && (isNaN(Number(row.paymentTermsDays)) || Number(row.paymentTermsDays) < 0 || Number(row.paymentTermsDays) > 365)) {
        errors.push('Payment terms must be a number between 0 and 365.');
      }
      if (row.creditLimit && (isNaN(Number(row.creditLimit)) || Number(row.creditLimit) < 0)) {
        errors.push('Credit limit must be a positive number.');
      }
      return errors;
    }
  },
  products: {
    headers: ['name', 'sku', 'barcode', 'hsn', 'unit', 'price', 'taxRate', 'trackStock', 'stockQuantity', 'reorderLevel', 'isService'],
    required: ['name'],
    validateRow: (row) => {
      const errors = [];
      if (!row.name || !row.name.trim()) errors.push('Name is required.');
      if (row.price && (isNaN(Number(row.price)) || Number(row.price) < 0)) {
        errors.push('Price must be a positive number.');
      }
      if (row.taxRate && (isNaN(Number(row.taxRate)) || Number(row.taxRate) < 0 || Number(row.taxRate) > 100)) {
        errors.push('Tax rate must be between 0 and 100.');
      }
      if (row.stockQuantity && isNaN(Number(row.stockQuantity))) {
        errors.push('Stock quantity must be a number.');
      }
      return errors;
    }
  },
  expenses: {
    headers: ['date', 'category', 'vendor', 'amount', 'notes'],
    required: ['date', 'category', 'amount'],
    validateRow: (row) => {
      const errors = [];
      if (!row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) errors.push('Date must be in YYYY-MM-DD format.');
      if (!row.category || !row.category.trim()) errors.push('Category is required.');
      if (!row.amount || isNaN(Number(row.amount)) || Number(row.amount) <= 0) {
        errors.push('Amount must be a positive number.');
      }
      return errors;
    }
  },
  payments: {
    headers: ['documentNumber', 'date', 'amount', 'method', 'reference'],
    required: ['documentNumber', 'date', 'amount'],
    validateRow: (row) => {
      const errors = [];
      if (!row.documentNumber || !row.documentNumber.trim()) errors.push('Document number is required.');
      if (!row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) errors.push('Date must be in YYYY-MM-DD format.');
      if (!row.amount || isNaN(Number(row.amount)) || Number(row.amount) <= 0) {
        errors.push('Amount must be a positive number.');
      }
      return errors;
    }
  }
};

export function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers, rows) {
  return [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(','))
  ].join('\r\n');
}

export function parseCsv(text, maxRows = 5000) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = '';
      if (rows.length > maxRows) throw new Error(`CSV exceeds ${maxRows} rows limit.`);
    } else {
      cell += char;
    }
  }

  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  if (!rows.length) return [];

  const [headers, ...data] = rows;
  return data.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] || '']))
  );
}

export function downloadText(text, filename, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Validates parsed CSV rows against a schema.
 * Returns parsed items and a list of structured row errors.
 */
export function validateCsvImport(type, parsedRows) {
  const schema = CSV_SCHEMAS[type];
  if (!schema) throw new Error(`Unknown CSV import schema: ${type}`);

  const valid = [];
  const errors = []; // array of { line, errors }

  parsedRows.forEach((row, index) => {
    const line = index + 2; // Line 1 is header
    const rowErrors = schema.validateRow(row);
    if (rowErrors.length > 0) {
      errors.push({ line, errors: rowErrors, row });
    } else {
      valid.push({ line, row });
    }
  });

  return { valid, errors };
}
