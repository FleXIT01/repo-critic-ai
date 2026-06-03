import { afterEach, describe, expect, it, vi } from "vitest";
import { createLLMCaller, defaultLLMConfig } from "../src/llm/client.js";
import type { LLMConfig } from "../src/types/index.js";

describe("createLLMCaller — disabled states", () => {
  it("is disabled when config.enabled is false", () => {
    const config: LLMConfig = {
      enabled: false,
      baseURL: "http://localhost:11434/v1",
      apiKey: "some-key",
      model: "llama3",
    };
    expect(createLLMCaller(config).enabled).toBe(false);
  });

  it("is disabled when apiKey is empty even if enabled:true", () => {
    const config: LLMConfig = {
      enabled: true,
      baseURL: "http://localhost:11434/v1",
      apiKey: "",
      model: "llama3",
    };
    expect(createLLMCaller(config).enabled).toBe(false);
  });

  it("disabled caller returns null without making any network call", async () => {
    const config: LLMConfig = {
      enabled: false,
      baseURL: "http://localhost:11434/v1",
      apiKey: "",
      model: "llama3",
    };
    const caller = createLLMCaller(config);
    const result = await caller.call("hello");
    expect(result).toBeNull();
  });

  it("disabled caller returns null for any prompt + system prompt", async () => {
    const caller = createLLMCaller({ enabled: false, baseURL: "", apiKey: "", model: "" });
    expect(await caller.call("user prompt", "system prompt")).toBeNull();
  });
});

describe("defaultLLMConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("disables LLM when LLM_API_KEY is not set", () => {
    vi.stubEnv("LLM_API_KEY", "");
    const config = defaultLLMConfig();
    expect(config.enabled).toBe(false);
  });

  it("enables LLM when LLM_API_KEY is non-empty", () => {
    vi.stubEnv("LLM_API_KEY", "sk-test");
    const config = defaultLLMConfig();
    expect(config.enabled).toBe(true);
    expect(config.apiKey).toBe("sk-test");
  });

  it("uses LLM_BASE_URL when set", () => {
    vi.stubEnv("LLM_BASE_URL", "http://custom:8080/v1");
    vi.stubEnv("LLM_API_KEY", "key");
    const config = defaultLLMConfig();
    expect(config.baseURL).toBe("http://custom:8080/v1");
  });

  it("overrides values from the overrides argument", () => {
    vi.stubEnv("LLM_API_KEY", "key");
    const config = defaultLLMConfig({ model: "gpt-4o", enabled: false });
    expect(config.model).toBe("gpt-4o");
    expect(config.enabled).toBe(false);
  });
});
