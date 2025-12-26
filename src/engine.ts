import { MemoryStore } from "./memoryStore.js";
import { AuditEntry, MemoryRecord, NormalizedInvoice, PipelineOutput, RawInvoice } from "./types.js";

export type EngineOptions = {
  dbPath?: string;
  minConfidenceToApply?: number;
  minConfidenceToAutoAccept?: number;
};

const DEFAULTS = {
  dbPath: "./memory.db",
  minConfidenceToApply: 0.45,
  minConfidenceToAutoAccept: 0.7,
};

type RecallResult = {
  vendorMemories: MemoryRecord[];
  correctionMemories: MemoryRecord[];
  resolutionMemories: MemoryRecord[];
};

export class MemoryEngine {
  private store: MemoryStore;
  private options: Required<EngineOptions>;

  constructor(options?: EngineOptions) {
    this.options = { ...DEFAULTS, ...options } as Required<EngineOptions>;
    this.store = new MemoryStore(this.options.dbPath);
    this.store.decayMemories();
  }

  run(invoice: RawInvoice, humanCorrection?: Partial<NormalizedInvoice>): PipelineOutput {
    const audit: AuditEntry[] = [];
    const memoryUpdates: string[] = [];
    const addAudit = (step: AuditEntry["step"], details: string) => {
      const entry: AuditEntry = { step, timestamp: new Date().toISOString(), details };
      audit.push(entry);
      this.store.addAudit(step, details);
    };

    const recall = this.recall(invoice);
    addAudit("recall", `Found ${recall.vendorMemories.length} vendor memories, ${recall.correctionMemories.length} corrections, ${recall.resolutionMemories.length} resolutions.`);

    const applyResult = this.apply(invoice, recall);
    addAudit("apply", applyResult.reasoning.join(" | "));

    const decision = this.decide(applyResult.normalized, applyResult.proposedCorrections, recall, applyResult.appliedConfidence);
    addAudit("decide", decision.reasoning);

    if (humanCorrection) {
      const learnResult = this.learn(invoice, applyResult.normalized, humanCorrection, decision.requiresHumanReview);
      memoryUpdates.push(...learnResult.memoryUpdates);
      addAudit("learn", learnResult.reasoning);
    }

    return {
      normalizedInvoice: applyResult.normalized,
      proposedCorrections: applyResult.proposedCorrections,
      requiresHumanReview: decision.requiresHumanReview,
      reasoning: [applyResult.reasoning.join(" | "), decision.reasoning].join(" | "),
      confidenceScore: decision.confidenceScore,
      memoryUpdates,
      auditTrail: audit,
    };
  }

  private recall(invoice: RawInvoice): RecallResult {
    const vendorMemories = this.store.queryMemories({ kind: "vendor", vendor: invoice.vendor });
    const correctionMemories = this.store.queryMemories({ kind: "correction", vendor: invoice.vendor });
    const resolutionMemories = this.store.queryMemories({ kind: "resolution", vendor: invoice.vendor });
    return { vendorMemories, correctionMemories, resolutionMemories };
  }

  private apply(invoice: RawInvoice, recall: RecallResult) {
    const normalized: NormalizedInvoice = { ...invoice };
    const reasoning: string[] = [];
    const proposedCorrections: string[] = [];
    let appliedConfidence = 0;

    const applyVendorField = (key: string, target: keyof NormalizedInvoice) => {
      const memory = recall.vendorMemories.find((m) => m.key === key);
      if (memory && memory.confidence >= this.options.minConfidenceToApply) {
        const value = memory.value;
        if (!normalized[target]) {
          (normalized as any)[target] = value;
          proposedCorrections.push(`Applied vendor memory ${key} -> ${target}`);
          reasoning.push(`Vendor memory (${key}) filled ${String(target)} with confidence ${memory.confidence.toFixed(2)}`);
          appliedConfidence = Math.max(appliedConfidence, memory.confidence);
        }
      }
    };

    applyVendorField("serviceDateFromLeistungsdatum", "serviceDate");
    applyVendorField("currencyFromRawText", "currency");
    applyVendorField("poDefault", "poNumber");

    const vatHint = recall.vendorMemories.find((m) => m.key === "vatInclusiveHint" && m.confidence >= this.options.minConfidenceToApply);
    if (vatHint && normalized.vatInclusiveHint) {
      reasoning.push(`VAT inclusive hint recognized with confidence ${vatHint.confidence.toFixed(2)}`);
      appliedConfidence = Math.max(appliedConfidence, vatHint.confidence);
      if (normalized.totalGross && normalized.vatRate && !normalized.totalNet) {
        normalized.totalNet = normalized.totalGross / (1 + normalized.vatRate);
        proposedCorrections.push("Computed net from gross using vendor VAT inclusive pattern");
      }
    }

    const freightSku = recall.correctionMemories.find((m) => m.key === "freightSku" && m.confidence >= this.options.minConfidenceToApply);
    if (freightSku && normalized.items) {
      for (const item of normalized.items) {
        if ((item.description ?? "").toLowerCase().includes("freight")) {
          item.sku = freightSku.value;
          reasoning.push(`Mapped freight description to SKU using memory confidence ${freightSku.confidence.toFixed(2)}`);
          proposedCorrections.push("Mapped freight line to SKU from memory");
          appliedConfidence = Math.max(appliedConfidence, freightSku.confidence);
        }
      }
    }

    const duplicateKey = `${invoice.vendor}|${invoice.invoiceNumber}`;
    const duplicateMemory = recall.resolutionMemories.find((m) => m.key === `duplicate:${duplicateKey}`);
    if (duplicateMemory && duplicateMemory.confidence >= this.options.minConfidenceToApply) {
      reasoning.push(`Potential duplicate detected based on prior resolution with confidence ${duplicateMemory.confidence.toFixed(2)}`);
      proposedCorrections.push("Flagged as potential duplicate");
      appliedConfidence = Math.max(appliedConfidence, duplicateMemory.confidence);
    }

    const skontoMemory = recall.vendorMemories.find((m) => m.key === "skontoTerms" && m.confidence >= this.options.minConfidenceToApply);
    if (skontoMemory) {
      reasoning.push(`Known skonto terms recorded: ${skontoMemory.value} (conf ${skontoMemory.confidence.toFixed(2)})`);
      appliedConfidence = Math.max(appliedConfidence, skontoMemory.confidence);
    }

    return { normalized, proposedCorrections, reasoning, appliedConfidence };
  }

