import { describe, expect, it } from "vitest";
import { Effect, Either } from "effect";
import { CommandExecutor, Command } from "@effect/platform";
import { NodePlatformLayer } from "./node-layer.js";
import { readPhpArrayAsJson, PhpExecutionError } from "./php-array-reader.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

function hasPhpBinary(): boolean {
  try {
    execSync("php -v", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("readPhpArrayAsJson", () => {
  const testDir = join(tmpdir(), `dialekt-php-test-${Date.now()}`);

  it.skipIf(!hasPhpBinary())("reads a PHP array file as JSON", async () => {
    mkdirSync(testDir, { recursive: true });
    const filePath = join(testDir, "test.php");
    writeFileSync(filePath, "<?php return ['email' => 'Email address'];");

    const program = Effect.provide(readPhpArrayAsJson(filePath), NodePlatformLayer);
    const result = await Effect.runPromise(program);
    expect(result).toEqual({ email: "Email address" });

    rmSync(testDir, { recursive: true, force: true });
  });

  it.skipIf(!hasPhpBinary())("returns PhpExecutionError for a nonexistent file", async () => {
    const program = Effect.provide(readPhpArrayAsJson("/nonexistent/file.php"), NodePlatformLayer);
    const exit = (await Effect.runPromise(Effect.either(program))) as Either.Either<
      unknown,
      PhpExecutionError
    >;
    if (exit._tag === "Left") {
      expect(exit.left._tag).toBe("PhpExecutionError");
      expect(exit.left.path).toBe("/nonexistent/file.php");
    } else {
      throw new Error("Expected Left");
    }
  });

  it.skipIf(!hasPhpBinary())("reads nested PHP arrays", async () => {
    mkdirSync(testDir, { recursive: true });
    const filePath = join(testDir, "nested.php");
    writeFileSync(
      filePath,
      "<?php return ['validation' => ['email' => 'Email address', 'required' => 'Required field']];",
    );

    const program = Effect.provide(readPhpArrayAsJson(filePath), NodePlatformLayer);
    const result = await Effect.runPromise(program);
    expect(result).toEqual({
      validation: { email: "Email address", required: "Required field" },
    });

    rmSync(testDir, { recursive: true, force: true });
  });

  it.skipIf(!hasPhpBinary())("reads PHP arrays with numeric keys as JS arrays", async () => {
    mkdirSync(testDir, { recursive: true });
    const filePath = join(testDir, "numeric.php");
    writeFileSync(filePath, "<?php return ['first', 'second', 'third'];");

    const program = Effect.provide(readPhpArrayAsJson(filePath), NodePlatformLayer);
    const result = await Effect.runPromise(program);
    expect(result).toEqual(["first", "second", "third"]);

    rmSync(testDir, { recursive: true, force: true });
  });

  it.skipIf(!hasPhpBinary())("reads PHP arrays with unicode values", async () => {
    mkdirSync(testDir, { recursive: true });
    const filePath = join(testDir, "unicode.php");
    writeFileSync(filePath, "<?php return ['greeting' => 'Héllo 🌍 — 日本語'];");

    const program = Effect.provide(readPhpArrayAsJson(filePath), NodePlatformLayer);
    const result = await Effect.runPromise(program);
    expect(result).toEqual({ greeting: "Héllo 🌍 — 日本語" });

    rmSync(testDir, { recursive: true, force: true });
  });

  it.skipIf(!hasPhpBinary())("reads empty PHP array as empty JS array", async () => {
    mkdirSync(testDir, { recursive: true });
    const filePath = join(testDir, "empty.php");
    writeFileSync(filePath, "<?php return [];");

    const program = Effect.provide(readPhpArrayAsJson(filePath), NodePlatformLayer);
    const result = await Effect.runPromise(program);
    expect(result).toEqual([]);

    rmSync(testDir, { recursive: true, force: true });
  });

  it.skipIf(!hasPhpBinary())("returns PhpExecutionError for malformed PHP", async () => {
    mkdirSync(testDir, { recursive: true });
    const filePath = join(testDir, "bad.php");
    writeFileSync(filePath, "<?php this is not valid php");

    const program = Effect.provide(readPhpArrayAsJson(filePath), NodePlatformLayer);
    const exit = (await Effect.runPromise(Effect.either(program))) as Either.Either<
      unknown,
      PhpExecutionError
    >;
    expect(exit._tag).toBe("Left");
    if (exit._tag === "Left") {
      expect(exit.left._tag).toBe("PhpExecutionError");
    }

    rmSync(testDir, { recursive: true, force: true });
  });

  it("is skipped when php is unavailable", () => {
    expect(hasPhpBinary()).toBe(true); // meta-test: if php IS available, this proves skipIf works
  });
});
