# @dialekt/adapter-laravel Testing Guide

## Tested Areas Map

| Export | Test File | Status |
|--------|-----------|--------|
| `laravel()` adapter | `src/adapter.test.ts` | ✅ |
| `renderPhpArray` / `renderPhpFile` | `src/php-array-writer.test.ts` | ✅ |
| `listLaravelLocales` / `listLaravelResources` | `src/resources.test.ts` | ✅ |
| `findUnusedLaravelKeys` | `src/unused-keys.test.ts` | ✅ |

## Known Coverage Gaps

- Corrupted PHP file handling (PHP syntax error) — `readResource` returns `PhpExecutionError` but no explicit test for malformed PHP
- JSON locale file with invalid JSON — no explicit test for corrupted `en.json`
- `phpBinary` option in `LaravelAdapterOptions` — not tested with custom PHP binary path

## Specialties & Watch-Outs

- **PHP-dependent tests** use `it.skipIf(!hasPhpBinary())` to skip when `php` is not installed.
- Tests create real temp directories via `node:fs` and clean up with `rmSync` in `afterEach` pattern.
- The adapter's `findUnusedKeys!` requires `capabilities.unusedKeyDetection: true`.
- `writeResource` for PHP domains produces actual `.php` files with `<?php return [...];` syntax.

## Running Tests

```bash
pnpm --filter @dialekt/adapter-laravel test
```
