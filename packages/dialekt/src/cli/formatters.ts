/**
 * Command-specific formatters for the dialekt CLI output.
 *
 * Imports the core utilities from `format.ts` and builds structured
 * pretty / JSON renderers for each dialekt command.
 */

import {
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
} from "./format.js";
import type { OutputFormat } from "./format.js";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
} as const;

// ─── Missing keys formatter ──────────────────────────────────────────────────

export interface MissingKeyEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly key: string;
}

export function formatMissingKeys(
  entries: readonly MissingKeyEntry[],
  format: OutputFormat,
): string {
  if (format === "json") {
    return JSON.stringify(entries, null, 2) + "\n";
  }

  if (entries.length === 0) {
    return success("All translations are complete. No missing keys.") + "\n";
  }

  const grouped = new Map<string, Map<string, Map<string, string[]>>>();
  for (const e of entries) {
    const byAdapter = grouped.get(e.adapter) ?? new Map();
    const byLocale = byAdapter.get(e.locale) ?? new Map();
    const keys = byLocale.get(e.resource) ?? [];
    keys.push(e.key);
    byLocale.set(e.resource, keys);
    byAdapter.set(e.locale, byLocale);
    grouped.set(e.adapter, byAdapter);
  }

  const lines: string[] = [];
  const g = glyphs();
  const total = entries.length;

  lines.push(sectionHeader(`Missing keys (${total})`));

  for (const [adapter, byLocale] of grouped) {
    let adapterTotal = 0;
    for (const byResource of byLocale.values()) {
      for (const keys of byResource.values()) adapterTotal += keys.length;
    }
    lines.push(`\n  ${color(adapter, C.bold + C.blue)} ${color(`(${adapterTotal})`, C.dim)}`);

    for (const [locale, byResource] of byLocale) {
      let localeTotal = 0;
      for (const keys of byResource.values()) localeTotal += keys.length;
      lines.push(
        `    ${color(`${g.arrow} ${locale}`, C.yellow)} ${color(`(${localeTotal})`, C.dim)}`,
      );

      for (const [resource, keys] of byResource) {
        lines.push(`      ${color(resource, C.bold)}`);
        for (const key of keys) {
          lines.push(`        ${color(g.bullet, C.dim)} ${key}`);
        }
      }
    }
  }

  return lines.join("\n") + "\n";
}

// ─── Unused keys formatter ───────────────────────────────────────────────────

export interface UnusedKeyEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly key: string;
}

export function formatUnusedKeys(entries: readonly UnusedKeyEntry[], format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(entries, null, 2) + "\n";
  }

  if (entries.length === 0) {
    return success("All keys are referenced in source files. No unused keys.") + "\n";
  }

  const grouped = new Map<string, Map<string, Map<string, string[]>>>();
  for (const e of entries) {
    const byAdapter = grouped.get(e.adapter) ?? new Map();
    const byLocale = byAdapter.get(e.locale) ?? new Map();
    const keys = byLocale.get(e.resource) ?? [];
    keys.push(e.key);
    byLocale.set(e.resource, keys);
    byAdapter.set(e.locale, byLocale);
    grouped.set(e.adapter, byAdapter);
  }

  const lines: string[] = [];
  const g = glyphs();
  const total = entries.length;

  lines.push(sectionHeader(`Unused keys (${total})`));

  for (const [adapter, byLocale] of grouped) {
    let adapterTotal = 0;
    for (const byResource of byLocale.values()) {
      for (const keys of byResource.values()) adapterTotal += keys.length;
    }
    lines.push(`\n  ${color(adapter, C.bold + C.blue)} ${color(`(${adapterTotal})`, C.dim)}`);

    for (const [locale, byResource] of byLocale) {
      let localeTotal = 0;
      for (const keys of byResource.values()) localeTotal += keys.length;
      lines.push(
        `    ${color(`${g.arrow} ${locale}`, C.yellow)} ${color(`(${localeTotal})`, C.dim)}`,
      );

      for (const [resource, keys] of byResource) {
        lines.push(`      ${color(resource, C.bold)}`);
        for (const key of keys) {
          lines.push(`        ${color(g.bullet, C.dim)} ${key}`);
        }
      }
    }
  }

  return lines.join("\n") + "\n";
}

// ─── Validate formatter ──────────────────────────────────────────────────────

export interface ValidateEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly count: number;
}

export interface ValidateResult {
  readonly passing: boolean;
  readonly entries: readonly ValidateEntry[];
}

