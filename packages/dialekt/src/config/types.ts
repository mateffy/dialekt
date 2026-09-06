import type { TranslationAdapter } from "../adapter/types.js";
import type { ModelConfig } from "../translation/model-registry.js";

export type { ModelConfig };

export interface ChunkingConfig {
  readonly maxTokens: number;
  readonly charsPerToken: number;
  readonly concurrency: number;
  /** When set, each chunk gets at most this many keys (overrides token estimation). */
  readonly keysPerChunk?: number;
}

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}

export interface DialektConfig {
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[] | null;
  readonly strategy: "one-shot" | "tool-loop-agent";
  readonly model: ModelConfig;
  readonly fastModel: ModelConfig;
  readonly chunking: ChunkingConfig;
  readonly retry: RetryConfig;
  readonly adapters: readonly TranslationAdapter[];
  /** Explicit list of .env files to load before running commands. */
  readonly env?: readonly string[];
}
