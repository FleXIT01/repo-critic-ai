import { describe, expect, it } from "vitest";
import { AnalysisMemory } from "../src/agent/memory.js";
import type { HealthReport } from "../src/types/index.js";

function makeReport(id: string, score: number): HealthReport {
  return {
    id,
    repoUrl: `https://github.com/test/${id}`,
    score,
    grade: score >= 65 ? "B" : "C",
    summary: "Test report",
    analysis: {
      repoUrl: `https://github.com/test/${id}`,
      owner: "test",
      name: id,
      analyzedAt: new Date(),
      readme: { toolName: "readmeAnalyzer", success: true, data: { present: true, lengthWords: 100, hasInstallSection: true, hasUsageSection: true, hasExamples: true, score }, durationMs: 0 },
      todos: { toolName: "todoScanner", success: true, data: [], durationMs: 0 },
      security: { toolName: "securityChecker", success: true, data: [], durationMs: 0 },
      issues: { toolName: "issueHelper", success: true, data: [], durationMs: 0 },
    },
    markdownReport: `# ${id}`,
    generatedAt: new Date(),
  };
}

describe("AnalysisMemory", () => {
  it("starts empty", () => {
    const mem = new AnalysisMemory();
    expect(mem.size).toBe(0);
    expect(mem.list()).toHaveLength(0);
  });

  it("stores and retrieves a report by id", () => {
    const mem = new AnalysisMemory();
    mem.store(makeReport("abc", 75));
    const entry = mem.get("abc");
    expect(entry).toBeDefined();
    expect(entry?.report.score).toBe(75);
  });

  it("returns undefined for an unknown id", () => {
    const mem = new AnalysisMemory();
    expect(mem.get("not-found")).toBeUndefined();
  });

  it("tracks size correctly", () => {
    const mem = new AnalysisMemory();
    mem.store(makeReport("a", 50));
    mem.store(makeReport("b", 60));
    expect(mem.size).toBe(2);
  });

  it("overwrites an existing entry with the same id", () => {
    const mem = new AnalysisMemory();
    mem.store(makeReport("x", 50));
    mem.store(makeReport("x", 90)); // same id, different score
    expect(mem.size).toBe(1);
    expect(mem.get("x")?.report.score).toBe(90);
  });

  it("list() contains all stored ids", () => {
    const mem = new AnalysisMemory();
    mem.store(makeReport("a", 50));
    mem.store(makeReport("b", 80));
    const ids = mem.list().map((e) => e.id);
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });

  it("clears all entries", () => {
    const mem = new AnalysisMemory();
    mem.store(makeReport("x", 60));
    mem.clear();
    expect(mem.size).toBe(0);
    expect(mem.get("x")).toBeUndefined();
  });

  it("toJSON() produces valid parseable JSON", () => {
    const mem = new AnalysisMemory();
    mem.store(makeReport("x", 70));
    const json = mem.toJSON();
    expect(() => JSON.parse(json)).not.toThrow();
    const parsed = JSON.parse(json) as Array<{ id: string }>;
    expect(parsed[0].id).toBe("x");
  });
});
