/**
 * Terminal formatting helpers for the dialekt CLI output.
 *
 * Two output modes:
 *   - `pretty` — lush human-readable output with colours and grouping (TTY only)
 *   - `json`   — single compact JSON document for AI agents / machines
 *
 * stdout is the data contract in every mode; status / banners go to stderr.
 * All decoration is gated behind `isTTY` so the output is never mojibake-prone
 * when piped or consumed by another process.
 */

// ─── Output format ──────────────────────────────────────────────────────────

export type OutputFormat = 'pretty' | 'json';

/**
 * Environment variables that signal dialekt is running inside an AI agent.
 * When any is set (truthy), or stdout is not a TTY, JSON mode is the default.
 */
export const AGENT_ENV_VARS = [
  'CLAUDE_CODE',
  'CLAUDECODE',
  'CURSOR',
  'CURSOR_TRACE_ID',
  'DEVIN',
  'GEMINI_CLI',
  'AGENT_TASK_ID',
  'AIDER_CHAT',
] as const;

/**
 * Resolves the output format from explicit flag and environment.
 * Precedence: explicit `--format` > auto-detection.
 *
 * Auto-detection picks `json` when stdout is not a TTY or an agent env var
 * is present; otherwise `pretty`.
 */
export function detectFormat(explicit?: OutputFormat | undefined): OutputFormat {
  if (explicit !== undefined) return explicit;
  if (!process.stdout.isTTY) return 'json';
  if (AGENT_ENV_VARS.some((k) => process.env[k])) return 'json';
  return 'pretty';
}

// ─── ANSI colours ────────────────────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
} as const;

function isTty(): boolean {
  return process.stdout.isTTY === true;
}

/** Wraps text in ANSI codes only when stdout is a TTY; otherwise returns it bare. */
export function color(text: string, ...codes: string[]): string {
  if (!isTty()) return text;
  return `${codes.join('')}${text}${C.reset}`;
}

// ─── Box-drawing glyphs ──────────────────────────────────────────────────────

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

const PRETTY_GLYPHS: Glyphs = {
  hLine: String.fromCharCode(0x2500),     // ─
  vLine: String.fromCharCode(0x2502),     // │
  cornerTL: String.fromCharCode(0x250C),  // ┌
  cornerTR: String.fromCharCode(0x2510),  // ┐
  cornerBL: String.fromCharCode(0x2514),  // └
  cornerBR: String.fromCharCode(0x2518),  // ┘
  teeRight: String.fromCharCode(0x251C),  // ├
  teeLeft: String.fromCharCode(0x2524),  // ┤
  teeDown: String.fromCharCode(0x252C),   // ┬
  teeUp: String.fromCharCode(0x2534),    // ┴
  cross: String.fromCharCode(0x253C),     // ┼
  bullet: String.fromCharCode(0x2022),    // •
  arrow: String.fromCharCode(0x2192),     // →
  check: String.fromCharCode(0x2713),     // ✓
  crossMark: String.fromCharCode(0x2717), // ✗
  warn: String.fromCharCode(0x26A0),     // ⚠
};

const ASCII_GLYPHS: Glyphs = {
  hLine: '-',
  vLine: '|',
  cornerTL: '+',
  cornerTR: '+',
  cornerBL: '+',
  cornerBR: '+',
  teeRight: '+',
  teeLeft: '+',
  teeDown: '+',
  teeUp: '+',
  cross: '+',
  bullet: '*',
  arrow: '>',
  check: '+',
  crossMark: 'x',
  warn: '!',
};

export function glyphs(): Glyphs {
  return isTty() ? PRETTY_GLYPHS : ASCII_GLYPHS;
}

// ─── Table helpers ───────────────────────────────────────────────────────────

