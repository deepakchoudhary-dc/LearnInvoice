import { getState, saveState, addAudit, setActiveCompany } from './state.js';
import { encryptBackup, decryptBackup } from './crypto.js';
import { calculateDocumentTotals } from './documents.js';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_IRP_RESPONSE_BYTES = 100 * 1024; // 100 KB

function downloadJson(data, filename) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function validateBackupState(value) {
  if (!value || typeof value !== 'object') throw new Error('Backup has invalid data.');
  if (!Array.isArray(value.companies) && (!value.company || typeof value.company !== 'object')) {
    throw new Error('Backup has no valid business profile.');
  }
  for (const collection of ['customers', 'products', 'documents']) {
    if (!Array.isArray(value[collection])) {
      throw new Error(`Backup has invalid ${collection} data.`);
    }
  }
  return value;
}

export async function exportBackup(password) {
  const state = getState();
  const envelope = await encryptBackup(state, password);
  downloadJson(envelope, `ledgerly-backup-${new Date().toISOString().slice(0, 10)}.json`);
  addAudit('backup.exported', 'company', state.activeCompanyId, 'Encrypted backup generated');
}

/**
 * Parses and decrypts backup file, returning a preview summary of contents
 */
export async function previewBackupFile(file, password) {
  if (!file || file.size > MAX_BACKUP_BYTES) {
    throw new Error('Backup must be a JSON file smaller than 10 MB.');
  }
  let envelope;
  try {
    envelope = JSON.parse(await file.text());
  } catch {
    throw new Error('Backup file is not valid JSON.');
  }

  const imported = validateBackupState(await decryptBackup(envelope, password));

  // Build preview summary
  const companiesList = imported.companies || [imported.company];
  const summary = {
    companies: companiesList.map(c => {
      const companyDocs = (imported.documents || []).filter(d => d.companyId === c.id || (!d.companyId && c.id === imported.activeCompanyId));
      const companyCusts = (imported.customers || []).filter(cust => cust.companyId === c.id || (!cust.companyId && c.id === imported.activeCompanyId));
      const companyProds = (imported.products || []).filter(p => p.companyId === c.id || (!p.companyId && c.id === imported.activeCompanyId));
      return {
        name: c.name,
        documentCount: companyDocs.length,
        customerCount: companyCusts.length,
        productCount: companyProds.length
      };
    })
  };

  return { state: imported, summary };
}

/**
 * Restores decrypted backup state
 * @param {object} imported - Decrypted state object
 * @param {boolean} restoreAsCopy - If true, imports records as new isolated entities without overwriting current data
 */
export async function performRestore(imported, restoreAsCopy = false) {
  const current = getState();

  const importedCompanies = imported.companies || [imported.company];
  const importedActiveId = imported.activeCompanyId || importedCompanies[0].id;

  if (restoreAsCopy) {
    // Generate fresh UUIDs for all imported entities to avoid ID collision
    const idMap = new Map();

    const newCompanies = importedCompanies.map(c => {
      const newId = crypto.randomUUID();
      idMap.set(c.id, newId);
      return { ...c, id: newId, name: `${c.name} (Imported)` };
    });

    const newCustomers = (imported.customers || []).map(cust => {
      const newId = crypto.randomUUID();
      idMap.set(cust.id, newId);
      return { ...cust, id: newId, companyId: idMap.get(cust.companyId) || cust.companyId };
    });

    const newProducts = (imported.products || []).map(p => {
      const newId = crypto.randomUUID();
      idMap.set(p.id, newId);
      return { ...p, id: newId, companyId: idMap.get(p.companyId) || p.companyId };
    });

    const newDocuments = (imported.documents || []).map(doc => {
      const newId = crypto.randomUUID();
      idMap.set(doc.id, newId);
      // Remap document fields
      const items = (doc.items || []).map(item => ({
        ...item,
        id: crypto.randomUUID(),
        productId: idMap.get(item.productId) || item.productId
      }));
      const payments = (doc.payments || []).map(pay => ({
        ...pay,
        id: crypto.randomUUID()
      }));
      return {
        ...doc,
        id: newId,
        companyId: idMap.get(doc.companyId) || doc.companyId,
        customerId: idMap.get(doc.customerId) || doc.customerId,
        items,
        payments
      };
    });

    const newExpenses = (imported.expenses || []).map(exp => ({
      ...exp,
      id: crypto.randomUUID(),
      companyId: idMap.get(exp.companyId) || exp.companyId
    }));

    const newRecurring = (imported.recurringTemplates || []).map(rec => {
      const items = (rec.items || []).map(item => ({
        ...item,
        id: crypto.randomUUID(),
        productId: idMap.get(item.productId) || item.productId
      }));
      return {
        ...rec,
        id: crypto.randomUUID(),
        companyId: idMap.get(rec.companyId) || rec.companyId,
        customerId: idMap.get(rec.customerId) || rec.customerId,
        items
      };
    });

    // Merge into current state
    current.companies.push(...newCompanies);
    current.customers.push(...newCustomers);
    current.products.push(...newProducts);
    current.documents.push(...newDocuments);
    current.expenses.push(...newExpenses);
    current.recurringTemplates.push(...newRecurring);

    // Switch to first imported company
    setActiveCompany(newCompanies[0].id);
    addAudit('backup.restored_as_copy', 'company', newCompanies[0].id, 'Backup restored as new company copy');
  } else {
    // Standard Overwrite Restore
    current.companies = importedCompanies;
    current.activeCompanyId = importedActiveId;
    current.company = current.companies.find(c => c.id === current.activeCompanyId) || current.companies[0];

    current.customers = imported.customers || [];
    current.products = imported.products || [];
    current.documents = imported.documents || [];
    current.expenses = imported.expenses || [];
    current.recurringTemplates = imported.recurringTemplates || [];
    current.audit = imported.audit || [];
    current.settings = imported.settings || current.settings;

    addAudit('backup.restored_overwrite', 'company', current.activeCompanyId, 'Backup completely overwrote existing data');
  }

  await saveState();
}

