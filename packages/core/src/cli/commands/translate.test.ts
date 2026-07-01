import { describe, expect, it, vi } from 'vitest';
import { Effect, Option } from 'effect';
import { runTranslate, translateCommand } from './translate.js';
import type { DialektConfig } from '../../config/types.js';

describe('runTranslate', () => {
  const baseConfig: DialektConfig = {
    sourceLocale: 'en',
    targetLocales: ['de', 'fr'],
    strategy: 'one-shot',
    model: { provider: 'openai', modelId: 'gpt-4o' },
    fastModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
    chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    retry: { maxAttempts: 3, baseDelayMs: 1000 },
    adapters: [],
  };

  it('loads config and runs translation with default model', async () => {
    const logs: string[] = [];
    const translationCalls: unknown[] = [];

    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(baseConfig),
      () => Effect.succeed({} as unknown),
      (opts) =>
        Effect.sync(() => {
          translationCalls.push(opts);
        }),
      (msg) =>
        Effect.sync(() => {
          logs.push(msg);
        }),
    );

    await Effect.runPromise(program);
    expect(translationCalls).toHaveLength(1);
    expect(logs).toContain('Translation complete.');
  });

  it('uses fastModel when --fast is passed', async () => {
    let resolvedModel: unknown;

    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: true,
      },
      () => Effect.succeed(baseConfig),
      (config) =>
        Effect.sync(() => {
          resolvedModel = config;
          return {};
        }),
      () => Effect.void,
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(resolvedModel).toEqual(baseConfig.fastModel);
  });

  it('overrides strategy with --strategy flag', async () => {
    let usedStrategy: string | undefined;

    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.some('tool-loop-agent'),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(baseConfig),
      () => Effect.succeed({} as unknown),
      (opts) =>
        Effect.sync(() => {
          usedStrategy = (opts.strategy as { name: string }).name;
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(usedStrategy).toBe('tool-loop-agent');
  });

  it('overrides sourceLocale with --base-language flag', async () => {
    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.none(),
        baseLanguage: Option.some('fr'),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(baseConfig),
      () => Effect.succeed({} as unknown),
      (opts) =>
        Effect.sync(() => {
          expect(opts.sourceLocale).toBe('fr');
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
  });

  it('filters adapters by --adapter flag', async () => {
    const adapterA = { name: 'a', capabilities: { canCreateResource: true, unusedKeyDetection: false }, listLocales: () => Effect.void as unknown as Effect.Effect<string[], never>, listResources: () => Effect.void as unknown as Effect.Effect<{ key: string; label: string }[], never>, readResource: () => Effect.void as unknown as Effect.Effect<Record<string, string>, never>, writeResource: () => Effect.void };
    const adapterB = { name: 'b', capabilities: { canCreateResource: true, unusedKeyDetection: false }, listLocales: () => Effect.void as unknown as Effect.Effect<string[], never>, listResources: () => Effect.void as unknown as Effect.Effect<{ key: string; label: string }[], never>, readResource: () => Effect.void as unknown as Effect.Effect<Record<string, string>, never>, writeResource: () => Effect.void };
    const config = { ...baseConfig, adapters: [adapterA, adapterB] as unknown as DialektConfig['adapters'] };

    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.some('b'),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(config),
      () => Effect.succeed({} as unknown),
      (opts) =>
        Effect.sync(() => {
          expect(opts.adapters).toHaveLength(1);
          expect((opts.adapters[0] as { name: string }).name).toBe('b');
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
  });

  it('fails when configLoader fails', async () => {
    const program = runTranslate(
      {
        config: './missing.ts',
        adapter: Option.none(),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.fail(new Error('Config not found')),
      () => Effect.succeed({} as unknown),
      () => Effect.void,
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Config not found');
  });

  it('fails when modelResolver fails', async () => {
    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(baseConfig),
      () => Effect.fail(new Error('Model unavailable')),
      () => Effect.void,
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Model unavailable');
  });

  it('fails when translationRunner fails', async () => {
    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(baseConfig),
      () => Effect.succeed({} as unknown),
      () => Effect.fail(new Error('Translation failed')),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Translation failed');
  });

  it('ignores invalid strategy values and falls back to config', async () => {
    let usedStrategy: string | undefined;

    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.some('invalid-strategy'),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(baseConfig),
      () => Effect.succeed({} as unknown),
      (opts) =>
        Effect.sync(() => {
          usedStrategy = (opts.strategy as { name: string }).name;
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(usedStrategy).toBe('one-shot');
  });

  it('limits targetLocales with --language flag', async () => {
    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.some('de'),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(baseConfig),
      () => Effect.succeed({} as unknown),
      (opts) =>
        Effect.sync(() => {
          expect(opts.targetLocales).toEqual(['de']);
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
  });

  it('handles empty targetLocales gracefully', async () => {
    const config = { ...baseConfig, targetLocales: [] };
    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(config),
      () => Effect.succeed({} as unknown),
      (opts) =>
        Effect.sync(() => {
          expect(opts.targetLocales).toEqual([]);
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
  });

  it('handles empty adapters list', async () => {
    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.none(),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(baseConfig),
      () => Effect.succeed({} as unknown),
      (opts) =>
        Effect.sync(() => {
          expect(opts.adapters).toHaveLength(0);
        }),
      (msg) => Effect.sync(() => expect(msg).toBe('Translation complete.')),
    );

    await Effect.runPromise(program);
  });
});
