import { Data, Effect } from "effect";

export interface TranslationContext {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly sourceMap: Record<string, string>;
  readonly targetMap: Record<string, string>;
  readonly keys: readonly string[];
  /** Display label of the resource file being translated (e.g. "auth", "cms"). */
  readonly resource?: string;
}

export class TranslationFailedError extends Data.TaggedError("TranslationFailedError")<{
  readonly keys: readonly string[];
  readonly cause: unknown;
}> {}

export interface TranslationStrategy {
  readonly name: "one-shot" | "tool-loop-agent";
  translateChunk(
    ctx: TranslationContext,
  ): Effect.Effect<Record<string, string>, TranslationFailedError>;
}
