import { describe, expect, it } from 'vitest';
import { Effect, Option } from 'effect';
import { runMissing, missingCommand } from './missing.js';
import type { DialektConfig } from '../../config/types.js';
import type { TranslationAdapter, ResourceRef } from '../../adapter/types.js';

describe('runMissing', () => {
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

  it('logs missing keys in default format', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };
    const resource: ResourceRef = { key: 'messages', label: 'messages' };

    const program = runMissing(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      () =>
        Effect.succeed([
          { adapter: 'test', locale: 'de', resource, missing: ['hello', 'bye'] },
        ]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toEqual([
      { adapter: 'test', locale: 'de', resource: 'messages', key: 'hello' },
      { adapter: 'test', locale: 'de', resource: 'messages', key: 'bye' },
    ]);
  });

  it('outputs JSON when --format json is passed', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };
    const resource: ResourceRef = { key: 'messages', label: 'messages' };

    const program = runMissing(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none(), format: Option.some('json') },
      () => Effect.succeed(config),
      () =>
        Effect.succeed([
          { adapter: 'test', locale: 'de', resource, missing: ['hello'] },
        ]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toEqual([
      { adapter: 'test', locale: 'de', resource: 'messages', key: 'hello' },
    ]);
  });

  it('outputs pretty when --format pretty is passed', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };
    const resource: ResourceRef = { key: 'messages', label: 'messages' };

    const program = runMissing(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none(), format: Option.some('pretty') },
      () => Effect.succeed(config),
      () =>
        Effect.succeed([
          { adapter: 'test', locale: 'de', resource, missing: ['hello', 'bye'] },
        ]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('test');
    expect(logs[0]).toContain('de');
    expect(logs[0]).toContain('hello');
    expect(logs[0]).toContain('bye');
  });

  it('returns empty JSON array when nothing is missing', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runMissing(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      () => Effect.succeed([]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toEqual([]);
  });

  it('handles multiple adapters and multiple locales', async () => {
    const logs: string[] = [];
    const a1 = makeAdapter({ name: 'a1' });
    const a2 = makeAdapter({ name: 'a2', locales: ['en', 'fr'] });
    const config = { ...baseConfig, adapters: [a1, a2] as unknown as DialektConfig['adapters'] };
    const resource: ResourceRef = { key: 'messages', label: 'messages' };

    const program = runMissing(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      (a) =>
        Effect.succeed([
          { adapter: a.name, locale: a.name === 'a1' ? 'de' : 'fr', resource, missing: ['k1'] },
        ]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toHaveLength(2);
    expect(parsed).toContainEqual({ adapter: 'a1', locale: 'de', resource: 'messages', key: 'k1' });
    expect(parsed).toContainEqual({ adapter: 'a2', locale: 'fr', resource: 'messages', key: 'k1' });
  });

  it('filters adapters by --adapter flag', async () => {
    let queriedAdapter: string | undefined;
    const a1 = makeAdapter({ name: 'a1' });
    const a2 = makeAdapter({ name: 'a2' });
    const config = { ...baseConfig, adapters: [a1, a2] as unknown as DialektConfig['adapters'] };

    const program = runMissing(
      { config: './config.ts', adapter: Option.some('a2'), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      (a) =>
        Effect.sync(() => {
          queriedAdapter = a.name;
          return [];
        }),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    expect(queriedAdapter).toBe('a2');
  });

  it('fails when configLoader fails', async () => {
    const program = runMissing(
      { config: './missing.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.fail(new Error('Config not found')),
      () => Effect.succeed([]),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Config not found');
  });

  it('fails when listLocales fails', async () => {
    const adapter: TranslationAdapter = {
      name: 'broken',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.fail(new Error('disk error') as never),
      listResources: () => Effect.succeed([]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runMissing(
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

    const program = runMissing(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      () => Effect.succeed([]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toEqual([]);
  });

  it('handles single-locale adapter (no targets)', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'mono', locales: ['en'] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runMissing(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none() },
      () => Effect.succeed(config),
      () => Effect.succeed([]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(JSON.parse(logs[0]!)).toEqual([]);
  });

  it('produces valid JSON array even with many entries', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'test' });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };
    const resource: ResourceRef = { key: 'messages', label: 'messages' };

    const program = runMissing(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none(), language: Option.none(), format: Option.some('json') },
      () => Effect.succeed(config),
      () =>
        Effect.succeed([
          { adapter: 'test', locale: 'de', resource, missing: ['a', 'b', 'c'] },
        ]),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed).toHaveLength(3);
    expect(parsed[0]).toMatchObject({ adapter: 'test', locale: 'de', resource: 'messages', key: 'a' });
  });
});
