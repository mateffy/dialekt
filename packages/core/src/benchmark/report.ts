import type { StrategyBenchmarkSummary } from './metrics.js';

export function formatBenchmarkReport(
  summaries: readonly StrategyBenchmarkSummary[],
  format: 'table' | 'json',
): string {
  if (format === 'json') {
    return JSON.stringify(summaries, null, 2);
  }

  const lines: string[] = ['Benchmark Results', '================='];
  for (const s of summaries) {
    lines.push(`Strategy: ${s.strategyName}`);
    lines.push(`  Chunks: ${s.totalChunks} (${s.succeededChunks} ok, ${s.failedChunks} failed)`);
    lines.push(`  Total duration: ${s.totalDurationMs.toFixed(0)}ms`);
    lines.push(`  Avg per chunk: ${s.averageDurationMsPerChunk.toFixed(1)}ms`);
    lines.push(`  Total attempts: ${s.totalAttempts}`);
    lines.push('');
  }
  return lines.join('\n');
}
