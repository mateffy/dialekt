import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { AdapterReadError } from "dialekt";
import { AdapterReadError as AdapterReadErrorClass } from "dialekt";

export function findUnusedLaravelKeys(
  scanPaths: readonly string[],
  domain: string,
  keys: readonly string[],
): Effect.Effect<string[], AdapterReadError> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // Collect all referenced domain.key strings from source files.
    const referenced = new Set<string>();

    for (const scanPath of scanPaths) {
      const exists = yield* fs.exists(scanPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) continue;

      const entries = yield* fs
        .readDirectory(scanPath, { recursive: true })
        .pipe(Effect.orElseSucceed(() => [] as string[]));

      for (const relativePath of entries) {
        if (!relativePath.endsWith(".php") && !relativePath.endsWith(".blade.php")) {
          continue;
        }
        const filePath = path.join(scanPath, relativePath);
        const content = yield* fs.readFileString(filePath).pipe(Effect.orElseSucceed(() => ""));

        // Extract all quoted string literals from the file content.
        const quotedStrings: string[] = [];
        const patterns = [/'((?:[^'\\]|\\.)*)'/g, /"((?:[^"\\]|\\.)*)"/g];
        for (const pattern of patterns) {
          let m: RegExpExecArray | null;
          while ((m = pattern.exec(content)) !== null) {
            if (m[1] !== undefined) quotedStrings.push(m[1]!);
          }
        }

        const fullKeys = new Set(keys.map((key) => `${domain}.${key}`));
        for (const str of quotedStrings) {
          if (fullKeys.has(str)) {
            referenced.add(str.slice(domain.length + 1));
          }
        }
      }
    }

    return keys.filter((key) => !referenced.has(key));
  }).pipe(
    Effect.mapError(
      (cause) =>
        new AdapterReadErrorClass({
          adapter: "laravel",
          locale: "",
          resource: domain,
          cause,
        }) as AdapterReadError,
    ),
  );
}
