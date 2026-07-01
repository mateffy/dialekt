<div>
  <img src="./resources/icon.svg" align="left" width="175">
</div>

# `dialekt`

**Dialekt** [*diˈalɛkt, German for "dialect"*] is a CLI tool that automates application string translation using large language models. It reads your source locale files, detects missing keys in target locales, calls an LLM to produce translations, and writes the results back. Settings live in a typed config file you check into git.

<br>

## Why dialekt?

When you ship in more than one language, your translation files drift out of sync the moment someone edits a string in the source locale. dialekt solves this by diffing your locale files against each other, sending the missing keys to an LLM, and writing the translated results back. It handles token limits by chunking large translation sets, and retries individual chunks when the model returns malformed output.

dialekt is an extendable harness, not a closed box. The core package handles chunking, retries, missing-key detection on top of an interface which allows integrations for specific file formats and i18n frameworks to be built separately. Several first-party integrations ship out of the box, and writing your own means implementing a single interface with four methods.

| Command | What it does |
|---|---|
| `translate` | Finds missing keys and asks the LLM to fill them |
| `validate` | Exits non-zero if any locale is missing keys |
| `add` | Inserts a new key and triggers translation |
| `missing` | Lists every missing key without writing files |
| `unused` | Scans source code for keys that no longer appear |
| `languages` | Shows which locales each adapter detected |
| `benchmark` | Runs two strategies head-to-head with real API calls |

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

## Translation strategies

dialekt includes two strategies. Switch between them in your config file.

**one-shot** (default) — Sends the source file and missing keys to the model with a structured JSON schema. Works with any model that supports JSON output. Fast and predictable.

**tool-loop-agent** — Gives the model a `submitTranslations` tool and lets it reflect on its output before committing. Slightly more expensive, but self-correcting when the model hallucinates a key name.

Run `npx dialekt benchmark` to compare them with real API calls before you pick one.

## Adapters

An adapter teaches dialekt how to read and write your framework's translation files.

- **Laravel** — PHP array files (`lang/{locale}/{domain}.php`) and JSON locale files (`lang/{locale}.json`). Requires `php` on your `PATH`.
- **Paraglide** — inlang message-format JSON files (`messages/{locale}.json`).

Both adapters can scan your source code for stale keys: Laravel looks for `__('domain.key')` calls, Paraglide looks for `m.messageName(...)` references.

You can write your own adapter by implementing the `TranslationAdapter` interface. See [`packages/adapter-laravel/src/adapter.ts`](packages/adapter-laravel/src/adapter.ts) for a full example.

## How it's built

dialekt is written in TypeScript on top of [Effect-TS](https://effect.website). Every file read, every API call, and every parse error is either handled or reported as a typed failure. Nothing gets swallowed in a `catch` block. The architecture is layered:

- **CLI layer** (`@effect/cli`) — parses flags, resolves config files, wires up the runtime
- **SDK layer** — the public API for custom scripts: `runTranslation`, `resolveModel`, strategies, chunking
- **Adapter layer** — framework-specific I/O: reading locale files, writing them back, scanning source for unused keys
- **Strategy layer** — the LLM interaction itself: prompt construction, response parsing, retry logic

The monorepo is a pnpm workspace with three packages:

| Package | What it exports |
|---|---|
| `@dialekt/core` | CLI, SDK, translation engine, benchmarking |
| `@dialekt/adapter-laravel` | PHP array + JSON adapter |
| `@dialekt/adapter-paraglide` | inlang JSON adapter |

## Examples

The `examples/` folder contains working projects you can run dialekt against without setting up your own app. `cd` into an example and run the commands from there.

### Laravel example

```bash
cd examples/laravel
npx dialekt translate
npx dialekt missing
npx dialekt unused
```

The Laravel example includes `lang/en/auth.php`, `lang/en/validation.php`, `lang/en.json`, and their German counterparts. Some keys are intentionally missing from the German files so `translate` and `missing` have something to report. The `unused` command scans `resources/views/welcome.blade.php` and `app/Http/Controllers/UserController.php` for `__()`, `@lang()`, and `trans()` calls.

### Paraglide example

```bash
cd examples/paraglide
npx dialekt translate
npx dialekt missing
npx dialekt unused
```

The Paraglide example includes `messages/en.json` and `messages/de.json` with inlang message-format strings (some keys intentionally missing from German). The `unused` command scans `src/lib/i18n.ts` and `src/routes/+page.svelte` for `m.messageName(...)` calls.

> **Note:** Both examples require an `OPENAI_API_KEY` (or equivalent) in your environment. The `translate` command makes real API calls. Use `--fast` for cheaper runs.

## Development

```bash
pnpm install
pnpm -r run build
pnpm -r run typecheck
pnpm -r run test
pnpm exec gesetz check
```

## License

MIT
