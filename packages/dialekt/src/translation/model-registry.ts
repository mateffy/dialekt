import { Effect, Data } from "effect";
import type { LanguageModel } from "ai";

export class UnknownProviderError extends Data.TaggedError("UnknownProviderError")<{
  readonly provider: string;
}> {}

/** A model spec: either a live Vercel AI SDK model, or a provider+id pair. */
export type ModelConfig = LanguageModel | { readonly provider: string; readonly modelId: string };

function isLanguageModel(v: ModelConfig): v is LanguageModel {
  return typeof (v as any).doGenerate === "function" || typeof (v as any).specificationVersion !== "undefined";
}

/**
 * The one file in the entire codebase allowed to import AI SDK provider packages.
 * Accepts both { provider, modelId } specs and live LanguageModel instances.
 */
export function resolveModel(
  config: ModelConfig,
): Effect.Effect<LanguageModel, UnknownProviderError> {
  return Effect.gen(function* () {
    // Already a live model — pass through.
    if (isLanguageModel(config)) return config;

    const { provider, modelId } = config;
    return yield* Effect.tryPromise({
      try: async () => {
        switch (provider) {
          case "openai": {
            const { openai } = await import("@ai-sdk/openai");
            return openai(modelId);
          }
          case "openrouter": {
            const { createOpenAI } = await import("@ai-sdk/openai");
            const openrouter = createOpenAI({
              baseURL: "https://openrouter.ai/api/v1",
              apiKey: process.env.OPENROUTER_API_KEY ?? "",
            });
            return openrouter(modelId);
          }
          case "anthropic": {
            const { anthropic } = await import("@ai-sdk/anthropic");
            return anthropic(modelId);
          }
          case "google": {
            const { google } = await import("@ai-sdk/google");
            return google(modelId);
          }
          default:
            throw new UnknownProviderError({ provider });
        }
      },
      catch: (cause) =>
        cause instanceof UnknownProviderError
          ? cause
          : new UnknownProviderError({ provider }),
    });
  });
}