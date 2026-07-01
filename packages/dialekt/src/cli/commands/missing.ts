import { Command, Options } from "@effect/cli";
import { Effect, Console, Option } from "effect";
import { loadConfig } from "../../config/load-config.js";
import { resolveEffectiveConfig } from "../config-resolution.js";
import { detectFormat, type OutputFormat } from "../format.js";
import { formatMissingKeys } from "../formatters.js";
import type { DialektConfig } from "../../config/types.js";
import type { TranslationAdapter } from "../../adapter/types.js";
import { computeMissingKeys, type MissingKeyEntry } from "../../translation/missing-keys.js";

export interface MissingFlags {
  readonly config: string;
  readonly adapter: Option.Option<string>;
  readonly baseLanguage: Option.Option<string>;
  readonly language: Option.Option<string>;
  readonly format?: Option.Option<string>;
}

export type MissingKeysEntry = MissingKeyEntry;

export function runMissing(
  flags: MissingFlags,
  configLoader: (path: string) => Effect.Effect<DialektConfig, unknown> = loadConfig,
  missingKeysComputer: (
    adapter: TranslationAdapter,
    sourceLocale: string,
    targetLocales: readonly string[],
  ) => Effect.Effect<readonly MissingKeysEntry[], unknown> = computeMissingKeys,
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

    const allEntries: Array<{
      adapter: string;
      locale: string;
      resource: string;
      key: string;
    }> = [];

    for (const a of effective.adapters) {
      const locales = yield* a.listLocales();
      const sourceLocale = effective.sourceLocale;
      const targets = locales.filter((l) => l !== sourceLocale);

      const entries = yield* missingKeysComputer(a, sourceLocale, targets);
      for (const entry of entries) {
        for (const key of entry.missing) {
          allEntries.push({
            adapter: entry.adapter,
            locale: entry.locale,
            resource: entry.resource.label,
            key,
          });
        }
      }
    }

    const format = detectFormat(
      flags.format !== undefined
        ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
        : undefined,
    );

    yield* logger(formatMissingKeys(allEntries, format));
  }).pipe(Effect.mapError((e) => e as never)) as Effect.Effect<void, never, never>;
}

export const missingCommand = Command.make(
  "missing",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    adapter: Options.optional(Options.text("adapter")),
    baseLanguage: Options.optional(Options.text("base-language")),
    language: Options.optional(Options.text("language")),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runMissing(flags),
);
