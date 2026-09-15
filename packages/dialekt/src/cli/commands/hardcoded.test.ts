import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import { runHardcoded } from "./hardcoded.js";
import type { DialektConfig } from "../../config/types.js";
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

const sample: readonly HardcodedFinding[] = [
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

describe("runHardcoded", () => {
  it("logs findings as JSON by default", async () => {
    const logs: string[] = [];
    await Effect.runPromise(
      runHardcoded(
        { config: "./dialekt.config.ts" },
        () => Effect.succeed(baseConfig),
        () => Effect.succeed(sample),
        (msg) => Effect.sync(() => logs.push(msg)),
      ),
    );
    expect(JSON.parse(logs[0] ?? "[]")).toEqual(sample);
  });

  it("renders pretty output when requested", async () => {
    const logs: string[] = [];
    await Effect.runPromise(
      runHardcoded(
        { config: "./dialekt.config.ts", format: Option.some("pretty") },
        () => Effect.succeed(baseConfig),
        () => Effect.succeed(sample),
        (msg) => Effect.sync(() => logs.push(msg)),
      ),
    );
    expect(logs[0]).toContain("src/App.tsx");
    expect(logs[0]).toContain("Hello");
  });

  it("surfaces configuration failures", async () => {
    await expect(
      Effect.runPromise(
        runHardcoded(
          { config: "./missing.ts" },
          () => Effect.fail(new Error("Config not found")),
          () => Effect.succeed([]),
          () => Effect.void,
        ),
      ),
    ).rejects.toThrow("Config not found");
  });
});
