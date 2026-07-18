/**
 * Shared UI components, formatters, and security wrappers.
 * Prevents HTML injection by using DOM Text Nodes or strict sanitization.
 */

import { activeCompany } from '../state.js';

export const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])
  );

export function safeText(element, text) {
  const node = typeof element === 'string' ? document.getElementById(element) : element;
  if (!node) return;
  node.textContent = String(text ?? '');
}

export function money(amountPaise, currency, locale) {
  const comp = activeCompany();
  const cur = currency || comp?.currency || 'INR';
  const loc = locale || comp?.locale || 'en-IN';
  try {
    return new Intl.NumberFormat(loc, { style: 'currency', currency: cur }).format((amountPaise || 0) / 100);
  } catch {
    return `${cur} ${((amountPaise || 0) / 100).toFixed(2)}`;
  }
}

export function percent(bps) {
  return `${(Number(bps || 0) / 100).toFixed(2)}%`;
}

export function quantity(thousandths) {
  return (Number(thousandths || 0) / 1000).toString();
}

export function createTable(headers, rowsHtml) {
  return `<div class="table-wrap">
    <table class="data-table">
      <thead>
        <tr>
          ${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>`;
}

export function button(label, action, value = '', tone = '') {
  return `<button class="button small ${tone}" data-action="${escapeHtml(action)}" data-value="${escapeHtml(value)}">${escapeHtml(label)}</button>`;
}

export function select(label, name, options, value = '', extra = '') {
  return `<div class="field">
    <label>${escapeHtml(label)}</label>
    <select name="${escapeHtml(name)}" ${extra}>
      ${options.map(([val, text]) => `<option value="${escapeHtml(val)}" ${String(val) === String(value) ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}
    </select>
  </div>`;
}

export function field(label, name, value = '', type = 'text', extra = '') {
  return `<div class="field">
    <label>${escapeHtml(label)}</label>
    <input name="${escapeHtml(name)}" type="${type}" value="${escapeHtml(value)}" ${extra}>
  </div>`;
}

export function chooseFile(callback, accept = '.json,.csv,application/json,text/csv') {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.addEventListener('change', async () => {
    if (input.files?.[0]) {
      try {
        await callback(input.files[0]);
      } catch (error) {
        alert(error.message || 'File upload failed.');
      }
    }
  });
  input.click();
}
