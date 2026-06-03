/**
 * All LLM prompt templates used by repo-critic-ai tools and the agent.
 * Keeping prompts centralised makes them easy to tune without touching tool logic.
 */

export const PROMPTS = {
  README_SUMMARY:
    "You are a technical documentation reviewer. In 2-3 sentences, summarize the quality of the following README and state the single most important improvement.",

  ISSUE_QUALITY:
    "You are a software project manager. In 1-2 sentences, evaluate whether the following GitHub issue is well-formulated (clear title, description, steps to reproduce if applicable).",

  SECURITY_REVIEW:
    "You are a security engineer. List any security concerns in the following code snippet. Be concise — one line per finding.",

  HEALTH_SUMMARY:
    "You are a senior software engineer. Based on the JSON repository analysis data provided, write exactly 2 sentences: one summarizing the overall quality, one stating the top priority for improvement.",
} as const;

export type PromptKey = keyof typeof PROMPTS;
