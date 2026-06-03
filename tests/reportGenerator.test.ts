import { describe, expect, it } from "vitest";
import { generateMarkdownReport } from "../src/tools/reportGenerator.js";
import type { RepoAnalysis } from "../src/types/index.js";

function makeAnalysis(overrides: Partial<RepoAnalysis> = {}): RepoAnalysis {
  return {
    repoUrl: "https://github.com/test/repo",
    owner: "test",
    name: "repo",
    analyzedAt: new Date(),
    readme: {
      toolName: "readmeAnalyzer",
      success: true,
      data: {
        present: true,
        lengthWords: 500,
        hasInstallSection: true,
        hasUsageSection: true,
        hasExamples: true,
        score: 100,
      },
      durationMs: 10,
    },
    todos: { toolName: "todoScanner", success: true, data: [], durationMs: 0 },
    security: { toolName: "securityChecker", success: true, data: [], durationMs: 0 },
    issues: { toolName: "issueHelper", success: true, data: [], durationMs: 0 },
    ...overrides,
  };
}

describe("generateMarkdownReport", () => {
  it("includes repo name and score in the header", () => {
    const md = generateMarkdownReport(makeAnalysis(), 85, "A", "Great.");
    expect(md).toContain("test/repo");
    expect(md).toContain("85/100");
    expect(md).toContain("(A)");
  });

  it("includes the summary text", () => {
    const md = generateMarkdownReport(makeAnalysis(), 70, "B", "Needs work on security.");
    expect(md).toContain("Needs work on security.");
  });

  it("shows 'no security issues' when list is empty", () => {
    const md = generateMarkdownReport(makeAnalysis(), 70, "B", "OK.");
    expect(md).toContain("No security issues detected");
  });

  it("shows 'no TODO' message when list is empty", () => {
    const md = generateMarkdownReport(makeAnalysis(), 70, "B", "OK.");
    expect(md).toContain("No TODO / FIXME comments found");
  });

  it("renders a critical security finding", () => {
    const analysis = makeAnalysis({
      security: {
        toolName: "securityChecker",
        success: true,
        data: [{ severity: "critical", category: "Sensitive File", file: ".env", description: ".env committed" }],
        durationMs: 0,
      },
    });
    const md = generateMarkdownReport(analysis, 10, "F", "Bad.");
    expect(md).toContain(".env");
    expect(md).toContain("critical");
  });

  it("renders a FIXME todo item with file and line", () => {
    const analysis = makeAnalysis({
      todos: {
        toolName: "todoScanner",
        success: true,
        data: [{ type: "FIXME", file: "src/auth.ts", line: 42, text: "broken logic", priority: "high" }],
        durationMs: 0,
      },
    });
    const md = generateMarkdownReport(analysis, 50, "C", "OK.");
    expect(md).toContain("FIXME");
    expect(md).toContain("src/auth.ts");
    expect(md).toContain("42");
    expect(md).toContain("broken logic");
  });

  it("shows issue quality section when issues are present", () => {
    const analysis = makeAnalysis({
      issues: {
        toolName: "issueHelper",
        success: true,
        data: [{ number: 1, title: "Bug in login", hasDescription: true, hasLabels: false, qualityScore: 60 }],
        durationMs: 0,
      },
    });
    const md = generateMarkdownReport(analysis, 60, "C", "OK.");
    expect(md).toContain("Bug in login");
    expect(md).toContain("Average issue quality");
  });

  it("shows 'no open issues' when list is empty", () => {
    const md = generateMarkdownReport(makeAnalysis(), 80, "A", "Great.");
    expect(md).toContain("No open issues found");
  });

  it("shows tool error message when readme tool failed", () => {
    const analysis = makeAnalysis({
      readme: { toolName: "readmeAnalyzer", success: false, data: null, error: "API timeout", durationMs: 0 },
    });
    const md = generateMarkdownReport(analysis, 50, "C", "Partial.");
    expect(md).toContain("API timeout");
  });

  it("truncates todo list beyond 20 entries", () => {
    const todos = Array.from({ length: 25 }, (_, i) => ({
      type: "TODO" as const,
      file: `file${i}.ts`,
      line: i,
      text: `todo ${i}`,
      priority: "medium" as const,
    }));
    const analysis = makeAnalysis({
      todos: { toolName: "todoScanner", success: true, data: todos, durationMs: 0 },
    });
    const md = generateMarkdownReport(analysis, 60, "C", "OK.");
    expect(md).toContain("and 5 more");
  });
});
