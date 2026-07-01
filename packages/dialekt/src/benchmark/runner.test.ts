import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { runBenchmark } from "./runner.js";
import type { StrategyBenchmarkSummary } from "./metrics.js";
import type { TranslationStrategy, TranslationContext } from "../translation/types.js";
import { TranslationFailedError } from "../translation/types.js";

describe("runBenchmark", () => {
  it("returns summaries for both strategies", async () => {
    const a: TranslationStrategy = {
      name: "one-shot",
      translateChunk: () => Effect.succeed({ k: "a" }),
    };
    const b: TranslationStrategy = {
      name: "tool-loop-agent",
      translateChunk: () => Effect.succeed({ k: "b" }),
    };
    const chunks: TranslationContext[] = [
      {
        sourceLocale: "en",
        targetLocale: "de",
        sourceMap: { k: "K" },
        targetMap: {},
        keys: ["k"],
      },
    ];
    const result = (await Effect.runPromise(
      runBenchmark({ strategies: [a, b], chunks, concurrency: 1 }),
    )) as StrategyBenchmarkSummary[];
    expect(result).toHaveLength(2);
    expect(result[0]!.strategyName).toBe("one-shot");
    expect(result[1]!.strategyName).toBe("tool-loop-agent");
  });

  it("does not abort when one strategy fails every chunk", async () => {
    const a: TranslationStrategy = {
      name: "one-shot",
      translateChunk: () => Effect.succeed({ k: "a" }),
    };
    const b: TranslationStrategy = {
      name: "tool-loop-agent",
      translateChunk: () => Effect.fail(new TranslationFailedError({ keys: ["k"], cause: "boom" })),
    };
    const chunks: TranslationContext[] = [
      {
        sourceLocale: "en",
        targetLocale: "de",
        sourceMap: { k: "K" },
        targetMap: {},
        keys: ["k"],
      },
    ];
    const result = (await Effect.runPromise(
      runBenchmark({ strategies: [a, b], chunks, concurrency: 1 }),
    )) as StrategyBenchmarkSummary[];
    expect(result[0]!.succeededChunks).toBe(1);
    expect(result[1]!.failedChunks).toBe(1);
  });

  it("handles empty chunks", async () => {
    const a: TranslationStrategy = {
      name: "one-shot",
      translateChunk: () => Effect.succeed({}),
    };
    const result = (await Effect.runPromise(
      runBenchmark({ strategies: [a], chunks: [], concurrency: 1 }),
    )) as StrategyBenchmarkSummary[];
    expect(result).toHaveLength(1);
    expect(result[0]!.totalChunks).toBe(0);
    expect(result[0]!.succeededChunks).toBe(0);
  });

  it("handles single strategy", async () => {
    const a: TranslationStrategy = {
      name: "one-shot",
      translateChunk: () => Effect.succeed({ a: "A", b: "B" }),
    };
    const chunks: TranslationContext[] = [
      {
        sourceLocale: "en",
        targetLocale: "de",
        sourceMap: { a: "A", b: "B" },
        targetMap: {},
        keys: ["a", "b"],
      },
    ];
    const result = (await Effect.runPromise(
      runBenchmark({ strategies: [a], chunks, concurrency: 1 }),
    )) as StrategyBenchmarkSummary[];
    expect(result).toHaveLength(1);
    expect(result[0]!.totalChunks).toBe(1);
    expect(result[0]!.succeededChunks).toBe(1);
  });

  it("handles multiple chunks with concurrency", async () => {
    const a: TranslationStrategy = {
      name: "one-shot",
      translateChunk: () => Effect.succeed({ k: "v" }),
    };
    const chunks: TranslationContext[] = Array.from({ length: 5 }, (_, i) => ({
      sourceLocale: "en",
      targetLocale: "de",
      sourceMap: { [`k${i}`]: `V${i}` },
      targetMap: {},
      keys: [`k${i}`],
    }));
    const result = (await Effect.runPromise(
      runBenchmark({ strategies: [a], chunks, concurrency: 3 }),
    )) as StrategyBenchmarkSummary[];
    expect(result[0]!.totalChunks).toBe(5);
    expect(result[0]!.succeededChunks).toBe(5);
  });

  it("handles all strategies failing", async () => {
    const a: TranslationStrategy = {
      name: "one-shot",
      translateChunk: () => Effect.fail(new TranslationFailedError({ keys: ["k"], cause: "fail" })),
    };
    const chunks: TranslationContext[] = [
      {
        sourceLocale: "en",
        targetLocale: "de",
        sourceMap: { k: "K" },
        targetMap: {},
        keys: ["k"],
      },
    ];
    const result = (await Effect.runPromise(
      runBenchmark({ strategies: [a], chunks, concurrency: 1 }),
    )) as StrategyBenchmarkSummary[];
    expect(result[0]!.failedChunks).toBe(1);
    expect(result[0]!.succeededChunks).toBe(0);
  });

  it("handles mixed success and failure across chunks", async () => {
    let callCount = 0;
    const a: TranslationStrategy = {
      name: "one-shot",
      translateChunk: () => {
        callCount++;
        return callCount % 2 === 1
          ? Effect.succeed({ k: "v" })
          : Effect.fail(new TranslationFailedError({ keys: ["k"], cause: "odd" }));
      },
    };
    const chunks: TranslationContext[] = Array.from({ length: 4 }, () => ({
      sourceLocale: "en",
      targetLocale: "de",
      sourceMap: { k: "K" },
      targetMap: {},
      keys: ["k"],
    }));
    const result = (await Effect.runPromise(
      runBenchmark({ strategies: [a], chunks, concurrency: 1 }),
    )) as StrategyBenchmarkSummary[];
    expect(result[0]!.totalChunks).toBe(4);
    expect(result[0]!.succeededChunks).toBe(2);
    expect(result[0]!.failedChunks).toBe(2);
  });
});
