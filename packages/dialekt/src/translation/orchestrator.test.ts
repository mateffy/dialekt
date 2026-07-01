import { describe, expect, it } from 'vitest';
import { Effect, Either } from 'effect';
import { runTranslation } from './orchestrator.js';
import type { TranslationAdapter, ResourceRef, AdapterReadError, AdapterWriteError } from '../adapter/types.js';
import { TranslationFailedError } from './types.js';

describe('runTranslation', () => {
  it('translates missing keys across adapters and writes merged results', async () => {
    const writes: Array<{ locale: string; resource: string; entries: Record<string, string> }> = [];

    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () =>
        Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: (locale: string) =>
        Effect.succeed(
          locale === 'en'
            ? { hello: 'Hello', bye: 'Bye' }
            : { hello: 'Hallo' },
        ),
      writeResource: (locale: string, resource: ResourceRef, entries: Record<string, string>) =>
        Effect.sync(() => {
          writes.push({ locale, resource: resource.key, entries });
        }),
    };

    const strategy = {
      name: 'one-shot' as const,
      translateChunk: (ctx: { keys: readonly string[]; targetLocale: string }) =>
        Effect.succeed(
          Object.fromEntries(ctx.keys.map((k: string) => [k, `${ctx.targetLocale}:${k}`])),
        ),
    };

    const program = runTranslation({
      adapters: [adapter],
      strategy,
      sourceLocale: 'en',
      targetLocales: ['de'],
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    });

    await Effect.runPromise(program);
    expect(writes).toHaveLength(1);
    expect(writes[0]!.locale).toBe('de');
    expect(writes[0]!.entries).toEqual({ hello: 'Hallo', bye: 'de:bye' });
  });

  it('respects concurrency limit', async () => {
    let maxConcurrent = 0;
    let current = 0;

    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () =>
        Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: (locale: string) =>
        Effect.succeed(
          locale === 'en'
            ? { a: 'A', b: 'B', c: 'C', d: 'D' }
            : {},
        ),
      writeResource: () => Effect.void,
    };

    const strategy = {
      name: 'one-shot' as const,
      translateChunk: (ctx: { keys: readonly string[] }) =>
        Effect.gen(function* () {
          current++;
          maxConcurrent = Math.max(maxConcurrent, current);
          yield* Effect.sleep('50 millis');
          current--;
          return Object.fromEntries(ctx.keys.map((k: string) => [k, k]));
        }),
    };

    const program = runTranslation({
      adapters: [adapter],
      strategy,
      sourceLocale: 'en',
      targetLocales: ['de'],
      chunking: { maxTokens: 10, charsPerToken: 3.0, concurrency: 2 },
    });

    await Effect.runPromise(program);
    expect(maxConcurrent).toBeLessThanOrEqual(2);
  });

  it('collects failures and reports them at the end', async () => {
    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () =>
        Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: (locale: string) =>
        Effect.succeed(
          locale === 'en' ? { a: 'A' } : {},
        ),
      writeResource: () => Effect.void,
    };

    const strategy = {
      name: 'one-shot' as const,
      translateChunk: () =>
        Effect.fail(
          new TranslationFailedError({ keys: ['a'], cause: 'boom' }),
        ),
    };

    const program = runTranslation({
      adapters: [adapter],
      strategy,
      sourceLocale: 'en',
      targetLocales: ['de'],
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    });

    const exit = await Effect.runPromise(Effect.either(program)) as Either.Either<void, TranslationFailedError>;
    if (exit._tag === 'Left') {
      expect((exit.left as TranslationFailedError)._tag).toBe('TranslationFailedError');
    } else {
      throw new Error('Expected Left');
    }
  });

  it('handles empty adapters list', async () => {
    const strategy = {
      name: 'one-shot' as const,
      translateChunk: () => Effect.succeed({}),
    };

    const program = runTranslation({
      adapters: [],
      strategy,
      sourceLocale: 'en',
      targetLocales: ['de'],
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    });

    await Effect.runPromise(program);
    expect(true).toBe(true); // should not throw
  });

  it('handles single-locale adapter (no targets)', async () => {
    const adapter: TranslationAdapter = {
      name: 'mono',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: () => Effect.succeed({ hello: 'Hello' }),
      writeResource: () => Effect.void,
    };

    const strategy = {
      name: 'one-shot' as const,
      translateChunk: () => Effect.succeed({}),
    };

    const program = runTranslation({
      adapters: [adapter],
      strategy,
      sourceLocale: 'en',
      targetLocales: ['de'],
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    });

    await Effect.runPromise(program);
    expect(true).toBe(true); // should not throw
  });

  it('handles multiple resources', async () => {
    const writes: Array<{ locale: string; resource: string }> = [];
    const adapter: TranslationAdapter = {
      name: 'multi',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () =>
        Effect.succeed([
          { key: 'auth', label: 'auth' },
          { key: 'validation', label: 'validation' },
        ]),
      readResource: (locale: string) =>
        Effect.succeed(
          locale === 'en' ? { k1: 'V1' } : {},
        ),
      writeResource: (locale: string, resource: ResourceRef) =>
        Effect.sync(() => {
          writes.push({ locale, resource: resource.key });
        }),
    };

    const strategy = {
      name: 'one-shot' as const,
      translateChunk: (ctx: { keys: readonly string[] }) =>
        Effect.succeed(Object.fromEntries(ctx.keys.map((k: string) => [k, k]))),
    };

    const program = runTranslation({
      adapters: [adapter],
      strategy,
      sourceLocale: 'en',
      targetLocales: ['de'],
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    });

    await Effect.runPromise(program);
    expect(writes.length).toBeGreaterThanOrEqual(2);
  });

  it('handles adapter readResource failure', async () => {
    const adapter: TranslationAdapter = {
      name: 'broken',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: () => Effect.fail(new Error('read failed') as AdapterReadError),
      writeResource: () => Effect.void,
    };

    const strategy = {
      name: 'one-shot' as const,
      translateChunk: () => Effect.succeed({}),
    };

    const program = runTranslation({
      adapters: [adapter],
      strategy,
      sourceLocale: 'en',
      targetLocales: ['de'],
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    });

    await expect(Effect.runPromise(program)).rejects.toThrow('read failed');
  });

  it('handles multiple target locales', async () => {
    const writes: Array<{ locale: string }> = [];
    const adapter: TranslationAdapter = {
      name: 'multi-locale',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de', 'fr']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: (locale: string) =>
        Effect.succeed(locale === 'en' ? { hello: 'Hello' } : {}),
      writeResource: (locale: string) =>
        Effect.sync(() => {
          writes.push({ locale });
        }),
    };

    const strategy = {
      name: 'one-shot' as const,
      translateChunk: (ctx: { keys: readonly string[]; targetLocale: string }) =>
        Effect.succeed(Object.fromEntries(ctx.keys.map((k: string) => [k, `${ctx.targetLocale}:${k}`]))),
    };

    const program = runTranslation({
      adapters: [adapter],
      strategy,
      sourceLocale: 'en',
      targetLocales: ['de', 'fr'],
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
    });

    await Effect.runPromise(program);
    const locales = writes.map((w) => w.locale);
    expect(locales).toContain('de');
    expect(locales).toContain('fr');
  });
});
