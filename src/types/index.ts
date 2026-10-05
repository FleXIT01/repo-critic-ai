/**
 * Shared interfaces and types used across all repo-critic-ai modules.
 */

/** Configuration for the LLM backend (OpenAI-compatible). */
export interface LLMConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  /** When false, all LLM calls are skipped and rule-based fallbacks are used. */
  enabled: boolean;
}

/**
 * Generic wrapper returned by every tool — discriminated union on `success`.
 * When success is true, `data` is guaranteed to be non-null.
 */
export type ToolResult<T> =
  | { toolName: string; success: true; data: T; durationMs: number }
  | { toolName: string; success: false; data: null; error: string; durationMs: number };

/** Output of the README analysis tool. */
export interface ReadmeAnalysis {
  present: boolean;
  lengthWords: number;
  hasInstallSection: boolean;
  hasUsageSection: boolean;
  hasExamples: boolean;
  /** Rule-based score 0–100. */
  score: number;
}

/** A single TODO/FIXME/HACK/NOTE comment found in the repository. */
export interface TodoItem {
  type: "TODO" | "FIXME" | "HACK" | "NOTE";
  file: string;
  line: number;
  text: string;
  priority: "critical" | "high" | "medium" | "low";
}

/** A security concern identified in the repository. */
export interface SecurityFinding {
  severity: "critical" | "high" | "medium" | "low";
  category: string;
  file: string;
  description: string;
}

/** Quality assessment of a single GitHub issue. */
export interface IssueQuality {
  number: number;
  title: string;
  hasDescription: boolean;
  hasLabels: boolean;
  /** Score 0–100 based on completeness and clarity. */
  qualityScore: number;
}

/** A single entry in the repository file tree. */
export interface RepoFileEntry {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

/** Raw repository data fetched by the repoReader tool. */
export interface RepoData {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  defaultBranch: string;
  stars: number;
  forks: number;
  openIssuesCount: number;
  language: string | null;
  topics: string[];
  createdAt: string;
  updatedAt: string;
  isPrivate: boolean;
  readmeContent: string | null;
  fileTree: RepoFileEntry[];
  hasGitignore: boolean;
  hasLicense: boolean;
  packageJson: Record<string, unknown> | null;
  /** When set, repository was loaded from the local filesystem at this path. */
  localPath?: string;
}

/** Aggregated results of analysing all aspects of a repository. */
export interface RepoAnalysis {
  repoUrl: string;
  owner: string;
  name: string;
  analyzedAt: Date;
  readme: ToolResult<ReadmeAnalysis>;
  todos: ToolResult<TodoItem[]>;
  security: ToolResult<SecurityFinding[]>;
  issues: ToolResult<IssueQuality[]>;
}

/** The final health report returned to the user. */
export interface HealthReport {
  /** Unique ID for this report run (used for GET /report/:id). */
  id: string;
  repoUrl: string;
  /** Composite score 0–100. */
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
  analysis: RepoAnalysis;
  markdownReport: string;
  generatedAt: Date;
}
