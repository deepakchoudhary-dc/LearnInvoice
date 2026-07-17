/**
 * UI rendering utilities
 */

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function createTable(headers, rows) {
    return '<div class="table-wrap"><table class="data-table"><thead><tr>' +
      headers.map((header) => '<th>' + escapeHtml(header) + '</th>').join('') +
      '</tr></thead><tbody>' + (Array.isArray(rows) ? rows.join('') : String(rows)) + '</tbody></table></div>';
}

export function createFormGroup(label, inputHtml) {
    return `<div class="form-group"><label>${escapeHtml(label)}</label>${inputHtml}</div>`;
}

export function createAlert(message, type = 'info') {
    return `<div class="alert alert-${type}">${escapeHtml(message)}</div>`;
}

// Reusable Print function utilizing native browser print engine
export function printDocument() {
    window.print();
}
