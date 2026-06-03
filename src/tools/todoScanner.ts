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

const MAX_FILES = 10;
const MAX_FILE_SIZE = 100_000; // 100 KB

function priorityFor(type: string): TodoItem["priority"] {
  if (type === "FIXME") return "high";
  if (type === "HACK" || type === "TODO") return "medium";
  return "low";
}

function scanContent(path: string, content: string): TodoItem[] {
  const items: TodoItem[] = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const match = TODO_RE.exec(lines[i]);
    if (match) {
      const type = match[1].toUpperCase() as TodoItem["type"];
      items.push({
        type,
        file: path,
        line: i + 1,
        text: match[2].trim().slice(0, 120),
        priority: priorityFor(type),
      });
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
        const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
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
