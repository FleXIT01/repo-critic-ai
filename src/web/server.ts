import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { AnalysisMemory } from "../agent/memory.js";
import { defaultLLMConfig } from "../llm/client.js";
import { analyzeRoute } from "./routes/analyze.js";
import { reportRoute } from "./routes/report.js";

const __dir = fileURLToPath(new URL(".", import.meta.url));
const HTML = readFileSync(resolve(__dir, "public/index.html"), "utf-8");

/** Creates and configures the Hono application (exported for testing). */
export function createApp(): Hono {
  const memory = new AnalysisMemory();
  const llmConfig = defaultLLMConfig();

  const app = new Hono();
  app.use("*", cors());

  app.get("/", (c) => c.html(HTML));
  app.route("/analyze", analyzeRoute(memory, llmConfig));
  app.route("/report", reportRoute(memory));

  return app;
}

/** Starts the HTTP server on the given port. */
export function startServer(port = 3000): void {
  const app = createApp();
  serve({ fetch: app.fetch, port });
  console.log(`repo-critic-ai web server running at http://localhost:${port}`);
  console.log("Press Ctrl+C to stop.");
}
