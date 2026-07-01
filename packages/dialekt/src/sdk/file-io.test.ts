import { describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { readFileIfExists, writeFileEnsuringDir } from "./file-io.js";

function makeFsLayer(files: Record<string, string>) {
  const stub = FileSystem.makeNoop({
    exists: (path) => Effect.succeed(path in files),
    readFileString: (path) =>
      path in files
        ? Effect.succeed(files[path]!)
        : Effect.fail(new Error(`ENOENT: ${path}`) as never),
    writeFileString: (path, content) => {
      files[path] = content;
      return Effect.void;
    },
    makeDirectory: () => Effect.void,
  });
  return Layer.succeed(FileSystem.FileSystem, stub);
}

describe("readFileIfExists", () => {
  it("returns content when file exists", async () => {
    const files = { "/a/b.txt": "hello" };
    const program = readFileIfExists("/a/b.txt").pipe(Effect.provide(makeFsLayer(files)));
    const result = await Effect.runPromise(program);
    expect(result).toBe("hello");
  });

  it("returns null when file does not exist", async () => {
    const program = readFileIfExists("/a/missing.txt").pipe(Effect.provide(makeFsLayer({})));
    const result = await Effect.runPromise(program);
    expect(result).toBeNull();
  });

  it("returns null for empty file system", async () => {
    const program = readFileIfExists("/any/path.txt").pipe(Effect.provide(makeFsLayer({})));
    const result = await Effect.runPromise(program);
    expect(result).toBeNull();
  });

  it("returns content for deeply nested path", async () => {
    const files = { "/very/deep/nested/file.txt": "deep content" };
    const program = readFileIfExists("/very/deep/nested/file.txt").pipe(
      Effect.provide(makeFsLayer(files)),
    );
    const result = await Effect.runPromise(program);
    expect(result).toBe("deep content");
  });

  it("handles unicode content", async () => {
    const files = { "/unicode.txt": "Héllo 🌍 — 日本語" };
    const program = readFileIfExists("/unicode.txt").pipe(Effect.provide(makeFsLayer(files)));
    const result = await Effect.runPromise(program);
    expect(result).toBe("Héllo 🌍 — 日本語");
  });

  it("handles empty string content", async () => {
    const files = { "/empty.txt": "" };
    const program = readFileIfExists("/empty.txt").pipe(Effect.provide(makeFsLayer(files)));
    const result = await Effect.runPromise(program);
    expect(result).toBe("");
  });
});

describe("writeFileEnsuringDir", () => {
  it("writes content and creates parent directories", async () => {
    const files: Record<string, string> = {};
    const program = writeFileEnsuringDir("/a/b/c.txt", "content").pipe(
      Effect.provide(makeFsLayer(files)),
      Effect.provide(Path.layer),
    );
    await Effect.runPromise(program);
    expect(files["/a/b/c.txt"]).toBe("content");
  });

  it("overwrites existing file", async () => {
    const files: Record<string, string> = { "/existing.txt": "old" };
    const program = writeFileEnsuringDir("/existing.txt", "new").pipe(
      Effect.provide(makeFsLayer(files)),
      Effect.provide(Path.layer),
    );
    await Effect.runPromise(program);
    expect(files["/existing.txt"]).toBe("new");
  });

  it("handles deeply nested paths", async () => {
    const files: Record<string, string> = {};
    const program = writeFileEnsuringDir("/a/b/c/d/e.txt", "nested").pipe(
      Effect.provide(makeFsLayer(files)),
      Effect.provide(Path.layer),
    );
    await Effect.runPromise(program);
    expect(files["/a/b/c/d/e.txt"]).toBe("nested");
  });

  it("handles empty content", async () => {
    const files: Record<string, string> = {};
    const program = writeFileEnsuringDir("/empty.txt", "").pipe(
      Effect.provide(makeFsLayer(files)),
      Effect.provide(Path.layer),
    );
    await Effect.runPromise(program);
    expect(files["/empty.txt"]).toBe("");
  });

  it("handles unicode content", async () => {
    const files: Record<string, string> = {};
    const content = "Héllo 🌍 — 日本語";
    const program = writeFileEnsuringDir("/unicode.txt", content).pipe(
      Effect.provide(makeFsLayer(files)),
      Effect.provide(Path.layer),
    );
    await Effect.runPromise(program);
    expect(files["/unicode.txt"]).toBe(content);
  });

  it("handles paths with spaces", async () => {
    const files: Record<string, string> = {};
    const program = writeFileEnsuringDir("/path with spaces/file.txt", "content").pipe(
      Effect.provide(makeFsLayer(files)),
      Effect.provide(Path.layer),
    );
    await Effect.runPromise(program);
    expect(files["/path with spaces/file.txt"]).toBe("content");
  });
});
