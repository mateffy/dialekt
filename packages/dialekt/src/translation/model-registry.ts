import { Effect, Data } from 'effect';
import type { LanguageModel } from 'ai';

export class UnknownProviderError extends Data.TaggedError('UnknownProviderError')<{
  readonly provider: string;
}> {}

export interface ModelConfig {
  readonly provider: string;
  readonly modelId: string;
}

/**
 * The one file in the entire codebase allowed to import AI SDK provider packages.
 */
export function resolveModel(
  config: ModelConfig,
): Effect.Effect<LanguageModel, UnknownProviderError> {
  return Effect.tryPromise({
    try: async () => {
      switch (config.provider) {
        case 'openai': {
          const { openai } = await import('@ai-sdk/openai');
          return openai(config.modelId);
        }
        case 'anthropic': {
          const { anthropic } = await import('@ai-sdk/anthropic');
          return anthropic(config.modelId);
        }
        case 'google': {
          const { google } = await import('@ai-sdk/google');
          return google(config.modelId);
        }
        default:
          throw new UnknownProviderError({ provider: config.provider });
      }
    },
    catch: (cause) =>
      cause instanceof UnknownProviderError
        ? cause
        : new UnknownProviderError({ provider: config.provider }),
  });
}
