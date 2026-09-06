import { ToolLoopAgent, tool, hasToolCall } from "ai";
import { Effect, Schedule } from "effect";
import { z } from "zod";
import type { LanguageModel } from "ai";
import type { TranslationContext, TranslationStrategy } from "./types.js";
import { TranslationFailedError } from "./types.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import type { ChunkTrace } from "./one-shot-strategy.js";

function tryTranslateChunk(
  model: LanguageModel,
  ctx: TranslationContext,
  onTrace?: (trace: ChunkTrace) => void,
): Effect.Effect<Record<string, string>, Error> {
  return Effect.gen(function* () {
    const schema = z.object(Object.fromEntries(ctx.keys.map((key: string) => [key, z.string()])));

    let captured: Record<string, string> | null = null;

    const submitTranslations = tool({
      description:
        "Submit the final translations for every requested key. Call this exactly once, with every key filled in.",
      inputSchema: schema,
      execute: (input) => {
        captured = input as Record<string, string>;
        return Promise.resolve({ ok: true });
      },
    });

    const agent = new ToolLoopAgent({
      model,
      instructions: buildSystemPrompt(ctx.sourceLocale, ctx.targetLocale),
      tools: { submitTranslations },
      stopWhen: hasToolCall("submitTranslations"),
    });

    yield* Effect.tryPromise({
      try: () => agent.generate({ prompt: buildUserPrompt(ctx) }),
      catch: (cause) => new Error(String(cause)),
    });

    if (captured === null) {
      return yield* Effect.fail(new Error("Agent finished without calling submitTranslations"));
    }
    const result: Record<string, string> = captured;

    onTrace?.({
      sourceLocale: ctx.sourceLocale,
      targetLocale: ctx.targetLocale,
      keys: ctx.keys,
      sourceTexts: ctx.sourceMap,
      text: "",
      output: result,
      durationMs: 0,
      promptTokens: 0,
      completionTokens: 0,
      ...(ctx.resource !== undefined ? { resource: ctx.resource } : {}),
    } satisfies ChunkTrace);

    const missing = ctx.keys.filter((key: string) => !(key in result));
    if (missing.length > 0) {
      return yield* Effect.fail(new Error(`Model omitted keys: ${missing.join(", ")}`));
    }
    return result;
  });
}

export function createToolLoopStrategy(deps: {
  model: LanguageModel;
  retry: { maxAttempts: number; baseDelayMs: number };
  onTrace?: (trace: ChunkTrace) => void;
}): TranslationStrategy {
  return {
    name: "tool-loop-agent",
    translateChunk: (ctx: TranslationContext) =>
      tryTranslateChunk(deps.model, ctx, deps.onTrace).pipe(
        Effect.retry(
          Schedule.exponential(`${deps.retry.baseDelayMs} millis`).pipe(
            Schedule.compose(Schedule.recurs(deps.retry.maxAttempts - 1)),
          ),
        ),
        Effect.mapError((cause) => new TranslationFailedError({ keys: ctx.keys, cause })),
      ),
  };
}
