import { Effect } from 'effect';
import type { TranslationStrategy, TranslationContext } from '../translation/types.js';

export interface ChunkBenchmarkResult {
  readonly strategyName: 'one-shot' | 'tool-loop-agent';
  readonly chunkKeyCount: number;
  readonly durationMs: number;
  readonly attemptCount: number;
  readonly succeeded: boolean;
  readonly errorMessage?: string | undefined;
}

export interface StrategyBenchmarkSummary {
  readonly strategyName: 'one-shot' | 'tool-loop-agent';
  readonly totalChunks: number;
  readonly succeededChunks: number;
  readonly failedChunks: number;
  readonly totalDurationMs: number;
  readonly averageDurationMsPerChunk: number;
  readonly totalAttempts: number;
}

export function summarizeBenchmarkResults(
  results: readonly ChunkBenchmarkResult[],
): StrategyBenchmarkSummary {
  const totalChunks = results.length;
  const succeededChunks = results.filter((r) => r.succeeded).length;
  const failedChunks = totalChunks - succeededChunks;
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const totalAttempts = results.reduce((sum, r) => sum + r.attemptCount, 0);
  return {
    strategyName: results[0]?.strategyName ?? 'one-shot',
    totalChunks,
    succeededChunks,
    failedChunks,
    totalDurationMs,
    averageDurationMsPerChunk: totalChunks > 0 ? totalDurationMs / totalChunks : 0,
    totalAttempts,
  };
}

export function runBenchmarkedChunk(
  strategy: TranslationStrategy,
  ctx: TranslationContext,
): Effect.Effect<ChunkBenchmarkResult, never> {
  return Effect.gen(function* () {
    const start = Date.now();
    const result = yield* Effect.either(strategy.translateChunk(ctx));
    const durationMs = Date.now() - start;
    if (result._tag === 'Right') {
      return {
        strategyName: strategy.name,
        chunkKeyCount: ctx.keys.length,
        durationMs,
        attemptCount: 1,
        succeeded: true as const,
        errorMessage: undefined,
      };
    }
    return {
      strategyName: strategy.name,
      chunkKeyCount: ctx.keys.length,
      durationMs,
      attemptCount: 1,
      succeeded: false as const,
      errorMessage: String((result.left as { cause?: unknown }).cause),
    };
  });
}
