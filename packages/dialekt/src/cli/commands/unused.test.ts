import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import { runUnused, unusedCommand } from "./unused.js";
import type { DialektConfig } from "../../config/types.js";
import type { TranslationAdapter, ResourceRef } from "../../adapter/types.js";

describe("runUnused", () => {
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

  function makeAdapter(opts: {
    name: string;
    locales?: readonly string[];
    resources?: readonly ResourceRef[];
    unused?: readonly string[];
    hasUnusedDetection?: boolean;
  }): TranslationAdapter {
    const base = {
      name: opts.name,
      capabilities: {
        canCreateResource: true,
        unusedKeyDetection: opts.hasUnusedDetection ?? true,
      },
      listLocales: () => Effect.succeed(opts.locales ?? ["en", "de"]),
      listResources: () =>
        Effect.succeed(opts.resources ?? [{ key: "messages", label: "messages" }]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };
    if (opts.unused !== undefined) {
      return {
        ...base,
        findUnusedKeys: () => Effect.succeed(opts.unused!),
      } as TranslationAdapter;
    }
    return base as TranslationAdapter;
  }

  it("logs unused keys for capable adapters", async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: "test", unused: ["old_key", "another"] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runUnused(
      { config: "./config.ts", adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toEqual([
      { adapter: "test", locale: "en", resource: "messages", key: "old_key" },
      { adapter: "test", locale: "en", resource: "messages", key: "another" },
    ]);
  });

  it("skips adapters without unusedKeyDetection with a warning", async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const legacy = makeAdapter({ name: "legacy", hasUnusedDetection: false });
    const config = { ...baseConfig, adapters: [legacy] as unknown as DialektConfig["adapters"] };

    const program = runUnused(
      { config: "./config.ts", adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
      (msg) => Effect.sync(() => errors.push(msg)),
    );

    await Effect.runPromise(program);
    expect(errors).toHaveLength(1);
    expect(JSON.parse(errors[0]!)).toMatchObject({
      error: "Adapter 'legacy' does not support unused-key detection.",
    });
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toEqual([]);
  });

  it("handles multiple resources", async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({
      name: "multi",
      resources: [
        { key: "auth", label: "auth" },
        { key: "validation", label: "validation" },
      ],
      unused: ["unused_auth"],
    });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runUnused(
      { config: "./config.ts", adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toContainEqual({
      adapter: "multi",
      locale: "en",
      resource: "auth",
      key: "unused_auth",
    });
  });

  it("handles empty adapter list", async () => {
    const logs: string[] = [];
    const config = { ...baseConfig, adapters: [] };

    const program = runUnused(
      { config: "./config.ts", adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toEqual([]);
  });

  it("handles adapter with no resources", async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: "empty", resources: [] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runUnused(
      { config: "./config.ts", adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toEqual([]);
  });

  it("handles no unused keys gracefully", async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: "clean", unused: [] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runUnused(
      { config: "./config.ts", adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toEqual([]);
  });

  it("fails when configLoader fails", async () => {
    const program = runUnused(
      { config: "./missing.ts", adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.fail(new Error("Config not found")),
      () => Effect.void,
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow("Config not found");
  });

  it("outputs pretty when --format pretty is passed", async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: "test", unused: ["old_key"] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runUnused(
      {
        config: "./config.ts",
        adapter: Option.none(),
        baseLanguage: Option.none(),
        format: Option.some("pretty"),
      },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("test");
    expect(logs[0]).toContain("old_key");
  });
});
