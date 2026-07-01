import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { NodePlatformLayer } from "dialekt";
import { findUnusedLaravelKeys } from "./unused-keys.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("findUnusedLaravelKeys", () => {
  it("finds keys not referenced in source files", async () => {
    const dir = join(tmpdir(), `laravel-unused-${Date.now()}`);
    mkdirSync(join(dir, "views"), { recursive: true });
    writeFileSync(join(dir, "views", "email.blade.php"), "<div>{{ __('validation.email') }}</div>");

    const program = findUnusedLaravelKeys([dir], "validation", ["email", "password"]).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual(["password"]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("finds @lang references too", async () => {
    const dir = join(tmpdir(), `laravel-unused-lang-${Date.now()}`);
    mkdirSync(join(dir, "views"), { recursive: true });
    writeFileSync(join(dir, "views", "page.blade.php"), "@lang('validation.password')");

    const program = findUnusedLaravelKeys([dir], "validation", ["email", "password"]).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual(["email"]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("finds trans() references too", async () => {
    const dir = join(tmpdir(), `laravel-unused-trans-${Date.now()}`);
    mkdirSync(join(dir, "app"), { recursive: true });
    writeFileSync(join(dir, "app", "Controller.php"), "trans('validation.email');");

    const program = findUnusedLaravelKeys([dir], "validation", ["email", "password"]).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual(["password"]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("does not treat substrings as matches", async () => {
    const dir = join(tmpdir(), `laravel-unused-substr-${Date.now()}`);
    mkdirSync(join(dir, "views"), { recursive: true });
    writeFileSync(join(dir, "views", "page.blade.php"), "__('validation.email_longer')");

    const program = findUnusedLaravelKeys([dir], "validation", ["email", "email_longer"]).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual(["email"]);

    rmSync(dir, { recursive: true, force: true });
  });
});
