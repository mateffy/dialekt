import { Effect } from "effect";
import type { TranslationStrategy, TranslationContext } from "../translation/types.js";
import type { StrategyBenchmarkSummary } from "./metrics.js";
import { runBenchmarkedChunk, summarizeBenchmarkResults } from "./metrics.js";

export interface BenchmarkConfig {
  readonly strategies: readonly TranslationStrategy[];
  readonly chunks: readonly TranslationContext[];
  readonly concurrency: number;
}

export function runBenchmark(
  config: BenchmarkConfig,
): Effect.Effect<readonly StrategyBenchmarkSummary[], never> {
  return Effect.gen(function* () {
    const summaries: StrategyBenchmarkSummary[] = [];
    for (const strategy of config.strategies) {
      const results = yield* Effect.forEach(
        config.chunks,
        (chunk: TranslationContext) => runBenchmarkedChunk(strategy, chunk),
        { concurrency: config.concurrency },
      );
      summaries.push(summarizeBenchmarkResults(results));
    }
    return summaries;
  });
}
