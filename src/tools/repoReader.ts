import { Octokit } from "@octokit/rest";
import type { RepoData, RepoFileEntry, ToolResult } from "../types/index.js";

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
      `Cannot parse repo identifier "${input}". Use owner/repo or https://github.com/owner/repo.`
    );
  }
  return { owner, name };
}

/**
 * Fetches repository metadata, README content, and file tree from the GitHub API.
 * Three requests are made in parallel to minimise latency.
 * Pass a GITHUB_TOKEN to raise the rate limit from 60 to 5 000 requests/hour.
 */
export async function readRepo(
  repoUrl: string,
  githubToken?: string
): Promise<ToolResult<RepoData>> {
  const start = Date.now();

  try {
    const { owner, name } = parseRepoUrl(repoUrl);
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
