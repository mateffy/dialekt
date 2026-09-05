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
import { parse as yamlParse, stringify as yamlStringify } from "yaml";

export interface YamlAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}

function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({
    adapter: "yaml",
    locale,
    resource,
    cause,
  }) as AdapterReadError;
}

function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "yaml",
    locale,
    resource,
    cause,
  }) as AdapterWriteError;
}

function readYamlResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const content = yield* readFileIfExists(path.join(dir, `${locale}.yml`)).pipe(
      Effect.mapError((cause) => readError(locale, resource.key, cause)),
    );
    if (content === null) return {};
    const parsed = yield* Effect.try({
      try: () => yamlParse(content) as Record<string, unknown>,
      catch: (cause) => readError(locale, resource.key, cause),
    });
    return flattenObject(parsed);
  });
}

function writeYamlResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    yield* writeFileEnsuringDir(
      path.join(dir, `${locale}.yml`),
      `${yamlStringify(unflattenObject(entries))}\n`,
    ).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
  });
}

export function yaml(options: YamlAdapterOptions): TranslationAdapter {
  const { dir, resourceKey = "messages" } = options;
  const resource: ResourceRef = { key: resourceKey, label: `${resourceKey}.yml` };
  return {
    name: "yaml",
    capabilities: { canCreateResource: true, unusedKeyDetection: false },
    listLocales: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs
          .readDirectory(dir)
          .pipe(Effect.orElseSucceed(() => [] as string[]));
        return entries.filter((e) => e.endsWith(".yml")).map((e) => e.replace(/\.yml$/, ""));
      }).pipe(
        Effect.mapError((cause) => readError("", "", cause)),
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
    listResources: () => Effect.succeed([resource]),
    readResource: (locale, _) =>
      readYamlResource(dir, locale, resource).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
    writeResource: (locale, _, entries) =>
      writeYamlResource(dir, locale, resource, entries).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<void, AdapterWriteError, never>,
  };
}
