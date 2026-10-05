import { type Dirent, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { Octokit } from "@octokit/rest";
import type { RepoData, RepoFileEntry, ToolResult } from "../types/index.js";

/**
 * Checks whether the input string refers to a local file/directory path.
 */
export function isLocalPath(input: string): boolean {
  if (
    input === "." ||
    input.startsWith("./") ||
    input.startsWith("../") ||
    input.startsWith("/") ||
    input.startsWith("~") ||
    (process.platform === "win32" && /^[a-zA-Z]:[\\/]/.test(input))
  ) {
    return true;
  }
  try {
    const resolved = resolve(input);
    return existsSync(resolved) && statSync(resolved).isDirectory();
  } catch {
    return false;
  }
}

function getLocalFileTree(dir: string, maxFiles = 1000): RepoFileEntry[] {
  const entries: RepoFileEntry[] = [];
  const EXCLUDED = new Set([
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".next",
    ".cache",
    "vendor",
  ]);

  function walk(currentDir: string, relPrefix = "") {
    if (entries.length >= maxFiles) return;
    let dirents: Dirent[];
    try {
      dirents = readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const d of dirents) {
      if (entries.length >= maxFiles) break;
      if (EXCLUDED.has(d.name)) continue;
      const relPath = relPrefix ? `${relPrefix}/${d.name}` : d.name;
      const fullPath = join(currentDir, d.name);

      if (d.isDirectory()) {
        entries.push({ path: relPath, type: "tree" });
        walk(fullPath, relPath);
      } else if (d.isFile()) {
        let size: number | undefined;
        try {
          size = statSync(fullPath).size;
        } catch {
          // ignore
        }
        entries.push({ path: relPath, type: "blob", size });
      }
    }
  }

  walk(dir);
  return entries;
}

function tryExtractGitRemote(localPath: string): { owner: string; name: string } | null {
  try {
    const gitConfigPath = join(localPath, ".git", "config");
    if (existsSync(gitConfigPath)) {
      const content = readFileSync(gitConfigPath, "utf-8");
      const match =
        /url\s*=\s*(?:git@github\.com:|https?:\/\/github\.com\/)([^\s/]+)\/([^\s/.]+)(?:\.git)?/.exec(
          content
        );
      if (match) {
        return { owner: match[1], name: match[2] };
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

export async function readLocalRepo(directoryPath: string): Promise<ToolResult<RepoData>> {
  const start = Date.now();
  try {
    const absPath = resolve(directoryPath);
    if (!existsSync(absPath) || !statSync(absPath).isDirectory()) {
      throw new Error(`Directory does not exist: "${directoryPath}"`);
    }

    const remote = tryExtractGitRemote(absPath);
    const dirName = basename(absPath);
    const owner = remote ? remote.owner : "local";
    const name = remote ? remote.name : dirName;

    const fileTree = getLocalFileTree(absPath);
    const paths = new Set(fileTree.map((f) => f.path.toLowerCase()));

    // README detection
    let readmeContent: string | null = null;
    const readmeCandidates = ["readme.md", "readme", "readme.txt", "readme.rst"];
    for (const entry of fileTree) {
      if (entry.type === "blob" && readmeCandidates.includes(entry.path.toLowerCase())) {
        try {
          readmeContent = readFileSync(join(absPath, entry.path), "utf-8");
          break;
        } catch {
          // continue
        }
      }
    }

    // package.json detection
    let packageJson: Record<string, unknown> | null = null;
    const pkgPath = join(absPath, "package.json");
    if (existsSync(pkgPath)) {
      try {
        packageJson = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, unknown>;
      } catch {
        // ignore
      }
    }

    // primary language heuristic
    let language: string | null = null;
    if (
      paths.has("tsconfig.json") ||
      [...paths].some((p) => p.endsWith(".ts") || p.endsWith(".tsx"))
    ) {
      language = "TypeScript";
    } else if (
      paths.has("package.json") ||
      [...paths].some((p) => p.endsWith(".js") || p.endsWith(".jsx"))
    ) {
      language = "JavaScript";
    } else if ([...paths].some((p) => p.endsWith(".py"))) {
      language = "Python";
    } else if ([...paths].some((p) => p.endsWith(".go"))) {
      language = "Go";
    } else if ([...paths].some((p) => p.endsWith(".rs"))) {
      language = "Rust";
    }

    return {
      toolName: "repoReader",
      success: true,
      data: {
        owner,
        name,
        fullName: `${owner}/${name}`,
        description: typeof packageJson?.description === "string" ? packageJson.description : null,
        defaultBranch: "main",
        stars: 0,
        forks: 0,
        openIssuesCount: 0,
        language,
        topics: Array.isArray(packageJson?.keywords) ? (packageJson.keywords as string[]) : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isPrivate: true,
        readmeContent,
        fileTree,
        hasGitignore: existsSync(join(absPath, ".gitignore")),
        hasLicense:
          paths.has("license") ||
          paths.has("license.md") ||
          paths.has("license.txt") ||
          [...paths].some((p) => p.startsWith("license.")),
        packageJson,
        localPath: absPath,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      toolName: "repoReader",
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Parse "owner/repo", "https://github.com/owner/repo", or "github.com/owner/repo"
 * into a structured { owner, name } pair.
 */
function parseRepoUrl(input: string): { owner: string; name: string } {
  const cleaned = input
    .replace(/^https?:\/\//, "")
    .replace(/^github\.com\//, "")
    .replace(/\.git$/, "")
    .replace(/\/$/, "");

  const [owner, name] = cleaned.split("/");
  if (!owner || !name) {
    throw new Error(
      `Cannot parse repo identifier "${input}". Use owner/repo, https://github.com/owner/repo, or a local directory path.`
    );
  }
  return { owner, name };
}

/**
 * Fetches repository metadata, README content, and file tree from the GitHub API,
 * or reads directly from the filesystem if a local directory path is given.
 */
export async function readRepo(
  repoUrlOrPath: string,
  githubToken?: string
): Promise<ToolResult<RepoData>> {
  if (isLocalPath(repoUrlOrPath)) {
    return readLocalRepo(repoUrlOrPath);
  }

  const start = Date.now();

  try {
    const { owner, name } = parseRepoUrl(repoUrlOrPath);
    const octokit = new Octokit({ auth: githubToken });

    const [metaResult, readmeResult, treeResult] = await Promise.allSettled([
      octokit.repos.get({ owner, repo: name }),
      octokit.repos.getReadme({ owner, repo: name }),
      octokit.git.getTree({ owner, repo: name, tree_sha: "HEAD", recursive: "1" }),
    ]);

    if (metaResult.status === "rejected") {
      const err = metaResult.reason as { status?: number };
      if (err.status === 404) throw new Error(`Repository "${owner}/${name}" not found.`);
      if (err.status === 401 || err.status === 403)
        throw new Error("GitHub API authentication failed. Set GITHUB_TOKEN.");
      throw metaResult.reason instanceof Error
        ? metaResult.reason
        : new Error(String(metaResult.reason));
    }

    const repo = metaResult.value.data;

    // README content is base64-encoded by the API
    let readmeContent: string | null = null;
    if (readmeResult.status === "fulfilled") {
      readmeContent = Buffer.from(readmeResult.value.data.content ?? "", "base64").toString(
        "utf-8"
      );
    }

    // Cap file tree at 500 entries to keep memory usage reasonable
    let fileTree: RepoFileEntry[] = [];
    if (treeResult.status === "fulfilled") {
      fileTree = treeResult.value.data.tree
        .filter((item): item is typeof item & { path: string } => item.path !== undefined)
        .slice(0, 500)
        .map((item) => ({
          path: item.path,
          type: item.type === "blob" ? ("blob" as const) : ("tree" as const),
          size: item.size ?? undefined,
        }));
    }

    const paths = new Set(fileTree.map((f) => f.path.toLowerCase()));

    // Fetch package.json content when present (non-critical — skip on error)
    let packageJson: Record<string, unknown> | null = null;
    if (paths.has("package.json")) {
      try {
        const pkgRes = await octokit.repos.getContent({ owner, repo: name, path: "package.json" });
        if (!Array.isArray(pkgRes.data) && "content" in pkgRes.data) {
          packageJson = JSON.parse(
            Buffer.from(pkgRes.data.content, "base64").toString("utf-8")
          ) as Record<string, unknown>;
        }
      } catch {
        // Silently ignore — package.json analysis is optional
      }
    }

    return {
      toolName: "repoReader",
      success: true,
      data: {
        owner,
        name,
        fullName: repo.full_name,
        description: repo.description ?? null,
        defaultBranch: repo.default_branch,
        stars: repo.stargazers_count,
        forks: repo.forks_count,
        openIssuesCount: repo.open_issues_count,
        language: repo.language ?? null,
        topics: repo.topics ?? [],
        createdAt: repo.created_at,
        updatedAt: repo.updated_at,
        isPrivate: repo.private,
        readmeContent,
        fileTree,
        hasGitignore: paths.has(".gitignore"),
        hasLicense:
          paths.has("license") ||
          paths.has("license.md") ||
          paths.has("license.txt") ||
          [...paths].some((p) => p.startsWith("license.")),
        packageJson,
      },
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      toolName: "repoReader",
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
