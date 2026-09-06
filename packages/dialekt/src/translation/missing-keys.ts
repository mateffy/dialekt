import { Effect } from "effect";
import type { TranslationAdapter, ResourceRef, AdapterReadError } from "../adapter/types.js";
import { diffKeys } from "../keys/flatten.js";

export interface MissingKeyEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: ResourceRef;
  readonly missing: readonly string[];
}

function missingForLocale(
  adapter: TranslationAdapter,
  sourceMap: Record<string, string>,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<readonly MissingKeyEntry[], AdapterReadError> {
  return Effect.gen(function* () {
    const targetMap = yield* adapter.readResource(locale, resource);
    const missing = diffKeys(sourceMap, targetMap);
    return missing.length > 0 ? [{ adapter: adapter.name, locale, resource, missing }] : [];
  });
}

function missingForResource(
  adapter: TranslationAdapter,
  sourceLocale: string,
  targetLocales: readonly string[],
  resource: ResourceRef,
): Effect.Effect<readonly MissingKeyEntry[], AdapterReadError> {
  return Effect.gen(function* () {
    const sourceMap = yield* adapter.readResource(sourceLocale, resource);
    return yield* Effect.forEach(
      targetLocales,
      (locale) => missingForLocale(adapter, sourceMap, locale, resource),
      { concurrency: targetLocales.length },
    ).pipe(Effect.map((xs) => xs.flat()));
  });
}

export function computeMissingKeys(
  adapter: TranslationAdapter,
  sourceLocale: string,
  targetLocales: readonly string[],
): Effect.Effect<readonly MissingKeyEntry[], AdapterReadError> {
  return Effect.gen(function* () {
    const resources = yield* adapter.listResources(sourceLocale);
    const maxConcurrency = Math.min(resources.length, 10);
    return yield* Effect.forEach(
      resources,
      (resource) => missingForResource(adapter, sourceLocale, targetLocales, resource),
      { concurrency: maxConcurrency },
    ).pipe(Effect.map((xs) => xs.flat()));
  });
}
