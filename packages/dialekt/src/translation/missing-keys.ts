import { Effect } from 'effect';
import type { TranslationAdapter, ResourceRef, AdapterReadError } from '../adapter/types.js';
import { diffKeys } from '../keys/flatten.js';

export interface MissingKeyEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: ResourceRef;
  readonly missing: readonly string[];
}

export function computeMissingKeys(
  adapter: TranslationAdapter,
  sourceLocale: string,
  targetLocales: readonly string[],
): Effect.Effect<readonly MissingKeyEntry[], AdapterReadError> {
  return Effect.gen(function* () {
    const resources = yield* adapter.listResources(sourceLocale);
    const entries = yield* Effect.forEach(resources, (resource: ResourceRef) =>
      Effect.gen(function* () {
        const sourceMap = yield* adapter.readResource(sourceLocale, resource);
        const localeEntries = yield* Effect.forEach(targetLocales, (locale: string) =>
          Effect.gen(function* () {
            const targetMap = yield* adapter.readResource(locale, resource);
            const missing = diffKeys(sourceMap, targetMap);
            return missing.length > 0
              ? [{ adapter: adapter.name, locale, resource, missing }]
              : [];
          }),
        );
        return localeEntries.flat();
      }),
    );
    return entries.flat();
  });
}
