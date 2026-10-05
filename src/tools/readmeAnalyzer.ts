import type { LLMCaller } from "../llm/client.js";
import { PROMPTS } from "../llm/prompts.js";
import type { ReadmeAnalysis, ToolResult } from "../types/index.js";

// Section-detection regexes (case-insensitive, matches h1–h3)
const INSTALL_RE = /^#{1,3}\s+(install|installation|getting[- ]started|setup|quick[- ]start)\b/im;
const USAGE_RE = /^#{1,3}\s+(usage|how[- ]to[- ]use|how[- ]to[- ]run|examples?)\b/im;
const CODE_BLOCK_RE = /```[\s\S]*?```/;

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Scoring breakdown (max 100):
 *   20  – README is present
 *   10  – ≥100 words
 *   10  – ≥300 words
 *   20  – has an installation / getting-started section
 *   20  – has a usage section
 *   20  – contains at least one fenced code block
 */
function scoreReadme(content: string): ReadmeAnalysis {
  const lengthWords = countWords(content);
  const hasInstallSection = INSTALL_RE.test(content);
  const hasUsageSection = USAGE_RE.test(content);
  const hasExamples = CODE_BLOCK_RE.test(content);

  let score = 20;
  if (lengthWords >= 100) score += 10;
  if (lengthWords >= 300) score += 10;
  if (hasInstallSection) score += 20;
  if (hasUsageSection) score += 20;
  if (hasExamples) score += 20;

  return {
    present: true,
    lengthWords,
    hasInstallSection,
    hasUsageSection,
    hasExamples,
    score: Math.min(100, score),
  };
}

/**
 * Analyses README content using rule-based checks. No LLM required.
 * Returns score 0 when content is absent; up to 100 otherwise.
 */
export async function analyzeReadme(content: string | null): Promise<ToolResult<ReadmeAnalysis>> {
  const start = Date.now();

  if (!content || content.trim().length === 0) {
    return {
      toolName: "readmeAnalyzer",
      success: true,
      data: {
        present: false,
        lengthWords: 0,
        hasInstallSection: false,
        hasUsageSection: false,
        hasExamples: false,
        score: 0,
      },
      durationMs: Date.now() - start,
    };
  }

  return {
    toolName: "readmeAnalyzer",
    success: true,
    data: scoreReadme(content),
    durationMs: Date.now() - start,
  };
}

/**
 * Optional LLM enhancement: ask the model for a concise review of the README.
 * Returns null when llm.enabled is false.
 */
export async function getReadmeLLMReview(content: string, llm: LLMCaller): Promise<string | null> {
  return llm.call(content.slice(0, 4000), PROMPTS.README_SUMMARY);
}
