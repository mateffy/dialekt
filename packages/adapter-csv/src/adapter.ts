import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import type { ResourceRef, TranslationAdapter, AdapterReadError, AdapterWriteError } from "dialekt";
import {
  AdapterReadError as AdapterReadErrorClass,
  AdapterWriteError as AdapterWriteErrorClass,
  NodePlatformLayer,
  readFileIfExists,
  writeFileEnsuringDir,
} from "dialekt";
import { FileSystem } from "@effect/platform";

export interface CsvAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}

function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({ adapter: "csv", locale, resource, cause }) as AdapterReadError;
}

function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "csv",
    locale,
    resource,
    cause,
  }) as AdapterWriteError;
}

function parseCsv(content: string): Record<string, string> {
  const lines = content.split("\n").filter((line) => line.trim() !== "");
  if (lines.length === 0) return {};
  const header = lines[0]!.split(",").map((h) => h.trim());
  const keyIndex = header.indexOf("key");
  const targetIndex = header.indexOf("target");
  if (keyIndex === -1 || targetIndex === -1) return {};
  const result: Record<string, string> = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i]!.split(",").map((c) => c.trim());
    const key = cells[keyIndex];
    const target = cells[targetIndex];
    if (key !== undefined && target !== undefined) result[key] = target;
  }
  return result;
}

function writeCsv(
  entries: Record<string, string>,
  existingSource?: Record<string, string>,
): string {
  const lines: string[] = ["key,source,target"];
  for (const [key, target] of Object.entries(entries)) {
    const source = existingSource?.[key] ?? "";
    lines.push(`${key},${source},${target}`);
  }
  return lines.join("\n") + "\n";
}

function readCsvResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const content = yield* readFileIfExists(path.join(dir, `${locale}.csv`)).pipe(
      Effect.mapError((cause) => readError(locale, resource.key, cause)),
    );
    if (content === null) return {};
    return parseCsv(content);
  });
}

function writeCsvResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const filePath = path.join(dir, `${locale}.csv`);
    const existing = yield* readFileIfExists(filePath).pipe(Effect.orElseSucceed(() => null));
    const sourceMap: Record<string, string> = {};
    if (existing !== null) {
      const lines = existing.split("\n").filter((line) => line.trim() !== "");
      if (lines.length > 0) {
        const header = lines[0]!.split(",").map((h) => h.trim());
        const keyIndex = header.indexOf("key");
        const sourceIndex = header.indexOf("source");
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i]!.split(",").map((c) => c.trim());
          if (keyIndex !== -1 && sourceIndex !== -1) {
            const key = cells[keyIndex];
            const source = cells[sourceIndex];
            if (key !== undefined && source !== undefined) sourceMap[key] = source;
          }
        }
      }
    }
    yield* writeFileEnsuringDir(filePath, writeCsv(entries, sourceMap)).pipe(
      Effect.mapError((cause) => writeError(locale, resource.key, cause)),
    );
  });
}

export function csv(options: CsvAdapterOptions): TranslationAdapter {
  const { dir, resourceKey = "messages" } = options;
  const resource: ResourceRef = { key: resourceKey, label: `${resourceKey}.csv` };
  return {
    name: "csv",
    capabilities: { canCreateResource: true, unusedKeyDetection: false },
    listLocales: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs
          .readDirectory(dir)
          .pipe(Effect.orElseSucceed(() => [] as string[]));
        return entries.filter((e) => e.endsWith(".csv")).map((e) => e.replace(/\.csv$/, ""));
      }).pipe(
        Effect.mapError((cause) => readError("", "", cause)),
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
    listResources: () => Effect.succeed([resource]),
    readResource: (locale, _) =>
      readCsvResource(dir, locale, resource).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
    writeResource: (locale, _, entries) =>
      writeCsvResource(dir, locale, resource, entries).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<void, AdapterWriteError, never>,
  };
}
