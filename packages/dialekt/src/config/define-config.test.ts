import { describe, expect, it } from "vitest";
import { defineConfig } from "./define-config.js";
import type { DialektConfig } from "./types.js";

describe("defineConfig", () => {
  it("returns its input unchanged", () => {
    const config: DialektConfig = {
      sourceLocale: "en",
      targetLocales: ["de"],
      strategy: "one-shot",
      model: { provider: "openai", modelId: "gpt-4o" },
      fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
      retry: { maxAttempts: 3, baseDelayMs: 1000 },
      adapters: [],
    };
    expect(defineConfig(config)).toBe(config);
  });

  it("accepts a config with adapters", () => {
    const adapter = {
      name: "test",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => {
        throw new Error();
      },
      listResources: () => {
        throw new Error();
      },
      readResource: () => {
        throw new Error();
      },
      writeResource: () => {
        throw new Error();
      },
    } as unknown as DialektConfig["adapters"][number];
    const config: DialektConfig = {
      sourceLocale: "en",
      targetLocales: ["de"],
      strategy: "one-shot",
      model: { provider: "openai", modelId: "gpt-4o" },
      fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
      retry: { maxAttempts: 3, baseDelayMs: 1000 },
      adapters: [adapter],
    };
    expect(defineConfig(config)).toBe(config);
  });

  it("accepts a config with tool-loop-agent strategy", () => {
    const config: DialektConfig = {
      sourceLocale: "en",
      targetLocales: ["de"],
      strategy: "tool-loop-agent",
      model: { provider: "anthropic", modelId: "claude-3-sonnet" },
      fastModel: { provider: "anthropic", modelId: "claude-3-haiku" },
      chunking: { maxTokens: 4000, charsPerToken: 3.5, concurrency: 5 },
      retry: { maxAttempts: 5, baseDelayMs: 500 },
      adapters: [],
    };
    expect(defineConfig(config)).toBe(config);
  });

  it("preserves reference identity for nested objects", () => {
    const model = { provider: "openai", modelId: "gpt-4o" };
    const chunking = { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 };
    const config: DialektConfig = {
      sourceLocale: "en",
      targetLocales: ["de"],
      strategy: "one-shot",
      model,
      fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
      chunking,
      retry: { maxAttempts: 3, baseDelayMs: 1000 },
      adapters: [],
    };
    const result = defineConfig(config);
    expect(result.model).toBe(model);
    expect(result.chunking).toBe(chunking);
  });
});