export function drawTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[]
): string {
  const g = glyphs();
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );

  const pad = (text: string, width: number) => text.padEnd(width);

  const hLine = g.cornerTL +
    colWidths.map((w) => g.hLine.repeat(w + 2)).join(g.teeDown) +
    g.cornerTR;

  const headerRow = g.vLine +
    headers.map((h, i) => ` ${color(pad(h, colWidths[i]!), C.bold)} `).join(g.vLine) +
    g.vLine;

  const separator = g.teeRight +
    colWidths.map((w) => g.hLine.repeat(w + 2)).join(g.cross) +
    g.teeLeft;

  const dataRows = rows.map((row) =>
    g.vLine +
    row.map((cell, i) => ` ${pad(cell, colWidths[i]!)} `).join(g.vLine) +
    g.vLine
  );

  const bottomLine = g.cornerBL +
    colWidths.map((w) => g.hLine.repeat(w + 2)).join(g.teeUp) +
    g.cornerBR;

  return [hLine, headerRow, separator, ...dataRows, bottomLine].join('\n');
}

// ─── Banner / header helpers ─────────────────────────────────────────────────

export function banner(title: string): string {
  const g = glyphs();
  const line = g.hLine.repeat(Math.max(title.length + 4, 40));
  return `${color(line, C.dim)}\n  ${color(title, C.bold + C.cyan)}\n${color(line, C.dim)}`;
}

export function sectionHeader(label: string): string {
  const g = glyphs();
  return `\n${color(`${g.arrow} ${label}`, C.bold + C.cyan)}`;
}

export function success(text: string): string {
  const g = glyphs();
  return `${color(`${g.check} ${text}`, C.green)}`;
}

export function failure(text: string): string {
  const g = glyphs();
  return `${color(`${g.crossMark} ${text}`, C.red)}`;
}

export function warning(text: string): string {
  const g = glyphs();
  return `${color(`${g.warn} ${text}`, C.yellow)}`;
}

export function info(text: string): string {
  return color(text, C.dim);
}

export function keyValue(key: string, value: string): string {
  return `  ${color(key, C.bold)} ${value}`;
}

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
  if (format === 'json') {
    return JSON.stringify(entries, null, 2) + '\n';
  }

  if (entries.length === 0) {
    return success('All translations are complete. No missing keys.') + '\n';
  }

  // Group by adapter -> locale -> resource
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
      lines.push(`    ${color(`${g.arrow} ${locale}`, C.yellow)} ${color(`(${localeTotal})`, C.dim)}`);

      for (const [resource, keys] of byResource) {
        lines.push(`      ${color(resource, C.bold)}`);
        for (const key of keys) {
          lines.push(`        ${color(g.bullet, C.dim)} ${key}`);
        }
      }
    }
  }

  return lines.join('\n') + '\n';
}

// ─── Unused keys formatter ───────────────────────────────────────────────────

export interface UnusedKeyEntry {
  readonly adapter: string;
  readonly locale: string;
  readonly resource: string;
  readonly key: string;
}

export function formatUnusedKeys(
  entries: readonly UnusedKeyEntry[],
  format: OutputFormat,
): string {
  if (format === 'json') {
    return JSON.stringify(entries, null, 2) + '\n';
  }

  if (entries.length === 0) {
    return success('All keys are referenced in source files. No unused keys.') + '\n';
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
      lines.push(`    ${color(`${g.arrow} ${locale}`, C.yellow)} ${color(`(${localeTotal})`, C.dim)}`);

      for (const [resource, keys] of byResource) {
        lines.push(`      ${color(resource, C.bold)}`);
        for (const key of keys) {
          lines.push(`        ${color(g.bullet, C.dim)} ${key}`);
        }
      }
    }
  }

  return lines.join('\n') + '\n';
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

export function formatValidate(
  result: ValidateResult,
  format: OutputFormat,
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2) + '\n';
  }

  if (result.passing) {
    return '\n' + success('All translations are up to date.') + '\n';
  }

  const rows = result.entries.map((e) => [
    e.adapter,
    e.locale,
    e.resource,
    e.count.toString(),
  ]);

  const lines: string[] = [];
  lines.push(failure(`Missing keys found in ${result.entries.length} resource(s)`));
  lines.push('');
  lines.push(drawTable(['Adapter', 'Locale', 'Resource', 'Missing'], rows));
  lines.push('');
  lines.push(color(`Run ${color('dialekt translate', C.bold + C.cyan)} to fill missing keys.`, C.dim));

  return lines.join('\n') + '\n';
}

