import { describe, expect, it } from 'vitest';
import { formatBenchmarkReport } from './report.js';
import type { StrategyBenchmarkSummary } from './metrics.js';

describe('formatBenchmarkReport', () => {
  it('produces valid JSON round-trip', () => {
    const summaries: StrategyBenchmarkSummary[] = [
      {
        strategyName: 'one-shot',
        totalChunks: 3,
        succeededChunks: 3,
        failedChunks: 0,
        totalDurationMs: 300,
        averageDurationMsPerChunk: 100,
        totalAttempts: 3,
      },
    ];
    const json = formatBenchmarkReport(summaries, 'json');
    expect(JSON.parse(json)).toEqual(summaries);
  });

  it('produces human-readable table with key metrics', () => {
    const summaries: StrategyBenchmarkSummary[] = [
      {
        strategyName: 'one-shot',
        totalChunks: 3,
        succeededChunks: 3,
        failedChunks: 0,
        totalDurationMs: 300,
        averageDurationMsPerChunk: 100,
        totalAttempts: 3,
      },
    ];
    const table = formatBenchmarkReport(summaries, 'table');
    expect(table).toContain('one-shot');
    expect(table).toContain('300');
    expect(table).toContain('100.0');
    expect(table).toContain('3');
  });

  it('handles multiple strategies in table format', () => {
    const summaries: StrategyBenchmarkSummary[] = [
      {
        strategyName: 'one-shot',
        totalChunks: 5,
        succeededChunks: 5,
        failedChunks: 0,
        totalDurationMs: 500,
        averageDurationMsPerChunk: 100,
        totalAttempts: 5,
      },
      {
        strategyName: 'tool-loop-agent',
        totalChunks: 5,
        succeededChunks: 4,
        failedChunks: 1,
        totalDurationMs: 750,
        averageDurationMsPerChunk: 150,
        totalAttempts: 6,
      },
    ];
    const table = formatBenchmarkReport(summaries, 'table');
    expect(table).toContain('one-shot');
    expect(table).toContain('tool-loop-agent');
    expect(table).toContain('4 ok, 1 failed');
  });

  it('handles empty summaries in JSON format', () => {
    const json = formatBenchmarkReport([], 'json');
    expect(JSON.parse(json)).toEqual([]);
  });

  it('handles empty summaries in table format', () => {
    const table = formatBenchmarkReport([], 'table');
    expect(table).toContain('Benchmark Results');
  });

  it('handles all-failed strategy in table', () => {
    const summaries: StrategyBenchmarkSummary[] = [
      {
        strategyName: 'one-shot',
        totalChunks: 3,
        succeededChunks: 0,
        failedChunks: 3,
        totalDurationMs: 300,
        averageDurationMsPerChunk: 100,
        totalAttempts: 3,
      },
    ];
    const table = formatBenchmarkReport(summaries, 'table');
    expect(table).toContain('0 ok, 3 failed');
  });

  it('handles zero-duration strategy', () => {
    const summaries: StrategyBenchmarkSummary[] = [
      {
        strategyName: 'one-shot',
        totalChunks: 1,
        succeededChunks: 1,
        failedChunks: 0,
        totalDurationMs: 0,
        averageDurationMsPerChunk: 0,
        totalAttempts: 1,
      },
    ];
    const table = formatBenchmarkReport(summaries, 'table');
    expect(table).toContain('0ms');
    expect(table).toContain('0.0ms');
  });

  it('JSON format includes all numeric fields', () => {
    const summaries: StrategyBenchmarkSummary[] = [
      {
        strategyName: 'tool-loop-agent',
        totalChunks: 2,
        succeededChunks: 1,
        failedChunks: 1,
        totalDurationMs: 1234,
        averageDurationMsPerChunk: 617,
        totalAttempts: 4,
      },
    ];
    const json = formatBenchmarkReport(summaries, 'json');
    const parsed = JSON.parse(json) as StrategyBenchmarkSummary[];
    expect(parsed[0]!.totalChunks).toBe(2);
    expect(parsed[0]!.totalAttempts).toBe(4);
    expect(parsed[0]!.averageDurationMsPerChunk).toBe(617);
  });
});
