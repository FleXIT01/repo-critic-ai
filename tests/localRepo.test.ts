import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RepoAgent } from "../src/agent/RepoAgent.js";
import { isLocalPath, readLocalRepo, readRepo } from "../src/tools/repoReader.js";

describe("Local Repository Analysis", () => {
  it("correctly identifies local paths vs remote repositories", () => {
    expect(isLocalPath(".")).toBe(true);
    expect(isLocalPath("./src")).toBe(true);
    expect(isLocalPath("../")).toBe(true);
    expect(isLocalPath("/tmp")).toBe(true);
    expect(isLocalPath("owner/repo")).toBe(false);
    expect(isLocalPath("https://github.com/facebook/react")).toBe(false);
  });

  it("reads the current workspace directory locally", async () => {
    const result = await readLocalRepo(".");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const repo = result.data;
    expect(repo.localPath).toBe(resolve("."));
    expect(repo.name).toBe("repo-critic-ai");
    expect(repo.readmeContent).toBeTruthy();
    expect(repo.hasGitignore).toBe(true);
    expect(repo.packageJson?.name).toBe("repo-critic-ai");
    expect(repo.fileTree.length).toBeGreaterThan(0);
    expect(repo.fileTree.some((f) => f.path === "package.json")).toBe(true);
  });

  it("delegates to readLocalRepo when calling readRepo with a local path", async () => {
    const result = await readRepo(".");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.localPath).toBe(resolve("."));
  });

  it("analyzes the local repo end-to-end with RepoAgent without credentials", async () => {
    const agent = new RepoAgent({
      enabled: false,
      baseURL: "",
      apiKey: "",
      model: "",
    });

    const report = await agent.analyze(".");
    expect(report.score).toBeGreaterThan(0);
    expect(report.grade).toBeDefined();
    expect(report.markdownReport).toContain("repo-critic-ai");
    expect(report.analysis.readme.success).toBe(true);
    expect(report.analysis.security.success).toBe(true);
    expect(report.analysis.todos.success).toBe(true);
  });
});
