<div>
  <img src="../../resources/icon.svg" align="left" width="175">
</div>

# `dialekt`

**Dialekt** [*diˈalɛkt, German for "dialect"*] uses large language models to translate your app's strings, with retries when the model garbles the output, chunking for large files, and a typed config file you check into git.

<br>

## Quick start

### 1. Install

```bash
npm install -D @dialekt/core @dialekt/adapter-laravel
```

Install only the adapters you use. If you also have a Paraglide frontend:

```bash
npm install -D @dialekt/adapter-paraglide
```

### 2. Configure

Create `dialekt.config.ts` in your project root:

```ts
import { defineConfig } from '@dialekt/core';
import { laravel } from '@dialekt/adapter-laravel';

export default defineConfig({
  sourceLocale: 'en',
  targetLocales: ['de', 'fr', 'es'],
  strategy: 'one-shot',
  model: { provider: 'openai', modelId: 'gpt-4o' },
  fastModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
  chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
  retry: { maxAttempts: 3, baseDelayMs: 1000 },
  adapters: [
    laravel({ langDir: './lang', scanPaths: ['./app', './resources/views'] }),
  ],
});
```

### 3. Set your API key

```bash
export OPENAI_API_KEY=sk-...
# or ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
```

### 4. Translate

```bash
npx dialekt translate
```

## Full documentation

See the [GitHub README](https://github.com/mateffy/dialekt) for the full guide, command reference, translation strategies, adapter docs, and the programmatic API.
