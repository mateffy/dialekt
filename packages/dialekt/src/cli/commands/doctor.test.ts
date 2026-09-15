import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import { runDoctor } from "./doctor.js";
import type { DialektConfig } from "../../config/types.js";
import type { MissingEntry } from "./missing.js";
import type { HardcodedFinding } from "../../hardcoded/types.js";

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

const missing: readonly MissingEntry[] = [
  { adapter: "laravel", locale: "de", resource: "auth", key: "login" },
];

const hardcoded: readonly HardcodedFinding[] = [
  {
    file: "src/App.tsx",
    line: 2,
    column: 10,
    endLine: 2,
    endColumn: 15,
    text: "Hello",
    kind: "jsx-text",
    language: "typescriptreact",
    confidence: 0.9,
  },
];

function flags(overrides: Partial<Parameters<typeof runDoctor>[0]> = {}) {
  return {
    config: "./dialekt.config.ts",
    adapter: Option.none(),
    baseLanguage: Option.none(),
    language: Option.none(),
    skipMissing: false,
    skipHardcoded: false,
    ...overrides,
  };
}

function run(overrides: Partial<Parameters<typeof runDoctor>[0]>, logs: string[], format?: string) {
  return runDoctor(
    { ...flags(overrides), format: format === undefined ? Option.none() : Option.some(format) },
    () => Effect.succeed(baseConfig),
    () => Effect.succeed(missing),
    () => Effect.succeed(hardcoded),
    (msg) => Effect.sync(() => logs.push(msg)),
  );
}

describe("runDoctor", () => {
  it("reports both missing keys and hardcoded strings", async () => {
    const logs: string[] = [];
    await Effect.runPromise(run({}, logs));
    const parsed = JSON.parse(logs[0] ?? "{}");
    expect(parsed.missing).toEqual(missing);
    expect(parsed.hardcoded).toEqual(hardcoded);
    expect(parsed.summary).toEqual({ missing: 1, hardcoded: 1 });
  });

  it("skips the missing-key check when asked", async () => {
    const logs: string[] = [];
    await Effect.runPromise(run({ skipMissing: true }, logs));
    const parsed = JSON.parse(logs[0] ?? "{}");
    expect(parsed.missing).toEqual([]);
    expect(parsed.hardcoded).toEqual(hardcoded);
  });

  it("skips the hardcoded scan when asked", async () => {
    const logs: string[] = [];
    await Effect.runPromise(run({ skipHardcoded: true }, logs));
    const parsed = JSON.parse(logs[0] ?? "{}");
    expect(parsed.hardcoded).toEqual([]);
    expect(parsed.missing).toEqual(missing);
  });

  it("renders a pretty report with a summary", async () => {
    const logs: string[] = [];
    await Effect.runPromise(run({}, logs, "pretty"));
    expect(logs[0]).toContain("dialekt doctor");
    expect(logs[0]).toContain("Found 1 missing key(s) and 1 hardcoded string(s).");
  });

  it("surfaces configuration failures", async () => {
    await expect(
      Effect.runPromise(
        runDoctor(
          flags(),
          () => Effect.fail(new Error("Config not found")),
          () => Effect.succeed(missing),
          () => Effect.succeed(hardcoded),
          () => Effect.void,
        ),
      ),
    ).rejects.toThrow("Config not found");
  });
});
