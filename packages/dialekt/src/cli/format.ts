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

// ─── Output format ──────────────────────────────────────────────────────────

export type OutputFormat = "pretty" | "json";

/**
 * Environment variables that signal dialekt is running inside an AI agent.
 * When any is set (truthy), or stdout is not a TTY, JSON mode is the default.
 */
export const AGENT_ENV_VARS = [
  "CLAUDE_CODE",
  "CLAUDECODE",
  "CURSOR",
  "CURSOR_TRACE_ID",
  "DEVIN",
  "GEMINI_CLI",
  "AGENT_TASK_ID",
  "AIDER_CHAT",
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
  if (!process.stdout.isTTY) return "json";
  if (AGENT_ENV_VARS.some((k) => process.env[k])) return "json";
  return "pretty";
}

// ─── ANSI colours ────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
} as const;

function isTty(): boolean {
  return process.stdout.isTTY === true;
}

/** Wraps text in ANSI codes only when stdout is a TTY; otherwise returns it bare. */
export function color(text: string, ...codes: string[]): string {
  if (!isTty()) return text;
  return `${codes.join("")}${text}${C.reset}`;
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
  hLine: String.fromCharCode(0x2500),
  vLine: String.fromCharCode(0x2502),
  cornerTL: String.fromCharCode(0x250c),
  cornerTR: String.fromCharCode(0x2510),
  cornerBL: String.fromCharCode(0x2514),
  cornerBR: String.fromCharCode(0x2518),
  teeRight: String.fromCharCode(0x251c),
  teeLeft: String.fromCharCode(0x2524),
  teeDown: String.fromCharCode(0x252c),
  teeUp: String.fromCharCode(0x2534),
  cross: String.fromCharCode(0x253c),
  bullet: String.fromCharCode(0x2022),
  arrow: String.fromCharCode(0x2192),
  check: String.fromCharCode(0x2713),
  crossMark: String.fromCharCode(0x2717),
  warn: String.fromCharCode(0x26a0),
};

const ASCII_GLYPHS: Glyphs = {
  hLine: "-",
  vLine: "|",
  cornerTL: "+",
  cornerTR: "+",
  cornerBL: "+",
  cornerBR: "+",
  teeRight: "+",
  teeLeft: "+",
  teeDown: "+",
  teeUp: "+",
  cross: "+",
  bullet: "*",
  arrow: ">",
  check: "+",
  crossMark: "x",
  warn: "!",
};

export function glyphs(): Glyphs {
  return isTty() ? PRETTY_GLYPHS : ASCII_GLYPHS;
}

// ─── Table helpers ───────────────────────────────────────────────────────────

export function drawTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const g = glyphs();
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );

  const pad = (text: string, width: number) => text.padEnd(width);

  const hLine =
    g.cornerTL + colWidths.map((w) => g.hLine.repeat(w + 2)).join(g.teeDown) + g.cornerTR;

  const headerRow =
    g.vLine +
    headers.map((h, i) => ` ${color(pad(h, colWidths[i]!), C.bold)} `).join(g.vLine) +
    g.vLine;

  const separator =
    g.teeRight + colWidths.map((w) => g.hLine.repeat(w + 2)).join(g.cross) + g.teeLeft;

  const dataRows = rows.map(
    (row) =>
      g.vLine + row.map((cell, i) => ` ${pad(cell, colWidths[i]!)} `).join(g.vLine) + g.vLine,
  );

  const bottomLine =
    g.cornerBL + colWidths.map((w) => g.hLine.repeat(w + 2)).join(g.teeUp) + g.cornerBR;

  return [hLine, headerRow, separator, ...dataRows, bottomLine].join("\n");
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
