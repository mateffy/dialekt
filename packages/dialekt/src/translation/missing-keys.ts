import { Effect } from "effect";
import type { TranslationAdapter, ResourceRef, AdapterReadError } from "../adapter/types.js";
import { diffKeys } from "../keys/flatten.js";

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

    // Read source resources concurrently, then target resources concurrently.
    // This parallelises PHP process spawns — the biggest bottleneck.
    const entries = yield* Effect.forEach(resources, (resource: ResourceRef) =>
      Effect.gen(function* () {
        const sourceMap = yield* adapter.readResource(sourceLocale, resource);
        const localeEntries = yield* Effect.forEach(
          targetLocales,
          (locale: string) =>
            Effect.gen(function* () {
              const targetMap = yield* adapter.readResource(locale, resource);
              const missing = diffKeys(sourceMap, targetMap);
              return missing.length > 0
                ? [{ adapter: adapter.name, locale, resource, missing }]
                : [];
            }),
          { concurrency: targetLocales.length },
        );
        return localeEntries.flat();
      }),
      { concurrency: Math.min(resources.length, 10) },
    );
    return entries.flat();
  });
}