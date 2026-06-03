import { describe, expect, it } from "vitest";
import { planAnalysis } from "../src/agent/planner.js";
import type { RepoData } from "../src/types/index.js";

const base: RepoData = {
  owner: "test",
  name: "repo",
  fullName: "test/repo",
  description: null,
  defaultBranch: "main",
  stars: 0,
  forks: 0,
  openIssuesCount: 0,
  language: null,
  topics: [],
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
  isPrivate: false,
  readmeContent: null,
  fileTree: [],
  hasGitignore: false,
  hasLicense: false,
  packageJson: null,
};

describe("planAnalysis", () => {
  it("always runs readmeAnalyzer and securityChecker", () => {
    const plan = planAnalysis(base, false);
    expect(plan.runReadmeAnalyzer).toBe(true);
    expect(plan.runSecurityChecker).toBe(true);
  });

  it("skips todoScanner when file tree has no source files", () => {
    const plan = planAnalysis(base, false);
    expect(plan.runTodoScanner).toBe(false);
  });

  it("runs todoScanner when .ts file is present", () => {
    const data: RepoData = {
      ...base,
      fileTree: [{ path: "src/index.ts", type: "blob" }],
    };
    expect(planAnalysis(data, false).runTodoScanner).toBe(true);
  });

  it("runs todoScanner when .py file is present", () => {
    const data: RepoData = {
      ...base,
      fileTree: [{ path: "app.py", type: "blob" }],
    };
    expect(planAnalysis(data, false).runTodoScanner).toBe(true);
  });

  it("does NOT run todoScanner for markdown-only repo", () => {
    const data: RepoData = {
      ...base,
      fileTree: [{ path: "README.md", type: "blob" }],
    };
    expect(planAnalysis(data, false).runTodoScanner).toBe(false);
  });

  it("runs issueHelper on public repo without token", () => {
    expect(planAnalysis({ ...base, isPrivate: false }, false).runIssueHelper).toBe(true);
  });

  it("skips issueHelper on private repo without token", () => {
    expect(planAnalysis({ ...base, isPrivate: true }, false).runIssueHelper).toBe(false);
  });

  it("runs issueHelper on private repo when token is available", () => {
    expect(planAnalysis({ ...base, isPrivate: true }, true).runIssueHelper).toBe(true);
  });
});
