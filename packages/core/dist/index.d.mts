import { Effect, Layer } from "effect";
import { NodeContext } from "@effect/platform-node";
import { FileSystem, Path } from "@effect/platform";
import { LanguageModel } from "ai";
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
//#region src/config/types.d.ts
interface ModelConfig {
  readonly provider: string;
  readonly modelId: string;
}
interface ChunkingConfig {
  readonly maxTokens: number;
  readonly charsPerToken: number;
  readonly concurrency: number;
}
interface RetryConfig {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
}
interface DialektConfig {
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[] | null;
  readonly strategy: 'one-shot' | 'tool-loop-agent';
  readonly model: ModelConfig;
  readonly fastModel: ModelConfig;
  readonly chunking: ChunkingConfig;
  readonly retry: RetryConfig;
  readonly adapters: readonly TranslationAdapter[];
}
//#endregion
//#region src/config/define-config.d.ts
declare function defineConfig(config: DialektConfig): DialektConfig;
//#endregion
//#region src/keys/flatten.d.ts
declare function flattenObject(input: Readonly<Record<string, unknown>>, prefix?: string): Record<string, string>;
declare function unflattenObject(input: Readonly<Record<string, string>>): Record<string, unknown>;
declare function diffKeys(source: Readonly<Record<string, string>>, target: Readonly<Record<string, string>>): string[];
//#endregion
//#region src/translation/chunking.d.ts
interface ChunkingConfig$1 {
  readonly maxTokens: number;
  readonly charsPerToken: number;
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
declare function readFileIfExists(path: string): Effect.Effect<string | null, import("@effect/platform/Error").PlatformError, FileSystem.FileSystem>;
declare function writeFileEnsuringDir(path: string, content: string): Effect.Effect<void, import("@effect/platform/Error").PlatformError, FileSystem.FileSystem | Path.Path>;
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
//#endregion
//#region src/translation/model-registry.d.ts
declare const UnknownProviderError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "UnknownProviderError";
} & Readonly<A>;
declare class UnknownProviderError extends UnknownProviderError_base<{
  readonly provider: string;
}> {}
interface ModelConfig$1 {
  readonly provider: string;
  readonly modelId: string;
}
/**
 * The one file in the entire codebase allowed to import AI SDK provider packages.
 */
declare function resolveModel(config: ModelConfig$1): Effect.Effect<LanguageModel, UnknownProviderError>;
//#endregion
//#region src/translation/types.d.ts
interface TranslationContext {
  readonly sourceLocale: string;
  readonly targetLocale: string;
  readonly sourceMap: Record<string, string>;
  readonly targetMap: Record<string, string>;
  readonly keys: readonly string[];
}
declare const TranslationFailedError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P] }>) => import("effect/Cause").YieldableError & {
  readonly _tag: "TranslationFailedError";
} & Readonly<A>;
declare class TranslationFailedError extends TranslationFailedError_base<{
  readonly keys: readonly string[];
  readonly cause: unknown;
}> {}
interface TranslationStrategy {
  readonly name: 'one-shot' | 'tool-loop-agent';
  translateChunk(ctx: TranslationContext): Effect.Effect<Record<string, string>, TranslationFailedError>;
}
//#endregion
//#region src/translation/one-shot-strategy.d.ts
declare function createOneShotStrategy(deps: {
  model: LanguageModel;
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
  };
}): TranslationStrategy;
//#endregion
//#region src/translation/tool-loop-strategy.d.ts
declare function createToolLoopStrategy(deps: {
  model: LanguageModel;
  retry: {
    maxAttempts: number;
    baseDelayMs: number;
  };
}): TranslationStrategy;
//#endregion
//#region src/translation/orchestrator.d.ts
interface TranslationRunConfig {
  readonly adapters: readonly TranslationAdapter[];
  readonly strategy: TranslationStrategy;
  readonly sourceLocale: string;
  readonly targetLocales: readonly string[];
  readonly chunking: ChunkingConfig;
}
declare function runTranslation(config: TranslationRunConfig): Effect.Effect<undefined, AdapterReadError | AdapterWriteError | TranslationFailedError, never>;
//#endregion
//#region src/translation/prompt.d.ts
declare function buildSystemPrompt(from: string, to: string): string;
declare function buildUserPrompt(ctx: TranslationContext): string;
//#endregion
//#region src/translation/missing-keys.d.ts
interface MissingKeyEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: ResourceRef;
  readonly missing: readonly string[];
}
declare function computeMissingKeys(adapter: TranslationAdapter, sourceLocale: string, targetLocales: readonly string[]): Effect.Effect<readonly MissingKeyEntry[], AdapterReadError>;
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
export { type AdapterCapabilities, AdapterReadError, AdapterWriteError, type ChunkingConfig, ConfigLoadError, type DialektConfig, type ModelConfig, NodePlatformLayer, PhpExecutionError, type ResourceRef, type RetryConfig, type TranslationAdapter, type TranslationContext, TranslationFailedError, type TranslationStrategy, UnknownProviderError, buildSystemPrompt, buildUserPrompt, chunkKeys, computeMissingKeys, createOneShotStrategy, createToolLoopStrategy, defineConfig, diffKeys, flattenObject, loadConfig, readFileIfExists, readPhpArrayAsJson, resolveModel, runTranslation, unflattenObject, writeFileEnsuringDir };