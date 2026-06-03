import type { HealthReport } from "../types/index.js";

export interface MemoryEntry {
  id: string;
  repoUrl: string;
  report: HealthReport;
  storedAt: Date;
}

/**
 * In-memory store for analysis results within a single session.
 * Not a singleton — create one instance per server or test to avoid shared state.
 * Call toJSON() to export the full history as a JSON string.
 */
export class AnalysisMemory {
  private readonly entries = new Map<string, MemoryEntry>();

  store(report: HealthReport): void {
    this.entries.set(report.id, {
      id: report.id,
      repoUrl: report.repoUrl,
      report,
      storedAt: new Date(),
    });
  }

  get(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  /** Returns all entries sorted newest first. */
  list(): MemoryEntry[] {
    return [...this.entries.values()].sort(
      (a, b) => b.storedAt.getTime() - a.storedAt.getTime()
    );
  }

  toJSON(): string {
    return JSON.stringify(this.list(), null, 2);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
