import { Octokit } from "@octokit/rest";
import type { IssueQuality, ToolResult } from "../types/index.js";

// Keywords that indicate a well-structured issue body
const QUALITY_KEYWORDS = [
  "steps to reproduce",
  "expected behavior",
  "actual behavior",
  "to reproduce",
  "environment",
  "version",
  "screenshot",
];

function scoreIssue(body: string | null, labelCount: number): number {
  let score = 0;

  if (body && body.trim().length > 0) {
    score += 40; // has a description at all
    const wordCount = body.split(/\s+/).filter(Boolean).length;
    if (wordCount >= 50) score += 20; // reasonably detailed
    const lower = body.toLowerCase();
    if (QUALITY_KEYWORDS.some((kw) => lower.includes(kw))) score += 20; // structured
  }

  if (labelCount > 0) score += 20; // labelled issues are easier to triage

  return Math.min(100, score);
}

/**
 * Fetches open GitHub issues (pull requests excluded) and scores each one
 * based on completeness and clarity.
 */
export async function analyzeIssues(
  owner: string,
  name: string,
  githubToken?: string,
  limit = 20
): Promise<ToolResult<IssueQuality[]>> {
  const start = Date.now();

  try {
    const octokit = new Octokit({ auth: githubToken });

    const response = await octokit.issues.listForRepo({
      owner,
      repo: name,
      state: "open",
      per_page: Math.min(limit, 30),
    });

    // GitHub returns both issues and PRs from this endpoint
    const issues = response.data.filter((i) => !i.pull_request);

    const quality: IssueQuality[] = issues.map((issue) => ({
      number: issue.number,
      title: issue.title,
      hasDescription: Boolean(issue.body && issue.body.trim().length > 0),
      hasLabels: issue.labels.length > 0,
      qualityScore: scoreIssue(issue.body ?? null, issue.labels.length),
    }));

    return {
      toolName: "issueHelper",
      success: true,
      data: quality,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      toolName: "issueHelper",
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
