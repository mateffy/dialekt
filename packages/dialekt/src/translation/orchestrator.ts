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

export interface TranslationProgressEvent {
  readonly type:
    | "locale-start"
    | "locale-scanned"
    | "chunk-start"
    | "chunk-complete"
    | "chunk-fail"
    | "locale-done"
    | "locale-error";
  readonly locale: string;
  readonly resource?: string;
  readonly resourcesTotal?: number;
  readonly missingKeys?: number;
  readonly chunksTotal?: number;
  /** Trace data carried by chunk-complete events when --llm is active. */
  readonly trace?: {
    sourceTexts: Readonly<Record<string, string>>;
    output: Record<string, string>;
    text: string;
  };
}

export interface TranslationRunConfig {
  readonly adapters: readonly TranslationAdapter[];
  readonly strategy: TranslationStrategy;
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[];
  readonly chunking: {
    maxTokens: number;
    charsPerToken: number;
    keysPerChunk?: number;
    concurrency: number;
  };
  readonly resourceFilter?: string | undefined;
}

/**
 * Translate missing keys in one resource file. Chunks translate serially within
 * a resource so we can write after each chunk (resumability).
 */
function translateResource(
  adapter: TranslationAdapter,
  strategy: TranslationStrategy,
  chunking: { maxTokens: number; charsPerToken: number; keysPerChunk?: number },
  sourceLocale: string,
  targetLocale: string,
  resource: ResourceRef,
  failures: TranslationFailedError[],
  onProgress?: (event: TranslationProgressEvent) => void,
): Effect.Effect<void, AdapterReadError | AdapterWriteError> {
  return Effect.gen(function* () {
    const sourceMap = yield* adapter.readResource(sourceLocale, resource);
    const targetMap = yield* adapter.readResource(targetLocale, resource);
    const missing = diffKeys(sourceMap, targetMap);
    if (missing.length === 0) return;

    const chunkCfg: { maxTokens: number; charsPerToken: number; keysPerChunk?: number } = {
      maxTokens: chunking.maxTokens,
      charsPerToken: chunking.charsPerToken,
    };
    if (chunking.keysPerChunk !== undefined) chunkCfg.keysPerChunk = chunking.keysPerChunk;
    const chunks = chunkKeys(missing, sourceMap, targetMap, chunkCfg);

    const ctx = { sourceLocale, targetLocale, sourceMap, targetMap } as const;
    const merged = { ...targetMap };

    for (const keys of chunks) {
      const chunkCtx: TranslationContext = { ...ctx, keys, resource: resource.label };
      onProgress?.({ type: "chunk-start", locale: targetLocale, resource: resource.label });
      const result = yield* Effect.either(strategy.translateChunk(chunkCtx));
      if (result._tag === "Right") {
        Object.assign(merged, result.right);
        yield* adapter.writeResource(targetLocale, resource, { ...merged });
        onProgress?.({ type: "chunk-complete", locale: targetLocale, resource: resource.label });
      } else {
        failures.push(result.left);
        onProgress?.({ type: "chunk-fail", locale: targetLocale, resource: resource.label });
      }
    }
  });
}

/** Translate all resources for one locale in parallel, tracking per-chunk progress. */
function translateLocale(
  adapter: TranslationAdapter,
  strategy: TranslationStrategy,
  chunking: TranslationRunConfig["chunking"],
  sourceLocale: string,
  locale: string,
  resources: readonly ResourceRef[],
  failures: TranslationFailedError[],
  onProgress?: (event: TranslationProgressEvent) => void,
): Effect.Effect<void, AdapterReadError | AdapterWriteError> {
  return Effect.gen(function* () {
    onProgress?.({ type: "locale-start", locale, resourcesTotal: resources.length });
    let chOk = 0;
    let chFail = 0;

    const chunkCfg = {
      maxTokens: chunking.maxTokens,
      charsPerToken: chunking.charsPerToken,
      ...(chunking.keysPerChunk !== undefined ? { keysPerChunk: chunking.keysPerChunk } : {}),
    };

    const results = yield* Effect.forEach(
      resources,
      (res) =>
        translateResource(adapter, strategy, chunkCfg, sourceLocale, locale, res, failures, (e) => {
          if (e.type === "chunk-complete") chOk++;
          else if (e.type === "chunk-fail") chFail++;
          onProgress?.(e);
        }).pipe(Effect.either),
      { concurrency: chunking.concurrency, discard: false },
    );

    const hasError = results.some((r) => r._tag === "Left") || chFail > 0;
    if (hasError) onProgress?.({ type: "locale-error", locale });
    else onProgress?.({ type: "locale-done", locale });
  });
}