export function formatValidate(result: ValidateResult, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2) + "\n";
  }

  if (result.passing) {
    return "\n" + success("All translations are up to date.") + "\n";
  }

  const rows = result.entries.map((e) => [e.adapter, e.locale, e.resource, e.count.toString()]);

  const lines: string[] = [];
  lines.push(failure(`Missing keys found in ${result.entries.length} resource(s)`));
  lines.push("");
  lines.push(drawTable(["Adapter", "Locale", "Resource", "Missing"], rows));
  lines.push("");
  lines.push(
    color(`Run ${color("dialekt translate", C.bold + C.cyan)} to fill missing keys.`, C.dim),
  );

  return lines.join("\n") + "\n";
}

// ─── Languages formatter ─────────────────────────────────────────────────────

export interface LanguageEntry {
  readonly adapter: string;
  readonly locales: readonly string[];
}

export function formatLanguages(entries: readonly LanguageEntry[], format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(entries, null, 2) + "\n";
  }

  if (entries.length === 0) {
    return warning("No adapters configured.") + "\n";
  }

  const lines: string[] = [];
  const g = glyphs();

  for (const e of entries) {
    lines.push(`  ${color(e.adapter, C.bold + C.blue)}`);
    lines.push(`    ${color(`${g.arrow}`, C.dim)} ${e.locales.join(color(", ", C.dim))}`);
  }

  return lines.join("\n") + "\n";
}

// ─── Translate formatter ─────────────────────────────────────────────────────

export interface TranslateResult {
  readonly success: boolean;
  readonly message: string;
  readonly stats?: {
    readonly adaptersProcessed: number;
    readonly localesTranslated: number;
    readonly keysTranslated: number;
  };
}

export function formatTranslate(result: TranslateResult, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2) + "\n";
  }

  if (result.success) {
    const lines: string[] = [success(result.message)];
    if (result.stats) {
      lines.push("");
      lines.push(keyValue("Adapters:", result.stats.adaptersProcessed.toString()));
      lines.push(keyValue("Locales:", result.stats.localesTranslated.toString()));
      lines.push(keyValue("Keys:", result.stats.keysTranslated.toString()));
    }
    return lines.join("\n") + "\n";
  }

  return failure(result.message) + "\n";
}

// ─── Add formatter ───────────────────────────────────────────────────────────

export interface AddResult {
  readonly success: boolean;
  readonly message: string;
  readonly addedResources?: readonly string[];
}

export function formatAdd(result: AddResult, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(result, null, 2) + "\n";
  }

  if (result.success) {
    const lines: string[] = [success(result.message)];
    if (result.addedResources && result.addedResources.length > 0) {
      lines.push("");
      lines.push(color("Added to:", C.dim));
      for (const r of result.addedResources) {
        lines.push(`  ${color(glyphs().bullet, C.dim)} ${r}`);
      }
    }
    return lines.join("\n") + "\n";
  }

  return failure(result.message) + "\n";
}

// ─── Benchmark formatter ─────────────────────────────────────────────────────

export interface BenchmarkEntry {
  readonly strategyName: string;
  readonly totalChunks: number;
  readonly succeededChunks: number;
  readonly failedChunks: number;
  readonly totalDurationMs: number;
  readonly averageDurationMsPerChunk: number;
  readonly totalAttempts: number;
}

export function formatBenchmark(entries: readonly BenchmarkEntry[], format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify(entries, null, 2) + "\n";
  }

  if (entries.length === 0) {
    return warning("No benchmark data available.") + "\n";
  }

  const lines: string[] = [];

  lines.push(banner("Benchmark Results"));

  const rows = entries.map((e) => [
    e.strategyName,
    `${e.succeededChunks}/${e.totalChunks}`,
    `${e.totalDurationMs.toFixed(0)}ms`,
    `${e.averageDurationMsPerChunk.toFixed(1)}ms`,
    e.totalAttempts.toString(),
  ]);

  lines.push("");
  lines.push(drawTable(["Strategy", "Chunks", "Total", "Avg/Chunk", "Attempts"], rows));

  return lines.join("\n") + "\n";
}

// ─── Error formatter ─────────────────────────────────────────────────────────

export function formatError(message: string, format: OutputFormat): string {
  if (format === "json") {
    return JSON.stringify({ error: message }, null, 2) + "\n";
  }
  return failure(message) + "\n";
}
