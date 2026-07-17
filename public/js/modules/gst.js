/**
 * India GST validation and rules engine
 */

const STATE_CODES = {
    "01": "Jammu & Kashmir",
    "02": "Himachal Pradesh",
    "03": "Punjab",
    "04": "Chandigarh",
    "05": "Uttarakhand",
    "06": "Haryana",
    "07": "Delhi",
    "08": "Rajasthan",
    "09": "Uttar Pradesh",
    "10": "Bihar",
    "11": "Sikkim",
    "12": "Arunachal Pradesh",
    "13": "Nagaland",
    "14": "Manipur",
    "15": "Mizoram",
    "16": "Tripura",
    "17": "Meghalaya",
    "18": "Assam",
    "19": "West Bengal",
    "20": "Jharkhand",
    "21": "Odisha",
    "22": "Chhattisgarh",
    "23": "Madhya Pradesh",
    "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu",
    "27": "Maharashtra",
    "29": "Karnataka",
    "30": "Goa",
    "31": "Lakshadweep",
    "32": "Kerala",
    "33": "Tamil Nadu",
    "34": "Puducherry",
    "35": "Andaman & Nicobar Islands",
    "36": "Telangana",
    "37": "Andhra Pradesh",
    "38": "Ladakh"
};

export function validateGSTIN(gstin) {
    if (!gstin) return false;
    // Format: 2 digits (state), 10 chars (PAN), 1 digit (entity), 1 char (Z), 1 char (checksum)
    const regex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return regex.test(gstin.toUpperCase());
}

export function getStateCodeFromGSTIN(gstin) {
    if (!validateGSTIN(gstin)) return null;
    return gstin.substring(0, 2);
}

export function determineTaxType(supplierGSTIN, placeOfSupplyCode) {
    const supplierState = getStateCodeFromGSTIN(supplierGSTIN);
    if (!supplierState || !placeOfSupplyCode) {
        return "UNKNOWN"; // Needs manual selection or defaults
    }
    
    if (supplierState === placeOfSupplyCode) {
        return "INTRA_STATE"; // CGST + SGST
    } else {
        return "INTER_STATE"; // IGST
    }
}

export function validateHSNSAC(code) {
    if (!code) return false;
    const str = String(code);
    return str.length >= 4 && str.length <= 8 && /^\d+$/.test(str);
}
