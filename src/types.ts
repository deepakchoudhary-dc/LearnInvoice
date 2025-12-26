export type Currency = "EUR" | "USD" | "GBP" | string;

export type RawInvoice = {
  id: string;
  vendor: string;
  invoiceNumber: string;
  issueDate?: string;
  serviceDate?: string;
  poNumber?: string;
  currency?: Currency;
  totalNet?: number;
  totalGross?: number;
  vatRate?: number;
  vatInclusiveHint?: boolean;
  items?: Array<{
    sku?: string;
    description?: string;
    quantity?: number;
    unitPrice?: number;
    currency?: Currency;
  }>;
  rawText?: string;
  vendorFields?: Record<string, string | number | boolean | null>;
};

export type NormalizedInvoice = RawInvoice & {
  serviceDate?: string;
  poNumber?: string;
  currency?: Currency;
  items?: Array<{
    sku?: string;
    description?: string;
    quantity?: number;
    unitPrice?: number;
    currency?: Currency;
  }>;
};

export type MemoryKind = "vendor" | "correction" | "resolution";

export type MemoryRecord = {
  id: number;
  kind: MemoryKind;
  vendor?: string;
  key: string;
  value: string;
  confidence: number;
  lastUpdated: number;
  createdAt: number;
  hits: number;
  decayRate: number;
};

export type AuditEntry = {
  step: "recall" | "apply" | "decide" | "learn";
  timestamp: string;
  details: string;
};

export type PipelineOutput = {
  normalizedInvoice: NormalizedInvoice;
  proposedCorrections: string[];
  requiresHumanReview: boolean;
  reasoning: string;
  confidenceScore: number;
  memoryUpdates: string[];
  auditTrail: AuditEntry[];
};
