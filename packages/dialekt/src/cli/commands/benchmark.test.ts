import { describe, expect, it } from 'vitest';
import { Effect, Option } from 'effect';
import { runBenchmarkCommand, benchmarkCommand } from './benchmark.js';
import type { DialektConfig } from '../../config/types.js';
import type { TranslationAdapter, ResourceRef } from '../../adapter/types.js';
import type { TranslationStrategy, TranslationContext } from '../../translation/types.js';
import type { StrategyBenchmarkSummary } from '../../benchmark/metrics.js';

describe('runBenchmarkCommand', () => {
  const baseConfig: DialektConfig = {
    sourceLocale: 'en',
    targetLocales: ['de'],
    strategy: 'one-shot',
    model: { provider: 'openai', modelId: 'gpt-4o' },
    fastModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
    chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    adapters: [],
  };

  function makeAdapter(opts: {
    name: string;
    locales?: readonly string[];
    resources?: readonly ResourceRef[];
    sourceMap?: Record<string, string>;
    targetMap?: Record<string, string>;
    missing?: readonly string[];
  }): TranslationAdapter {
    return {
      name: opts.name,
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(opts.locales ?? ['en', 'de']),
      listResources: () => Effect.succeed(opts.resources ?? [{ key: 'messages', label: 'messages' }]),
      readResource: (_locale: string) =>
        Effect.succeed(_locale === 'en' ? (opts.sourceMap ?? {}) : (opts.targetMap ?? {})),
      writeResource: () => Effect.void,
    };
  }

  function makeDeps(
    overrides?: Partial<Parameters<typeof runBenchmarkCommand>[1]>,
  ): Parameters<typeof runBenchmarkCommand>[1] {
    return {
      configLoader: () => Effect.succeed(baseConfig),
      modelResolver: () => Effect.succeed({} as unknown),
      missingKeysComputer: () =>
        Effect.succeed([{ adapter: 'test', locale: 'de', resource: { key: 'messages', label: 'messages' } as ResourceRef, missing: ['hello'] as readonly string[] }]),
      benchmarkRunner: () =>
        Effect.succeed([
          {
            strategyName: 'one-shot',
            totalChunks: 1,
            succeededChunks: 1,
            failedChunks: 0,
            totalDurationMs: 100,
            averageDurationMsPerChunk: 100,
            totalAttempts: 1,
          } as StrategyBenchmarkSummary,
        ]),
      logger: () => Effect.void,
      errorLogger: () => Effect.void,
      ...overrides,
    };
  }

  it('logs a cost warning', async () => {
    const errors: string[] = [];
    const deps = makeDeps({
      errorLogger: (msg) => Effect.sync(() => errors.push(msg)),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.none(),
      },
      deps,
    );

    await Effect.runPromise(program);
    expect(errors.some((e) => e.includes('Warning') && e.includes('cost'))).toBe(true);
  });

  it('uses default strategies when none specified', async () => {
    let usedStrategies: readonly string[] | undefined;
    const deps = makeDeps({
      benchmarkRunner: (opts) =>
        Effect.sync(() => {
          usedStrategies = opts.strategies.map((s) => s.name);
          return [];
        }),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.none(),
      },
      deps,
    );

    await Effect.runPromise(program);
    expect(usedStrategies).toEqual(['one-shot', 'tool-loop-agent']);
  });

  it('uses custom strategies when --strategies is passed', async () => {
    let usedStrategies: readonly string[] | undefined;
    const deps = makeDeps({
      benchmarkRunner: (opts) =>
        Effect.sync(() => {
          usedStrategies = opts.strategies.map((s) => s.name);
          return [];
        }),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.some('tool-loop-agent'),
        sampleSize: Option.none(),
      },
      deps,
    );

    await Effect.runPromise(program);
    expect(usedStrategies).toEqual(['tool-loop-agent']);
  });

  it('limits sample size with --sample-size', async () => {
    let usedChunks: readonly TranslationContext[] | undefined;
    const adapter = makeAdapter({
      name: 'test',
      sourceMap: { a: 'A', b: 'B', c: 'C' },
      targetMap: {},
    });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };
    const deps = makeDeps({
      configLoader: () => Effect.succeed(config),
      benchmarkRunner: (opts) =>
        Effect.sync(() => {
          usedChunks = opts.chunks;
          return [];
        }),
      missingKeysComputer: () =>
        Effect.succeed([
          { adapter: 'test', locale: 'de', resource: { key: 'messages', label: 'messages' } as ResourceRef, missing: ['a', 'b', 'c'] as readonly string[] },
        ]),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.some(1),
      },
      deps,
    );

    await Effect.runPromise(program);
    expect(usedChunks).toHaveLength(1);
  });

  it('outputs JSON report when --format json is passed', async () => {
    const logs: string[] = [];
    const deps = makeDeps({
      logger: (msg) => Effect.sync(() => logs.push(msg)),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.none(),
        format: Option.some('json'),
      },
      deps,
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed[0]).toMatchObject({ strategyName: 'one-shot' });
  });

  it('outputs benchmark data by default', async () => {
    const logs: string[] = [];
    const deps = makeDeps({
      logger: (msg) => Effect.sync(() => logs.push(msg)),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.none(),
      },
      deps,
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toBeInstanceOf(Array);
  });

  it('filters adapters by --adapter flag', async () => {
    let queriedAdapter: string | undefined;
    const a1 = makeAdapter({ name: 'a1' });
    const a2 = makeAdapter({ name: 'a2' });
    const config = { ...baseConfig, adapters: [a1, a2] as unknown as DialektConfig['adapters'] };
    const deps = makeDeps({
      configLoader: () => Effect.succeed(config),
      missingKeysComputer: (a) =>
        Effect.sync(() => {
          queriedAdapter = a.name;
          return [];
        }),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.some('a2'),
        strategies: Option.none(),
        sampleSize: Option.none(),
      },
      deps,
    );

    await Effect.runPromise(program);
    expect(queriedAdapter).toBe('a2');
  });

  it('fails when configLoader fails', async () => {
    const deps = makeDeps({
      configLoader: () => Effect.fail(new Error('Config not found')),
    });

    const program = runBenchmarkCommand(
      {
        config: './missing.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.none(),
      },
      deps,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Config not found');
  });

  it('fails when modelResolver fails', async () => {
    const deps = makeDeps({
      modelResolver: () => Effect.fail(new Error('Model unavailable')),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.none(),
      },
      deps,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Model unavailable');
  });

  it('fails when benchmarkRunner fails', async () => {
    const deps = makeDeps({
      benchmarkRunner: () => Effect.fail(new Error('Benchmark crashed')),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.none(),
      },
      deps,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Benchmark crashed');
  });

  it('handles empty adapter list', async () => {
    const logs: string[] = [];
    const config = { ...baseConfig, adapters: [] };
    const deps = makeDeps({
      configLoader: () => Effect.succeed(config),
      benchmarkRunner: () => Effect.succeed([]),
      logger: (msg) => Effect.sync(() => logs.push(msg)),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.none(),
      },
      deps,
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toEqual([]);
  });

  it('handles adapter with no missing keys', async () => {
    let usedChunks: readonly TranslationContext[] | undefined;
    const deps = makeDeps({
      missingKeysComputer: () => Effect.succeed([]),
      benchmarkRunner: (opts) =>
        Effect.sync(() => {
          usedChunks = opts.chunks;
          return [];
        }),
    });

    const program = runBenchmarkCommand(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategies: Option.none(),
        sampleSize: Option.none(),
      },
      deps,
    );

    await Effect.runPromise(program);
    expect(usedChunks).toHaveLength(0);
  });
});
