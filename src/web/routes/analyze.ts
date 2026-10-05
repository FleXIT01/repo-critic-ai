import { Hono } from "hono";
import { RepoAgent } from "../../agent/RepoAgent.js";
import type { AnalysisMemory } from "../../agent/memory.js";
import type { LLMConfig } from "../../types/index.js";

/**
 * POST /analyze { repoUrl: string }
 * Runs a full analysis and stores the report in memory.
 * Returns { id, score, grade, summary } on success.
 */
export function analyzeRoute(memory: AnalysisMemory, llmConfig: LLMConfig): Hono {
  const router = new Hono();

  router.post("/", async (c) => {
    let body: { repoUrl?: unknown };
    try {
      body = await c.req.json<{ repoUrl?: unknown }>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (typeof body.repoUrl !== "string" || body.repoUrl.trim().length === 0) {
      return c.json({ error: "repoUrl (non-empty string) is required" }, 400);
    }

    const agent = new RepoAgent(llmConfig, process.env.GITHUB_TOKEN);

    try {
      const report = await agent.analyze(body.repoUrl.trim());
      memory.store(report);
      return c.json({
        id: report.id,
        score: report.score,
        grade: report.grade,
        summary: report.summary,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Analysis failed" }, 500);
    }
  });

  router.post("/improve-readme", async (c) => {
    let body: { repoUrl?: unknown };
    try {
      body = await c.req.json<{ repoUrl?: unknown }>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (typeof body.repoUrl !== "string" || body.repoUrl.trim().length === 0) {
      return c.json({ error: "repoUrl (non-empty string) is required" }, 400);
    }

    try {
      const { readRepo } = await import("../../tools/repoReader.js");
      const { improveReadme } = await import("../../tools/readmeImprover.js");
      const repoResult = await readRepo(body.repoUrl.trim(), process.env.GITHUB_TOKEN);
      if (!repoResult.success) {
        return c.json({ error: `Failed to read repository: ${repoResult.error}` }, 400);
      }
      const improvement = await improveReadme(repoResult.data.readmeContent ?? "");
      return c.json({ improvement });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "README improvement failed" },
        500
      );
    }
  });

  return router;
}
