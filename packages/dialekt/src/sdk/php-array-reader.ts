import { Command } from '@effect/platform';
import type { CommandExecutor } from '@effect/platform/CommandExecutor';
import { Effect, Data } from 'effect';

export class PhpExecutionError extends Data.TaggedError('PhpExecutionError')<{
  readonly path: string;
  readonly cause: unknown;
}> {}

const DUMP_SCRIPT =
  "echo json_encode(is_array($v = require $argv[1]) ? $v : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);";

export function readPhpArrayAsJson(
  absolutePath: string,
): Effect.Effect<Record<string, unknown>, PhpExecutionError, CommandExecutor> {
  return Effect.gen(function* () {
    const cmd = Command.make('php', '-r', DUMP_SCRIPT, '--', absolutePath);
    const output = yield* Command.string(cmd).pipe(
      Effect.mapError((cause) => new PhpExecutionError({ path: absolutePath, cause })),
    );
    return yield* Effect.try({
      try: () => JSON.parse(output) as Record<string, unknown>,
      catch: (cause) => new PhpExecutionError({ path: absolutePath, cause }),
    });
  });
}
