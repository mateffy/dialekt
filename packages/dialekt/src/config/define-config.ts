import type { DialektConfig, ChunkingConfig, RetryConfig, ModelConfig } from "./types.js";

const defaultChunking: ChunkingConfig = { maxTokens: 3000, charsPerToken: 3.0, concurrency: 5, keysPerChunk: 10 };
const defaultRetry: RetryConfig = { maxAttempts: 3, baseDelayMs: 1000 };

export function defineConfig(config: DialektConfig): DialektConfig {
  return {
    ...config,
    chunking: { ...defaultChunking, ...config.chunking },
    retry: { ...defaultRetry, ...config.retry },
  };
}
