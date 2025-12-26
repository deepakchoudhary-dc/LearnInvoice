import fs from "node:fs";
import path from "node:path";
import { MemoryEngine } from "./engine.js";
import { NormalizedInvoice, RawInvoice } from "./types.js";

const dataPath = path.resolve("data/sampleInvoices.json");
const dbPath = path.resolve("memory.db");

if (fs.existsSync(dbPath)) {
  fs.rmSync(dbPath);
}

const entries: Array<{ invoice: RawInvoice; human?: Partial<NormalizedInvoice> | null }> = JSON.parse(
  fs.readFileSync(dataPath, "utf-8")
);

const engine = new MemoryEngine({ dbPath });

console.log("Memory-driven demo starting...\n");

entries.forEach((entry, idx) => {
  const result = engine.run(entry.invoice, entry.human ?? undefined);
  console.log(`Run #${idx + 1} — Invoice ${entry.invoice.id}`);
  console.log(JSON.stringify(result, null, 2));
  console.log("---------------------------------------------\n");
});

console.log("Demo finished. Inspect memory.db for persisted learnings.");
