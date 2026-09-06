import { Effect, Data } from "effect";
import type { LanguageModel } from "ai";

export class UnknownProviderError extends Data.TaggedError("UnknownProviderError")<{
  readonly provider: string;
}> {}

export type ModelConfig = LanguageModel | { readonly provider: string; readonly modelId: string };

function isLanguageModel(v: ModelConfig): v is LanguageModel {
  const m = v as Record<string, unknown>;
  return typeof m["doGenerate"] === "function" || typeof m["specificationVersion"] !== "undefined";
}

type ProviderId = "openai" | "openrouter" | "anthropic" | "google";

const VALID_PROVIDERS: ReadonlySet<string> = new Set([
  "openai",
  "openrouter",
  "anthropic",
  "google",
]);

function loadProviderModel(
  provider: ProviderId,
  modelId: string,
): Effect.Effect<LanguageModel, UnknownProviderError> {
  return Effect.tryPromise({
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
      }
    },
    catch: (cause) =>
      cause instanceof UnknownProviderError ? cause : new UnknownProviderError({ provider }),
  });
}

export function resolveModel(
  config: ModelConfig,
): Effect.Effect<LanguageModel, UnknownProviderError> {
  return Effect.gen(function* () {
    if (isLanguageModel(config)) return config;

    const { provider, modelId } = config;

    if (!VALID_PROVIDERS.has(provider)) {
      return yield* Effect.fail(new UnknownProviderError({ provider }));
    }

    return yield* loadProviderModel(provider as ProviderId, modelId);
  });
}
