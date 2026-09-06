import { Effect, Layer } from "effect";
import { NodeContext } from "@effect/platform-node";
import { FileSystem, Path } from "@effect/platform";
import { LanguageModel } from "ai";
import { PlatformError } from "@effect/platform/Error";
import { CommandExecutor } from "@effect/platform/CommandExecutor";

//#region src/adapter/types.d.ts
/** Opaque adapter-specific identifier for one resource within a locale. */
interface ResourceRef {
  readonly key: string;
  readonly label: string;
}
declare const AdapterReadError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "AdapterReadError";
} & Readonly<A>;
declare class AdapterReadError extends AdapterReadError_base<{
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly cause: unknown;
}> {}
declare const AdapterWriteError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "AdapterWriteError";
} & Readonly<A>;
declare class AdapterWriteError extends AdapterWriteError_base<{
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly cause: unknown;
}> {}
interface TranslationAdapter {
  /** Stable adapter name, e.g. "laravel", "paraglide". Used in CLI --adapter flag and error messages. */
  readonly name: string;
  /** Which optional features this adapter instance supports (see Feature flags below). */
  readonly capabilities: AdapterCapabilities;
  /** Auto-detect configured locales (e.g. subdirectories of a lang dir), or return the user-configured list. */
  listLocales(): Effect.Effect<readonly string[], AdapterReadError>;
  /** List the resources available for a given locale (e.g. domain files present for "en"). */
  listResources(locale: string): Effect.Effect<readonly ResourceRef[], AdapterReadError>;
  /** Read one resource, flattened to dot-notation key → string value. Returns {} if the resource does not exist. */
  readResource(locale: string, resource: ResourceRef): Effect.Effect<Record<string, string>, AdapterReadError>;
  /** Write a full flattened key→value map back to a resource, unflattening as needed. Creates the resource if absent and `create` capability allows it. */
  writeResource(locale: string, resource: ResourceRef, entries: Record<string, string>): Effect.Effect<void, AdapterWriteError>;
  /**
   * Returns translation keys present in the resource but never referenced
   * anywhere in the project's source code. Only called by the CLI's `unused`
   * command when `capabilities.unusedKeyDetection` is `true` — present as an
   * optional method (not required on every adapter) because some future
   * adapter format may have no reliable "is this key referenced" heuristic
   * (e.g. a flat gettext catalog with no consistent call-site convention).
   *
   * Deliberately minimal contract: the adapter receives no scan-path
   * guidance, no shared "grep helper", and no hint about what a "reference"
   * looks like in its ecosystem. It owns the entire strategy internally —
   * Laravel scans for `__('domain.key')`-shaped calls in PHP/Blade files;
   * Paraglide scans for `m.messageName(...)` calls in JS/TS files. Each
   * adapter's own constructor options (`LaravelAdapterOptions`,
   * `ParaglideAdapterOptions`) carry whatever scan-path configuration that
   * adapter's own heuristic needs — core never sees or validates those
   * options.
   */
  findUnusedKeys?(locale: string, resource: ResourceRef): Effect.Effect<readonly string[], AdapterReadError>;
}
interface AdapterCapabilities {
  readonly canCreateResource: boolean;
  readonly unusedKeyDetection: boolean;
}
//#endregion
//#region src/translation/model-registry.d.ts
declare const UnknownProviderError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "UnknownProviderError";
} & Readonly<A>;
declare class UnknownProviderError extends UnknownProviderError_base<{
  readonly provider: string;
}> {}
/** A model spec: either a live Vercel AI SDK model, or a provider+id pair. */
type ModelConfig = LanguageModel | {
  readonly provider: string;
  readonly modelId: string;
};
/**
 * The one file in the entire codebase allowed to import AI SDK provider packages.
 * Accepts both { provider, modelId } specs and live LanguageModel instances.
 */
