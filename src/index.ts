#!/usr/bin/env node
/**
 * CLI entry point for repo-critic-ai.
 * Commands:
 *   repo-critic analyze <repoUrl>   – analyse a repository and print the report
 *   repo-critic web                 – start the local web interface
 */
import { Command } from "commander";
import { RepoAgent } from "./agent/RepoAgent.js";
import type { LLMConfig } from "./types/index.js";

const program = new Command();

program
  .name("repo-critic")
  .description("Analyse a GitHub repository and get a quality health report.")
  .version("0.1.0");

// ── analyze ──────────────────────────────────────────────────────────────────
program
  .command("analyze <repoUrlOrPath>")
  .description(
    "Analyse a GitHub repository or local directory.\n" +
      "  <repoUrlOrPath>  owner/repo, https://github.com/owner/repo, or local path (e.g. . or /path/to/repo)"
  )
  .option("--no-llm", "Disable LLM calls — use rule-based checks only")
  .option("--json", "Output raw JSON instead of Markdown")
  .option("--model <model>", "LLM model name", process.env.LLM_MODEL ?? "llama3")
  .option(
    "--base-url <url>",
    "OpenAI-compatible API base URL",
    process.env.LLM_BASE_URL ?? "http://localhost:11434/v1"
  )
  .option("--api-key <key>", "API key for the LLM endpoint", process.env.LLM_API_KEY ?? "")
  .option("--improve-readme", "Generate suggested README improvements and diff")
  .action(
    async (
      repoUrl: string,
      options: {
        llm: boolean;
        json: boolean;
        model: string;
        baseUrl: string;
        apiKey: string;
        improveReadme?: boolean;
      }
    ) => {
      const llmConfig: LLMConfig = {
        enabled: options.llm && options.apiKey.length > 0,
        baseURL: options.baseUrl,
        apiKey: options.apiKey,
        model: options.model,
      };

      const agent = new RepoAgent(llmConfig, process.env.GITHUB_TOKEN);
      console.error(`Analysing ${repoUrl}…`);

      try {
        const report = await agent.analyze(repoUrl);

        if (options.json) {
          console.log(JSON.stringify(report, null, 2));
        } else {
          console.log(report.markdownReport);
          console.error(`\nHealth Score: ${report.score}/100 (${report.grade})`);
        }

        if (options.improveReadme) {
          const { readRepo } = await import("./tools/repoReader.js");
          const { improveReadme } = await import("./tools/readmeImprover.js");
          const repoResult = await readRepo(repoUrl, process.env.GITHUB_TOKEN);
          if (repoResult.success && repoResult.data.readmeContent) {
            console.log("\n## README Improvement Suggestions & Diff\n");
            const diff = await improveReadme(repoResult.data.readmeContent);
            console.log(diff);
          }
        }
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    }
  );

// ── improve-readme ────────────────────────────────────────────────────────────
program
  .command("improve-readme <repoUrlOrPath>")
  .description(
    "Analyze a README and generate section gap analysis and suggested improvements (GitHub URL or local path)"
  )
  .action(async (repoUrlOrPath: string) => {
    const { readRepo } = await import("./tools/repoReader.js");
    const { improveReadme } = await import("./tools/readmeImprover.js");
    console.error(`Fetching README for ${repoUrlOrPath}…`);
    try {
      const repoResult = await readRepo(repoUrlOrPath, process.env.GITHUB_TOKEN);
      if (!repoResult.success) {
        throw new Error(repoResult.error);
      }
      const diff = await improveReadme(repoResult.data.readmeContent ?? "");
      console.log(diff);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });

// ── web ───────────────────────────────────────────────────────────────────────
program
  .command("web")
  .description("Start the local web interface (default: http://localhost:3000)")
  .option("-p, --port <port>", "Port to listen on", "3000")
  .action(async (options: { port: string }) => {
    const { startServer } = await import("./web/server.js");
    startServer(Number(options.port));
  });

program.parse();
