import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";

export function readFileIfExists(
  path: string,
): Effect.Effect<string | null, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const exists = yield* fs.exists(path);
    if (!exists) return null;
    return yield* fs.readFileString(path);
  });
}

export function writeFileEnsuringDir(
  path: string,
  content: string,
): Effect.Effect<void, never, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path_ = yield* Path.Path;
    const dir = path_.dirname(path);
    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFileString(path, content);
  });
}
