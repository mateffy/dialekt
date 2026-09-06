import type { DialektConfig, ChunkingConfig, RetryConfig, ModelConfig } from "./types.js";

const DEFAULT_MAX_TOKENS = 3000;
const DEFAULT_CONCURRENCY = 5;
const DEFAULT_KEYS_PER_CHUNK = 10;

const defaultChunking: ChunkingConfig = {
  maxTokens: DEFAULT_MAX_TOKENS,
  charsPerToken: 3.0,
  concurrency: DEFAULT_CONCURRENCY,
  keysPerChunk: DEFAULT_KEYS_PER_CHUNK,
};
const defaultRetry: RetryConfig = { maxAttempts: 3, baseDelayMs: 1000 };

export function defineConfig(config: DialektConfig): DialektConfig {
  return {
    ...config,
    chunking: { ...defaultChunking, ...config.chunking },
    retry: { ...defaultRetry, ...config.retry },
  };
}
