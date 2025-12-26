# Invoice Memory Agent (TypeScript)

A lightweight, heuristic memory layer that reuses prior human corrections for invoice processing. It persists memories in SQLite, recalls vendor/correction/resolution patterns, applies them with confidence gating, and emits an auditable decision record.

## Quick Start

```powershell
# from repo root
npm install
npm run demo
```
Outputs are printed per invoice as JSON and persisted in `memory.db`.

## Design

- **Memory types**
  - Vendor memory: vendor-scoped mappings (e.g., `Leistungsdatum -> serviceDate`, default PO, skonto terms, VAT inclusive hint, currency recovery).
  - Correction memory: repeated correction patterns (e.g., freight description -> SKU).
  - Resolution memory: duplicate flags, auto-accept history.
- **Persistence**: SQLite via `better-sqlite3`, tables `memories` and `audit`. Confidence supports reinforcement + decay.
- **Pipeline** (`engine.run`)
  1. **Recall**: fetch vendor/correction/resolution memories above threshold.
  2. **Apply**: use memories to normalize fields, map freight SKUs, compute VAT-inclusive net, detect duplicates, acknowledge skonto terms.
  3. **Decide**: gate auto-accept vs. human review based on applied confidence and presence of corrections.
  4. **Learn**: incorporate human feedback to reinforce or create memories; log audit entries.
- **Confidence & Decay**
  - Reinforcement increases confidence up to 1.0 with per-record decay (`decayRate`) applied by age.
  - Low-confidence memories are ignored until reinforced.

## Demo Data & Expected Behaviors

Demo invoices live in `data/sampleInvoices.json` and cover the rubric cases:

- **Supplier GmbH**: learns `Leistungsdatum -> serviceDate`; later invoices auto-fill service date and remember PO `PO-A-051`.
- **Parts AG**: learns VAT-inclusive handling and currency recovery from raw text; later invoice auto-computes net.
- **Freight & Co**: records skonto terms and maps freight descriptions to SKU `FREIGHT`, reducing review churn.
- **Duplicates**: repeated `Supplier GmbH` invoice stores a duplicate resolution and later flags similar repeats.

## Output Contract

Each `engine.run` returns:

```json
{
  "normalizedInvoice": {"...": "..."},
  "proposedCorrections": ["..."],
  "requiresHumanReview": true,
  "reasoning": "why memory was applied and decisions taken",
  "confidenceScore": 0.0,
  "memoryUpdates": ["..."],
  "auditTrail": [
    {"step": "recall|apply|decide|learn", "timestamp": "...", "details": "..."}
  ]
}
```

## Extending

- Add more vendor/correction heuristics in `engine.ts`.
- Tune thresholds via `MemoryEngine` options: `minConfidenceToApply`, `minConfidenceToAutoAccept`.
- Replace or augment persistence by swapping `MemoryStore` (single class boundary).

## Demo Runner Script

`npm run demo` executes `src/demo.ts`, which resets `memory.db`, replays invoices with/without human corrections, and prints outputs showing learning over time.


