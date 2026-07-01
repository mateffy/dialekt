import { Command, Options } from '@effect/cli';
import { Effect, Console, Option } from 'effect';
import { loadConfig } from '../../config/load-config.js';
import { resolveEffectiveConfig } from '../config-resolution.js';
import { resolveModel } from '../../translation/model-registry.js';
import { createOneShotStrategy } from '../../translation/one-shot-strategy.js';
import { createToolLoopStrategy } from '../../translation/tool-loop-strategy.js';
import { runTranslation } from '../../translation/orchestrator.js';
import { detectFormat, formatTranslate, formatError, type OutputFormat } from '../format.js';
import type { DialektConfig } from '../../config/types.js';
import type { TranslationStrategy } from '../../translation/types.js';

export interface TranslateFlags {
  readonly config: string;
  readonly adapter: Option.Option<string>;
  readonly strategy: Option.Option<string>;
  readonly baseLanguage: Option.Option<string>;
  readonly language: Option.Option<string>;
  readonly name: Option.Option<string>;
  readonly skipNames: boolean;
  readonly skipLanguages: boolean;
  readonly fast: boolean;
  readonly format: Option.Option<string>;
}

export function runTranslate(
  flags: TranslateFlags,
  configLoader: (path: string) => Effect.Effect<DialektConfig, unknown> = loadConfig,
  modelResolver: (config: { provider: string; modelId: string }) => Effect.Effect<unknown, unknown> = resolveModel,
  translationRunner: (opts: {
    adapters: readonly unknown[];
    strategy: TranslationStrategy;
    sourceLocale: string;
    targetLocales: readonly string[];
    chunking: unknown;
  }) => Effect.Effect<void, unknown> = runTranslation as unknown as typeof translationRunner,
  logger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.log(msg),
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      {
        baseLanguage: Option.getOrUndefined(flags.baseLanguage),
        language: Option.isSome(flags.language) ? [flags.language.value] : undefined,
        adapter: Option.getOrUndefined(flags.adapter),
        strategy:
          Option.getOrUndefined(flags.strategy) === 'one-shot' ||
          Option.getOrUndefined(flags.strategy) === 'tool-loop-agent'
            ? (Option.getOrUndefined(flags.strategy) as 'one-shot' | 'tool-loop-agent')
            : undefined,
      },
      loaded,
    );

    const modelConfig = flags.fast ? effective.fastModel : effective.model;
    const model = yield* modelResolver(modelConfig) as Effect.Effect<import('ai').LanguageModel, unknown>;

    const translationStrategy =
      effective.strategy === 'tool-loop-agent'
        ? createToolLoopStrategy({ model, retry: effective.retry })
        : createOneShotStrategy({ model, retry: effective.retry });

    yield* translationRunner({
      adapters: effective.adapters,
      strategy: translationStrategy,
      sourceLocale: effective.sourceLocale,
      targetLocales: effective.targetLocales ?? [],
      chunking: effective.chunking,
    });

    const format = detectFormat(
      Option.getOrUndefined(flags.format) as OutputFormat | undefined,
    );

    yield* logger(
      formatTranslate(
        {
          success: true,
          message: 'Translation complete.',
          stats: {
            adaptersProcessed: effective.adapters.length,
            localesTranslated: (effective.targetLocales ?? []).length,
            keysTranslated: 0, // TODO: track from orchestrator
          },
        },
        format,
      ),
    );
  });
}

export const translateCommand = Command.make('translate', {
  config: Options.text('config').pipe(Options.withDefault('./dialekt.config.ts')),
  adapter: Options.optional(Options.text('adapter')),
  strategy: Options.optional(Options.text('strategy')),
  baseLanguage: Options.optional(Options.text('base-language')),
  language: Options.optional(Options.text('language')),
  name: Options.optional(Options.text('name')),
  skipNames: Options.boolean('skip-names'),
  skipLanguages: Options.boolean('skip-languages'),
  fast: Options.boolean('fast'),
  format: Options.optional(Options.text('format')),
}, (flags) => runTranslate(flags));
