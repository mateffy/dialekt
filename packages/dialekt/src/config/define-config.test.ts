import { describe, expect, it } from "vitest";
import { defineConfig } from "./define-config.js";
import type { DialektConfig } from "./types.js";

describe("defineConfig", () => {
  it("merges defaults for chunking and retry", () => {
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
    const result = defineConfig(config);
    expect(result.chunking).toEqual({ maxTokens: 3000, charsPerToken: 3.0, concurrency: 3, keysPerChunk: 10 });
    expect(result.retry).toEqual({ maxAttempts: 3, baseDelayMs: 1000 });
  });

  it("fills defaults when chunking and retry are missing", () => {
    // Simulate a config loaded at runtime without these fields
    const partial = {
      sourceLocale: "en",
      targetLocales: ["de"] as const,
      strategy: "one-shot" as const,
      model: { provider: "openai", modelId: "gpt-4o" },
      fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
      adapters: [],
    } as unknown as DialektConfig;
    const result = defineConfig(partial);
    expect(result.chunking.maxTokens).toBe(3000);
    expect(result.retry.maxAttempts).toBe(3);
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
    expect(defineConfig(config).adapters).toEqual([adapter]);
  });

  it("preserves reference identity for adapters array", () => {
    const model = { provider: "openai", modelId: "gpt-4o" };
    const adapters: DialektConfig["adapters"] = [];
    const config: DialektConfig = {
      sourceLocale: "en",
      targetLocales: ["de"],
      strategy: "one-shot",
      model,
      fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
      retry: { maxAttempts: 3, baseDelayMs: 1000 },
      adapters,
    };
    const result = defineConfig(config);
    expect(result.model).toBe(model);
    expect(result.adapters).toBe(adapters);
  });
});