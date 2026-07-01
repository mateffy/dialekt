import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { summarizeBenchmarkResults, runBenchmarkedChunk } from './metrics.js';
import type { ChunkBenchmarkResult } from './metrics.js';
import type { TranslationStrategy, TranslationContext } from '../translation/types.js';
import { TranslationFailedError } from '../translation/types.js';

describe('summarizeBenchmarkResults', () => {
  it('computes totals and averages correctly', () => {
    const results = [
      { strategyName: 'one-shot' as const, chunkKeyCount: 2, durationMs: 100, attemptCount: 1, succeeded: true },
      { strategyName: 'one-shot' as const, chunkKeyCount: 2, durationMs: 200, attemptCount: 1, succeeded: true },
      { strategyName: 'one-shot' as const, chunkKeyCount: 1, durationMs: 300, attemptCount: 1, succeeded: false, errorMessage: 'oops' },
    ];
    const summary = summarizeBenchmarkResults(results);
    expect(summary.totalChunks).toBe(3);
    expect(summary.succeededChunks).toBe(2);
    expect(summary.failedChunks).toBe(1);
    expect(summary.totalDurationMs).toBe(600);
    expect(summary.averageDurationMsPerChunk).toBe(200);
    expect(summary.totalAttempts).toBe(3);
  });

  it('handles empty results', () => {
    const summary = summarizeBenchmarkResults([]);
    expect(summary.totalChunks).toBe(0);
    expect(summary.succeededChunks).toBe(0);
    expect(summary.failedChunks).toBe(0);
    expect(summary.totalDurationMs).toBe(0);
    expect(summary.averageDurationMsPerChunk).toBe(0);
    expect(summary.totalAttempts).toBe(0);
    expect(summary.strategyName).toBe('one-shot');
  });

  it('handles single result', () => {
    const results = [
      { strategyName: 'tool-loop-agent' as const, chunkKeyCount: 5, durationMs: 150, attemptCount: 2, succeeded: true },
    ];
    const summary = summarizeBenchmarkResults(results);
    expect(summary.totalChunks).toBe(1);
    expect(summary.succeededChunks).toBe(1);
    expect(summary.failedChunks).toBe(0);
    expect(summary.averageDurationMsPerChunk).toBe(150);
    expect(summary.totalAttempts).toBe(2);
  });

  it('handles all failures', () => {
    const results = [
      { strategyName: 'one-shot' as const, chunkKeyCount: 1, durationMs: 50, attemptCount: 1, succeeded: false, errorMessage: 'a' },
      { strategyName: 'one-shot' as const, chunkKeyCount: 1, durationMs: 60, attemptCount: 1, succeeded: false, errorMessage: 'b' },
    ];
    const summary = summarizeBenchmarkResults(results);
    expect(summary.succeededChunks).toBe(0);
    expect(summary.failedChunks).toBe(2);
    expect(summary.totalDurationMs).toBe(110);
  });

  it('handles zero-duration results', () => {
    const results = [
      { strategyName: 'one-shot' as const, chunkKeyCount: 1, durationMs: 0, attemptCount: 1, succeeded: true },
    ];
    const summary = summarizeBenchmarkResults(results);
    expect(summary.totalDurationMs).toBe(0);
    expect(summary.averageDurationMsPerChunk).toBe(0);
  });

  it('preserves strategyName from first result', () => {
    const results = [
      { strategyName: 'tool-loop-agent' as const, chunkKeyCount: 1, durationMs: 100, attemptCount: 1, succeeded: true },
    ];
    const summary = summarizeBenchmarkResults(results);
    expect(summary.strategyName).toBe('tool-loop-agent');
  });

  it('handles very large durations without overflow', () => {
    const results = [
      { strategyName: 'one-shot' as const, chunkKeyCount: 1, durationMs: 1_000_000, attemptCount: 1, succeeded: true },
      { strategyName: 'one-shot' as const, chunkKeyCount: 1, durationMs: 2_000_000, attemptCount: 1, succeeded: true },
    ];
    const summary = summarizeBenchmarkResults(results);
    expect(summary.totalDurationMs).toBe(3_000_000);
    expect(summary.averageDurationMsPerChunk).toBe(1_500_000);
  });
});

describe('runBenchmarkedChunk', () => {
  it('measures duration and returns success', async () => {
    const strategy: TranslationStrategy = {
      name: 'one-shot',
      translateChunk: () => Effect.succeed({ hello: 'Hallo' }),
    };
    const ctx: TranslationContext = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { hello: 'Hello' },
      targetMap: {},
      keys: ['hello'],
    };
    const result = await Effect.runPromise(runBenchmarkedChunk(strategy, ctx)) as ChunkBenchmarkResult;
    expect(result.succeeded).toBe(true);
    expect(result.chunkKeyCount).toBe(1);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.strategyName).toBe('one-shot');
  });

  it('records failure without propagating', async () => {
    const strategy: TranslationStrategy = {
      name: 'tool-loop-agent',
      translateChunk: () =>
        Effect.fail(new TranslationFailedError({ keys: ['a'], cause: 'boom' })),
    };
    const ctx: TranslationContext = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { a: 'A' },
      targetMap: {},
      keys: ['a'],
    };
    const result = await Effect.runPromise(runBenchmarkedChunk(strategy, ctx)) as ChunkBenchmarkResult;
    expect(result.succeeded).toBe(false);
    expect(result.errorMessage).toBe('boom');
    expect(result.chunkKeyCount).toBe(1);
  });

  it('handles empty key list', async () => {
    const strategy: TranslationStrategy = {
      name: 'one-shot',
      translateChunk: () => Effect.succeed({}),
    };
    const ctx: TranslationContext = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: {},
      targetMap: {},
      keys: [],
    };
    const result = await Effect.runPromise(runBenchmarkedChunk(strategy, ctx)) as ChunkBenchmarkResult;
    expect(result.succeeded).toBe(true);
    expect(result.chunkKeyCount).toBe(0);
  });

  it('measures duration for slow strategies', async () => {
    const strategy: TranslationStrategy = {
      name: 'tool-loop-agent',
      translateChunk: () =>
        Effect.gen(function* () {
          yield* Effect.sleep('50 millis');
          return { k: 'v' };
        }),
    };
    const ctx: TranslationContext = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { k: 'K' },
      targetMap: {},
      keys: ['k'],
    };
    const result = await Effect.runPromise(runBenchmarkedChunk(strategy, ctx)) as ChunkBenchmarkResult;
    expect(result.succeeded).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(30);
  });

  it('captures Error cause in errorMessage', async () => {
    const strategy: TranslationStrategy = {
      name: 'one-shot',
      translateChunk: () =>
        Effect.fail(new TranslationFailedError({ keys: ['x'], cause: new Error('deep error') })),
    };
    const ctx: TranslationContext = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { x: 'X' },
      targetMap: {},
      keys: ['x'],
    };
    const result = await Effect.runPromise(runBenchmarkedChunk(strategy, ctx)) as ChunkBenchmarkResult;
    expect(result.succeeded).toBe(false);
    expect(result.errorMessage).toContain('deep error');
  });
});
