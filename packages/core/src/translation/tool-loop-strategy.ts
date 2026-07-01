import { ToolLoopAgent, tool, hasToolCall } from 'ai';
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

  let captured: Record<string, string> | null = null;

  const submitTranslations = tool({
    description:
      'Submit the final translations for every requested key. Call this exactly once, with every key filled in.',
    inputSchema: schema,
    execute: async (input) => {
      captured = input as Record<string, string>;
      return { ok: true };
    },
  });

  const agent = new ToolLoopAgent({
    model,
    instructions: buildSystemPrompt(ctx.sourceLocale, ctx.targetLocale),
    tools: { submitTranslations },
    stopWhen: hasToolCall('submitTranslations'),
  });

  await agent.generate({ prompt: buildUserPrompt(ctx) });
  if (captured === null) {
    throw new Error('Agent finished without calling submitTranslations');
  }
  const missing = ctx.keys.filter(
    (key: string) => !(key in (captured as Record<string, string>)),
  );
  if (missing.length > 0) {
    throw new Error(`Model omitted keys: ${missing.join(', ')}`);
  }
  return captured;
}

export function createToolLoopStrategy(deps: {
  model: LanguageModel;
  retry: { maxAttempts: number; baseDelayMs: number };
}): TranslationStrategy {
  return {
    name: 'tool-loop-agent',
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
