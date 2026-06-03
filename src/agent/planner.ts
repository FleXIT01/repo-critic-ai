import type { RepoData } from "../types/index.js";

export interface AnalysisPlan {
  runReadmeAnalyzer: boolean;
  runTodoScanner: boolean;
  runSecurityChecker: boolean;
  runIssueHelper: boolean;
}

const SOURCE_RE = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|php|cs|cpp|c|swift|kt)$/;

/**
 * Decides which tools to run based on available repository data and credentials.
 * All decisions are heuristic — the goal is to skip tools that would return
 * useless results (e.g. todoScanner on a repo with no source files).
 */
export function planAnalysis(repoData: RepoData, hasGithubToken: boolean): AnalysisPlan {
  const hasSourceFiles = repoData.fileTree.some(
    (f) => f.type === "blob" && SOURCE_RE.test(f.path)
  );

  return {
    runReadmeAnalyzer: true,
    runTodoScanner: hasSourceFiles,
    runSecurityChecker: true,
    // Skip issue analysis on private repos without a token to avoid 401 errors
    runIssueHelper: hasGithubToken || !repoData.isPrivate,
  };
}
