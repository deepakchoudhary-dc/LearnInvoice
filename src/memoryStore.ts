import Database from "better-sqlite3";
import { MemoryKind, MemoryRecord } from "./types.js";

export class MemoryStore {
  private db: Database.Database;

  constructor(path: string) {
    this.db = new Database(path);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        vendor TEXT,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        confidence REAL NOT NULL,
        hits INTEGER NOT NULL DEFAULT 0,
        decayRate REAL NOT NULL DEFAULT 0.01,
        createdAt INTEGER NOT NULL,
        lastUpdated INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        step TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        details TEXT NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_memory ON memories(kind, vendor, key);
    `);
  }

  addAudit(step: string, details: string) {
    const stmt = this.db.prepare(
      "INSERT INTO audit(step, timestamp, details) VALUES(?, ?, ?)"
    );
    stmt.run(step, Date.now(), details);
  }

  upsertMemory(params: {
    kind: MemoryKind;
    vendor?: string;
    key: string;
    value: string;
    confidence: number;
    decayRate?: number;
  }): MemoryRecord {
    const now = Date.now();
    const decay = params.decayRate ?? 0.01;
    const existing = this.getMemory(params.kind, params.vendor, params.key);
    if (existing) {
      const newConfidence = Math.min(1, existing.confidence * (1 - decay) + params.confidence);
      const hits = existing.hits + 1;
      const stmt = this.db.prepare(
        "UPDATE memories SET value=?, confidence=?, hits=?, decayRate=?, lastUpdated=? WHERE id=?"
      );
      stmt.run(params.value, newConfidence, hits, decay, now, existing.id);
      return { ...existing, value: params.value, confidence: newConfidence, hits, decayRate: decay, lastUpdated: now };
    }
    const stmt = this.db.prepare(
      "INSERT INTO memories(kind, vendor, key, value, confidence, hits, decayRate, createdAt, lastUpdated) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const result = stmt.run(params.kind, params.vendor ?? null, params.key, params.value, params.confidence, 1, decay, now, now);
    return {
      id: Number(result.lastInsertRowid),
      kind: params.kind,
      vendor: params.vendor,
      key: params.key,
      value: params.value,
      confidence: params.confidence,
      hits: 1,
      decayRate: decay,
      createdAt: now,
      lastUpdated: now,
    };
  }

  decayMemories() {
    const rows = this.db.prepare("SELECT * FROM memories").all() as MemoryRecord[];
    const now = Date.now();
    const update = this.db.prepare(
      "UPDATE memories SET confidence=?, lastUpdated=? WHERE id=?"
    );
    for (const row of rows) {
      const ageDays = (now - row.lastUpdated) / (1000 * 60 * 60 * 24);
      const decayed = Math.max(0, row.confidence * Math.pow(1 - row.decayRate, ageDays));
      if (decayed !== row.confidence) {
        update.run(decayed, now, row.id);
      }
    }
  }

  getMemory(kind: MemoryKind, vendor: string | undefined, key: string): MemoryRecord | undefined {
    const stmt = this.db.prepare(
      "SELECT * FROM memories WHERE kind=? AND key=? AND (vendor IS ? OR vendor=?)"
    );
    const row = stmt.get(kind, key, vendor ?? null, vendor ?? null) as MemoryRecord | undefined;
    return row;
  }

  queryMemories(params: { kind?: MemoryKind; vendor?: string; minConfidence?: number }): MemoryRecord[] {
    const { kind, vendor, minConfidence = 0 } = params;
    const clauses: string[] = [];
    const values: unknown[] = [];
    if (kind) {
      clauses.push("kind=?");
      values.push(kind);
    }
    if (vendor) {
      clauses.push("(vendor IS NULL OR vendor=?)");
      values.push(vendor);
    }
    clauses.push("confidence>=?");
    values.push(minConfidence);
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT * FROM memories ${where}`).all(...values) as MemoryRecord[];
    return rows.sort((a, b) => b.confidence - a.confidence);
  }
}
