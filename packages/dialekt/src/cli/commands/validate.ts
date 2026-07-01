import { Command, Options } from '@effect/cli';
import { Effect, Console, Option } from 'effect';
import { loadConfig } from '../../config/load-config.js';
import { resolveEffectiveConfig } from '../config-resolution.js';
import { computeMissingKeys } from '../../translation/missing-keys.js';
import { detectFormat, type OutputFormat } from '../format.js';
import { formatValidate, formatError } from '../formatters.js';
import type { DialektConfig } from '../../config/types.js';
import type { TranslationAdapter, ResourceRef } from '../../adapter/types.js';

export interface ValidateFlags {
  readonly config: string;
  readonly adapter: Option.Option<string>;
  readonly baseLanguage: Option.Option<string>;
  readonly language: Option.Option<string>;
  readonly format?: Option.Option<string>;
}

export interface MissingEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: ResourceRef;
  readonly missing: readonly string[];
}

export function runValidate(
  flags: ValidateFlags,
  configLoader: (path: string) => Effect.Effect<DialektConfig, unknown> = loadConfig,
  missingKeysComputer: (
    adapter: TranslationAdapter,
    sourceLocale: string,
    targetLocales: readonly string[],
  ) => Effect.Effect<readonly MissingEntry[], unknown> = computeMissingKeys as unknown as typeof missingKeysComputer,
  logger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.log(msg),
): Effect.Effect<void, Error> {
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

    const entries: Array<{
      adapter: string;
      locale: string;
      resource: string;
      count: number;
    }> = [];

    for (const a of effective.adapters) {
      const locales = yield* a.listLocales();
      const sourceLocale = effective.sourceLocale;
      const targets = locales.filter((l) => l !== sourceLocale);

      const missingEntries = yield* missingKeysComputer(a, sourceLocale, targets);
      for (const entry of missingEntries) {
        entries.push({
          adapter: entry.adapter,
          locale: entry.locale,
          resource: entry.resource.label,
          count: entry.missing.length,
        });
      }
    }

    const format = detectFormat(
      flags.format !== undefined
        ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
        : undefined,
    );

    const passing = entries.length === 0;

    yield* logger(
      formatValidate({ passing, entries }, format),
    );

    if (!passing) {
      yield* Effect.sync(() => {
        process.exitCode = 1;
      });
    }
  }).pipe(Effect.mapError((e) => e as Error)) as Effect.Effect<void, Error, never>;
}

export const validateCommand = Command.make('validate', {
  config: Options.text('config').pipe(Options.withDefault('./dialekt.config.ts')),
  adapter: Options.optional(Options.text('adapter')),
  baseLanguage: Options.optional(Options.text('base-language')),
  language: Options.optional(Options.text('language')),
  format: Options.optional(Options.text('format')),
}, (flags) => runValidate(flags));
