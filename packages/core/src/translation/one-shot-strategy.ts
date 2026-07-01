import { generateText, Output } from 'ai';
import { Effect, Schedule } from 'effect';
import { z } from 'zod';
import type { LanguageModel } from 'ai';
import type { TranslationContext, TranslationStrategy } from './types.js';
import { TranslationFailedError } from './types.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';

async function tryTranslateChunk(
  model: LanguageModel,
  ctx: TranslationContext,
): Promise<Record<string, string>> {
  const schema = z.object(
    Object.fromEntries(ctx.keys.map((key: string) => [key, z.string()])),
  );
  const { output } = await generateText({
    model,
    system: buildSystemPrompt(ctx.sourceLocale, ctx.targetLocale),
    prompt: buildUserPrompt(ctx),
    output: Output.object({ schema }),
  });
  const missing = ctx.keys.filter((key: string) => !(key in output));
  if (missing.length > 0) {
    throw new Error(`Model omitted keys: ${missing.join(', ')}`);
  }
  return output as Record<string, string>;
}

export function createOneShotStrategy(deps: {
  model: LanguageModel;
  retry: { maxAttempts: number; baseDelayMs: number };
}): TranslationStrategy {
  return {
    name: 'one-shot',
    translateChunk: (ctx: TranslationContext) =>
      Effect.tryPromise({
        try: () => tryTranslateChunk(deps.model, ctx),
        catch: (cause) => cause,
      }).pipe(
        Effect.retry(
          Schedule.exponential(`${deps.retry.baseDelayMs} millis`).pipe(
            Schedule.compose(Schedule.recurs(deps.retry.maxAttempts - 1)),
          ),
        ),
        Effect.mapError((cause) => new TranslationFailedError({ keys: ctx.keys, cause })),
      ),
  };
}