declare function resolveModel(config: ModelConfig): Effect.Effect<LanguageModel, UnknownProviderError>;
//#endregion
//#region src/config/types.d.ts
interface ChunkingConfig {
  readonly maxTokens: number;
  readonly charsPerToken: number;
  readonly concurrency: number;
  /** When set, each chunk gets at most this many keys (overrides token estimation). */
  readonly keysPerChunk?: number;
}
interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}
interface DialektConfig {
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[] | null;
  readonly strategy: "one-shot" | "tool-loop-agent";
  readonly model: ModelConfig;
  readonly fastModel: ModelConfig;
  readonly chunking: ChunkingConfig;
  readonly retry: RetryConfig;
  readonly adapters: readonly TranslationAdapter[];
  /** Explicit list of .env files to load before running commands. */
  readonly env?: readonly string[];
}
//#endregion
//#region src/config/define-config.d.ts
declare function defineConfig(config: DialektConfig): DialektConfig;
//#endregion
//#region src/keys/flatten.d.ts
declare function flattenObject(input: Readonly<Record<string, unknown>>, prefix?: string): Record<string, string>;
/**
 * Unflatten dot-separated keys into a nested object.
 *
 * Special handling: when the input has BOTH a plain scalar key (e.g. `password`)
 * AND dotted keys that would nest under it (e.g. `password.letters`), the dotted
 * keys are kept as literal dot-containing keys at the top level — they are NOT
 * nested. This preserves round-trip fidelity for PHP files that use dot-notation
 * keys alongside plain scalar keys.
 */
declare function unflattenObject(input: Readonly<Record<string, string>>): Record<string, unknown>;
declare function diffKeys(source: Readonly<Record<string, string>>, target: Readonly<Record<string, string>>): string[];
//#endregion
//#region src/icu/types.d.ts
interface IcuVariable {
  readonly type: "variable";
  readonly name: string;
}
interface IcuPlural {
  readonly type: "plural";
  readonly variable: string;
  readonly offset?: number;
  readonly forms: Record<string, string>;
}
interface IcuSelect {
  readonly type: "select";
  readonly variable: string;
  readonly cases: Record<string, string>;
}
type IcuNode = IcuVariable | IcuPlural | IcuSelect | string;
type IcuMessage = readonly IcuNode[];
declare class IcuParseError extends Error {
  readonly _tag = "IcuParseError";
}
//#endregion
//#region src/icu/parser.d.ts
declare function parseIcuMessage(input: string): IcuMessage;
//#endregion
//#region src/icu/validator.d.ts
declare function extractIcuVariables(message: string): string[];
declare function validateIcuPlural(message: string): boolean;
//#endregion
//#region src/translation/chunking.d.ts
interface ChunkingConfig$1 {
  readonly maxTokens: number;
  readonly charsPerToken: number;
  readonly keysPerChunk?: number;
}
declare function chunkKeys(keys: readonly string[], sourceMap: Readonly<Record<string, string>>, targetMap: Readonly<Record<string, string>>, config: ChunkingConfig$1): string[][];
//#endregion
//#region src/sdk/node-layer.d.ts
/**
 * The only file in this package (besides cli/main.ts) permitted to know
 * this is running on Node.js. Provides FileSystem, Path, and
 * CommandExecutor. Swapping to Bun/Deno later means swapping this one
 * import for @effect/platform-bun's equivalent — nothing else changes.
 */
