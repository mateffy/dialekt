import { describe, expect, it } from 'vitest';
import { Effect, Option } from 'effect';
import { runValidate, validateCommand } from './validate.js';
import type { DialektConfig } from '../../config/types.js';
import type { TranslationAdapter, ResourceRef } from '../../adapter/types.js';

describe('runValidate', () => {
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

  function makeAdapter(opts: {
    name: string;
    locales?: readonly string[];
    missing?: readonly { resource: ResourceRef; missing: readonly string[] }[];
  }): TranslationAdapter {
    return {
      name: opts.name,
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(opts.locales ?? ['en', 'de']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };
  }

  it('passes when no keys are missing', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runValidate(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      () => Effect.succeed([]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toContain('All translations up to date.');
  });

  it('fails with Error when missing keys are found', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };
    const resource: ResourceRef = { key: 'messages', label: 'messages' };

    const program = runValidate(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      () => Effect.succeed([{ adapter: 'test', locale: 'de', resource, missing: ['hello'] }]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Missing keys found');
    expect(logs.some((l) => l.includes('test/de/messages: 1 missing'))).toBe(true);
  });

  it('reports missing keys for multiple adapters', async () => {
    const logs: string[] = [];
    const a1 = makeAdapter({ name: 'a1' });
    const a2 = makeAdapter({ name: 'a2' });
    const config = { ...baseConfig, adapters: [a1, a2] as unknown as DialektConfig['adapters'] };
    const resource: ResourceRef = { key: 'messages', label: 'messages' };

    const program = runValidate(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      (a) =>
        Effect.succeed([
          { adapter: a.name, locale: 'de', resource, missing: ['k1'] },
        ]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Missing keys found');
    expect(logs).toHaveLength(2);
  });

  it('filters adapters by --adapter flag', async () => {
    const logs: string[] = [];
    const a1 = makeAdapter({ name: 'a1' });
    const a2 = makeAdapter({ name: 'a2' });
    const config = { ...baseConfig, adapters: [a1, a2] as unknown as DialektConfig['adapters'] };
    let queriedAdapter: string | undefined;

    const program = runValidate(
      { config: './config.ts', adapter: Option.some('a2'), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      (a) =>
        Effect.sync(() => {
          queriedAdapter = a.name;
          return [];
        }),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(queriedAdapter).toBe('a2');
  });

  it('overrides sourceLocale with --base-language', async () => {
    let usedSource: string | undefined;
    const adapter = makeAdapter({ name: 'test', locales: ['fr', 'de'] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runValidate(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.some('fr'), language: Option.none() },
      () => Effect.succeed(config),
      (_a, sourceLocale, _targets) =>
        Effect.sync(() => {
          usedSource = sourceLocale;
          return [];
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(usedSource).toBe('fr');
  });

  it('limits target locales with --language flag', async () => {
    let usedTargets: readonly string[] | undefined;
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runValidate(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.some('de') },
      () => Effect.succeed(config),
      (_a, _s, targets) =>
        Effect.sync(() => {
          usedTargets = targets;
          return [];
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(usedTargets).toEqual(['de']);
  });

  it('fails when configLoader fails', async () => {
    const program = runValidate(
      { config: './missing.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.fail(new Error('Config not found')),
      () => Effect.succeed([]),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Config not found');
  });

  it('fails when adapter listLocales fails', async () => {
    const adapter: TranslationAdapter = {
      name: 'broken',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.fail(new Error('disk error') as never),
      listResources: () => Effect.succeed([]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runValidate(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      () => Effect.succeed([]),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('disk error');
  });

  it('handles empty adapter list', async () => {
    const logs: string[] = [];
    const config = { ...baseConfig, adapters: [] };

    const program = runValidate(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      () => Effect.succeed([]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toContain('All translations up to date.');
  });

  it('handles adapter with only source locale (no targets)', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'mono', locales: ['en'] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runValidate(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      () => Effect.succeed([]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toContain('All translations up to date.');
  });
});
