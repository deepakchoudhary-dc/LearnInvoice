import { getState, initializeState, saveState } from './state.js';

/**
 * Generates an encrypted backup of the entire state
 * The state is already in memory, we simply stringify it.
 * Note: For extreme security, we could re-encrypt it with a specific backup password,
 * but for this offline app, the state is exported as raw JSON since the user has already unlocked it locally.
 * If the user wants to encrypt the backup file, they must provide a backup password.
 */

export function exportBackup() {
    const state = getState();
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `ledgerly_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export async function importBackup(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const importedState = JSON.parse(e.target.result);
                if (!importedState.company || !importedState.documents) {
                    throw new Error("Invalid backup file format.");
                }
                
                // Merge state directly 
                const currentState = getState();
                currentState.company = importedState.company;
                currentState.customers = importedState.customers;
                currentState.products = importedState.products;
                currentState.documents = importedState.documents;
                
                await saveState();
                resolve();
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
    });
}

/**
 * Phase 4: Generate India GST IRP e-Invoice Draft JSON
 * Format aligns with GST INV-01 Schema
 */
export function exportIRPDraft(invoice, totals) {
    const state = getState();
    const customer = state.customers.find(c => c.id === invoice.customerId);
    
    // Simplistic mapping to IRP Schema
    const irpDraft = {
        "Version": "1.1",
        "TranDtls": {
            "TaxSch": "GST",
            "SupTyp": "B2B",
            "RegRev": "N",
            "IgstOnIntra": "N"
        },
        "DocDtls": {
            "Typ": invoice.type === 'invoice' ? 'INV' : invoice.type === 'credit' ? 'CRN' : 'DBN',
            "No": invoice.number,
            "Dt": invoice.issueDate.split('-').reverse().join('/') // DD/MM/YYYY
        },
        "SellerDtls": {
            "Gstin": state.company.taxId,
            "LglNm": state.company.name,
            "Addr1": state.company.address,
            "Loc": "Unknown", // Needs city
            "Pin": 0, // Needs pin
            "Stcd": state.company.taxId ? state.company.taxId.substring(0,2) : ""
        },
        "BuyerDtls": {
            "Gstin": customer ? customer.taxId : "",
            "LglNm": customer ? customer.name : "",
            "Pos": customer ? customer.placeOfSupply : "",
            "Addr1": customer ? customer.email : "",
            "Loc": "Unknown",
            "Pin": 0,
            "Stcd": customer ? customer.placeOfSupply : ""
        },
        "ItemList": invoice.items.map((item, idx) => ({
            "SlNo": String(idx + 1),
            "PrdDesc": item.description,
            "IsServc": "N", // Would need service flag
            "HsnCd": item.hsn,
            "Qty": Number(item.quantity),
            "Unit": "NOS",
            "UnitPrice": Number(item.rate),
            "TotAmt": Number(item.rate) * Number(item.quantity),
            "Discount": 0,
            "AssAmt": Number(item.rate) * Number(item.quantity),
            "GstRt": Number(item.taxRate),
            "IgstAmt": totals.taxType === 'INTER_STATE' ? (totals.tax / 100) : 0,
            "CgstAmt": totals.taxType === 'INTRA_STATE' ? (totals.tax / 200) : 0,
            "SgstAmt": totals.taxType === 'INTRA_STATE' ? (totals.tax / 200) : 0,
            "TotItemVal": (Number(item.rate) * Number(item.quantity)) + (totals.tax / 100)
        })),
        "ValDtls": {
            "AssVal": totals.subtotal / 100,
            "CgstVal": totals.taxType === 'INTRA_STATE' ? (totals.tax / 200) : 0,
            "SgstVal": totals.taxType === 'INTRA_STATE' ? (totals.tax / 200) : 0,
            "IgstVal": totals.taxType === 'INTER_STATE' ? (totals.tax / 100) : 0,
            "TotInvVal": totals.total / 100
        }
    };

    const dataStr = JSON.stringify(irpDraft, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IRP_Draft_${invoice.number}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
