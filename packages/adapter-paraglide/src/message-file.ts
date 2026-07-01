import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import { flattenObject, unflattenObject } from "dialekt";

export interface MessageFileResult {
  readonly translations: Record<string, string>;
  readonly meta: Record<string, unknown>;
}

export function readMessageFile(
  path: string,
): Effect.Effect<MessageFileResult, never, FileSystem.FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false));
    if (!exists) {
      return { translations: {}, meta: {} };
    }
    const content = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => "{}"));
    const parsed = yield* Effect.try({
      try: () => JSON.parse(content) as Record<string, unknown>,
      catch: () => ({}),
    }).pipe(Effect.orElseSucceed(() => ({})));

    const meta: Record<string, unknown> = {};
    const translations: Record<string, string> = {};

    for (const [key, value] of Object.entries(parsed)) {
      if (key.startsWith("$")) {
        meta[key] = value;
      } else if (typeof value === "string") {
        translations[key] = value;
      } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        const flattened = flattenObject(value as Record<string, unknown>);
        for (const [flatKey, flatValue] of Object.entries(flattened)) {
          if (typeof flatValue === "string") {
            translations[`${key}.${flatKey}`] = flatValue;
          }
        }
      }
    }

    return { translations, meta };
  });
}

export function writeMessageFile(
  path: string,
  translations: Record<string, string>,
  meta: Record<string, unknown>,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path_ = yield* Path.Path;
    const dir = path_.dirname(path);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orElseSucceed(() => undefined));

    const unflattened = unflattenObject(translations);
    const output: Record<string, unknown> = { ...meta };
    for (const [key, value] of Object.entries(unflattened)) {
      output[key] = value;
    }

    yield* fs
      .writeFileString(path, JSON.stringify(output, null, 2) + "\n")
      .pipe(Effect.orElseSucceed(() => undefined));
  });
}
