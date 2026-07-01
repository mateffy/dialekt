import { Effect } from "effect";
import { chunkKeys } from "./chunking.js";
import { diffKeys } from "../keys/flatten.js";
import type { TranslationAdapter } from "../adapter/types.js";
import type { TranslationStrategy } from "./types.js";
import { TranslationFailedError } from "./types.js";
import type { ChunkingConfig } from "../config/types.js";

export interface TranslationRunConfig {
  readonly adapters: readonly TranslationAdapter[];
  readonly strategy: TranslationStrategy;
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[];
  readonly chunking: ChunkingConfig;
}

export function runTranslation(config: TranslationRunConfig) {
  return Effect.gen(function* () {
    const failures: TranslationFailedError[] = [];

    for (const adapter of config.adapters) {
      const locales =
        config.targetLocales.length > 0 ? config.targetLocales : yield* adapter.listLocales();
      const sourceLocale = config.sourceLocale;
      const targetLocales = locales.filter((l: string) => l !== sourceLocale);

      for (const locale of targetLocales) {
        const resources = yield* adapter.listResources(sourceLocale);
        for (const resource of resources) {
          const sourceMap = yield* adapter.readResource(sourceLocale, resource);
          const targetMap = yield* adapter.readResource(locale, resource);
          const missing = diffKeys(sourceMap, targetMap);
          if (missing.length === 0) continue;

          const chunks = chunkKeys(missing, sourceMap, targetMap, {
            maxTokens: config.chunking.maxTokens,
            charsPerToken: config.chunking.charsPerToken,
          });

          const translatedChunks: Record<string, string>[] = [];

          yield* Effect.forEach(
            chunks,
            (chunkKeysArr) =>
              Effect.gen(function* () {
                const result = yield* config.strategy.translateChunk({
                  sourceLocale,
                  targetLocale: locale,
                  sourceMap,
                  targetMap,
                  keys: chunkKeysArr,
                });
                translatedChunks.push(result);
              }).pipe(
                Effect.catchAll((err) => {
                  failures.push(err);
                  return Effect.void;
                }),
              ),
            { concurrency: config.chunking.concurrency, discard: true },
          );

          const merged = { ...targetMap };
          for (const chunk of translatedChunks) {
            Object.assign(merged, chunk);
          }
          yield* adapter.writeResource(locale, resource, merged);
        }
      }
    }

    if (failures.length > 0) {
      return yield* Effect.fail(
        new TranslationFailedError({
          keys: failures.flatMap((f) => [...f.keys]),
          cause: failures.map((f) => f.cause),
        }),
      );
    }

    return void 0;
  });
}
