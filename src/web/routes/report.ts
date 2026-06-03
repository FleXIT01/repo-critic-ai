import { Hono } from "hono";
import type { AnalysisMemory } from "../../agent/memory.js";

/**
 * GET /report        → list of all stored reports (id, repoUrl, score, grade)
 * GET /report/:id    → full HealthReport JSON for a specific analysis run
 */
export function reportRoute(memory: AnalysisMemory): Hono {
  const router = new Hono();

  router.get("/", (c) => {
    const list = memory.list().map((e) => ({
      id: e.id,
      repoUrl: e.repoUrl,
      score: e.report.score,
      grade: e.report.grade,
      storedAt: e.storedAt,
    }));
    return c.json(list);
  });

  router.get("/:id", (c) => {
    const id = c.req.param("id");
    const entry = memory.get(id);

    if (!entry) {
      return c.json({ error: `Report "${id}" not found` }, 404);
    }

    return c.json(entry.report);
  });

  return router;
}
