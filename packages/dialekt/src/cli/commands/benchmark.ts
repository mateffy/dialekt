import { Command, Options } from '@effect/cli';
import { Effect, Console, Option } from 'effect';
import { loadConfig } from '../../config/load-config.js';
import { resolveEffectiveConfig } from '../config-resolution.js';
import { resolveModel } from '../../translation/model-registry.js';
import { createOneShotStrategy } from '../../translation/one-shot-strategy.js';
import { createToolLoopStrategy } from '../../translation/tool-loop-strategy.js';
import { chunkKeys } from '../../translation/chunking.js';
import { computeMissingKeys } from '../../translation/missing-keys.js';
import { runBenchmark } from '../../benchmark/runner.js';
import { detectFormat, type OutputFormat } from '../format.js';
import { formatBenchmark, formatError } from '../formatters.js';
import type { DialektConfig } from '../../config/types.js';
import type { TranslationAdapter, ResourceRef } from '../../adapter/types.js';
import type { TranslationStrategy, TranslationContext } from '../../translation/types.js';
import type { StrategyBenchmarkSummary } from '../../benchmark/metrics.js';

export interface BenchmarkFlags {
  readonly config: string;
  readonly adapter: Option.Option<string>;
  readonly strategies: Option.Option<string>;
  readonly sampleSize: Option.Option<number>;
  readonly format?: Option.Option<string>;
}

export interface BenchmarkDeps {
  readonly configLoader: (path: string) => Effect.Effect<DialektConfig, unknown>;
  readonly modelResolver: (config: { provider: string; modelId: string }) => Effect.Effect<unknown, unknown>;
  readonly missingKeysComputer: (
    adapter: TranslationAdapter,
    sourceLocale: string,
    targetLocales: readonly string[],
  ) => Effect.Effect<readonly { adapter: string; locale: string; resource: ResourceRef; missing: readonly string[] }[], unknown>;
  readonly benchmarkRunner: (opts: {
    strategies: readonly TranslationStrategy[];
    chunks: readonly TranslationContext[];
    concurrency: number;
  }) => Effect.Effect<readonly StrategyBenchmarkSummary[], unknown>;
  readonly reportFormatter?: (summaries: readonly StrategyBenchmarkSummary[], format: 'table' | 'json') => string;
  readonly logger: (msg: string) => Effect.Effect<void>;
  readonly errorLogger: (msg: string) => Effect.Effect<void>;
}

export function runBenchmarkCommand(
  flags: BenchmarkFlags,
  deps: BenchmarkDeps,
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    yield* deps.errorLogger(
      formatError(
        'Warning: This will make real API calls to the configured model provider(s) and may incur cost.',
        detectFormat(
          flags.format !== undefined
            ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
            : undefined,
        ),
      ),
    );

    const loaded = yield* deps.configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      { adapter: Option.getOrUndefined(flags.adapter) },
      loaded,
    );

    const strategyNames = Option.getOrElse(flags.strategies, () => 'one-shot,tool-loop-agent')
      .split(',')
      .map((s: string) => s.trim()) as Array<'one-shot' | 'tool-loop-agent'>;

    const model = yield* deps.modelResolver(effective.model) as Effect.Effect<import('ai').LanguageModel, unknown>;

    const strategyList = strategyNames.map((name) =>
      name === 'tool-loop-agent'
        ? createToolLoopStrategy({ model, retry: effective.retry })
        : createOneShotStrategy({ model, retry: effective.retry }),
    );

    const allChunks: TranslationContext[] = [];

    for (const a of effective.adapters) {
      const locales = yield* a.listLocales();
      const sourceLocale = effective.sourceLocale;
      const targets = locales.filter((l) => l !== sourceLocale);
      const missingEntries = yield* deps.missingKeysComputer(a, sourceLocale, targets);

      for (const entry of missingEntries) {
        const sourceMap = yield* a.readResource(sourceLocale, entry.resource);
        const targetMap = yield* a.readResource(entry.locale, entry.resource);
        const chunks = chunkKeys(entry.missing, sourceMap, targetMap, {
          maxTokens: effective.chunking.maxTokens,
          charsPerToken: effective.chunking.charsPerToken,
        });
        for (const keys of chunks) {
          allChunks.push({
            sourceLocale,
            targetLocale: entry.locale,
            sourceMap,
            targetMap,
            keys,
          });
        }
      }
    }

    const sampled = allChunks.slice(0, Option.getOrElse(flags.sampleSize, () => 20));

    const summaries = yield* deps.benchmarkRunner({
      strategies: strategyList,
      chunks: sampled,
      concurrency: effective.chunking.concurrency,
    });

    const format = detectFormat(
      flags.format !== undefined
        ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
        : undefined,
    );

    const entries = summaries.map((s) => ({
      strategyName: s.strategyName,
      totalChunks: s.totalChunks,
      succeededChunks: s.succeededChunks,
      failedChunks: s.failedChunks,
      totalDurationMs: s.totalDurationMs,
      averageDurationMsPerChunk: s.averageDurationMsPerChunk,
      totalAttempts: s.totalAttempts,
    }));

    yield* deps.logger(formatBenchmark(entries, format));
  });
}

export const benchmarkCommand = Command.make('benchmark', {
  config: Options.text('config').pipe(Options.withDefault('./dialekt.config.ts')),
  adapter: Options.optional(Options.text('adapter')),
  strategies: Options.optional(Options.text('strategies')),
  sampleSize: Options.optional(Options.integer('sample-size')),
  format: Options.optional(Options.text('format')),
}, (flags) =>
  runBenchmarkCommand(flags, {
    configLoader: loadConfig,
    modelResolver: resolveModel,
    missingKeysComputer: computeMissingKeys as unknown as BenchmarkDeps['missingKeysComputer'],
    benchmarkRunner: runBenchmark,
    logger: (msg: string) => Console.log(msg),
    errorLogger: (msg: string) => Console.error(msg),
  }),
);