declare const NodePlatformLayer: Layer.Layer<NodeContext.NodeContext, never, never>;
//#endregion
//#region src/sdk/file-io.d.ts
declare function readFileIfExists(path: string): Effect.Effect<string | null, PlatformError, FileSystem.FileSystem | Path.Path>;
declare function writeFileEnsuringDir(path: string, content: string): Effect.Effect<void, PlatformError, FileSystem.FileSystem | Path.Path>;
//#endregion
//#region src/sdk/php-array-reader.d.ts
declare const PhpExecutionError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "PhpExecutionError";
} & Readonly<A>;
declare class PhpExecutionError extends PhpExecutionError_base<{
  readonly path: string;
  readonly cause: unknown;
}> {}
declare function readPhpArrayAsJson(absolutePath: string): Effect.Effect<Record<string, unknown>, PhpExecutionError, CommandExecutor>;
/** Read multiple PHP files in a single PHP process. Returns a map of path → parsed array. */
declare function readPhpArraysBatch(absolutePaths: readonly string[]): Effect.Effect<Record<string, Record<string, unknown>>, PhpExecutionError, CommandExecutor>;
//#endregion
//#region src/translation/types.d.ts
interface TranslationContext {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly sourceMap: Record<string, string>;
  readonly targetMap: Record<string, string>;
  readonly keys: readonly string[];
  /** Display label of the resource file being translated (e.g. "auth", "cms"). */
  readonly resource?: string;
}
declare const TranslationFailedError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "TranslationFailedError";
} & Readonly<A>;
declare class TranslationFailedError extends TranslationFailedError_base<{
  readonly keys: readonly string[];
  readonly cause: unknown;
}> {}
interface TranslationStrategy {
  readonly name: "one-shot" | "tool-loop-agent";
  translateChunk(ctx: TranslationContext): Effect.Effect<Record<string, string>, TranslationFailedError>;
}
//#endregion
//#region src/translation/one-shot-strategy.d.ts
/** Metadata about a translation attempt, emitted by `onTrace`. */
interface ChunkTrace {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly resource?: string;
  readonly keys: readonly string[];
  readonly sourceTexts: Readonly<Record<string, string>>;
  readonly text: string;
  readonly output: Record<string, string>;
  readonly durationMs: number;
  readonly promptTokens: number;
  readonly completionTokens: number;
}
declare function createOneShotStrategy(deps: {
  model: LanguageModel;
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
  };
  onTrace?: (trace: ChunkTrace) => void;
}): TranslationStrategy;
//#endregion
//#region src/translation/tool-loop-strategy.d.ts
declare function createToolLoopStrategy(deps: {
  model: LanguageModel;
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
  };
  onTrace?: (trace: ChunkTrace) => void;
}): TranslationStrategy;
//#endregion
//#region src/translation/orchestrator.d.ts
interface TranslationProgressEvent {
  readonly type: "locale-start" | "locale-scanned" | "chunk-start" | "chunk-complete" | "chunk-fail" | "locale-done" | "locale-error";
  readonly locale: string;
  readonly resource?: string;
  readonly resourcesTotal?: number;
  readonly missingKeys?: number;
  readonly chunksTotal?: number;
  /** Trace data carried by chunk-complete events when --llm is active. */
  readonly trace?: {
    sourceTexts: Readonly<Record<string, string>>;
    output: Record<string, string>;
    text: string;
  };
}
interface TranslationRunConfig {
  readonly adapters: readonly TranslationAdapter[];
  readonly strategy: TranslationStrategy;
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[];
  readonly chunking: {
    maxTokens: number;
    charsPerToken: number;
    keysPerChunk?: number;
    concurrency: number;
  };
  readonly resourceFilter?: string | undefined;
}
declare function runTranslation(config: TranslationRunConfig, onProgress?: (event: TranslationProgressEvent) => void): Effect.Effect<void, TranslationFailedError | AdapterReadError | AdapterWriteError>;
//#endregion
//#region src/translation/prompt.d.ts
declare function buildSystemPrompt(from: string, to: string): string;
declare function buildUserPrompt(ctx: TranslationContext): string;
//#endregion
//#region src/translation/missing-keys.d.ts
interface MissingKeyEntry$1 {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: ResourceRef;
  readonly missing: readonly string[];
}
declare function computeMissingKeys(adapter: TranslationAdapter, sourceLocale: string, targetLocales: readonly string[]): Effect.Effect<readonly MissingKeyEntry$1[], AdapterReadError>;
//#endregion
//#region src/config/load-config.d.ts
declare const ConfigLoadError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "ConfigLoadError";
} & Readonly<A>;
declare class ConfigLoadError extends ConfigLoadError_base<{
  readonly path: string;
  readonly cause: unknown;
}> {}
declare function loadConfig(configPath: string): Effect.Effect<DialektConfig, ConfigLoadError>;
//#endregion
//#region src/cli/format.d.ts
/**
 * Terminal formatting core utilities for the dialekt CLI output.
 *
 * Two output modes:
 *   - `pretty` — lush human-readable output with colours and grouping (TTY only)
 *   - `json`   — single compact JSON document for AI agents / machines
 *
 * stdout is the data contract in every mode; status / banners go to stderr.
 * All decoration is gated behind `isTTY` so the output is never mojibake-prone
 * when piped or consumed by another process.
 */
type OutputFormat = "pretty" | "json";
/**
 * Resolves the output format from explicit flag and environment.
 * Precedence: explicit `--format` > auto-detection.
 *
 * Auto-detection picks `json` when stdout is not a TTY or an agent env var
 * is present; otherwise `pretty`.
 */
