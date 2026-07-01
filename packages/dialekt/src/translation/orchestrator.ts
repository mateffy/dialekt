import { Effect } from "effect";
import { chunkKeys } from "./chunking.js";
import { diffKeys } from "../keys/flatten.js";
import type {
  TranslationAdapter,
  ResourceRef,
  AdapterReadError,
  AdapterWriteError,
} from "../adapter/types.js";
import type { TranslationStrategy, TranslationContext } from "./types.js";
import { TranslationFailedError } from "./types.js";
import type { ChunkingConfig } from "../config/types.js";

export interface TranslationRunConfig {
  readonly adapters: readonly TranslationAdapter[];
  readonly strategy: TranslationStrategy;
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[];
  readonly chunking: ChunkingConfig;
}

function translateChunks(
  strategy: TranslationStrategy,
  chunking: ChunkingConfig,
  ctxBase: Omit<TranslationContext, "keys">,
  chunks: readonly string[][],
  failures: TranslationFailedError[],
): Effect.Effect<readonly Record<string, string>[], never> {
  const translatedChunks: Record<string, string>[] = [];
  return Effect.forEach(
    chunks,
    (chunkKeysArr) =>
      Effect.gen(function* () {
        const ctx: TranslationContext = { ...ctxBase, keys: chunkKeysArr };
        const result = yield* strategy.translateChunk(ctx);
        translatedChunks.push(result);
      }).pipe(
        Effect.catchAll((err) => {
          failures.push(err);
          return Effect.void;
        }),
      ),
    { concurrency: chunking.concurrency, discard: true },
  ).pipe(Effect.map(() => translatedChunks));
}

function translateResource(
  adapter: TranslationAdapter,
  strategy: TranslationStrategy,
  chunking: ChunkingConfig,
  sourceLocale: string,
  targetLocale: string,
  resource: ResourceRef,
  failures: TranslationFailedError[],
): Effect.Effect<void, AdapterReadError | AdapterWriteError> {
  return Effect.gen(function* () {
    const sourceMap = yield* adapter.readResource(sourceLocale, resource);
    const targetMap = yield* adapter.readResource(targetLocale, resource);
    const missing = diffKeys(sourceMap, targetMap);
    if (missing.length === 0) return;

    const chunks = chunkKeys(missing, sourceMap, targetMap, {
      maxTokens: chunking.maxTokens,
      charsPerToken: chunking.charsPerToken,
    });

    const ctxBase = { sourceLocale, targetLocale, sourceMap, targetMap };
    const translatedChunks = yield* translateChunks(strategy, chunking, ctxBase, chunks, failures);

    const merged = { ...targetMap };
    for (const chunk of translatedChunks) {
      Object.assign(merged, chunk);
    }
    yield* adapter.writeResource(targetLocale, resource, merged);
  });
}

export function runTranslation(
  config: TranslationRunConfig,
): Effect.Effect<void, TranslationFailedError | AdapterReadError | AdapterWriteError> {
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
          yield* translateResource(
            adapter,
            config.strategy,
            config.chunking,
            sourceLocale,
            locale,
            resource,
            failures,
          );
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
