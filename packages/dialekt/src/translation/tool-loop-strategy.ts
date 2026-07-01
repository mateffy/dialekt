import { ToolLoopAgent, tool, hasToolCall } from "ai";
import { Effect, Schedule } from "effect";
import { z } from "zod";
import type { LanguageModel } from "ai";
import type { TranslationContext, TranslationStrategy } from "./types.js";
import { TranslationFailedError } from "./types.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";

function tryTranslateChunk(
  model: LanguageModel,
  ctx: TranslationContext,
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
      catch: (cause) => cause,
    });

    if (captured === null) {
      return yield* Effect.fail(new Error("Agent finished without calling submitTranslations"));
    }
    const missing = ctx.keys.filter((key: string) => !(key in captured));
    if (missing.length > 0) {
      return yield* Effect.fail(new Error(`Model omitted keys: ${missing.join(", ")}`));
    }
    return captured;
  });
}

export function createToolLoopStrategy(deps: {
  model: LanguageModel;
  retry: { maxAttempts: number; baseDelayMs: number };
}): TranslationStrategy {
  return {
    name: "tool-loop-agent",
    translateChunk: (ctx: TranslationContext) =>
      tryTranslateChunk(deps.model, ctx).pipe(
        Effect.retry(
          Schedule.exponential(`${deps.retry.baseDelayMs} millis`).pipe(
            Schedule.compose(Schedule.recurs(deps.retry.maxAttempts - 1)),
          ),
        ),
        Effect.mapError((cause) => new TranslationFailedError({ keys: ctx.keys, cause })),
      ),
  };
}
