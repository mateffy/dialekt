import { Command, Options, Args } from '@effect/cli';
import { Effect, Console } from 'effect';
import { loadConfig } from '../../config/load-config.js';
import { resolveEffectiveConfig } from '../config-resolution.js';
import { resolveModel } from '../../translation/model-registry.js';
import { createOneShotStrategy } from '../../translation/one-shot-strategy.js';
import { createToolLoopStrategy } from '../../translation/tool-loop-strategy.js';
import { runTranslation } from '../../translation/orchestrator.js';
import { flattenObject } from '../../keys/flatten.js';
import type { DialektConfig } from '../../config/types.js';
import type { TranslationAdapter, ResourceRef } from '../../adapter/types.js';
import type { TranslationStrategy } from '../../translation/types.js';

export interface AddFlags {
  readonly config: string;
  readonly create: boolean;
}

export function parseAddTokens(
  tokens: readonly string[],
  errorLogger: (msg: string) => Effect.Effect<void>,
): Effect.Effect<Record<string, Record<string, string>>, never> {
  return Effect.gen(function* () {
    const entriesByResource: Record<string, Record<string, string>> = {};

    for (const token of tokens) {
      const eqIdx = token.indexOf('=');
      if (eqIdx === -1) {
        yield* errorLogger(`Invalid token (missing '='): ${token}`);
        continue;
      }
      const key = token.slice(0, eqIdx);
      const value = token.slice(eqIdx + 1);
      const dotIdx = key.indexOf('.');
      if (dotIdx === -1) {
        yield* errorLogger(`Invalid key (no resource segment): ${key}`);
        continue;
      }
      const resource = key.slice(0, dotIdx);
      const subKey = key.slice(dotIdx + 1);
      if (!entriesByResource[resource]) entriesByResource[resource] = {};
      entriesByResource[resource]![subKey] = value;
    }

    return entriesByResource;
  });
}

export function runAdd(
  flags: AddFlags,
  tokens: readonly string[],
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
  errorLogger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.error(msg),
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig({}, loaded);

    const entriesByResource = yield* parseAddTokens(tokens, errorLogger);

    for (const adapter of effective.adapters) {
      for (const [resourceKey, entries] of Object.entries(entriesByResource)) {
        const resourceRef = { key: resourceKey, label: resourceKey };
        yield* adapter.writeResource(effective.sourceLocale, resourceRef, entries);
      }
    }

    const modelConfig = effective.model;
    const model = yield* modelResolver(modelConfig) as Effect.Effect<import('ai').LanguageModel, unknown>;
    const translationStrategy =
      effective.strategy === 'tool-loop-agent'
        ? createToolLoopStrategy({ model, retry: effective.retry })
        : createOneShotStrategy({ model, retry: effective.retry });

    yield* translationRunner({
      adapters: effective.adapters,
      strategy: translationStrategy,
      sourceLocale: effective.sourceLocale,
      targetLocales: (effective.targetLocales ?? []).filter((l) => l !== effective.sourceLocale),
      chunking: effective.chunking,
    });

    yield* logger('Add + translate complete.');
  });
}

export const addCommand = Command.make('add', {
  config: Options.text('config').pipe(Options.withDefault('./dialekt.config.ts')),
  create: Options.boolean('create'),
}, ({ config, create }) => {
  const rawTokens = process.argv.slice(3).filter((t: string) => !t.startsWith('--') && !t.startsWith('-'));
  return runAdd({ config, create }, rawTokens);
});
