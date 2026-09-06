import { Effect } from "effect";
import type { TranslationStrategy, TranslationContext } from "../translation/types.js";

export interface ChunkBenchmarkResult {
  readonly strategyName: "one-shot" | "tool-loop-agent";
  readonly chunkKeyCount: number;
  readonly durationMs: number;
  readonly attemptCount: number;
  readonly succeeded: boolean;
  readonly errorMessage?: string | undefined;
  readonly promptTokens?: number;
  readonly completionTokens?: number;
}

export interface StrategyBenchmarkSummary {
  readonly strategyName: "one-shot" | "tool-loop-agent";
  readonly totalChunks: number;
  readonly succeededChunks: number;
  readonly failedChunks: number;
  readonly totalDurationMs: number;
  readonly averageDurationMsPerChunk: number;
  readonly totalAttempts: number;
  readonly totalPromptTokens?: number;
  readonly totalCompletionTokens?: number;
  /** Estimated cost in USD using OpenRouter DeepSeek pricing. */
  readonly estimatedCostUsd?: number;
}

// OpenRouter DeepSeek v4 Flash pricing per 1M tokens
const DEEPSEEK_INPUT_PRICE = 0.4; // $0.40 per 1M input tokens
const DEEPSEEK_OUTPUT_PRICE = 0.6; // $0.60 per 1M output tokens

export function summarizeBenchmarkResults(
  results: readonly ChunkBenchmarkResult[],
): StrategyBenchmarkSummary {
  const totalChunks = results.length;
  const succeededChunks = results.filter((r) => r.succeeded).length;
  const failedChunks = totalChunks - succeededChunks;
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const totalAttempts = results.reduce((sum, r) => sum + r.attemptCount, 0);
  const totalPromptTokens = results.reduce((sum, r) => sum + (r.promptTokens ?? 0), 0);
  const totalCompletionTokens = results.reduce((sum, r) => sum + (r.completionTokens ?? 0), 0);
  const estimatedCostUsd =
    (totalPromptTokens / 1_000_000) * DEEPSEEK_INPUT_PRICE +
    (totalCompletionTokens / 1_000_000) * DEEPSEEK_OUTPUT_PRICE;
  return {
    strategyName: results[0]?.strategyName ?? "one-shot",
    totalChunks,
    succeededChunks,
    failedChunks,
    totalDurationMs,
    averageDurationMsPerChunk: totalChunks > 0 ? totalDurationMs / totalChunks : 0,
    totalAttempts,
    totalPromptTokens,
    totalCompletionTokens,
    estimatedCostUsd,
  };
}

let _globalUsage: { promptTokens: number; completionTokens: number } | null = null;

export function setChunkUsage(u: { promptTokens: number; completionTokens: number }): void {
  _globalUsage = u;
}

export function consumeChunkUsage(): { promptTokens: number; completionTokens: number } {
  const u = _globalUsage ?? { promptTokens: 0, completionTokens: 0 };
  _globalUsage = null;
  return u;
}

export function runBenchmarkedChunk(
  strategy: TranslationStrategy,
  ctx: TranslationContext,
): Effect.Effect<ChunkBenchmarkResult, never> {
  return Effect.gen(function* () {
    const start = Date.now();
    const result = yield* Effect.either(strategy.translateChunk(ctx));
    const durationMs = Date.now() - start;
    const usage = consumeChunkUsage();
    if (result._tag === "Right") {
      return {
        strategyName: strategy.name,
        chunkKeyCount: ctx.keys.length,
        durationMs,
        attemptCount: 1,
        succeeded: true as const,
        errorMessage: undefined,
        ...(usage.promptTokens > 0
          ? { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens }
          : {}),
      };
    }
    return {
      strategyName: strategy.name,
      chunkKeyCount: ctx.keys.length,
      durationMs,
      attemptCount: 1,
      succeeded: false as const,
      errorMessage: String((result.left as { cause?: unknown }).cause),
      ...(usage.promptTokens > 0
        ? { promptTokens: usage.promptTokens, completionTokens: usage.completionTokens }
        : {}),
    };
  });
}
