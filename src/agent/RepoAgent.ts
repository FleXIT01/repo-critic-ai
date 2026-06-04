import { randomUUID } from "node:crypto";
import { createLLMCaller } from "../llm/client.js";
import type { LLMCaller } from "../llm/client.js";
import { PROMPTS } from "../llm/prompts.js";
import { analyzeIssues } from "../tools/issueHelper.js";
import { analyzeReadme } from "../tools/readmeAnalyzer.js";
import { readRepo } from "../tools/repoReader.js";
import { generateMarkdownReport } from "../tools/reportGenerator.js";
import { checkSecurity } from "../tools/securityChecker.js";
import { scanTodos } from "../tools/todoScanner.js";
import type {
  HealthReport,
  IssueQuality,
  LLMConfig,
  ReadmeAnalysis,
  RepoAnalysis,
  SecurityFinding,
  TodoItem,
  ToolResult,
} from "../types/index.js";
import { planAnalysis } from "./planner.js";

function calculateGrade(score: number): HealthReport["grade"] {
  if (score >= 80) return "A";
  if (score >= 65) return "B";
  if (score >= 50) return "C";
  if (score >= 35) return "D";
  return "F";
}

function computeTodoScore(todos: TodoItem[]): number {
  let score = 100;
  for (const t of todos) {
    if (t.priority === "critical") score -= 20;
    else if (t.priority === "high") score -= 10;
    else if (t.priority === "medium") score -= 5;
    else score -= 1;
  }
  return Math.max(0, score);
}

function computeSecurityScore(findings: SecurityFinding[]): number {
  let score = 100;
  for (const f of findings) {
    if (f.severity === "critical") score -= 40;
    else if (f.severity === "high") score -= 20;
    else if (f.severity === "medium") score -= 10;
    else score -= 5;
  }
  return Math.max(0, score);
}

function skipped<T>(toolName: string, data: T): ToolResult<T> {
  return { toolName, success: true as const, data, durationMs: 0 };
}

/**
 * Main agent: reads the repository, runs all configured tools in parallel,
 * computes a weighted health score, and returns a HealthReport.
 */
export class RepoAgent {
  private llm: LLMCaller;

  constructor(
    llmConfig: LLMConfig,
    private readonly githubToken?: string
  ) {
    this.llm = createLLMCaller(llmConfig);
  }

  async analyze(repoUrl: string): Promise<HealthReport> {
    // 1 — fetch repository data (serial: everything else depends on this)
    const repoResult = await readRepo(repoUrl, this.githubToken);
    if (!repoResult.success) {
      throw new Error(`Failed to read repository: ${repoResult.error}`);
    }
    const repo = repoResult.data;

    // 2 — decide which tools to run
    const plan = planAnalysis(repo, Boolean(this.githubToken));

    const emptyReadme: ReadmeAnalysis = {
      present: false, lengthWords: 0, hasInstallSection: false,
      hasUsageSection: false, hasExamples: false, score: 0,
    };

    // 3 — run tools in parallel
    const [readmeResult, todoResult, securityResult, issueResult] = await Promise.all([
      plan.runReadmeAnalyzer
        ? analyzeReadme(repo.readmeContent)
        : Promise.resolve(skipped("readmeAnalyzer", emptyReadme)),
      plan.runTodoScanner
        ? scanTodos(repo, this.githubToken)
        : Promise.resolve(skipped("todoScanner", [] as TodoItem[])),
      plan.runSecurityChecker
        ? checkSecurity(repo, this.githubToken)
        : Promise.resolve(skipped("securityChecker", [] as SecurityFinding[])),
      plan.runIssueHelper
        ? analyzeIssues(repo.owner, repo.name, this.githubToken)
        : Promise.resolve(skipped("issueHelper", [] as IssueQuality[])),
    ]);

    const analysis: RepoAnalysis = {
      repoUrl,
      owner: repo.owner,
      name: repo.name,
      analyzedAt: new Date(),
      readme: readmeResult,
      todos: todoResult,
      security: securityResult,
      issues: issueResult,
    };

    // 4 — composite score (weighted by tools that actually ran and succeeded)
    let total = 0;
    let weight = 0;

    if (plan.runReadmeAnalyzer && readmeResult.success) {
      total += readmeResult.data.score * 0.3;
      weight += 0.3;
    }
    if (plan.runTodoScanner && todoResult.success) {
      total += computeTodoScore(todoResult.data) * 0.2;
      weight += 0.2;
    }
    if (plan.runSecurityChecker && securityResult.success) {
      total += computeSecurityScore(securityResult.data) * 0.3;
      weight += 0.3;
    }
    if (plan.runIssueHelper && issueResult.success && issueResult.data.length > 0) {
      const avgQuality =
        issueResult.data.reduce((s, i) => s + i.qualityScore, 0) / issueResult.data.length;
      total += avgQuality * 0.2;
      weight += 0.2;
    }

    const score = weight > 0 ? Math.round(total / weight) : 0;
    const grade = calculateGrade(score);

    // 5 — summary: prefer LLM, fall back to rule-based
    let summary = `${repo.owner}/${repo.name} scored ${score}/100. ${
      score >= 65 ? "The project is in good shape." : "Several areas need attention."
    }`;

    if (this.llm.enabled) {
      try {
        const llmSummary = await this.llm.call(
          JSON.stringify({
            score,
            readme: readmeResult.success ? readmeResult.data : null,
            securityFindings: securityResult.success ? securityResult.data.length : null,
            todoCount: todoResult.success ? todoResult.data.length : null,
          }),
          PROMPTS.HEALTH_SUMMARY
        );
        if (llmSummary) summary = llmSummary;
      } catch {
        // LLM summary is optional — rule-based fallback is fine
      }
    }

    return {
      id: randomUUID(),
      repoUrl,
      score,
      grade,
      summary,
      analysis,
      markdownReport: generateMarkdownReport(analysis, score, grade, summary),
      generatedAt: new Date(),
    };
  }
}
