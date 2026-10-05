import { createLLMCaller, defaultLLMConfig } from "../llm/client.js";
import { PROMPTS } from "../llm/prompts.js";

const SECTION_RES: Record<string, RegExp> = {
  Installation: /^#{1,3}\s+(install|installation|getting[- ]started|setup|quick[- ]start)\b/im,
  Usage: /^#{1,3}\s+(usage|how[- ]to[- ]use|how[- ]to[- ]run|examples?)\b/im,
  Contributing: /^#{1,3}\s+(contribut(ing)?|development)\b/im,
  License: /^#{1,3}\s+(licen[sc]e)\b/im,
};

function detectMissingSections(content: string): string[] {
  return Object.keys(SECTION_RES).filter((name) => !SECTION_RES[name].test(content));
}

type Edit = { op: " " | "+" | "-"; line: string };

function diffLines(a: string[], b: string[]): Edit[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);

  const edits: Edit[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      edits.unshift({ op: " ", line: a[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ op: "+", line: b[j - 1] });
      j--;
    } else {
      edits.unshift({ op: "-", line: a[i - 1] });
      i--;
    }
  }
  return edits;
}

function formatUnifiedDiff(original: string, improved: string, contextLines = 3): string {
  if (original === improved) return "No changes.";

  const edits = diffLines(original.split("\n"), improved.split("\n"));
  const changed = edits.flatMap((e, idx) => (e.op !== " " ? [idx] : []));
  if (changed.length === 0) return "No changes.";

  // Merge change positions into hunks with surrounding context
  const hunks: Array<[number, number]> = [];
  let hStart = Math.max(0, changed[0] - contextLines);
  let hEnd = Math.min(edits.length - 1, changed[0] + contextLines);
  for (let ci = 1; ci < changed.length; ci++) {
    const nextStart = Math.max(0, changed[ci] - contextLines);
    if (nextStart <= hEnd + 1) {
      hEnd = Math.min(edits.length - 1, changed[ci] + contextLines);
    } else {
      hunks.push([hStart, hEnd]);
      hStart = nextStart;
      hEnd = Math.min(edits.length - 1, changed[ci] + contextLines);
    }
  }
  hunks.push([hStart, hEnd]);

  // Pre-compute 1-based original/new line numbers at each edit index
  let oLine = 1;
  let nLine = 1;
  const origAt: number[] = [];
  const newAt: number[] = [];
  for (const e of edits) {
    origAt.push(oLine);
    newAt.push(nLine);
    if (e.op !== "+") oLine++;
    if (e.op !== "-") nLine++;
  }

  const out: string[] = ["--- README.md", "+++ README.md (improved)"];
  for (const [hs, he] of hunks) {
    let origCount = 0;
    let newCount = 0;
    for (let k = hs; k <= he; k++) {
      if (edits[k].op !== "+") origCount++;
      if (edits[k].op !== "-") newCount++;
    }
    out.push(`@@ -${origAt[hs]},${origCount} +${newAt[hs]},${newCount} @@`);
    for (let k = hs; k <= he; k++) out.push(`${edits[k].op}${edits[k].line}`);
  }

  return out.join("\n");
}

/**
 * Detects missing standard README sections, requests an LLM-improved version,
 * and returns a unified diff of the changes alongside a section-gap summary.
 *
 * LLM is read from environment variables (LLM_API_KEY, LLM_BASE_URL, LLM_MODEL).
 * When LLM_API_KEY is not set the function returns only the missing-section report.
 */
export async function improveReadme(content: string): Promise<string> {
  const missing = detectMissingSections(content);
  const header =
    missing.length > 0
      ? `Missing sections: ${missing.join(", ")}`
      : "All standard sections present.";

  const llm = createLLMCaller(defaultLLMConfig());
  if (!llm.enabled) {
    return `${header}\n\nLLM not configured — set LLM_API_KEY to enable improvement suggestions.`;
  }

  const userPrompt =
    (missing.length > 0 ? `Missing sections: ${missing.join(", ")}.\n\n` : "") +
    content.slice(0, 3500);

  const improved = (await llm.call(userPrompt, PROMPTS.README_IMPROVE)) ?? content;
  const diff = formatUnifiedDiff(content, improved);

  return `${header}\n\n${diff}`;
}
