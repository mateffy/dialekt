import { Command } from "@effect/platform";
import type { CommandExecutor } from "@effect/platform/CommandExecutor";
import { Effect, Data } from "effect";

export class PhpExecutionError extends Data.TaggedError("PhpExecutionError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

const SINGLE_DUMP =
  "try { $v = require $argv[1]; } catch (\\Throwable $e) { $v = []; } echo json_encode(is_array($v) ? $v : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);";

export function readPhpArrayAsJson(
  absolutePath: string,
): Effect.Effect<Record<string, unknown>, PhpExecutionError, CommandExecutor> {
  return Effect.gen(function* () {
    const cmd = Command.make("php", "-r", SINGLE_DUMP, "--", absolutePath);
    const output = yield* Command.string(cmd).pipe(
      Effect.mapError((cause) => new PhpExecutionError({ path: absolutePath, cause })),
    );
    return yield* Effect.try({
      try: () => JSON.parse(output) as Record<string, unknown>,
      catch: (cause) => new PhpExecutionError({ path: absolutePath, cause }),
    });
  });
}

/** Read multiple PHP files in a single PHP process. Returns a map of path → parsed array. */
export function readPhpArraysBatch(
  absolutePaths: readonly string[],
): Effect.Effect<Record<string, Record<string, unknown>>, PhpExecutionError, CommandExecutor> {
  if (absolutePaths.length === 0) return Effect.succeed({});
  return Effect.gen(function* () {
    const pathsJson = JSON.stringify(absolutePaths);
    // Use double-quote string (not template literal) so $ signs are literal.
    const batchScript = "$paths = json_decode($argv[1], true); $out = []; foreach ($paths as $p) { try { $v = require $p; } catch (\\Throwable $e) { $v = []; } $out[$p] = is_array($v) ? $v : []; } echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);";
    const cmd = Command.make("php", "-r", batchScript, "--", pathsJson);
    const output = yield* Command.string(cmd).pipe(
      Effect.mapError((cause) => new PhpExecutionError({ path: absolutePaths[0]!, cause })),
    );
    return yield* Effect.try({
      try: () => JSON.parse(output) as Record<string, Record<string, unknown>>,
      catch: (cause) => new PhpExecutionError({ path: absolutePaths[0]!, cause }),
    });
  });
}