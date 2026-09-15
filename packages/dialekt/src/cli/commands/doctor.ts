import { Command, Options } from "@effect/cli";
import { Console, Effect, Option } from "effect";
import { loadConfig } from "../../config/load-config.js";
import { resolveEffectiveConfig } from "../config-resolution.js";
import { detectFormat, type OutputFormat } from "../format.js";
import { formatDoctor } from "../hardcoded-formatters.js";
import { scanProjectHardcoded } from "../../hardcoded/scan.js";
import type { HardcodedFinding } from "../../hardcoded/types.js";
import type { DialektConfig } from "../../config/types.js";
import { collectMissingEntries, type MissingEntry } from "./missing.js";
import type { HardcodedRunner } from "./hardcoded.js";

export interface DoctorFlags {
  readonly config: string;
  readonly adapter: Option.Option<string>;
  readonly baseLanguage: Option.Option<string>;
  readonly language: Option.Option<string>;
  readonly skipMissing: boolean;
  readonly skipHardcoded: boolean;
  readonly format?: Option.Option<string>;
}

export type MissingRunner = (
  effective: DialektConfig,
) => Effect.Effect<readonly MissingEntry[], unknown>;

export function runDoctor(
  flags: DoctorFlags,
  configLoader: (path: string) => Effect.Effect<DialektConfig, unknown> = loadConfig,
  missingRunner: MissingRunner = collectMissingEntries,
  hardcodedRunner: HardcodedRunner = scanProjectHardcoded,
  logger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.log(msg),
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      {
        baseLanguage: Option.getOrUndefined(flags.baseLanguage),
        language: Option.isSome(flags.language) ? [flags.language.value] : undefined,
        adapter: Option.getOrUndefined(flags.adapter),
      },
      loaded,
    );

    const missing: readonly MissingEntry[] = flags.skipMissing
      ? []
      : yield* missingRunner(effective);
    const hardcoded: readonly HardcodedFinding[] = flags.skipHardcoded
      ? []
      : yield* hardcodedRunner(effective);

    const format = detectFormat(
      flags.format !== undefined
        ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
        : undefined,
    );

    yield* logger(
      formatDoctor(
        {
          missing,
          hardcoded,
          skipped: { missing: flags.skipMissing, hardcoded: flags.skipHardcoded },
        },
        format,
      ),
    );
  }).pipe(Effect.mapError((e) => e as never)) as Effect.Effect<void, never, never>;
}

export const doctorCommand = Command.make(
  "doctor",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    adapter: Options.optional(Options.text("adapter")),
    baseLanguage: Options.optional(Options.text("base-language")),
    language: Options.optional(Options.text("language")),
    skipMissing: Options.boolean("skip-missing"),
    skipHardcoded: Options.boolean("skip-hardcoded"),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runDoctor(flags),
);
