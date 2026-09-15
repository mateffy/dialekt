import { Effect, Layer } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
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
type ModelConfig = LanguageModel | {
  readonly provider: string;
  readonly modelId: string;
};
declare function resolveModel(config: ModelConfig): Effect.Effect<LanguageModel, UnknownProviderError>;
//#endregion
//#region src/hardcoded/types.d.ts
/** Where a hardcoded string was found, and what role it plays. */
type HardcodedKind = "jsx-text" | "jsx-attribute" | "html-text" | "html-attribute";
/** Language identifiers understood by the bundled scanners. */
type HardcodedLanguage = "javascript" | "typescript" | "javascriptreact" | "typescriptreact" | "blade";
interface HardcodedFinding {
  /** Path relative to the working directory, using forward slashes. */
  readonly file: string;
  /** 1-based line of the first character of `text`. */
  readonly line: number;
  /** 1-based column of the first character of `text`. */
  readonly column: number;
  /** 1-based line of the last character of `text`. */
  readonly endLine: number;
  /** 1-based column of the last character of `text`. */
  readonly endColumn: number;
  /** The raw, untranslated string, with internal whitespace collapsed. */
  readonly text: string;
  readonly kind: HardcodedKind;
  readonly language: HardcodedLanguage;
  /** Attribute or prop name when `kind` is an attribute kind. */
  readonly attribute?: string;
  /** Scanner confidence in the 0..1 range; text nodes score higher than attributes. */
  readonly confidence: number;
}
/**
 * A reviewed, deliberately untranslated string. The entry matches by file and
 * exact text, so editing the string makes the finding appear again.
 */
interface HardcodedIgnore {
  /** File path relative to the working directory. Suffix matching is supported. */
  readonly file: string;
  /** Exact raw string that was reviewed and accepted. */
  readonly text: string;
  /** Optional kind discriminator for the rare case where text repeats. */
  readonly kind?: HardcodedKind;
  /** Free-form note for humans; never used by matching. */
  readonly reason?: string;
}
interface HardcodedLanguageConfig {
  readonly enabled?: boolean;
  readonly minLength?: number;
  readonly ignoredAttributes?: readonly string[];
  readonly ignoredValues?: readonly string[];
}
interface HardcodedConfig {
  readonly enabled?: boolean;
  readonly scanPaths?: readonly string[];
  readonly minLength?: number;
  readonly ignoredAttributes?: readonly string[];
  readonly ignoredValues?: readonly string[];
  /** Per-language overrides keyed by `HardcodedLanguage`. */
  readonly languages?: Readonly<Record<string, HardcodedLanguageConfig>>;
  /** Manual allow-list. Keep this at the very bottom: it is expected to grow. */
  readonly ignore?: readonly HardcodedIgnore[];
}
/** Configuration after defaults and per-language overrides are applied. */
interface ResolvedHardcodedOptions {
  readonly minLength: number;
  readonly ignoredAttributes: ReadonlySet<string>;
  readonly ignoredValues: ReadonlySet<string>;
}
interface HardcodedScanInput {
  readonly file: string;
  readonly language: HardcodedLanguage;
  readonly content: string;
  readonly options: ResolvedHardcodedOptions;
}
/**
 * Low-level extension point for language support. A scanner receives one file
 * at a time and returns candidate findings without doing any file I/O, so it
 * is trivial to unit-test and to add a new language.
 */
interface HardcodedScanner {
  readonly name: string;
  readonly languages: readonly HardcodedLanguage[];
  readonly extensions: readonly string[];
  scan(input: HardcodedScanInput): readonly HardcodedFinding[];
}
declare const HardcodedScanError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "HardcodedScanError";
} & Readonly<A>;
declare class HardcodedScanError extends HardcodedScanError_base<{
  readonly path: string;
  readonly cause: unknown;
}> {}
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
  /** Hardcoded-string detection settings. Keep the `ignore` list at the bottom of the object. */
  readonly hardcoded?: HardcodedConfig;
}
//#endregion
//#region src/config/define-config.d.ts
declare function defineConfig(config: DialektConfig): DialektConfig;
//#endregion
//#region src/hardcoded/scan.d.ts
declare const DEFAULT_SCANNERS: readonly HardcodedScanner[];
interface HardcodedScanOptions {
  readonly scanPaths: readonly string[];
  readonly config?: HardcodedConfig | undefined;
  readonly ignore?: readonly HardcodedIgnore[];
  readonly scanners?: readonly HardcodedScanner[];
}
declare function languageForFile(file: string): HardcodedLanguage | null;
declare function normalizePath(value: string): string;
declare function isIgnoredFinding(finding: HardcodedFinding, ignore: readonly HardcodedIgnore[]): boolean;
declare function scanHardcoded(options: HardcodedScanOptions): Effect.Effect<readonly HardcodedFinding[], HardcodedScanError, FileSystem.FileSystem | Path.Path>;
/** Scan a project using `config.hardcoded`, with all platform services provided. */
declare function scanProjectHardcoded(config: DialektConfig): Effect.Effect<readonly HardcodedFinding[], HardcodedScanError>;
//#endregion
//#region src/hardcoded/filter.d.ts
/**
 * Attributes whose values are almost always technical (class names, identifiers,
 * routes, handlers). Translatable attributes such as `alt`, `title`,
 * `placeholder`, `label` and `aria-label` are deliberately absent so they get
 * reported.
 */
