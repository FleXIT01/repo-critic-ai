import { Octokit } from "@octokit/rest";
import type { RepoData, TodoItem, ToolResult } from "../types/index.js";

const SOURCE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs",
  ".py", ".go", ".rs", ".java", ".rb",
  ".php", ".cs", ".cpp", ".c", ".swift",
]);

const EXCLUDED_DIRS = new Set([
  "node_modules", "dist", "build", ".git", "vendor", "coverage", ".next",
]);

// Matches // TODO: ..., # FIXME ..., * HACK: ..., etc.
const TODO_RE = /(?:\/\/|#|\*)\s*(TODO|FIXME|HACK|NOTE)[:\s]+(.*)/i;

const SECURITY_RE = /\b(auth|password|token|encrypt|secret|credential|hash|salt|jwt|oauth|session|csrf|xss|sql|injection)\b/i;
const PERF_TEXT_RE = /\b(perf|performance|optim|slow|cache|memo|latency|throughput|bottleneck|cpu|memory.?leak)\b/i;
const HOT_PATH_RE = /\b(for|while)\s*\(|\.(?:forEach|map|filter|reduce)\s*\(|\brender\s*[({]|\bfetch\s*\(/;

const MAX_FILES = 10;
const MAX_FILE_SIZE = 100_000; // 100 KB

function priorityFor(
  type: TodoItem["type"],
  text: string,
  context: string
): TodoItem["priority"] {
  if (SECURITY_RE.test(text)) return "critical";
  if (PERF_TEXT_RE.test(text) || HOT_PATH_RE.test(context)) return "high";
  if (type === "NOTE") return "low";
  return "medium";
}

function scanContent(path: string, content: string): TodoItem[] {
  const items: TodoItem[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = TODO_RE.exec(lines[i]);
    if (match) {
      const type = match[1].toUpperCase() as TodoItem["type"];
      const text = match[2].trim().slice(0, 120);
      const context = lines.slice(Math.max(0, i - 5), Math.min(lines.length, i + 6)).join("\n");
      items.push({ type, file: path, line: i + 1, text, priority: priorityFor(type, text, context) });
    }
  }
  return items;
}

function isExcluded(path: string): boolean {
  return path.split("/").some((part) => EXCLUDED_DIRS.has(part));
}

function hasSourceExtension(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot !== -1 && SOURCE_EXTENSIONS.has(path.slice(dot));
}

/**
 * Fetches up to MAX_FILES source files from the repository and scans them for
 * TODO / FIXME / HACK / NOTE comments. Skipped files and fetch errors are silently ignored.
 */
export async function scanTodos(
  repoData: RepoData,
  githubToken?: string
): Promise<ToolResult<TodoItem[]>> {
  const start = Date.now();

  try {
    const { owner, name, fileTree } = repoData;
    const octokit = new Octokit({ auth: githubToken });

    const candidates = fileTree
      .filter(
        (f) =>
          f.type === "blob" &&
          hasSourceExtension(f.path) &&
          !isExcluded(f.path) &&
          (f.size === undefined || f.size <= MAX_FILE_SIZE)
      )
      .slice(0, MAX_FILES);

    const results = await Promise.allSettled(
      candidates.map((f) =>
        octokit.repos
          .getContent({ owner, repo: name, path: f.path })
          .then((res) => {
            if (Array.isArray(res.data) || !("content" in res.data)) return [];
            const content = Buffer.from(res.data.content, "base64").toString("utf-8");
            return scanContent(f.path, content);
          })
      )
    );

    const todos = results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .sort((a, b) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      });

    return { toolName: "todoScanner", success: true, data: todos, durationMs: Date.now() - start };
  } catch (err) {
    return {
      toolName: "todoScanner",
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
