# Changelog

All notable changes to **dialekt** and the `@dialekt/*` packages are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — 2026-07-01

Initial release of the dialekt AI translation toolkit.

### Added

**Core package (`dialekt`)**
- `defineConfig()` — typed configuration with `sourceLocale`, `targetLocales`,
  `model`, `fastModel`, `chunking`, `retry`, and `adapters`.
- `loadConfig()` — loads `dialekt.config.ts` via `jiti`, resolves from cwd so
  relative paths work regardless of where the CLI is invoked.
- CLI with 7 commands: `translate`, `validate`, `missing`, `unused`,
  `languages`, `add`, `benchmark`.
- `--format` flag on every command: `pretty` (default in TTY) or `json`
  (default when piped or inside an AI agent shell).
- TTY-gated pretty output with box-drawing tables, grouped results, and ANSI
  colours. ASCII fallbacks when stdout is not a TTY.
- `one-shot` and `tool-loop-agent` translation strategies backed by the
  `ai` SDK (v7).
- Chunking algorithm that splits large translation sets by token budget.
- Retry logic with configurable `maxAttempts` and exponential back-off.
- Missing-key detection — diff every target locale against the source locale
  per adapter.
- `TranslationAdapter` interface for framework integrations.
- Programmatic API exported from `dialekt` for custom scripts.
- 293 passing tests.

**Laravel adapter (`@dialekt/adapter-laravel`)**
- Reads and writes PHP array files (`lang/{locale}/{resource}.php`) via a
  PHP subprocess + `var_export()` round-trip that preserves comments and
  formatting.
- Reads and writes JSON string files (`lang/{locale}.json`).
- Scans Blade views and PHP controllers for `__()`, `@lang()`, and `trans()`
  calls to detect unused keys.
- 28 passing tests.

**Paraglide adapter (`@dialekt/adapter-paraglide`)**
- Reads and writes inlang message-format JSON files (`messages/{locale}.json`).
- Scans `.ts`, `.tsx`, `.svelte`, and `.vue` source files for `m.key()`
  references to detect unused keys.
- 18 passing tests.

**Tooling**
- pnpm workspace with `packages/*` layout.
- tsdown (Rolldown-based) for bundling every package to ESM + TypeScript
  declarations.
- gesetz quality gates configured with custom rules for no-console-log,
  no-raw-node-io, and no-Effect.runPromise outside entry points.
- oxfmt for formatting.

**Examples**
- `examples/laravel/` — working Laravel project with `en`, `de`, and `fr`
  locales, pre-wired `dialekt.config.ts`.
- `examples/paraglide/` — working Paraglide project with `en`, `de`, `fr`,
  and `es` locales, pre-wired `dialekt.config.ts`.
