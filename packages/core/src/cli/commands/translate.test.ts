import { describe, expect, it } from 'vitest';
import { Effect, Option } from 'effect';
import { runTranslate, translateCommand } from './translate.js';
import type { DialektConfig } from '../../config/types.js';
import type { TranslationAdapter, ResourceRef } from '../../adapter/types.js';
import type { TranslationStrategy } from '../../translation/types.js';

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

  function makeAdapter(opts: { name: string; locales?: readonly string[] }): TranslationAdapter {
    return {
      name: opts.name,
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(opts.locales ?? ['en', 'de']),
      listResources: () => Effect.succeed([]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };
  }

  it('loads config and runs translation with default model', async () => {
    const logs: string[] = [];
    let translationCalls = 0;
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

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
      () => Effect.succeed({}),
      (opts) =>
        Effect.sync(() => {
          translationCalls++;
          expect(opts.adapters).toHaveLength(1);
          expect(opts.sourceLocale).toBe('en');
        }),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(translationCalls).toBe(1);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toBe('Translation complete.');
  });

  it('uses fastModel when --fast is passed', async () => {
    let usedModel: string | undefined;
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

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
      () => Effect.succeed(config),
      (modelConfig) =>
        Effect.sync(() => {
          usedModel = modelConfig.modelId;
          return {};
        }),
      () => Effect.void,
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(usedModel).toBe('gpt-4o-mini');
  });

  it('uses default strategy from config', async () => {
    let strategy: TranslationStrategy | undefined;
    const adapter = makeAdapter({ name: 'test' });
    const config: DialektConfig = {
      ...baseConfig,
      strategy: 'tool-loop-agent',
      adapters: [adapter] as unknown as DialektConfig['adapters'],
    };

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
      () => Effect.succeed({}),
      (opts) =>
        Effect.sync(() => {
          strategy = opts.strategy;
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(strategy).toBeDefined();
    expect(strategy!.name).toBe('tool-loop-agent');
  });

  it('overrides strategy with --strategy flag', async () => {
    let strategyName: string | undefined;
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

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
      () => Effect.succeed(config),
      () => Effect.succeed({}),
      (opts) =>
        Effect.sync(() => {
          strategyName = opts.strategy.name;
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(strategyName).toBe('tool-loop-agent');
  });

  it('filters adapters by --adapter flag', async () => {
    let usedAdapterName: string | undefined;
    const a1 = makeAdapter({ name: 'a1' });
    const a2 = makeAdapter({ name: 'a2' });
    const config = { ...baseConfig, adapters: [a1, a2] as unknown as DialektConfig['adapters'] };

    const program = runTranslate(
      {
        config: './config.ts',
        adapter: Option.some('a2'),
        strategy: Option.none(),
        baseLanguage: Option.none(),
        language: Option.none(),
        name: Option.none(),
        skipNames: false,
        skipLanguages: false,
        fast: false,
      },
      () => Effect.succeed(config),
      () => Effect.succeed({}),
      (opts) =>
        Effect.sync(() => {
          usedAdapterName = (opts.adapters as TranslationAdapter[])[0]!.name;
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(usedAdapterName).toBe('a2');
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
      () => Effect.succeed({}),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Config not found');
  });

  it('fails when modelResolver fails', async () => {
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

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
      () => Effect.fail(new Error('No API key')),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('No API key');
  });

  it('fails when translationRunner fails', async () => {
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

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
      () => Effect.succeed({}),
      () => Effect.fail(new Error('Translation failed')),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Translation failed');
  });

  it('uses one-shot strategy by default', async () => {
    let strategyName: string | undefined;
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

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
      () => Effect.succeed({}),
      (opts) =>
        Effect.sync(() => {
          strategyName = opts.strategy.name;
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(strategyName).toBe('one-shot');
  });

  it('filters target locales by --language flag', async () => {
    let targetLocales: readonly string[] = [];
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

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
      () => Effect.succeed(config),
      () => Effect.succeed({}),
      (opts) =>
        Effect.sync(() => {
          targetLocales = opts.targetLocales;
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(targetLocales).toEqual(['de']);
  });

  it('outputs pretty when --format pretty is passed', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

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
        format: Option.some('pretty'),
      },
      () => Effect.succeed(config),
      () => Effect.succeed({}),
      () => Effect.void,
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('Translation complete');
  });

  it('handles empty adapters list', async () => {
    const logs: string[] = [];
    const config = { ...baseConfig, adapters: [] };

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
      () => Effect.succeed({}),
      (opts) =>
        Effect.sync(() => {
          expect(opts.adapters).toHaveLength(0);
        }),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.success).toBe(true);
  });
});
