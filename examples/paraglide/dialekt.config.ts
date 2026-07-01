import { defineConfig } from '@dialekt/core';
import { paraglide } from '@dialekt/adapter-paraglide';

export default defineConfig({
  sourceLocale: 'en',
  targetLocales: ['de', 'fr', 'es'],
  strategy: 'one-shot',
  model: { provider: 'openai', modelId: 'gpt-4o' },
  fastModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
  chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
  retry: { maxAttempts: 3, baseDelayMs: 1000 },
  adapters: [
    paraglide({
      messagesDir: './messages',
      scanPaths: ['./src'],
    }),
  ],
});
