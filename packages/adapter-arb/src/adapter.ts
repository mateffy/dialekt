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

export interface ArbAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}

function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({ adapter: "arb", locale, resource, cause }) as AdapterReadError;
}

function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "arb",
    locale,
    resource,
    cause,
  }) as AdapterWriteError;
}

function readArbResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const content = yield* readFileIfExists(path.join(dir, `${locale}.arb`)).pipe(
      Effect.mapError((cause) => readError(locale, resource.key, cause)),
    );
    if (content === null) return {};
    const parsed = yield* Effect.try({
      try: () => JSON.parse(content) as Record<string, unknown>,
      catch: (cause) => readError(locale, resource.key, cause),
    });
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!key.startsWith("@")) filtered[key] = value;
    }
    return flattenObject(filtered);
  });
}

function writeArbResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const filePath = path.join(dir, `${locale}.arb`);
    const existing = yield* readFileIfExists(filePath).pipe(Effect.orElseSucceed(() => null));
    const meta: Record<string, unknown> = {};
    if (existing !== null) {
      const parsed = JSON.parse(existing) as Record<string, unknown>;
      for (const [key, value] of Object.entries(parsed)) {
        if (key.startsWith("@")) meta[key] = value;
      }
    }
    const output: Record<string, unknown> = { "@@locale": locale, ...unflattenObject(entries) };
    for (const [key, value] of Object.entries(meta)) {
      if (!output[key]) output[key] = value;
    }
    yield* writeFileEnsuringDir(filePath, `${JSON.stringify(output, null, 2)}\n`).pipe(
      Effect.mapError((cause) => writeError(locale, resource.key, cause)),
    );
  });
}

export function arb(options: ArbAdapterOptions): TranslationAdapter {
  const { dir, resourceKey = "messages" } = options;
  const resource: ResourceRef = { key: resourceKey, label: `${resourceKey}.arb` };
  return {
    name: "arb",
    capabilities: { canCreateResource: true, unusedKeyDetection: false },
    listLocales: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs
          .readDirectory(dir)
          .pipe(Effect.orElseSucceed(() => [] as string[]));
        return entries.filter((e) => e.endsWith(".arb")).map((e) => e.replace(/\.arb$/, ""));
      }).pipe(
        Effect.mapError((cause) => readError("", "", cause)),
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
    listResources: () => Effect.succeed([resource]),
    readResource: (locale, _) =>
      readArbResource(dir, locale, resource).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
    writeResource: (locale, _, entries) =>
      writeArbResource(dir, locale, resource, entries).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<void, AdapterWriteError, never>,
  };
}
