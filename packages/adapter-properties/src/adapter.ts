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

export interface PropertiesAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}

function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({
    adapter: "properties",
    locale,
    resource,
    cause,
  }) as AdapterReadError;
}

function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "properties",
    locale,
    resource,
    cause,
  }) as AdapterWriteError;
}

const HEX_DIGIT_COUNT = 4;
const HEX_RADIX = 16;
const UNICODE_ESCAPE_RE = new RegExp(`\\\\u([0-9a-fA-F]{${HEX_DIGIT_COUNT}})`, "g");

function decodeUnicodeEscapes(value: string): string {
  return value.replace(UNICODE_ESCAPE_RE, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, HEX_RADIX)),
  );
}

function encodeUnicodeEscapes(value: string): string {
  let result = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 0x7f) {
      result += `\\u${code.toString(HEX_RADIX).padStart(HEX_DIGIT_COUNT, "0")}`;
    } else {
      result += char;
    }
  }
  return result;
}

function parseProperties(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");
  let currentLine = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith("!")) continue;

    if (line.endsWith("\\")) {
      currentLine += line.slice(0, -1);
      continue;
    }

    currentLine += line;
    const separatorIdx = currentLine.indexOf("=");
    if (separatorIdx === -1) {
      currentLine = "";
      continue;
    }
    const key = currentLine.slice(0, separatorIdx).trim();
    const value = decodeUnicodeEscapes(currentLine.slice(separatorIdx + 1).trim());
    result[key] = value;
    currentLine = "";
  }

  return result;
}

function writeProperties(entries: Record<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(entries)) {
    const escaped = encodeUnicodeEscapes(value)
      .replace(/\\/g, "\\\\")
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
    lines.push(`${key}=${escaped}`);
  }
  return lines.join("\n") + "\n";
}

function readPropertiesResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const content = yield* readFileIfExists(path.join(dir, `${locale}.properties`)).pipe(
      Effect.mapError((cause) => readError(locale, resource.key, cause)),
    );
    if (content === null) return {};
    return parseProperties(content);
  });
}

function writePropertiesResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    yield* writeFileEnsuringDir(
      path.join(dir, `${locale}.properties`),
      writeProperties(entries),
    ).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
  });
}

export function properties(options: PropertiesAdapterOptions): TranslationAdapter {
  const { dir, resourceKey = "messages" } = options;
  const resource: ResourceRef = { key: resourceKey, label: `${resourceKey}.properties` };
  return {
    name: "properties",
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
          .filter((e) => e.endsWith(".properties"))
          .map((e) => e.replace(/\.properties$/, ""));
      }).pipe(
        Effect.mapError((cause) => readError("", "", cause)),
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
    listResources: () => Effect.succeed([resource]),
    readResource: (locale, _) =>
      readPropertiesResource(dir, locale, resource).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
    writeResource: (locale, _, entries) =>
      writePropertiesResource(dir, locale, resource, entries).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<void, AdapterWriteError, never>,
  };
}
