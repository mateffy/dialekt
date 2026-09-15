import { Data } from "effect";

/** Where a hardcoded string was found, and what role it plays. */
export type HardcodedKind = "jsx-text" | "jsx-attribute" | "html-text" | "html-attribute";

/** Language identifiers understood by the bundled scanners. */
export type HardcodedLanguage =
  | "javascript"
  | "typescript"
  | "javascriptreact"
  | "typescriptreact"
  | "blade";

export interface HardcodedFinding {
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
export interface HardcodedIgnore {
  /** File path relative to the working directory. Suffix matching is supported. */
  readonly file: string;
  /** Exact raw string that was reviewed and accepted. */
  readonly text: string;
  /** Optional kind discriminator for the rare case where text repeats. */
  readonly kind?: HardcodedKind;
  /** Free-form note for humans; never used by matching. */
  readonly reason?: string;
}

export interface HardcodedLanguageConfig {
  readonly enabled?: boolean;
  readonly minLength?: number;
  readonly ignoredAttributes?: readonly string[];
  readonly ignoredValues?: readonly string[];
}

export interface HardcodedConfig {
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
export interface ResolvedHardcodedOptions {
  readonly minLength: number;
  readonly ignoredAttributes: ReadonlySet<string>;
  readonly ignoredValues: ReadonlySet<string>;
}

export interface HardcodedScanInput {
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
export interface HardcodedScanner {
  readonly name: string;
  readonly languages: readonly HardcodedLanguage[];
  readonly extensions: readonly string[];
  scan(input: HardcodedScanInput): readonly HardcodedFinding[];
}

export class HardcodedScanError extends Data.TaggedError("HardcodedScanError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}
