import OpenAI from "openai";
import type { LLMConfig } from "../types/index.js";

/** Callable LLM interface returned by createLLMCaller. */
export interface LLMCaller {
  /** Make a chat completion request. Returns null when LLM is disabled. */
  call(userPrompt: string, systemPrompt?: string): Promise<string | null>;
  readonly enabled: boolean;
}

/**
 * Factory that creates an LLMCaller bound to the given config.
 * When config.enabled is false, all calls silently return null so
 * rule-based fallbacks in each tool take over without any code changes.
 */
export function createLLMCaller(config: LLMConfig): LLMCaller {
  if (!config.enabled || !config.apiKey) {
    return { enabled: false, call: async () => null };
  }

  const client = new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey });

  return {
    enabled: true,
    async call(userPrompt: string, systemPrompt?: string): Promise<string | null> {
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
      if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
      messages.push({ role: "user", content: userPrompt });

      const response = await client.chat.completions.create({
        model: config.model,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      });

      return response.choices[0]?.message.content ?? null;
    },
  };
}

/**
 * Build a default LLMConfig from environment variables.
 * LLM is disabled when LLM_API_KEY is not set, so the tool works out of the box
 * without any configuration — just set LLM_API_KEY to opt in.
 */
export function defaultLLMConfig(overrides: Partial<LLMConfig> = {}): LLMConfig {
  const apiKey = process.env.LLM_API_KEY ?? "";
  return {
    baseURL: process.env.LLM_BASE_URL ?? "http://localhost:11434/v1",
    apiKey,
    model: process.env.LLM_MODEL ?? "llama3",
    enabled: apiKey.length > 0,
    ...overrides,
  };
}
