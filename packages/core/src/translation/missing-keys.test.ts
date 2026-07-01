import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { computeMissingKeys } from './missing-keys.js';
import type { TranslationAdapter } from '../adapter/types.js';

describe('computeMissingKeys', () => {
  it('lists missing keys per resource/locale', async () => {
    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: (locale: string) =>
        Effect.succeed(
          locale === 'en' ? { hello: 'Hello', bye: 'Bye' } : { hello: 'Hallo' },
        ),
      writeResource: () => Effect.void,
    };

    const result = await Effect.runPromise(
      computeMissingKeys(adapter, 'en', ['de']),
    ) as ReadonlyArray<{ missing: readonly string[] }>;
    expect(result).toHaveLength(1);
    expect(result[0]!.missing).toEqual(['bye']);
  });

  it('returns empty when nothing is missing', async () => {
    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: () => Effect.succeed({ hello: 'Hello' }),
      writeResource: () => Effect.void,
    };

    const result = await Effect.runPromise(
      computeMissingKeys(adapter, 'en', ['de']),
    ) as ReadonlyArray<{ missing: readonly string[] }>;
    expect(result).toHaveLength(0);
  });

  it('handles multiple resources', async () => {
    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () =>
        Effect.succeed([
          { key: 'auth', label: 'auth' },
          { key: 'validation', label: 'validation' },
        ]),
      readResource: (locale: string, resource) =>
        Effect.succeed(
          locale === 'en'
            ? resource.key === 'auth'
              ? { login: 'Login' }
              : { email: 'Email' }
            : resource.key === 'auth'
              ? { login: 'Anmelden' }
              : {},
        ),
      writeResource: () => Effect.void,
    };

    const result = await Effect.runPromise(
      computeMissingKeys(adapter, 'en', ['de']),
    ) as ReadonlyArray<{ resource: { label: string }; missing: readonly string[] }>;
    expect(result).toHaveLength(1);
    expect(result[0]!.resource.label).toBe('validation');
    expect(result[0]!.missing).toEqual(['email']);
  });

  it('handles multiple target locales', async () => {
    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de', 'fr']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: (locale: string) =>
        Effect.succeed(
          locale === 'en' ? { hello: 'Hello' } : {},
        ),
      writeResource: () => Effect.void,
    };

    const result = await Effect.runPromise(
      computeMissingKeys(adapter, 'en', ['de', 'fr']),
    ) as ReadonlyArray<{ locale: string; missing: readonly string[] }>;
    expect(result).toHaveLength(2);
    const locales = result.map((r) => r.locale);
    expect(locales).toContain('de');
    expect(locales).toContain('fr');
  });

  it('handles empty target locales', async () => {
    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };

    const result = await Effect.runPromise(
      computeMissingKeys(adapter, 'en', []),
    ) as ReadonlyArray<{ missing: readonly string[] }>;
    expect(result).toHaveLength(0);
  });

  it('handles empty resources', async () => {
    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () => Effect.succeed([]),
      readResource: () => Effect.succeed({}),
      writeResource: () => Effect.void,
    };

    const result = await Effect.runPromise(
      computeMissingKeys(adapter, 'en', ['de']),
    ) as ReadonlyArray<{ missing: readonly string[] }>;
    expect(result).toHaveLength(0);
  });

  it('handles adapter readResource failure', async () => {
    const adapter: TranslationAdapter = {
      name: 'broken',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: () => Effect.fail(new Error('read failed') as never),
      writeResource: () => Effect.void,
    };

    await expect(Effect.runPromise(computeMissingKeys(adapter, 'en', ['de']))).rejects.toThrow('read failed');
  });

  it('handles all keys missing', async () => {
    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: (locale: string) =>
        Effect.succeed(
          locale === 'en' ? { a: 'A', b: 'B', c: 'C' } : {},
        ),
      writeResource: () => Effect.void,
    };

    const result = await Effect.runPromise(
      computeMissingKeys(adapter, 'en', ['de']),
    ) as ReadonlyArray<{ missing: readonly string[] }>;
    expect(result).toHaveLength(1);
    expect(result[0]!.missing).toEqual(['a', 'b', 'c']);
  });

  it('ignores target keys not present in source', async () => {
    const adapter: TranslationAdapter = {
      name: 'test',
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.succeed(['en', 'de']),
      listResources: () => Effect.succeed([{ key: 'messages', label: 'messages' }]),
      readResource: (locale: string) =>
        Effect.succeed(
          locale === 'en' ? { a: 'A' } : { a: 'A-de', b: 'B-de' },
        ),
      writeResource: () => Effect.void,
    };

    const result = await Effect.runPromise(
      computeMissingKeys(adapter, 'en', ['de']),
    ) as ReadonlyArray<{ missing: readonly string[] }>;
    expect(result).toHaveLength(0);
  });
});
