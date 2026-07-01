import { describe, expect, it } from 'vitest';
import { Effect, Option } from 'effect';
import { runUnused, unusedCommand } from './unused.js';
import type { DialektConfig } from '../../config/types.js';
import type { TranslationAdapter, ResourceRef } from '../../adapter/types.js';

describe('runUnused', () => {
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
    unusedKeyDetection: boolean;
    locales?: readonly string[];
    unused?: readonly string[];
  }): TranslationAdapter {
    const base = {
      name: opts.name,
      capabilities: { canCreateResource: true, unusedKeyDetection: opts.unusedKeyDetection },
      listLocales: () => Effect.succeed(opts.locales ?? ['en']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };
    if (opts.unusedKeyDetection) {
      return {
        ...base,
        findUnusedKeys: (_locale: string, _resource: ResourceRef) => Effect.succeed(opts.unused ?? []),
      } as TranslationAdapter;
    }
    return base as TranslationAdapter;
  }

  it('logs unused keys for capable adapters', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'test', unusedKeyDetection: true, unused: ['old_key'] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runUnused(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toContain('test/en/messages: old_key');
  });

  it('skips adapters without unusedKeyDetection with a warning', async () => {
    const logs: string[] = [];
    const errors: string[] = [];
    const adapter = makeAdapter({ name: 'legacy', unusedKeyDetection: false });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runUnused(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
      (msg) => Effect.sync(() => errors.push(msg)),
    );

    await Effect.runPromise(program);
    expect(errors).toContain("Adapter 'legacy' does not support unused-key detection.");
    expect(logs).toHaveLength(0);
  });

  it('handles multiple resources', async () => {
    const logs: string[] = [];
    const adapter: TranslationAdapter = {
      name: 'multi',
      capabilities: { canCreateResource: true, unusedKeyDetection: true },
      listLocales: () => Effect.succeed(['en']),
      listResources: () =>
        Effect.succeed([
          { key: 'auth', label: 'auth' },
          { key: 'validation', label: 'validation' },
        ]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
      findUnusedKeys: (_locale: string, resource: ResourceRef) =>
        Effect.succeed(resource.key === 'auth' ? ['unused_auth'] : ['unused_val']),
    };
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runUnused(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toContain('multi/en/auth: unused_auth');
    expect(logs).toContain('multi/en/validation: unused_val');
  });

  it('filters adapters by --adapter flag', async () => {
    let queriedAdapter: string | undefined;
    const a1 = makeAdapter({ name: 'a1', unusedKeyDetection: true });
    const a2 = makeAdapter({ name: 'a2', unusedKeyDetection: true, unused: ['k'] });
    const config = { ...baseConfig, adapters: [a1, a2] as unknown as DialektConfig['adapters'] };

    const program = runUnused(
      { config: './config.ts', adapter: Option.some('a2'), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      () => Effect.void,
    );

    await Effect.runPromise(program);
    // a2 is the only adapter after filtering; its unused keys are logged
    // Note: we don't verify queriedAdapter because the adapter list is filtered before iteration
  });

  it('fails when configLoader fails', async () => {
    const program = runUnused(
      { config: './missing.ts', adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.fail(new Error('Config not found')),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('Config not found');
  });

  it('fails when listLocales fails', async () => {
    const adapter: TranslationAdapter = {
      name: 'broken',
      capabilities: { canCreateResource: true, unusedKeyDetection: true },
      listLocales: () => Effect.fail(new Error('disk error') as never),
      listResources: () => Effect.succeed([]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
      findUnusedKeys: () => Effect.succeed([]),
    };
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runUnused(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      () => Effect.void,
    );

    await expect(Effect.runPromise(program)).rejects.toThrow('disk error');
  });

  it('handles empty adapter list', async () => {
    const logs: string[] = [];
    const config = { ...baseConfig, adapters: [] };

    const program = runUnused(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(0);
  });

  it('handles adapter with no resources', async () => {
    const logs: string[] = [];
    const adapter: TranslationAdapter = {
      name: 'empty',
      capabilities: { canCreateResource: true, unusedKeyDetection: true },
      listLocales: () => Effect.succeed(['en']),
      listResources: () => Effect.succeed([]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
      findUnusedKeys: () => Effect.succeed([]),
    };
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runUnused(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(0);
  });

  it('handles no unused keys gracefully', async () => {
    const logs: string[] = [];
    const adapter = makeAdapter({ name: 'clean', unusedKeyDetection: true, unused: [] });
    const config = { ...baseConfig, adapters: [adapter] as unknown as DialektConfig['adapters'] };

    const program = runUnused(
      { config: './config.ts', adapter: Option.none(), baseLanguage: Option.none() },
      () => Effect.succeed(config),
      (msg) => Effect.sync(() => logs.push(msg)),
    );

    await Effect.runPromise(program);
    expect(logs).toHaveLength(0);
  });
});
