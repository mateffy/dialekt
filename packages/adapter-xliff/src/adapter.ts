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

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_" });

export interface XliffAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}

function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({
    adapter: "xliff",
    locale,
    resource,
    cause,
  }) as AdapterReadError;
}

function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "xliff",
    locale,
    resource,
    cause,
  }) as AdapterWriteError;
}

interface XliffUnit {
  readonly id: string;
  readonly source: string;
  readonly target?: string | undefined;
  readonly note?: string | undefined;
}

interface ParsedXliff {
  readonly sourceLang: string;
  readonly targetLang: string;
  readonly units: readonly XliffUnit[];
}

function normalizeUnits(raw: unknown): readonly XliffUnit[] {
  if (!raw) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr
    .filter((u) => u && typeof u === "object")
    .map((u) => ({
      id: String(u["@_id"] ?? ""),
      source: String(u.source ?? ""),
      target: u.target !== undefined ? String(u.target) : undefined,
      note: u.note !== undefined ? String(u.note) : undefined,
    }));
}

function parseXliff(xml: string): ParsedXliff {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const xliff = (parsed.xliff ?? parsed) as Record<string, unknown>;
  const file = (xliff.file ?? {}) as Record<string, unknown>;
  const body = (file.body ?? {}) as Record<string, unknown>;
  const rawUnits = body["trans-unit"];
  return {
    sourceLang: String(file["@_source-language"] ?? ""),
    targetLang: String(file["@_target-language"] ?? ""),
    units: normalizeUnits(rawUnits),
  };
}

const XML_VERSION = "1.0";
const XML_ENCODING = "UTF-8";
const XLIFF_VERSION = "1.2";
const XLIFF_XMLNS = "urn:oasis:names:tc:xliff:document:1.2";

function buildXliffObject(
  sourceLang: string,
  targetLang: string,
  units: readonly XliffUnit[],
): Record<string, unknown> {
  return {
    "?xml": { "@_version": XML_VERSION, "@_encoding": XML_ENCODING },
    xliff: {
      "@_version": XLIFF_VERSION,
      "@_xmlns": XLIFF_XMLNS,
      file: {
        "@_source-language": sourceLang,
        "@_target-language": targetLang,
        "@_datatype": "plaintext",
        body: {
          "trans-unit": units.map((u) => ({
            "@_id": u.id,
            source: u.source,
            ...(u.target !== undefined ? { target: u.target } : {}),
            ...(u.note !== undefined ? { note: u.note } : {}),
          })),
        },
      },
    },
  };
}

function readXliffResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const content = yield* readFileIfExists(path.join(dir, `${locale}.xlf`)).pipe(
      Effect.mapError((cause) => readError(locale, resource.key, cause)),
    );
    if (content === null) return {};
    const parsed = parseXliff(content);
    const result: Record<string, string> = {};
    for (const unit of parsed.units) {
      result[unit.id] = unit.target ?? unit.source;
    }
    return result;
  });
}

function writeXliffResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const filePath = path.join(dir, `${locale}.xlf`);
    const existing = yield* readFileIfExists(filePath).pipe(Effect.orElseSucceed(() => null));
    let parsed: ParsedXliff;
    if (existing !== null) {
      parsed = parseXliff(existing);
    } else {
      parsed = { sourceLang: "en", targetLang: locale, units: [] };
    }
    const unitMap = new Map<string, XliffUnit>();
    for (const u of parsed.units) unitMap.set(u.id, u);
    const newUnits: XliffUnit[] = [];
    for (const [key, value] of Object.entries(entries)) {
      const existingUnit = unitMap.get(key);
      newUnits.push({
        id: key,
        source: existingUnit?.source ?? key,
        target: value,
        note: existingUnit?.note,
      });
    }
    const obj = buildXliffObject(parsed.sourceLang, locale, newUnits);
    const xml = builder.build(obj) as string;
    yield* writeFileEnsuringDir(filePath, xml).pipe(
      Effect.mapError((cause) => writeError(locale, resource.key, cause)),
    );
  });
}

export function xliff(options: XliffAdapterOptions): TranslationAdapter {
  const { dir, resourceKey = "messages" } = options;
  const resource: ResourceRef = { key: resourceKey, label: `${resourceKey}.xlf` };
  return {
    name: "xliff",
    capabilities: { canCreateResource: true, unusedKeyDetection: false },
    listLocales: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs
          .readDirectory(dir)
          .pipe(Effect.orElseSucceed(() => [] as string[]));
        const locales: string[] = [];
        const path_ = yield* Path;
        for (const file of entries.filter((e) => e.endsWith(".xlf"))) {
          const content = yield* readFileIfExists(path_.join(dir, file)).pipe(
            Effect.orElseSucceed(() => null),
          );
          if (content !== null) {
            const parsed = parseXliff(content);
            if (parsed.targetLang) locales.push(parsed.targetLang);
          }
        }
        return locales;
      }).pipe(
        Effect.mapError((cause) => readError("", "", cause)),
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
    listResources: () => Effect.succeed([resource]),
    readResource: (locale, _) =>
      readXliffResource(dir, locale, resource).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
    writeResource: (locale, _, entries) =>
      writeXliffResource(dir, locale, resource, entries).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<void, AdapterWriteError, never>,
  };
}