  private decide(normalized: NormalizedInvoice, proposedCorrections: string[], recall: RecallResult, appliedConfidence: number) {
    let requiresHumanReview = proposedCorrections.length > 0;
    let confidenceScore = appliedConfidence;
    const parts: string[] = [];

    if (!normalized.serviceDate && recall.vendorMemories.some((m) => m.key === "serviceDateFromLeistungsdatum")) {
      requiresHumanReview = true;
      parts.push("Service date missing; vendor memory exists but not applied");
    }

    if (appliedConfidence >= this.options.minConfidenceToAutoAccept && proposedCorrections.length === 0) {
      requiresHumanReview = false;
      confidenceScore = appliedConfidence;
      parts.push("High confidence and no corrections; auto-accept");
    } else if (appliedConfidence >= this.options.minConfidenceToApply && proposedCorrections.length === 0) {
      requiresHumanReview = false;
      parts.push("Moderate confidence; no corrections; auto-accept");
    } else if (proposedCorrections.length > 0) {
      requiresHumanReview = true;
      confidenceScore = Math.max(confidenceScore, this.options.minConfidenceToApply);
      parts.push("Corrections proposed; send to human for confirmation");
    }

    return {
      requiresHumanReview,
      confidenceScore,
      reasoning: parts.join(" | ") || "Standard decision flow",
    };
  }

  private learn(original: RawInvoice, normalized: NormalizedInvoice, human: Partial<NormalizedInvoice>, requiresHumanReview: boolean) {
    const updates: string[] = [];
    const reasoning: string[] = [];

    const reinforce = (kind: "vendor" | "correction" | "resolution", key: string, value: string, confidence: number, vendor?: string) => {
      const record = this.store.upsertMemory({ kind, key, value, confidence, vendor });
      updates.push(`${kind}:${key} -> ${value} (conf ${record.confidence.toFixed(2)})`);
    };

    if (human.serviceDate && !normalized.serviceDate && original.vendorFields?.["Leistungsdatum"]) {
      reinforce("vendor", "serviceDateFromLeistungsdatum", human.serviceDate, 0.8, original.vendor);
      reasoning.push("Learned mapping Leistungsdatum -> serviceDate");
    }

    if (human.currency && !normalized.currency && original.rawText?.toLowerCase().includes(human.currency.toLowerCase())) {
      reinforce("vendor", "currencyFromRawText", human.currency, 0.6, original.vendor);
      reasoning.push("Learned currency recovery from raw text");
    }

    if (human.vatInclusiveHint && original.vatInclusiveHint) {
      reinforce("vendor", "vatInclusiveHint", "true", 0.5, original.vendor);
      reasoning.push("Reinforced VAT inclusive handling");
    }

    if (human.poNumber && !normalized.poNumber) {
      reinforce("vendor", "poDefault", human.poNumber, 0.6, original.vendor);
      reasoning.push("Recorded PO match preference for vendor");
    }

    if (human.items && normalized.items) {
      for (const item of human.items) {
        if ((item.description ?? "").toLowerCase().includes("freight")) {
          reinforce("correction", "freightSku", item.sku ?? "FREIGHT", 0.6, original.vendor);
          reasoning.push("Mapped freight description to SKU from human feedback");
        }
      }
    }

    if (original.rawText && original.rawText.toLowerCase().includes("skonto")) {
      reinforce("vendor", "skontoTerms", "Skonto terms noted", 0.5, original.vendor);
      reasoning.push("Captured skonto terms as known pattern");
    }

    if (requiresHumanReview === false) {
      reinforce("resolution", "autoAccept", original.invoiceNumber, 0.4, original.vendor);
      reasoning.push("Recorded auto-accept resolution");
    }

    if (human.invoiceNumber === original.invoiceNumber && human.vendor === original.vendor && human.issueDate === original.issueDate) {
      reinforce("resolution", `duplicate:${original.vendor}|${original.invoiceNumber}`, "true", 0.9, original.vendor);
      reasoning.push("Recorded duplicate detection");
    }

    return { memoryUpdates: updates, reasoning: reasoning.join(" | ") };
  }
}
