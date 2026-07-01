import { Command, Options } from "@effect/cli";
import { Effect, Console, Option } from "effect";
import { loadConfig } from "../../config/load-config.js";
import { resolveEffectiveConfig } from "../config-resolution.js";
import { detectFormat, type OutputFormat } from "../format.js";
import { formatLanguages } from "../formatters.js";
import type { DialektConfig } from "../../config/types.js";
import type { TranslationAdapter } from "../../adapter/types.js";

export interface LanguagesFlags {
  readonly config: string;
  readonly format?: Option.Option<string>;
}

export function runLanguages(
  flags: LanguagesFlags,
  configLoader: (path: string) => Effect.Effect<DialektConfig, unknown> = loadConfig,
  logger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.log(msg),
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig({}, loaded);

    const entries: Array<{ adapter: string; locales: readonly string[] }> = [];
    for (const adapter of effective.adapters) {
      const locales = yield* adapter.listLocales();
      entries.push({ adapter: adapter.name, locales });
    }

    const format = detectFormat(
      flags.format !== undefined
        ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
        : undefined,
    );
    yield* logger(formatLanguages(entries, format));
  }).pipe(Effect.mapError((e) => e as never)) as Effect.Effect<void, never, never>;
}

export const languagesCommand = Command.make(
  "languages",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runLanguages(flags),
);
