import { Data, Effect } from 'effect';

/** Opaque adapter-specific identifier for one resource within a locale. */
export interface ResourceRef {
  readonly key: string; // e.g. Laravel domain "validation", or "messages" for Paraglide
  readonly label: string; // human-readable, for CLI output
}

export class AdapterReadError extends Data.TaggedError('AdapterReadError')<{
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly cause: unknown;
}> {}

export class AdapterWriteError extends Data.TaggedError('AdapterWriteError')<{
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly cause: unknown;
}> {}

export interface TranslationAdapter {
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
  writeResource(
    locale: string,
    resource: ResourceRef,
    entries: Record<string, string>,
  ): Effect.Effect<void, AdapterWriteError>;

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
  findUnusedKeys?(
    locale: string,
    resource: ResourceRef,
  ): Effect.Effect<readonly string[], AdapterReadError>;
}

export interface AdapterCapabilities {
  readonly canCreateResource: boolean; // can writeResource() create a brand-new file?
  readonly unusedKeyDetection: boolean; // is findUnusedKeys implemented?
}
