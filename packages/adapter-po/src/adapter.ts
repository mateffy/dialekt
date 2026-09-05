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

export interface PoAdapterOptions {
  readonly dir: string;
  readonly resourceKey?: string;
}

function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
  return new AdapterReadErrorClass({ adapter: "po", locale, resource, cause }) as AdapterReadError;
}

function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
  return new AdapterWriteErrorClass({
    adapter: "po",
    locale,
    resource,
    cause,
  }) as AdapterWriteError;
}

function extractQuotedStrings(lines: string[]): string {
  return lines
    .map((line) => {
      const trimmed = line.trim();
      const firstQuote = trimmed.indexOf('"');
      const lastQuote = trimmed.lastIndexOf('"');
      if (firstQuote !== -1 && lastQuote > firstQuote) {
        return trimmed.slice(firstQuote + 1, lastQuote);
      }
      return "";
    })
    .join("")
    .replace(/\\n/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parsePo(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split("\n");
  let i = 0;
  let currentContext = "";
  let currentMsgid: string | null = null;
  let currentMsgidPlural: string | null = null;
  let currentMsgstr: string[] = [];
  let currentMsgstrPlural: Record<number, string[]> = {};
  let currentPluralIndex: number | null = null;

  function flushEntry(): void {
    if (currentMsgid !== null) {
      const key = currentContext ? `${currentContext}.${currentMsgid}` : currentMsgid;
      if (currentMsgidPlural !== null) {
        const indices = Object.keys(currentMsgstrPlural)
          .map(Number)
          .sort((a, b) => a - b);
        const one = indices.find((idx) => currentMsgstrPlural[idx] !== undefined);
        if (one !== undefined) {
          result[`${key}.one`] = extractQuotedStrings(currentMsgstrPlural[one]!);
        }
        const last = indices[indices.length - 1];
        if (last !== undefined && last !== one) {
          result[`${key}.other`] = extractQuotedStrings(currentMsgstrPlural[last]!);
        }
      } else {
        result[key] = extractQuotedStrings(currentMsgstr);
      }
    }
    currentMsgid = null;
    currentMsgidPlural = null;
    currentMsgstr = [];
    currentMsgstrPlural = {};
    currentPluralIndex = null;
  }

  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();

    if (trimmed === "" || trimmed.startsWith("#")) {
      flushEntry();
      currentContext = "";
      i++;
      continue;
    }

    if (trimmed.startsWith('msgctxt "')) {
      flushEntry();
      const ctxtLines: string[] = [trimmed];
      i++;
      while (i < lines.length && lines[i]!.trim().startsWith('"')) {
        ctxtLines.push(lines[i]!.trim());
        i++;
      }
      currentContext = extractQuotedStrings(ctxtLines);
      continue;
    }

    if (trimmed.startsWith('msgid "')) {
      flushEntry();
      const idLines: string[] = [trimmed];
      i++;
      while (i < lines.length && lines[i]!.trim().startsWith('"')) {
        idLines.push(lines[i]!.trim());
        i++;
      }
      currentMsgid = extractQuotedStrings(idLines);
      continue;
    }

    if (trimmed.startsWith('msgid_plural "')) {
      const pluralLines: string[] = [trimmed];
      i++;
      while (i < lines.length && lines[i]!.trim().startsWith('"')) {
        pluralLines.push(lines[i]!.trim());
        i++;
      }
      currentMsgidPlural = extractQuotedStrings(pluralLines);
      continue;
    }

    const pluralMatch = /^msgstr\[(\d+)\]\s+"/.exec(trimmed);
    if (pluralMatch) {
      currentPluralIndex = Number(pluralMatch[1]);
      const strLines: string[] = [trimmed.slice(pluralMatch[0].indexOf('"'))];
      i++;
      while (i < lines.length && lines[i]!.trim().startsWith('"')) {
        strLines.push(lines[i]!.trim());
        i++;
      }
      if (currentPluralIndex !== null) {
        currentMsgstrPlural[currentPluralIndex] = strLines;
      }
      continue;
    }

    if (trimmed.startsWith('msgstr "')) {
      const strLines: string[] = [trimmed];
      i++;
      while (i < lines.length && lines[i]!.trim().startsWith('"')) {
        strLines.push(lines[i]!.trim());
        i++;
      }
      currentMsgstr = strLines;
      continue;
    }

    i++;
  }

  flushEntry();
  return result;
}

function escapePoValue(value: string): string {
  return (
    '"' +
    value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\t/g, "\\t") +
    '"'
  );
}

function writePo(entries: Record<string, string>): string {
  const lines: string[] = [];
  const groups: Record<string, { one?: string; other?: string; single?: string }> = {};

  for (const [key, value] of Object.entries(entries)) {
    const pluralMatch = /^(.+)\.(one|other)$/.exec(key);
    if (pluralMatch) {
      const base = pluralMatch[1]!;
      const form = pluralMatch[2] as "one" | "other";
      groups[base] ??= {};
      groups[base][form] = value;
    } else {
      groups[key] ??= {};
      groups[key].single = value;
    }
  }

  for (const [key, group] of Object.entries(groups)) {
    if (group.single !== undefined) {
      lines.push(`msgid ${escapePoValue(key)}`);
      lines.push(`msgstr ${escapePoValue(group.single)}`);
      lines.push("");
    } else if (group.one !== undefined || group.other !== undefined) {
      lines.push(`msgid ${escapePoValue(key)}`);
      lines.push(`msgid_plural ${escapePoValue(key)}`);
      lines.push(`msgstr[0] ${escapePoValue(group.one ?? group.other ?? "")}`);
      lines.push(`msgstr[1] ${escapePoValue(group.other ?? group.one ?? "")}`);
      lines.push("");
    }
  }

  return lines.join("\n");
}

function readPoResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
): Effect.Effect<Record<string, string>, AdapterReadError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    const content = yield* readFileIfExists(path.join(dir, `${locale}.po`)).pipe(
      Effect.mapError((cause) => readError(locale, resource.key, cause)),
    );
    if (content === null) return {};
    return parsePo(content);
  });
}

function writePoResource(
  dir: string,
  locale: string,
  resource: ResourceRef,
  entries: Record<string, string>,
): Effect.Effect<void, AdapterWriteError, FileSystem.FileSystem | Path> {
  return Effect.gen(function* () {
    const path = yield* Path;
    yield* writeFileEnsuringDir(path.join(dir, `${locale}.po`), writePo(entries)).pipe(
      Effect.mapError((cause) => writeError(locale, resource.key, cause)),
    );
  });
}

export function po(options: PoAdapterOptions): TranslationAdapter {
  const { dir, resourceKey = "messages" } = options;
  const resource: ResourceRef = { key: resourceKey, label: `${resourceKey}.po` };
  return {
    name: "po",
    capabilities: { canCreateResource: true, unusedKeyDetection: false },
    listLocales: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs
          .readDirectory(dir)
          .pipe(Effect.orElseSucceed(() => [] as string[]));
        return entries.filter((e) => e.endsWith(".po")).map((e) => e.replace(/\.po$/, ""));
      }).pipe(
        Effect.mapError((cause) => readError("", "", cause)),
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,
    listResources: () => Effect.succeed([resource]),
    readResource: (locale, _) =>
      readPoResource(dir, locale, resource).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
    writeResource: (locale, _, entries) =>
      writePoResource(dir, locale, resource, entries).pipe(
        Effect.provide(NodePlatformLayer),
      ) as Effect.Effect<void, AdapterWriteError, never>,
  };
}
