import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { AdapterReadError } from "dialekt";
import { AdapterReadError as AdapterReadErrorClass } from "dialekt";

export function findUnusedParaglideKeys(scanPaths: readonly string[], keys: readonly string[]) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    const referenced = new Set<string>();

    for (const scanPath of scanPaths) {
      const exists = yield* fs.exists(scanPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) continue;

      const entries = yield* fs
        .readDirectory(scanPath, { recursive: true })
        .pipe(Effect.orElseSucceed(() => [] as string[]));

      for (const relativePath of entries) {
        if (
          !relativePath.endsWith(".ts") &&
          !relativePath.endsWith(".tsx") &&
          !relativePath.endsWith(".js") &&
          !relativePath.endsWith(".jsx") &&
          !relativePath.endsWith(".svelte") &&
          !relativePath.endsWith(".vue")
        ) {
          continue;
        }
        const filePath = path.join(scanPath, relativePath);
        const content = yield* fs.readFileString(filePath).pipe(Effect.orElseSucceed(() => ""));

        for (const key of keys) {
          const pattern = new RegExp(`\\bm\\.${key}\\b`);
          if (pattern.test(content)) {
            referenced.add(key);
          }
        }
      }
    }

    return keys.filter((key) => !referenced.has(key));
  }).pipe(
    Effect.mapError(
      (cause) =>
        new AdapterReadErrorClass({
          adapter: "paraglide",
          locale: "",
          resource: "messages",
          cause,
        }) as AdapterReadError,
    ),
  );
}
