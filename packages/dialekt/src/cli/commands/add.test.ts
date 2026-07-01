import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { runAdd, addCommand, parseAddTokens } from "./add.js";
import type { DialektConfig } from "../../config/types.js";
import type { TranslationAdapter, ResourceRef } from "../../adapter/types.js";

describe("parseAddTokens", () => {
  it("parses resource.key=value pairs", async () => {
    const errors: string[] = [];
    const program = parseAddTokens(["messages.hello=Hello", "validation.email=Email"], (msg) =>
      Effect.sync(() => errors.push(msg)),
    );

    const result = await Effect.runPromise(program);
    expect(result).toEqual({
      messages: { hello: "Hello" },
      validation: { email: "Email" },
    });
    expect(errors).toHaveLength(0);
  });

  it("handles empty tokens", async () => {
    const program = parseAddTokens([], () => Effect.void);

    const result = await Effect.runPromise(program);
    expect(result).toEqual({});
  });

  it("logs error for tokens without =", async () => {
    const errors: string[] = [];
    const program = parseAddTokens(["invalid-token"], (msg) => Effect.sync(() => errors.push(msg)));

    const result = await Effect.runPromise(program);
    expect(result).toEqual({});
    expect(errors[0]).toContain("Invalid token (missing '=')");
    expect(errors[0]).toContain("invalid-token");
  });

  it("logs error for keys without resource segment", async () => {
    const errors: string[] = [];
    const program = parseAddTokens(["no_dot=value"], (msg) => Effect.sync(() => errors.push(msg)));

    const result = await Effect.runPromise(program);
    expect(result).toEqual({});
    expect(errors[0]).toContain("Invalid key (no resource segment)");
  });

  it("handles multiple keys in the same resource", async () => {
    const program = parseAddTokens(["messages.hello=Hello", "messages.bye=Bye"], () => Effect.void);

    const result = await Effect.runPromise(program);
    expect(result).toEqual({
      messages: { hello: "Hello", bye: "Bye" },
    });
  });

  it("handles values containing =", async () => {
    const program = parseAddTokens(["messages.greeting=Hello=World"], () => Effect.void);

    const result = await Effect.runPromise(program);
    expect(result).toEqual({
      messages: { greeting: "Hello=World" },
    });
  });

  it("ignores tokens after first = in key portion", async () => {
    const program = parseAddTokens(["messages.key=val=ue"], () => Effect.void);

    const result = await Effect.runPromise(program);
    expect(result).toEqual({
      messages: { key: "val=ue" },
    });
  });

  it("handles empty values", async () => {
    const program = parseAddTokens(["messages.empty="], () => Effect.void);

    const result = await Effect.runPromise(program);
    expect(result).toEqual({
      messages: { empty: "" },
    });
  });

  it("handles deeply nested resource names by splitting on first dot only", async () => {
    const program = parseAddTokens(["a.b.c.key=value"], () => Effect.void);

    const result = await Effect.runPromise(program);
    expect(result).toEqual({
      a: { "b.c.key": "value" },
    });
  });
});

describe("runAdd", () => {
  const baseConfig: DialektConfig = {
    sourceLocale: "en",
    targetLocales: ["de"],
    strategy: "one-shot",
    model: { provider: "openai", modelId: "gpt-4o" },
    fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
    chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    adapters: [],
  };

  function makeAdapter(name: string): TranslationAdapter {
    return {
      name,
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed([]),
      listResources: () => Effect.succeed([]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };
  }

  it("writes entries to all adapters and triggers translation", async () => {
    const writes: Array<{
      adapter: string;
      locale: string;
      resource: string;
      entries: Record<string, string>;
    }> = [];
    let translated = false;

    const adapter = makeAdapter("test");
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runAdd(
      { config: "./config.ts", create: false },
      ["messages.hello=Hello"],
      () => Effect.succeed(config),
      () => Effect.succeed({} as unknown),
      () =>
        Effect.sync(() => {
          translated = true;
        }),
      (msg) =>
        Effect.sync(() => {
          const parsed = JSON.parse(msg);
          expect(parsed.success).toBe(true);
          expect(parsed.message).toBe("Add + translate complete.");
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(translated).toBe(true);
  });

  it("fails when configLoader fails", async () => {
    const program = runAdd(
      { config: "./missing.ts", create: false },
      ["messages.hello=Hello"],
      () => Effect.fail(new Error("Config not found")),
      () => Effect.succeed({} as unknown),
      () => Effect.void,
      () => Effect.void,
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow("Config not found");
  });

  it("fails when modelResolver fails", async () => {
    const adapter = makeAdapter("test");
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runAdd(
      { config: "./config.ts", create: false },
      ["messages.hello=Hello"],
      () => Effect.succeed(config),
      () => Effect.fail(new Error("Model unavailable")),
      () => Effect.void,
      () => Effect.void,
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow("Model unavailable");
  });

  it("fails when translationRunner fails", async () => {
    const adapter = makeAdapter("test");
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runAdd(
      { config: "./config.ts", create: false },
      ["messages.hello=Hello"],
      () => Effect.succeed(config),
      () => Effect.succeed({} as unknown),
      () => Effect.fail(new Error("Translation failed")),
      () => Effect.void,
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow("Translation failed");
  });

  it("handles empty tokens list", async () => {
    let translated = false;
    const adapter = makeAdapter("test");
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig["adapters"] };

    const program = runAdd(
      { config: "./config.ts", create: false },
      [],
      () => Effect.succeed(config),
      () => Effect.succeed({} as unknown),
      () =>
        Effect.sync(() => {
          translated = true;
        }),
      () => Effect.void,
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(translated).toBe(true);
  });

  it("filters targetLocales to exclude sourceLocale", async () => {
    let usedTargets: readonly string[] | undefined;
    const adapter = makeAdapter("test");
    const config = {
      ...baseConfig,
      sourceLocale: "en",
      targetLocales: ["en", "de", "fr"],
      adapters: [adapter] as unknown as DialektConfig["adapters"],
    };

    const program = runAdd(
      { config: "./config.ts", create: false },
      ["messages.hello=Hello"],
      () => Effect.succeed(config),
      () => Effect.succeed({} as unknown),
      (opts) =>
        Effect.sync(() => {
          usedTargets = opts.targetLocales as readonly string[];
        }),
      () => Effect.void,
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(usedTargets).not.toContain("en");
    expect(usedTargets).toContain("de");
  });
});
