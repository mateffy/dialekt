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

export interface LaravelAdapterOptions {
  readonly langDir: string;
  readonly phpBinary?: string;
  readonly scanPaths?: readonly string[];
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
      Effect.gen(function* () {
        const path = yield* Path;

        if (resource.key === "json") {
          // JSON locale file
          const filePath = path.join(langDir, `${locale}.json`);
          const content = yield* readFileIfExists(filePath).pipe(
            Effect.mapError(
              (cause) =>
                new AdapterReadErrorClass({
                  adapter: "laravel",
                  locale,
                  resource: resource.key,
                  cause,
                }) as AdapterReadError,
            ),
          );
          if (content === null) return {};
          return yield* Effect.try({
            try: () => JSON.parse(content) as Record<string, string>,
            catch: (cause) =>
              new AdapterReadErrorClass({
                adapter: "laravel",
                locale,
                resource: resource.key,
                cause,
              }),
          });
        }

        // PHP domain file
        const filePath = path.join(langDir, locale, `${resource.key}.php`);
        const result = yield* readPhpArrayAsJson(filePath).pipe(
          Effect.catchTag("PhpExecutionError", () => Effect.succeed({})),
          Effect.mapError(
            (cause) =>
              new AdapterReadErrorClass({
                adapter: "laravel",
                locale,
                resource: resource.key,
                cause,
              }) as AdapterReadError,
          ),
        );
        return flattenObject(result);
      }).pipe(Effect.provide([NodePlatformLayer])) as Effect.Effect<
        Record<string, string>,
        AdapterReadError,
        never
      >,

    writeResource: (locale, resource, entries) =>
      Effect.gen(function* () {
        const path = yield* Path;

        if (resource.key === "json") {
          // JSON locale file
          const filePath = path.join(langDir, `${locale}.json`);
          yield* writeFileEnsuringDir(filePath, JSON.stringify(entries, null, 2)).pipe(
            Effect.mapError(
              (cause) =>
                new AdapterWriteErrorClass({
                  adapter: "laravel",
                  locale,
                  resource: resource.key,
                  cause,
                }) as AdapterWriteError,
            ),
          );
          return;
        }

        // PHP domain file
        const filePath = path.join(langDir, locale, `${resource.key}.php`);
        const nested = unflattenObject(entries);
        yield* writeFileEnsuringDir(filePath, renderPhpFile(nested)).pipe(
          Effect.mapError(
            (cause) =>
              new AdapterWriteErrorClass({
                adapter: "laravel",
                locale,
                resource: resource.key,
                cause,
              }) as AdapterWriteError,
          ),
        );
      }).pipe(Effect.provide([NodePlatformLayer])) as Effect.Effect<void, AdapterWriteError, never>,

    findUnusedKeys: (locale, resource) =>
      Effect.gen(function* () {
        const path = yield* Path;
        const adapterScanPaths = scanPaths.length > 0 ? scanPaths : [path.resolve(langDir, "..")];
        const keys = yield* Effect.gen(function* () {
          const map = yield* laravel(options).readResource(locale, resource);
          return Object.keys(map);
        });
        return yield* findUnusedLaravelKeys(adapterScanPaths, resource.key, keys);
      }).pipe(Effect.provide([NodePlatformLayer])) as Effect.Effect<
        readonly string[],
        AdapterReadError,
        never
      >,
  };
}