declare const DEFAULT_IGNORED_ATTRIBUTES: readonly string[];
declare const DEFAULT_HARDCODED_MIN_LENGTH = 2;
/** Merge global config, per-language overrides and defaults for one language. */
declare function resolveHardcodedOptions(config: HardcodedConfig | undefined, language: string): ResolvedHardcodedOptions;
declare function isIgnoredAttribute(name: string, options: ResolvedHardcodedOptions): boolean;
/**
 * Heuristic gate for "is this string worth translating?". It intentionally
 * errs on the side of reporting and lets config prune the rest.
 */
declare function isLikelyTranslatable(text: string, options: ResolvedHardcodedOptions): boolean;
//#endregion
//#region src/hardcoded/scanners/jsx.d.ts
declare const jsxScanner: HardcodedScanner;
//#endregion
//#region src/hardcoded/scanners/blade.d.ts
declare const bladeScanner: HardcodedScanner;
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
//#region src/cli/hardcoded-formatters.d.ts
declare function formatHardcoded(findings: readonly HardcodedFinding[], format: OutputFormat): string;
interface DoctorResult {
  readonly missing: readonly MissingKeyEntry[];
  readonly hardcoded: readonly HardcodedFinding[];
  readonly skipped: {
    readonly missing: boolean;
    readonly hardcoded: boolean;
  };
}
declare function formatDoctor(result: DoctorResult, format: OutputFormat): string;
//#endregion
export { type AdapterCapabilities, AdapterReadError, AdapterWriteError, type AddResult, type BenchmarkEntry, type ChunkingConfig, ConfigLoadError, DEFAULT_HARDCODED_MIN_LENGTH, DEFAULT_IGNORED_ATTRIBUTES, DEFAULT_SCANNERS, type DialektConfig, type DoctorResult, type HardcodedConfig, type HardcodedFinding, type HardcodedIgnore, type HardcodedKind, type HardcodedLanguage, type HardcodedLanguageConfig, HardcodedScanError, type HardcodedScanInput, type HardcodedScanner, type IcuMessage, type IcuNode, IcuParseError, type IcuPlural, type IcuSelect, type IcuVariable, type LanguageEntry, type MissingKeyEntry, type ModelConfig, NodePlatformLayer, type OutputFormat, PhpExecutionError, type ResolvedHardcodedOptions, type ResourceRef, type RetryConfig, type TranslateResult, type TranslationAdapter, type TranslationContext, TranslationFailedError, type TranslationStrategy, UnknownProviderError, type UnusedKeyEntry, type ValidateEntry, type ValidateResult, banner, bladeScanner, buildSystemPrompt, buildUserPrompt, chunkKeys, color, computeMissingKeys, createOneShotStrategy, createToolLoopStrategy, defineConfig, detectFormat, diffKeys, drawTable, extractIcuVariables, failure, flattenObject, formatAdd, formatBenchmark, formatDoctor, formatError, formatHardcoded, formatLanguages, formatMissingKeys, formatTranslate, formatUnusedKeys, formatValidate, glyphs, info, isIgnoredAttribute, isIgnoredFinding, isLikelyTranslatable, jsxScanner, keyValue, languageForFile, loadConfig, normalizePath, parseIcuMessage, readFileIfExists, readPhpArrayAsJson, readPhpArraysBatch, resolveHardcodedOptions, resolveModel, runTranslation, scanHardcoded, scanProjectHardcoded, sectionHeader, success, unflattenObject, validateIcuPlural, warning, writeFileEnsuringDir };