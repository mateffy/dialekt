import { Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { loadConfig } from "../../config/load-config.js";
import { scanProjectHardcoded } from "../../hardcoded/scan.js";
import type { HardcodedFinding } from "../../hardcoded/types.js";
import type { DialektConfig } from "../../config/types.js";
import { detectFormat, type OutputFormat } from "../format.js";
import { formatHardcoded } from "../hardcoded-formatters.js";

export interface HardcodedFlags {
  readonly config: string;
  readonly format?: Option.Option<string>;
}

export type HardcodedRunner = (
  config: DialektConfig,
) => Effect.Effect<readonly HardcodedFinding[], unknown>;

export function runHardcoded(
  flags: HardcodedFlags,
  configLoader: (path: string) => Effect.Effect<DialektConfig, unknown> = loadConfig,
  hardcodedRunner: HardcodedRunner = scanProjectHardcoded,
  logger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.log(msg),
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const config = yield* configLoader(flags.config);
    const findings = yield* hardcodedRunner(config);
    const format = detectFormat(
      flags.format !== undefined
        ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
        : undefined,
    );
    yield* logger(formatHardcoded(findings, format));
  }).pipe(Effect.mapError((e) => e as never)) as Effect.Effect<void, never, never>;
}

export const hardcodedCommand = Command.make(
  "hardcoded",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runHardcoded(flags),
);
