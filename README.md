<div>
  <img src="./resources/icon.svg" align="left" width="200">
</div>

# `dialekt`

**Dialekt** [*diˈalɛkt, German for "dialect"*] is a CLI toolkit that automates application string translation using large language models, regardless of your tech stack. It detects missing keys in target locales, calls an LLM to produce translations, and writes the results using framework-specific adapters.

<br>

## Why dialekt?

When you ship in more than one language, your translation files drift out of sync the moment someone edits a string in the source locale. dialekt solves this by diffing your locale files against each other, sending the missing keys to an LLM, and writing the translated results back. It handles token limits by chunking large translation sets, and retries individual chunks when the model returns malformed output.

dialekt is an extendable harness, not a closed box. The core package handles chunking, retries, missing-key detection on top of an interface which allows integrations for specific file formats and i18n frameworks to be built separately. Several first-party integrations ship out of the box, and writing your own means implementing a single interface with four methods.

| Command     | What it does                                         |
| ----------- | ---------------------------------------------------- |
| `translate` | Finds missing keys and asks the LLM to fill them     |
| `validate`  | Exits non-zero if any locale is missing keys         |
| `add`       | Inserts a new key and triggers translation           |
| `missing`   | Lists every missing key without writing files        |
| `unused`    | Scans source code for keys that no longer appear     |
| `hardcoded` | Scans source code for raw, untranslated strings      |
| `doctor`    | Combines missing keys and hardcoded strings in one report |
| `languages` | Shows which locales each adapter detected            |

## Quick start

### 1. Install

```bash
npm install -D dialekt @dialekt/adapter-laravel
```

Install only the adapters you use. If you also have a Paraglide frontend:

```bash
npm install -D @dialekt/adapter-paraglide
```

### 2. Configure

Create `dialekt.config.ts` in your project root:

```ts
import { defineConfig } from "dialekt";
import { laravel } from "@dialekt/adapter-laravel";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de", "fr", "es"],
  model: { provider: "openai", modelId: "gpt-4o" },
  chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
  retry: { maxAttempts: 3, baseDelayMs: 1000 },
  adapters: [laravel({ langDir: "./lang", scanPaths: ["./app", "./resources/views"] })],
});
```

## Model providers

