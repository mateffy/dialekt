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

export interface IosAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}

function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({ adapter: "ios", locale, resource, cause }) as AdapterReadError;
}

function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "ios",
    locale,
    resource,
    cause,
  }) as AdapterWriteError;
}

const HEX_DIGIT_COUNT = 4;
const HEX_RADIX = 16;
const UNICODE_ESCAPE_RE = new RegExp(`\\\\u([0-9a-fA-F]{${HEX_DIGIT_COUNT}})`, "g");

function unescapeStringsValue(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(UNICODE_ESCAPE_RE, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, HEX_RADIX)),
    );
}

function escapeStringsValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t");
}

function parseStrings(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  let i = 0;

  while (i < content.length) {
    const ch = content[i];
    if (ch === undefined) break;

    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i++;
      continue;
    }

    if (ch === "/" && content[i + 1] === "*") {
      i += 2;
      while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    if (ch === "/" && content[i + 1] === "/") {
      while (i < content.length && content[i] !== "\n") i++;
      continue;
    }

    if (ch !== '"') {
      i++;
      continue;
    }

    let key = "";
    i++;
    while (i < content.length) {
      const c = content[i]!;
      if (c === '"' && content[i - 1] !== "\\") break;
      key += c;
      i++;
    }
    i++;

    while (i < content.length && (content[i] === " " || content[i] === "\t")) i++;
    if (content[i] !== "=") continue;
    i++;
    while (i < content.length && (content[i] === " " || content[i] === "\t")) i++;
    if (content[i] !== '"') continue;
    i++;

    let value = "";
    while (i < content.length) {
      const c = content[i]!;
      if (c === '"' && content[i - 1] !== "\\") break;
      value += c;
      i++;
    }
    i++;

    while (i < content.length && content[i] === " ") i++;
    if (content[i] === ";") i++;

    result[unescapeStringsValue(key)] = unescapeStringsValue(value);
  }

  return result;
}

function writeStrings(entries: Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    lines.push(`"${escapeStringsValue(key)}" = "${escapeStringsValue(value)}";`);
  }
  return lines.join("\n") + "\n";
}

function readStringsResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const content = yield* readFileIfExists(path.join(dir, `${locale}.strings`)).pipe(
      Effect.mapError((cause) => readError(locale, resource.key, cause)),
    );
    if (content === null) return {};
    return parseStrings(content);
  });
}

function writeStringsResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    yield* writeFileEnsuringDir(path.join(dir, `${locale}.strings`), writeStrings(entries)).pipe(
      Effect.mapError((cause) => writeError(locale, resource.key, cause)),
    );
  });
}

export function ios(options: IosAdapterOptions): TranslationAdapter {
  const { dir, resourceKey = "messages" } = options;
  const resource: ResourceRef = { key: resourceKey, label: `${resourceKey}.strings` };
  return {
    name: "ios",
    capabilities: { canCreateResource: true, unusedKeyDetection: false },
    listLocales: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs
          .readDirectory(dir)
          .pipe(Effect.orElseSucceed(() => [] as string[]));
        return entries
          .filter((e) => e.endsWith(".strings"))
          .map((e) => e.replace(/\.strings$/, ""));
      }).pipe(
        Effect.mapError((cause) => readError("", "", cause)),
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
    listResources: () => Effect.succeed([resource]),
    readResource: (locale, _) =>
      readStringsResource(dir, locale, resource).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
    writeResource: (locale, _, entries) =>
      writeStringsResource(dir, locale, resource, entries).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<void, AdapterWriteError, never>,
  };
}
