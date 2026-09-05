import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import type { ResourceRef, TranslationAdapter, AdapterReadError, AdapterWriteError } from "dialekt";
import {
  AdapterReadError as AdapterReadErrorClass,
  AdapterWriteError as AdapterWriteErrorClass,
  NodePlatformLayer,
  flattenObject,
  unflattenObject,
  readFileIfExists,
  writeFileEnsuringDir,
} from "dialekt";
import { FileSystem } from "@effect/platform";

export interface JsonAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}

function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({
    adapter: "json",
    locale,
    resource,
    cause,
  }) as AdapterReadError;
}

function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "json",
    locale,
    resource,
    cause,
  }) as AdapterWriteError;
}

function readJsonResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const content = yield* readFileIfExists(path.join(dir, `${locale}.json`)).pipe(
      Effect.mapError((cause) => readError(locale, resource.key, cause)),
    );
    if (content === null) return {};
    const parsed = yield* Effect.try({
      try: () => JSON.parse(content) as Record<string, unknown>,
      catch: (cause) => readError(locale, resource.key, cause),
    });
    return flattenObject(parsed);
  });
}

function writeJsonResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    yield* writeFileEnsuringDir(
      path.join(dir, `${locale}.json`),
      `${JSON.stringify(unflattenObject(entries), null, 2)}\n`,
    ).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
  });
}

export function json(options: JsonAdapterOptions): TranslationAdapter {
  const { dir, resourceKey = "messages" } = options;
  const resource: ResourceRef = { key: resourceKey, label: `${resourceKey}.json` };
  return {
    name: "json",
    capabilities: { canCreateResource: true, unusedKeyDetection: false },
    listLocales: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs
          .readDirectory(dir)
          .pipe(Effect.orElseSucceed(() => [] as string[]));
        return entries.filter((e) => e.endsWith(".json")).map((e) => e.replace(/\.json$/, ""));
      }).pipe(
        Effect.mapError((cause) => readError("", "", cause)),
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
    listResources: () => Effect.succeed([resource]),
    readResource: (locale, _) =>
      readJsonResource(dir, locale, resource).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
    writeResource: (locale, _, entries) =>
      writeJsonResource(dir, locale, resource, entries).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<void, AdapterWriteError, never>,
  };
}
