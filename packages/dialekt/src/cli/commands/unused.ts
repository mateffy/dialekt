import { Command, Options } from "@effect/cli";
import { Effect, Console, Option } from "effect";
import { loadConfig } from "../../config/load-config.js";
import { resolveEffectiveConfig } from "../config-resolution.js";
import { detectFormat, type OutputFormat } from "../format.js";
import { formatUnusedKeys, formatError } from "../formatters.js";
import type { DialektConfig } from "../../config/types.js";
import type { TranslationAdapter, ResourceRef } from "../../adapter/types.js";

export interface UnusedFlags {
  readonly config: string;
  readonly adapter: Option.Option<string>;
  readonly baseLanguage: Option.Option<string>;
  readonly format?: Option.Option<string>;
}

export function runUnused(
  flags: UnusedFlags,
  configLoader: (path: string) => Effect.Effect<DialektConfig, unknown> = loadConfig,
  logger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.log(msg),
  errorLogger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.error(msg),
): Effect.Effect<void, never> {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      {
        baseLanguage: Option.getOrUndefined(flags.baseLanguage),
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
      if (!a.capabilities.unusedKeyDetection) {
        yield* errorLogger(
          formatError(
            `Adapter '${a.name}' does not support unused-key detection.`,
            detectFormat(
              flags.format !== undefined
                ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
                : undefined,
            ),
          ),
        );
        continue;
      }

      const locales = yield* a.listLocales();
      const sourceLocale = effective.sourceLocale;
      const resources = yield* a.listResources(sourceLocale);

      for (const resource of resources) {
        const unused = yield* a.findUnusedKeys!(sourceLocale, resource);
        for (const key of unused) {
          allEntries.push({
            adapter: a.name,
            locale: sourceLocale,
            resource: resource.label,
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

    yield* logger(formatUnusedKeys(allEntries, format));
  }).pipe(Effect.mapError((e) => e as never)) as Effect.Effect<void, never, never>;
}

export const unusedCommand = Command.make(
  "unused",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    adapter: Options.optional(Options.text("adapter")),
    baseLanguage: Options.optional(Options.text("base-language")),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runUnused(flags),
);
