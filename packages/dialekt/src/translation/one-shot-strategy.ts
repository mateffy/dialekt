import { generateText, Output } from "ai";
import { Effect, Schedule } from "effect";
import { z } from "zod";
import type { LanguageModel } from "ai";
import type { TranslationContext, TranslationStrategy } from "./types.js";
import { TranslationFailedError } from "./types.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";

/** Metadata about a translation attempt, emitted by `onTrace`. */
export interface ChunkTrace {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly resource?: string;
  readonly keys: readonly string[];
  readonly sourceTexts: Readonly<Record<string, string>>;
  readonly text: string;
  readonly output: Record<string, string>;
  readonly durationMs: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
}

function tryTranslateChunk(
  model: LanguageModel,
  ctx: TranslationContext,
  onTrace?: (trace: ChunkTrace) => void,
): Effect.Effect<Record<string, string>, Error> {
  return Effect.gen(function* () {
    const schema = z.object(Object.fromEntries(ctx.keys.map((key: string) => [key, z.string()])));
    const start = Date.now();
    const result = yield* Effect.tryPromise({
      try: () =>
        generateText({
          model,
          system: buildSystemPrompt(ctx.sourceLocale, ctx.targetLocale),
          prompt: buildUserPrompt(ctx),
          output: Output.object({ schema }),
        }),
      catch: (cause) => new Error(String(cause)),
    });
    const durationMs = Date.now() - start;
    const output = result.output as Record<string, string>;
    onTrace?.({
      sourceLocale: ctx.sourceLocale,
      targetLocale: ctx.targetLocale,
      ...(ctx.resource !== undefined ? { resource: ctx.resource } : {}),
      keys: ctx.keys,
      sourceTexts: ctx.sourceMap,
      text: result.text ?? "",
      output,
      durationMs,
      promptTokens: result.usage?.inputTokens ?? 0,
      completionTokens: result.usage?.outputTokens ?? 0,
    } satisfies ChunkTrace);
    const missing = ctx.keys.filter((key: string) => !(key in output));
    if (missing.length > 0) {
      return yield* Effect.fail(new Error(`Model omitted keys: ${missing.join(", ")}`));
    }
    return output;
  });
}

export function createOneShotStrategy(deps: {
  model: LanguageModel;
  retry: { maxAttempts: number; baseDelayMs: number };
  onTrace?: (trace: ChunkTrace) => void;
}): TranslationStrategy {
  return {
    name: "one-shot",
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
