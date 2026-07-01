import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import type { ResourceRef, TranslationAdapter, AdapterReadError, AdapterWriteError } from "dialekt";
import {
  AdapterReadError as AdapterReadErrorClass,
  AdapterWriteError as AdapterWriteErrorClass,
  NodePlatformLayer,
  flattenObject,
  unflattenObject,
  readPhpArrayAsJson,
  readFileIfExists,
  writeFileEnsuringDir,
} from "dialekt";
import { renderPhpFile } from "./php-array-writer.js";
import { listLaravelLocales, listLaravelResources } from "./resources.js";
import { findUnusedLaravelKeys } from "./unused-keys.js";

function readError(locale: string, resourceKey: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({
    adapter: "laravel",
    locale,
    resource: resourceKey,
    cause,
  }) as AdapterReadError;
}

function writeError(locale: string, resourceKey: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "laravel",
    locale,
    resource: resourceKey,
    cause,
  }) as AdapterWriteError;
}

export interface LaravelAdapterOptions {
  readonly langDir: string;
  readonly phpBinary?: string;
  readonly scanPaths?: readonly string[];
}

function readLaravelResource(
  langDir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, Path.Path> {
  return Effect.gen(function* () {
    const path = yield* Path;

    if (resource.key === "json") {
      const filePath = path.join(langDir, `${locale}.json`);
      const content = yield* readFileIfExists(filePath).pipe(
        Effect.mapError((cause) => readError(locale, resource.key, cause)),
      );
      if (content === null) return {};
      return yield* Effect.try({
        try: () => JSON.parse(content) as Record<string, string>,
        catch: (cause) => readError(locale, resource.key, cause),
      });
    }

    const filePath = path.join(langDir, locale, `${resource.key}.php`);
    const result = yield* readPhpArrayAsJson(filePath).pipe(
      Effect.catchTag("PhpExecutionError", () => Effect.succeed({})),
      Effect.mapError((cause) => readError(locale, resource.key, cause)),
    );
    return flattenObject(result);
  });
}

function writeLaravelResource(
  langDir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, Path.Path> {
  return Effect.gen(function* () {
    const path = yield* Path;

    if (resource.key === "json") {
      const filePath = path.join(langDir, `${locale}.json`);
      yield* writeFileEnsuringDir(filePath, JSON.stringify(entries, null, 2)).pipe(
        Effect.mapError((cause) => writeError(locale, resource.key, cause)),
      );
      return;
    }

    const filePath = path.join(langDir, locale, `${resource.key}.php`);
    const nested = unflattenObject(entries);
    yield* writeFileEnsuringDir(filePath, renderPhpFile(nested)).pipe(
      Effect.mapError((cause) => writeError(locale, resource.key, cause)),
    );
  });
}

function findUnusedLaravelAdapterKeys(
  langDir: string,
  scanPaths: readonly string[],
  locale: string,
  resource: ResourceRef,
): Effect.Effect<readonly string[], AdapterReadError, Path.Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const adapterScanPaths = scanPaths.length > 0 ? scanPaths : [path.resolve(langDir, "..")];
    const map = yield* readLaravelResource(langDir, locale, resource);
    const keys = Object.keys(map);
    return yield* findUnusedLaravelKeys(adapterScanPaths, resource.key, keys);
  });
}

export function laravel(options: LaravelAdapterOptions): TranslationAdapter {
  const { langDir, scanPaths = [] } = options;

  return {
    name: "laravel",
    capabilities: {
      canCreateResource: true,
      unusedKeyDetection: true,
    },

    listLocales: () => listLaravelLocales(langDir).pipe(Effect.provide(NodePlatformLayer)),

    listResources: (locale) =>
      listLaravelResources(langDir, locale).pipe(Effect.provide(NodePlatformLayer)),

    readResource: (locale, resource) =>
      readLaravelResource(langDir, locale, resource).pipe(
        Effect.provide([NodePlatformLayer]),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,

    writeResource: (locale, resource, entries) =>
      writeLaravelResource(langDir, locale, resource, entries).pipe(
        Effect.provide([NodePlatformLayer]),
      ) as Effect.Effect<void, AdapterWriteError, never>,

    findUnusedKeys: (locale, resource) =>
      findUnusedLaravelAdapterKeys(langDir, scanPaths, locale, resource).pipe(
        Effect.provide([NodePlatformLayer]),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
  };
}
