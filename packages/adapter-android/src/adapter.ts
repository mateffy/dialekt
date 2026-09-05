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
import { XMLParser, XMLBuilder } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  preserveOrder: false,
});
const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export interface AndroidAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}

function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({
    adapter: "android",
    locale,
    resource,
    cause,
  }) as AdapterReadError;
}

function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "android",
    locale,
    resource,
    cause,
  }) as AdapterWriteError;
}

function normalizeArray<T>(raw: unknown): T[] {
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as T[]) : [raw as T];
}

function readAndroidResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const content = yield* readFileIfExists(
      path.join(dir, `res/values-${locale}/strings.xml`),
    ).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
    if (content === null) return {};
    const parsed = parser.parse(content) as Record<string, unknown>;
    const resources = (parsed.resources ?? {}) as Record<string, unknown>;
    const result: Record<string, string> = {};
    for (const stringItem of normalizeArray<Record<string, unknown>>(resources.string)) {
      const name = String(stringItem["@_name"] ?? "");
      const value = String(stringItem["#text"] ?? "");
      if (name) result[name] = value;
    }
    for (const pluralItem of normalizeArray<Record<string, unknown>>(resources.plurals)) {
      const pluralName = String(pluralItem["@_name"] ?? "");
      for (const item of normalizeArray<Record<string, unknown>>(pluralItem.item)) {
        const quantity = String(item["@_quantity"] ?? "");
        const value = String(item["#text"] ?? "");
        if (pluralName && quantity) result[`${pluralName}.${quantity}`] = value;
      }
    }
    return result;
  });
}

function writeAndroidResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const filePath = path.join(dir, `res/values-${locale}/strings.xml`);
    const strings: Array<Record<string, unknown>> = [];
    const pluralsMap: Record<string, Record<string, string>> = {};
    for (const [key, value] of Object.entries(entries)) {
      const pluralMatch = /^(.+)\.(one|other|zero|two|few|many)$/.exec(key);
      if (pluralMatch) {
        const base = pluralMatch[1]!;
        const quantity = pluralMatch[2]!;
        pluralsMap[base] ??= {};
        pluralsMap[base][quantity] = value;
      } else {
        strings.push({ "@_name": key, "#text": value });
      }
    }
    const pluralEntries: Array<Record<string, unknown>> = [];
    for (const [name, items] of Object.entries(pluralsMap)) {
      pluralEntries.push({
        "@_name": name,
        item: Object.entries(items).map(([quantity, value]) => ({
          "@_quantity": quantity,
          "#text": value,
        })),
      });
    }
    const obj = {
      resources: {
        ...(strings.length > 0 ? { string: strings } : {}),
        ...(pluralEntries.length > 0 ? { plurals: pluralEntries } : {}),
      },
    };
    const XML_ENCODING = "utf-8";
    const xml = `<?xml version="1.0" encoding="${XML_ENCODING}"?>\n${builder.build(obj) as string}\n`;
    yield* writeFileEnsuringDir(filePath, xml).pipe(
      Effect.mapError((cause) => writeError(locale, resource.key, cause)),
    );
  });
}

export function android(options: AndroidAdapterOptions): TranslationAdapter {
  const { dir, resourceKey = "strings" } = options;
  const resource: ResourceRef = { key: resourceKey, label: "strings.xml" };
  return {
    name: "android",
    capabilities: { canCreateResource: true, unusedKeyDetection: false },
    listLocales: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path_ = yield* Path;
        const resDir = path_.join(dir, "res");
        const exists = yield* fs.exists(resDir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs
          .readDirectory(resDir)
          .pipe(Effect.orElseSucceed(() => [] as string[]));
        return entries.filter((e) => e.startsWith("values-")).map((e) => e.replace(/^values-/, ""));
      }).pipe(
        Effect.mapError((cause) => readError("", "", cause)),
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
    listResources: () => Effect.succeed([resource]),
    readResource: (locale, _) =>
      readAndroidResource(dir, locale, resource).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
    writeResource: (locale, _, entries) =>
      writeAndroidResource(dir, locale, resource, entries).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<void, AdapterWriteError, never>,
  };
}