dialekt runs on top of the [Vercel AI SDK](https://sdk.vercel.ai), which means
**any LLM provider** with an AI SDK integration works out of the box.

You can configure your model in two ways:

**A — Provider + model ID** (the simple way)

```ts
model: { provider: "openai", modelId: "gpt-4o" }
model: { provider: "openrouter", modelId: "deepseek/deepseek-v4-flash" }
model: { provider: "anthropic", modelId: "claude-sonnet-4-20250514" }
model: { provider: "google", modelId: "gemini-2.5-flash" }
```

**B — A live Vercel AI SDK model object** (for any provider or custom setup)

```ts
import { openai } from "@ai-sdk/openai";
import { createOpenAI } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";

// Any AI SDK factory works:
export default defineConfig({
  model: openai("gpt-4o-mini"),
  // or a custom OpenAI-compatible endpoint:
  fastModel: createOpenAI({
    baseURL: "https://your-proxy.com/v1",
    apiKey: process.env.CUSTOM_KEY,
  })("gpt-4o-mini"),
});
```

This means you can use **any provider** from the
[Vercel AI SDK providers list](https://sdk.vercel.ai/providers/ai-sdk-providers) —
OpenAI, Anthropic, Google, Mistral, Groq, Together, Fireworks, DeepSeek,
OpenRouter, Perplexity, xAI, and dozens more. Just install the corresponding
`@ai-sdk/*` package and pass the model object directly.

### 3. Set your API key

```bash
export OPENAI_API_KEY=sk-...
# or ANTHROPIC_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY
```

### 4. Translate

```bash
npx dialekt translate
```

## Adapters

An adapter teaches dialekt how to read and write your framework's translation files. Install only the ones you use.

| Adapter                    | File format                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `@dialekt/adapter-laravel` | PHP array files (`lang/{locale}/{domain}.php`) and JSON locale files |
| `@dialekt/adapter-paraglide` | inlang message-format JSON (`messages/{locale}.json`)        |
| `@dialekt/adapter-json`    | Plain JSON locale files                                        |
| `@dialekt/adapter-yaml`    | YAML locale files (`.yml` / `.yaml`)                           |
| `@dialekt/adapter-xliff`   | XLIFF translation files (`.xlf` / `.xliff`)                    |
| `@dialekt/adapter-po`      | GNU gettext `.po` files                                        |
| `@dialekt/adapter-android` | Android `strings.xml` resources                                |
| `@dialekt/adapter-ios`     | iOS `.strings` files                                           |
| `@dialekt/adapter-arb`     | Flutter Application Resource Bundle (`.arb`)                   |
| `@dialekt/adapter-csv`     | CSV locale tables                                              |
| `@dialekt/adapter-properties` | Java `.properties` files                                    |

The Laravel adapter requires `php` on your `PATH`. Both the Laravel and Paraglide adapters can scan your source code for stale keys: Laravel looks for `__('domain.key')` calls, Paraglide looks for `m.messageName(...)` references.

You can write your own adapter by implementing the `TranslationAdapter` interface. See [`packages/adapter-laravel/src/adapter.ts`](packages/adapter-laravel/src/adapter.ts) for a full example.

## Finding hardcoded strings

`dialekt hardcoded` scans your source files for raw, untranslated strings. It reports JSX text, JSX attributes, Blade text, and Blade attributes. It also reports React and HTML attributes such as `label`, `placeholder`, `title`, `alt`, and `aria-label`.

The scanner uses [ast-grep](https://ast-grep.github.io/) tree-sitter grammars. It parses JavaScript, TypeScript, JSX, TSX, and Blade (as HTML). By default, the scanner ignores technical attributes such as `type`, `className`, `id`, and `href`.

```ts
export default defineConfig({
  // ...
  hardcoded: {
    scanPaths: ["./src"],
    minLength: 2,
    ignoredAttributes: ["data-cy"],
    ignoredValues: ["OK"],
    languages: {
      typescriptreact: { ignoredValues: ["Acme"] },
    },
    // Manual allow-list. Keep this at the very bottom: the list grows.
    ignore: [
      { file: "src/App.tsx", text: "Acme Corp", reason: "Brand name" },
    ],
  },
});
```

The scanner matches an `ignore` entry by file and exact string. If you change the string, the scanner reports it again. Use the optional `kind` field (`jsx-text`, `jsx-attribute`, `html-text`, or `html-attribute`) when the same text occurs more than once in a file.

The `languages` key accepts these options for each language: `minLength`, `ignoredAttributes`, and `ignoredValues`. Global options apply to all languages. A language option overrides the global option.

### Add a language

A scanner is a small object with a `scan` function. The function receives one file and returns findings. It does no file I/O. Add your scanner to `DEFAULT_SCANNERS` in [`packages/dialekt/src/hardcoded/scan.ts`](packages/dialekt/src/hardcoded/scan.ts). See [`packages/dialekt/src/hardcoded/scanners/jsx.ts`](packages/dialekt/src/hardcoded/scanners/jsx.ts) for a full example.

## Health check with `doctor`

`dialekt doctor` combines the missing-key check and the hardcoded-string scan into one report. It is for humans and AI agents that fix translations.

```bash
dialekt doctor
dialekt doctor --skip-missing
dialekt doctor --skip-hardcoded
dialekt doctor --format json
```

## How it's built

dialekt is written in TypeScript on top of [Effect-TS](https://effect.website). Every file read, every API call, and every parse error is either handled or reported as a typed failure. Nothing gets swallowed in a `catch` block. The architecture is layered:

- **CLI layer** (`@effect/cli`) — parses flags, resolves config files, wires up the runtime
- **SDK layer** — the public API for custom scripts: `runTranslation`, `resolveModel`, chunking
- **Adapter layer** — framework-specific I/O: reading locale files, writing them back, scanning source for unused keys
- **Translation layer** — the LLM interaction itself: prompt construction, response parsing, retry logic

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

### React example

The React example shows `hardcoded` and `doctor` on JSX and TSX files. It has no locale adapter, so `doctor` reports only hardcoded strings. The example config shows an ignored value ("OK") and a manual ignore entry.

```bash
cd examples/react
npx dialekt hardcoded
npx dialekt doctor --skip-missing
```

The Laravel example also has raw strings in `resources/views/welcome.blade.php`. Run the same commands there to see Blade findings.

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