/** Pre-scan a locale: count missing keys, compute chunk count. */
function preScanLocale(
  adapter: TranslationAdapter,
  sourceLocale: string,
  locale: string,
  chunking: TranslationRunConfig["chunking"],
  resourceFilter?: string,
): Effect.Effect<
  { locale: string; resources: readonly ResourceRef[]; missingKeys: number; chunksTotal: number },
  AdapterReadError
> {
  return Effect.gen(function* () {
    const allRes = yield* adapter.listResources(sourceLocale);
    const filtered = resourceFilter
      ? allRes.filter(
          (r) =>
            r.key === resourceFilter ||
            r.label === resourceFilter ||
            r.key.startsWith(resourceFilter),
        )
      : allRes;

    let missingKeys = 0;
    let chunksTotal = 0;
    for (const resource of filtered) {
      const srcMap = yield* adapter.readResource(sourceLocale, resource);
      const tgtMap = yield* adapter.readResource(locale, resource);
      const missing = diffKeys(srcMap, tgtMap);
      missingKeys += missing.length;
      if (missing.length > 0) {
        const cfg = {
          maxTokens: chunking.maxTokens,
          charsPerToken: chunking.charsPerToken,
          ...(chunking.keysPerChunk !== undefined ? { keysPerChunk: chunking.keysPerChunk } : {}),
        };
        chunksTotal += chunkKeys(missing, srcMap, tgtMap, cfg).length;
      }
    }
    return { locale, resources: filtered, missingKeys, chunksTotal };
  });
}

export function runTranslation(
  config: TranslationRunConfig,
  onProgress?: (event: TranslationProgressEvent) => void,
): Effect.Effect<void, TranslationFailedError | AdapterReadError | AdapterWriteError> {
  return Effect.gen(function* () {
    const failures: TranslationFailedError[] = [];

    for (const adapter of config.adapters) {
      const allLocales = yield* adapter.listLocales();
      const sourceLocale = config.sourceLocale;
      let targetLocales =
        config.targetLocales.length > 0
          ? config.targetLocales.filter((l: string) => l !== sourceLocale)
          : allLocales.filter((l: string) => l !== sourceLocale);
      if (targetLocales.length === 0) {
        targetLocales = allLocales.filter((l: string) => l !== sourceLocale);
      }

      // Phase 1: pre-scan all locales.
      const localeJobs = yield* Effect.forEach(
        targetLocales,
        (locale) =>
          preScanLocale(adapter, sourceLocale, locale, config.chunking, config.resourceFilter),
        { concurrency: Math.min(targetLocales.length, config.chunking.concurrency) },
      );

      for (const job of localeJobs) {
        onProgress?.({
          type: "locale-scanned",
          locale: job.locale,
          missingKeys: job.missingKeys,
          chunksTotal: job.chunksTotal,
        });
      }

      // Phase 2: translate all locales in parallel.
      yield* Effect.forEach(
        localeJobs,
        ({ locale, resources }) =>
          translateLocale(
            adapter,
            config.strategy,
            config.chunking,
            sourceLocale,
            locale,
            resources,
            failures,
            onProgress,
          ),
        { concurrency: config.chunking.concurrency },
      );
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
