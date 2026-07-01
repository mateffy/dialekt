export { defineConfig } from "./config/define-config.js";
export type { DialektConfig, ModelConfig, ChunkingConfig, RetryConfig } from "./config/types.js";
export type { ResourceRef, TranslationAdapter, AdapterCapabilities } from "./adapter/types.js";
export { AdapterReadError, AdapterWriteError } from "./adapter/types.js";
export { flattenObject, unflattenObject, diffKeys } from "./keys/flatten.js";
export { chunkKeys } from "./translation/chunking.js";
export { NodePlatformLayer } from "./sdk/node-layer.js";
export { readFileIfExists, writeFileEnsuringDir } from "./sdk/file-io.js";
export { readPhpArrayAsJson, PhpExecutionError } from "./sdk/php-array-reader.js";
export { resolveModel, UnknownProviderError } from "./translation/model-registry.js";
export type { TranslationContext, TranslationStrategy } from "./translation/types.js";
export { TranslationFailedError } from "./translation/types.js";
export { createOneShotStrategy } from "./translation/one-shot-strategy.js";
export { createToolLoopStrategy } from "./translation/tool-loop-strategy.js";
export { runTranslation } from "./translation/orchestrator.js";
export { buildSystemPrompt, buildUserPrompt } from "./translation/prompt.js";
export { computeMissingKeys } from "./translation/missing-keys.js";
export { loadConfig, ConfigLoadError } from "./config/load-config.js";
export {
  detectFormat,
  color,
  glyphs,
  drawTable,
  banner,
  sectionHeader,
  success,
  failure,
  warning,
  info,
  keyValue,
} from "./cli/format.js";
export type { OutputFormat } from "./cli/format.js";
export {
  formatMissingKeys,
  formatUnusedKeys,
  formatValidate,
  formatLanguages,
  formatTranslate,
  formatAdd,
  formatBenchmark,
  formatError,
} from "./cli/formatters.js";
export type {
  MissingKeyEntry,
  UnusedKeyEntry,
  ValidateEntry,
  ValidateResult,
  LanguageEntry,
  TranslateResult,
  AddResult,
  BenchmarkEntry,
} from "./cli/formatters.js";