declare function detectFormat(explicit?: OutputFormat | undefined): OutputFormat;
/** Wraps text in ANSI codes only when stdout is a TTY; otherwise returns it bare. */
declare function color(text: string, ...codes: string[]): string;
interface Glyphs {
  hLine: string;
  vLine: string;
  cornerTL: string;
  cornerTR: string;
  cornerBL: string;
  cornerBR: string;
  teeRight: string;
  teeLeft: string;
  teeDown: string;
  teeUp: string;
  cross: string;
  bullet: string;
  arrow: string;
  check: string;
  crossMark: string;
  warn: string;
}
declare function glyphs(): Glyphs;
declare function drawTable(headers: readonly string[], rows: readonly (readonly string[])[]): string;
declare function banner(title: string): string;
declare function sectionHeader(label: string): string;
declare function success(text: string): string;
declare function failure(text: string): string;
declare function warning(text: string): string;
declare function info(text: string): string;
declare function keyValue(key: string, value: string): string;
//#endregion
//#region src/cli/formatters.d.ts
interface MissingKeyEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly key: string;
}
declare function formatMissingKeys(entries: readonly MissingKeyEntry[], format: OutputFormat): string;
interface UnusedKeyEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly key: string;
}
declare function formatUnusedKeys(entries: readonly UnusedKeyEntry[], format: OutputFormat): string;
interface ValidateEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly count: number;
}
interface ValidateResult {
  readonly passing: boolean;
  readonly entries: readonly ValidateEntry[];
}
declare function formatValidate(result: ValidateResult, format: OutputFormat): string;
interface LanguageEntry {
  readonly adapter: string;
  readonly locales: readonly string[];
}
declare function formatLanguages(entries: readonly LanguageEntry[], format: OutputFormat): string;
interface TranslateResult {
  readonly success: boolean;
  readonly message: string;
  readonly stats?: {
    readonly adaptersProcessed: number;
    readonly localesTranslated: number;
    readonly keysTranslated: number;
    readonly totalSourceKeys?: number;
    readonly perLocale?: Record<string, {
      translated: number;
      remaining: number;
    }>;
    readonly chunkStats?: {
      readonly chunkCount: number;
      readonly avgDurationMs: number;
      readonly minDurationMs: number;
      readonly maxDurationMs: number;
      readonly totalPromptTokens: number;
      readonly totalCompletionTokens: number;
      readonly estimatedCostUsd: number;
    };
  };
}
declare function formatTranslate(result: TranslateResult, format: OutputFormat): string;
interface AddResult {
  readonly success: boolean;
  readonly message: string;
  readonly addedResources?: readonly string[];
}
declare function formatAdd(result: AddResult, format: OutputFormat): string;
interface BenchmarkEntry {
  readonly strategyName: string;
  readonly totalChunks: number;
  readonly succeededChunks: number;
  readonly failedChunks: number;
  readonly totalDurationMs: number;
  readonly averageDurationMsPerChunk: number;
  readonly totalAttempts: number;
}
declare function formatBenchmark(entries: readonly BenchmarkEntry[], format: OutputFormat): string;
declare function formatError(message: string, format: OutputFormat): string;
//#endregion
export { type AdapterCapabilities, AdapterReadError, AdapterWriteError, type AddResult, type BenchmarkEntry, type ChunkingConfig, ConfigLoadError, type DialektConfig, type IcuMessage, type IcuNode, IcuParseError, type IcuPlural, type IcuSelect, type IcuVariable, type LanguageEntry, type MissingKeyEntry, type ModelConfig, NodePlatformLayer, type OutputFormat, PhpExecutionError, type ResourceRef, type RetryConfig, type TranslateResult, type TranslationAdapter, type TranslationContext, TranslationFailedError, type TranslationStrategy, UnknownProviderError, type UnusedKeyEntry, type ValidateEntry, type ValidateResult, banner, buildSystemPrompt, buildUserPrompt, chunkKeys, color, computeMissingKeys, createOneShotStrategy, createToolLoopStrategy, defineConfig, detectFormat, diffKeys, drawTable, extractIcuVariables, failure, flattenObject, formatAdd, formatBenchmark, formatError, formatLanguages, formatMissingKeys, formatTranslate, formatUnusedKeys, formatValidate, glyphs, info, keyValue, loadConfig, parseIcuMessage, readFileIfExists, readPhpArrayAsJson, readPhpArraysBatch, resolveModel, runTranslation, sectionHeader, success, unflattenObject, validateIcuPlural, warning, writeFileEnsuringDir };