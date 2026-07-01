import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import { runLanguages, languagesCommand } from "./languages.js";
import type { DialektConfig } from "../../config/types.js";
import type { TranslationAdapter } from "../../adapter/types.js";

describe("runLanguages", () => {
  const baseConfig: DialektConfig = {
    sourceLocale: "en",
    targetLocales: ["de", "fr"],
    strategy: "one-shot",
    model: { provider: "openai", modelId: "gpt-4o" },
    fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
    chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    adapters: [],
  };

  function makeAdapter(opts: { name: string; locales?: readonly string[] }): TranslationAdapter {
    return {
      name: opts.name,
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(opts.locales ?? ["en", "de"]),
      listResources: () => Effect.succeed([]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };
  }

  it("logs locales for each adapter", async () => {
    const logs: string[] = [];
    const laravel = makeAdapter({ name: "laravel", locales: ["en", "de", "fr"] });
    const paraglide = makeAdapter({ name: "paraglide", locales: ["en", "es"] });
    const config = {
      ...baseConfig,
      adapters: [laravel, paraglide] as unknown as DialektConfig["adapters"],
    };

    const program = runLanguages(
      { config: "./config.ts" },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toHaveLength(2);
    expect(parsed).toContainEqual({ adapter: "laravel", locales: ["en", "de", "fr"] });
    expect(parsed).toContainEqual({ adapter: "paraglide", locales: ["en", "es"] });
  });

  it("handles single adapter with single locale", async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: "mono", locales: ["en"] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runLanguages(
      { config: "./config.ts" },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toEqual([{ adapter: "mono", locales: ["en"] }]);
  });

  it("handles empty adapter list", async () => {
    const logs: string[] = [];
    const config = { ...baseConfig, adapters: [] };

    const program = runLanguages(
      { config: "./config.ts" },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toEqual([]);
  });

  it("fails when configLoader fails", async () => {
    const program = runLanguages(
      { config: "./missing.ts" },
      () => Effect.fail(new Error("Config not found")),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow("Config not found");
  });

  it("handles adapter with empty locales", async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: "empty", locales: [] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runLanguages(
      { config: "./config.ts" },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toEqual([{ adapter: "empty", locales: [] }]);
  });

  it("outputs pretty when --format pretty is passed", async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: "test", locales: ["en", "de"] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runLanguages(
      { config: "./config.ts", format: Option.some("pretty") },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("test");
    expect(logs[0]).toContain("en");
    expect(logs[0]).toContain("de");
  });
});
