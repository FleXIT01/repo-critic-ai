import { Octokit } from "@octokit/rest";
import type { RepoData, SecurityFinding, ToolResult } from "../types/index.js";

interface SecretPattern {
  pattern: RegExp;
  category: string;
  severity: SecurityFinding["severity"];
}

// Patterns tuned to avoid false positives: exclude template placeholders (${}), env references, and obvious fakes.
const SECRET_PATTERNS: SecretPattern[] = [
  { pattern: /AKIA[0-9A-Z]{16}/, category: "AWS Access Key", severity: "critical" },
  { pattern: /sk-[a-zA-Z0-9]{32,}(?![\w-])/, category: "OpenAI API Key", severity: "critical" },
  { pattern: /ghp_[a-zA-Z0-9]{36}/, category: "GitHub Personal Token", severity: "critical" },
  { pattern: /-----BEGIN (RSA|EC|DSA|OPENSSH) PRIVATE KEY-----/, category: "Private Key", severity: "critical" },
  {
    pattern: /password\s*[=:]\s*["'][^"'${}\\n]{8,}["']/i,
    category: "Hardcoded Password",
    severity: "high",
  },
];

interface SensitiveFileRule {
  pattern: RegExp;
  severity: SecurityFinding["severity"];
  description: string;
}

const SENSITIVE_FILE_RULES: SensitiveFileRule[] = [
  { pattern: /^\.env$/, severity: "critical", description: ".env file committed to the repository" },
  { pattern: /^\.env\.(local|production|prod)$/, severity: "critical", description: "Environment secrets file committed" },
  { pattern: /\.pem$/, severity: "critical", description: "PEM certificate/key file committed" },
  { pattern: /\.(key|p12|pfx)$/, severity: "critical", description: "Private key or certificate file committed" },
  { pattern: /^\.aws\/credentials$/, severity: "critical", description: "AWS credentials file committed" },
  { pattern: /^id_(rsa|ecdsa|ed25519)$/, severity: "high", description: "SSH private key file committed" },
];

const MAX_FILES_TO_SCAN = 5;
const MAX_FILE_SIZE = 50_000;
const SCAN_EXTENSIONS = new Set([".ts", ".js", ".py", ".go", ".env", ".yml", ".yaml", ".json", ".sh"]);

function hasScanExtension(path: string): boolean {
  const dot = path.lastIndexOf(".");
  return dot !== -1 && SCAN_EXTENSIONS.has(path.slice(dot));
}

function isExcluded(path: string): boolean {
  return path.startsWith("node_modules/") || path.startsWith(".git/") || path.startsWith("dist/");
}

/**
 * Checks for sensitive files in the file tree (no API calls) and scans a sample
 * of source files for hardcoded secrets and API keys.
 */
export async function checkSecurity(
  repoData: RepoData,
  githubToken?: string
): Promise<ToolResult<SecurityFinding[]>> {
  const start = Date.now();

  try {
    const findings: SecurityFinding[] = [];

    // 1 — static file tree analysis (no extra API calls needed)
    for (const entry of repoData.fileTree) {
      if (entry.type !== "blob") continue;
      const fileName = entry.path.split("/").pop() ?? entry.path;
      for (const rule of SENSITIVE_FILE_RULES) {
        if (rule.pattern.test(fileName) || rule.pattern.test(entry.path)) {
          findings.push({
            severity: rule.severity,
            category: "Sensitive File",
            file: entry.path,
            description: rule.description,
          });
          break;
        }
      }
    }

    // 2 — scan a sample of source files for hardcoded secrets
    const { owner, name, fileTree } = repoData;
    const octokit = new Octokit({ auth: githubToken });

    const candidates = fileTree
      .filter(
        (f) =>
          f.type === "blob" &&
          hasScanExtension(f.path) &&
          !isExcluded(f.path) &&
          (f.size === undefined || f.size <= MAX_FILE_SIZE)
      )
      .slice(0, MAX_FILES_TO_SCAN);

    await Promise.allSettled(
      candidates.map(async (f) => {
        const res = await octokit.repos.getContent({ owner, repo: name, path: f.path });
        if (Array.isArray(res.data) || !("content" in res.data)) return;
        const content = Buffer.from(res.data.content, "base64").toString("utf-8");

        for (const { pattern, category, severity } of SECRET_PATTERNS) {
          if (pattern.test(content)) {
            findings.push({
              severity,
              category,
              file: f.path,
              description: `Possible ${category} detected`,
            });
          }
        }
      })
    );

    return {
      toolName: "securityChecker",
      success: true,
      data: findings,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    return {
      toolName: "securityChecker",
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
