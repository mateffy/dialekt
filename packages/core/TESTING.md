# @dialekt/core Testing Guide

## Tested Areas Map

| Export | Test File | Status |
|--------|-----------|--------|
| `AdapterReadError` / `AdapterWriteError` | `src/adapter/types.test.ts` | ✅ |
| `flattenObject` / `unflattenObject` / `diffKeys` | `src/keys/flatten.test.ts` | ✅ |
| `chunkKeys` | `src/translation/chunking.test.ts` | ✅ |
| `computeMissingKeys` | `src/translation/missing-keys.test.ts` | ✅ |
| `resolveModel` / `UnknownProviderError` | `src/translation/model-registry.test.ts` | ✅ |
| `createOneShotStrategy` | `src/translation/one-shot-strategy.test.ts` | ✅ |
| `createToolLoopStrategy` | `src/translation/tool-loop-strategy.test.ts` | ✅ |
| `runTranslation` | `src/translation/orchestrator.test.ts` | ✅ |
| `buildSystemPrompt` / `buildUserPrompt` | `src/translation/prompt.test.ts` | ✅ |
| `TranslationFailedError` | `src/translation/types.test.ts` | ✅ |
| `runBenchmarkedChunk` / `summarizeBenchmarkResults` | `src/benchmark/metrics.test.ts` | ✅ |
| `formatBenchmarkReport` | `src/benchmark/report.test.ts` | ✅ |
| `runBenchmark` | `src/benchmark/runner.test.ts` | ✅ |
| `translateCommand` / `runTranslate` | `src/cli/commands/translate.test.ts` | ✅ |
| `validateCommand` / `runValidate` | `src/cli/commands/validate.test.ts` | ✅ |
| `addCommand` / `runAdd` / `parseAddTokens` | `src/cli/commands/add.test.ts` | ✅ |
| `missingCommand` / `runMissing` | `src/cli/commands/missing.test.ts` | ✅ |
| `unusedCommand` / `runUnused` | `src/cli/commands/unused.test.ts` | ✅ |
| `languagesCommand` / `runLanguages` | `src/cli/commands/languages.test.ts` | ✅ |
| `benchmarkCommand` / `runBenchmarkCommand` | `src/cli/commands/benchmark.test.ts` | ✅ |
| `resolveEffectiveConfig` | `src/cli/config-resolution.test.ts` | ✅ |
| `loadConfig` / `ConfigLoadError` | `src/config/load-config.test.ts` | ✅ |
| `defineConfig` | `src/config/define-config.test.ts` | ✅ |
| config types | `src/config/types.test.ts` | ✅ |
| `readFileIfExists` / `writeFileEnsuringDir` | `src/sdk/file-io.test.ts` | ✅ |
| `NodePlatformLayer` | `src/sdk/node-layer.test.ts` | ✅ |
| `readPhpArrayAsJson` / `PhpExecutionError` | `src/sdk/php-array-reader.test.ts` | ✅ |

## Known Coverage Gaps

- `src/cli/main.ts` — CLI entrypoint wiring is not directly tested (covered via integration through command handlers)
- AI provider resolution for `anthropic` and `google` — tests only verify `openai` works because packages are installed
- `ChunkingConfig` / `RetryConfig` runtime validation — types enforce structure but no runtime bounds checking tests exist

## Specialties & Watch-Outs

- **Effect.gen generators are NOT async** — never use `await` inside `Effect.gen`. Import tags at top level.
- **CLI commands** — handlers extracted into `runXxx` functions for testability. The `Command.make` objects are thin wrappers.
- **PHP tests** skip when `php` binary is unavailable (`it.skipIf(!hasPhpBinary())`).
- **MockLanguageModelV3** from `ai/test` is used for strategy tests — it simulates the full AI SDK v7 response shape.
- **NodeNext `.js` extensions** — all imports must end in `.js` even for `.ts` source files.

## Test Utilities & Helpers

- `makeFsLayer` in `sdk/file-io.test.ts` — creates a `Layer.succeed(FileSystem, stub)` for in-memory file system testing.
- `makeAdapter` pattern — repeated across CLI tests to create lightweight `TranslationAdapter` stubs.
- `hasPhpBinary()` guard — used in `php-array-reader.test.ts` and `adapter-laravel` tests to conditionally run PHP-dependent tests.

## Running Tests

```bash
# All packages
pnpm -r run test

# Single package
pnpm --filter @dialekt/core test

# Single file
npx vitest run src/translation/chunking.test.ts
```