// ─── Languages formatter ─────────────────────────────────────────────────────

export interface LanguageEntry {
  readonly adapter: string;
  readonly locales: readonly string[];
}

export function formatLanguages(
  entries: readonly LanguageEntry[],
  format: OutputFormat,
): string {
  if (format === 'json') {
    return JSON.stringify(entries, null, 2) + '\n';
  }

  if (entries.length === 0) {
    return warning('No adapters configured.') + '\n';
  }

  const lines: string[] = [];
  const g = glyphs();

  for (const e of entries) {
    lines.push(`  ${color(e.adapter, C.bold + C.blue)}`);
    lines.push(`    ${color(`${g.arrow}`, C.dim)} ${e.locales.join(color(', ', C.dim))}`);
  }

  return lines.join('\n') + '\n';
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

export function formatTranslate(
  result: TranslateResult,
  format: OutputFormat,
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2) + '\n';
  }

  if (result.success) {
    const lines: string[] = [success(result.message)];
    if (result.stats) {
      lines.push('');
      lines.push(keyValue('Adapters:', result.stats.adaptersProcessed.toString()));
      lines.push(keyValue('Locales:', result.stats.localesTranslated.toString()));
      lines.push(keyValue('Keys:', result.stats.keysTranslated.toString()));
    }
    return lines.join('\n') + '\n';
  }

  return failure(result.message) + '\n';
}

// ─── Add formatter ───────────────────────────────────────────────────────────

export interface AddResult {
  readonly success: boolean;
  readonly message: string;
  readonly addedResources?: readonly string[];
}

export function formatAdd(
  result: AddResult,
  format: OutputFormat,
): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2) + '\n';
  }

  if (result.success) {
    const lines: string[] = [success(result.message)];
    if (result.addedResources && result.addedResources.length > 0) {
      lines.push('');
      lines.push(color('Added to:', C.dim));
      for (const r of result.addedResources) {
        lines.push(`  ${color(glyphs().bullet, C.dim)} ${r}`);
      }
    }
    return lines.join('\n') + '\n';
  }

  return failure(result.message) + '\n';
}

// ─── Benchmark formatter ───────────────────────────────────────────────────────

export interface BenchmarkEntry {
  readonly strategyName: string;
  readonly totalChunks: number;
  readonly succeededChunks: number;
  readonly failedChunks: number;
  readonly totalDurationMs: number;
  readonly averageDurationMsPerChunk: number;
  readonly totalAttempts: number;
}

export function formatBenchmark(
  entries: readonly BenchmarkEntry[],
  format: OutputFormat,
): string {
  if (format === 'json') {
    return JSON.stringify(entries, null, 2) + '\n';
  }

  if (entries.length === 0) {
    return warning('No benchmark data available.') + '\n';
  }

  const lines: string[] = [];
  const g = glyphs();

  lines.push(banner('Benchmark Results'));

  const rows = entries.map((e) => [
    e.strategyName,
    `${e.succeededChunks}/${e.totalChunks}`,
    `${e.totalDurationMs.toFixed(0)}ms`,
    `${e.averageDurationMsPerChunk.toFixed(1)}ms`,
    e.totalAttempts.toString(),
  ]);

  lines.push('');
  lines.push(drawTable(
    ['Strategy', 'Chunks', 'Total', 'Avg/Chunk', 'Attempts'],
    rows,
  ));

  return lines.join('\n') + '\n';
}

// ─── Error formatter ─────────────────────────────────────────────────────────

export function formatError(
  message: string,
  format: OutputFormat,
): string {
  if (format === 'json') {
    return JSON.stringify({ error: message }, null, 2) + '\n';
  }
  return failure(message) + '\n';
}
