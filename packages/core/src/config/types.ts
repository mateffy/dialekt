import type { TranslationAdapter } from '../adapter/types.js';

export interface ModelConfig {
  readonly provider: string;
  readonly modelId: string;
}

export interface ChunkingConfig {
  readonly maxTokens: number;
  readonly charsPerToken: number;
  readonly concurrency: number;
}

export interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}

export interface DialektConfig {
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[] | null;
  readonly strategy: 'one-shot' | 'tool-loop-agent';
  readonly model: ModelConfig;
  readonly fastModel: ModelConfig;
  readonly chunking: ChunkingConfig;
  readonly retry: RetryConfig;
  readonly adapters: readonly TranslationAdapter[];
}
