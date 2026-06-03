import { describe, expect, it } from "vitest";
import { analyzeReadme } from "../src/tools/readmeAnalyzer.js";

describe("analyzeReadme", () => {
  it("returns score 0 and present:false for null", async () => {
    const r = await analyzeReadme(null);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.present).toBe(false);
      expect(r.data.score).toBe(0);
    }
  });

  it("returns score 0 for whitespace-only content", async () => {
    const r = await analyzeReadme("   \n  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.score).toBe(0);
  });

  it("scores 20 for a minimal README (title only)", async () => {
    const r = await analyzeReadme("# My Project\n\nA short description.");
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.present).toBe(true);
      // base 20; < 100 words, no sections, no code blocks
      expect(r.data.score).toBe(20);
    }
  });

  it("awards +10 for ≥100 words and +10 for ≥300 words", async () => {
    const short = "word ".repeat(110).trim(); // 110 words
    const r1 = await analyzeReadme("# P\n\n" + short);
    if (r1.success) expect(r1.data.score).toBe(30); // 20 + 10

    const long = "word ".repeat(310).trim(); // 310 words
    const r2 = await analyzeReadme("# P\n\n" + long);
    if (r2.success) expect(r2.data.score).toBe(40); // 20 + 10 + 10
  });

  it("detects ## Installation section", async () => {
    const r = await analyzeReadme("# P\n\n## Installation\n\nRun npm install.");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.hasInstallSection).toBe(true);
  });

  it("detects ## Getting Started section", async () => {
    const r = await analyzeReadme("# P\n\n## Getting Started\n\nSteps here.");
    if (r.success) expect(r.data.hasInstallSection).toBe(true);
  });

  it("detects ## Usage section", async () => {
    const r = await analyzeReadme("# P\n\n## Usage\n\nRun the CLI.");
    if (r.success) expect(r.data.hasUsageSection).toBe(true);
  });

  it("detects fenced code blocks", async () => {
    const r = await analyzeReadme("# P\n\n```bash\nnpm install\n```");
    if (r.success) expect(r.data.hasExamples).toBe(true);
  });

  it("scores 100 for a complete, long README", async () => {
    const body = "word ".repeat(310);
    const md =
      `# Project\n\n${body}\n\n` +
      "## Installation\n\nRun npm install.\n\n" +
      "## Usage\n\nUse the CLI.\n\n" +
      "```bash\nnpm run dev\n```";
    const r = await analyzeReadme(md);
    if (r.success) expect(r.data.score).toBe(100);
  });

  it("caps score at 100 even with all criteria met", async () => {
    const body = "word ".repeat(500);
    const md =
      `# Project\n\n${body}\n\n` +
      "## Installation\n\nSetup.\n\n## Usage\n\nUse.\n\n```bash\ncode\n```";
    const r = await analyzeReadme(md);
    if (r.success) expect(r.data.score).toBeLessThanOrEqual(100);
  });
});
