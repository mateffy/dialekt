import { Data, Effect } from 'effect';

export interface TranslationContext {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly sourceMap: Record<string, string>; // full source resource, for context
  readonly targetMap: Record<string, string>; // full existing target resource, for context
  readonly keys: readonly string[]; // the specific keys to translate in this call
}

export class TranslationFailedError extends Data.TaggedError('TranslationFailedError')<{
  readonly keys: readonly string[];
  readonly cause: unknown;
}> {}

export interface TranslationStrategy {
  readonly name: 'one-shot' | 'tool-loop-agent';
  translateChunk(
    ctx: TranslationContext,
  ): Effect.Effect<Record<string, string>, TranslationFailedError>;
}