/**
 * Generates offline-compliant e-invoice (IRP) schema draft JSON file
 */
export function exportIRPDraft(invoice, totals) {
  const state = getState();
  const customer = state.customers.find((entry) => entry.id === invoice.customerId);
  if (!customer?.taxId || !state.company.taxId) {
    throw new Error('IRP draft requires supplier and buyer GSTIN details.');
  }

  const itemList = totals.rows.map((item, index) => {
    const cgst = totals.taxType === 'INTRA_STATE' ? Math.floor(item.taxPaise / 2) : 0;
    const sgst = totals.taxType === 'INTRA_STATE' ? item.taxPaise - cgst : 0;
    return {
      SlNo: String(index + 1),
      PrdDesc: item.description,
      IsServc: item.isService ? 'Y' : 'N',
      HsnCd: item.hsn,
      Qty: Number(item.quantityThousandths / 1000),
      Unit: item.unit || 'NOS',
      UnitPrice: Number(item.ratePaise / 100),
      TotAmt: (item.grossPaise || 0) / 100,
      Discount: (item.discountPaise || 0) / 100,
      AssAmt: (item.taxablePaise || 0) / 100,
      GstRt: Number(item.taxRateBps) / 100,
      IgstAmt: totals.taxType === 'INTER_STATE' ? (item.taxPaise || 0) / 100 : 0,
      CgstAmt: cgst / 100,
      SgstAmt: sgst / 100,
      TotItemVal: (item.lineTotalPaise || 0) / 100
    };
  });

  downloadJson({
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: invoice.supplyType || 'B2B',
      RegRev: invoice.reverseCharge ? 'Y' : 'N',
      IgstOnIntra: 'N'
    },
    DocDtls: {
      Typ: invoice.type === 'credit' ? 'CRN' : invoice.type === 'debit' ? 'DBN' : 'INV',
      No: invoice.number,
      Dt: invoice.issueDate.split('-').reverse().join('/')
    },
    SellerDtls: {
      Gstin: state.company.taxId,
      LglNm: state.company.name,
      Addr1: state.company.address,
      Loc: state.company.city || '',
      Pin: Number(state.company.pinCode || 0),
      Stcd: state.company.taxId.slice(0, 2)
    },
    BuyerDtls: {
      Gstin: customer.taxId,
      LglNm: customer.name,
      Addr1: customer.billingAddress || '',
      Loc: customer.city || '',
      Pin: Number(customer.pinCode || 0),
      Pos: customer.placeOfSupply || customer.taxId.slice(0, 2),
      Stcd: customer.placeOfSupply || customer.taxId.slice(0, 2)
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: totals.subtotal / 100,
      CgstVal: totals.taxType === 'INTRA_STATE' ? totals.tax / 200 : 0,
      SgstVal: totals.taxType === 'INTRA_STATE' ? totals.tax / 200 : 0,
      IgstVal: totals.taxType === 'INTER_STATE' ? totals.tax / 100 : 0,
      TotInvVal: totals.total / 100
    }
  }, `IRP-draft-${invoice.number}.json`);
}

/**
 * Validates and imports authorized IRP response file
 */
export async function importIRPResponse(file, invoiceId) {
  if (!file || file.size > MAX_IRP_RESPONSE_BYTES) {
    throw new Error('IRP response must be a JSON file smaller than 100 KB.');
  }

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('IRP response file is not valid JSON.');
  }

  // Schema-level validation of IRP response
  if (!data.Irn || !data.AckNo || !data.AckDt || !data.SignedQrCode) {
    throw new Error('Invalid IRP response: missing required fields (Irn, AckNo, AckDt, SignedQrCode).');
  }

  const state = getState();
  const doc = state.documents.find(d => d.id === invoiceId);
  if (!doc) throw new Error('Invoice not found.');
  if (doc.status === 'draft') throw new Error('Cannot import IRP response against draft documents. Issue the document first.');

  // Save e-invoice metadata
  doc.irpMetadata = {
    irn: String(data.Irn).trim(),
    ackNo: String(data.AckNo).trim(),
    ackDt: String(data.AckDt).trim(),
    qrCode: String(data.SignedQrCode).trim()
  };

  addAudit('document.irp_imported', 'document', doc.id, `Ack No: ${data.AckNo}`);
  await saveState();
  return doc;
}
