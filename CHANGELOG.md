# Changelog

All notable changes to **dialekt** and the `@dialekt/*` packages are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] — 2026-09-05

### Changed

- `ModelConfig` now accepts either a `{ provider, modelId }` pair or a live
  Vercel AI SDK `LanguageModel` object. Any AI SDK provider can be used by
  passing its model factory result directly. See the README for examples.

### Fixed

- Added `repository`, `homepage`, `bugs`, `author`, and `license` metadata
  to all 12 published packages so npm displays the correct links.

## [1.0.0] — 2026-09-05

First stable release. Everything from 0.1.0, plus:

### Added

- **Live trace output** (`dialekt translate`): chunk cards with unicode
  box-drawing, source/target side-by-side, resource name, locale pair, and
  progress counter. Chunk cards scroll above an animated single-line status
  bar showing which concurrent threads are active (`ar/estates`,
  `fr/commission`, etc.).
- **Incremental saves**: every translated chunk writes to disk immediately.
  Interrupt with Ctrl+C and re-run — only remaining chunks are left.
- **Per-chunk cost/timing stats**: prompt tokens, completion tokens,
  duration, estimated cost (DeepSeek pricing). Displayed in a table at the
  end of every run.
- **Per-locale summary**: translated and remaining key counts for every
  target locale, displayed in a compact table.
- **OpenRouter provider**: `model: { provider: "openrouter", modelId: "deepseek/deepseek-v4-flash" }`
- **Config-driven .env loading**: `env: [".env"]` in `dialekt.config.ts`
  loads variables into `process.env` before model resolution.
- **Resource name** displayed in every chunk card header.
- **`--quiet` flag** to suppress chunk cards and show only a progress table.
- **`--format json`** for machine-readable output on every command.
- **`--chunk-size` flag** on benchmark command for testing different
  `keysPerChunk` values.
- **`dialekt benchmark`** now reports token counts and estimated cost.
- **Batch PHP reader**: single PHP process reads all files for a locale,
  making `dialekt missing` ~10x faster (from hundreds of PHP spawns to one
  per locale).
- **Parallel locales and resources**: `concurrency` (default 5) applies to
  both locale-level and resource-level parallelism.
- **Progress status bar and table tests** (386 total).

### Changed

- `--llm` trace output is now the **default**. Use `--quiet` to suppress.
- Default `keysPerChunk` reduced from 25 to 10 (benchmarks show this is
  2-3x faster per chunk).
- Default `concurrency` increased from 3 to 5.
- Default strategy is `one-shot` (30% faster than tool-loop-agent per
  benchmark).
- `defineConfig()` now provides defaults for `chunking` and `retry` when
  they are missing from the user config.
- `translate --language en` now falls back to all non-source locales when
  `en` is the source.

### Fixed

- `unflattenObject` no longer destroys scalar parents when dotted children
  overlap (e.g. `password` scalar + `password.letters` dotted key).
  Conflict detection keeps literal dot-keys at the top level.
- PHP batch reader wrapped `require` in `try/catch(\Throwable)` to survive
  malformed files (e.g. `models.php` calling undefined `trans_hash()`).
- `loadConfig` pre-resolves `dialekt` and `@dialekt/*` packages via jiti
  `virtualModules` so configs work from external cwds.
- `missing` command respects `targetLocales` from the config instead of
  always listing all non-source locales.
- Laravel adapter batched reader cache is invalidated after writes so
  re-reads hit the updated file.
- `@dialekt/adapter-laravel` and `dialekt` package.json now have `main`
  and `types` top-level fields for Node10 module resolution.
