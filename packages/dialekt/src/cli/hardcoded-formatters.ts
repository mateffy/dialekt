import { color, banner, glyphs, info, success } from "./format.js";
import type { OutputFormat } from "./format.js";
import { formatMissingKeys, type MissingKeyEntry } from "./formatters.js";
import type { HardcodedFinding } from "../hardcoded/types.js";

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
} as const;

export function formatHardcoded(
  findings: readonly HardcodedFinding[],
  format: OutputFormat,
): string {
  if (format === "json") {
    return JSON.stringify(findings, null, 2) + "\n";
  }

  if (findings.length === 0) {
    return success("No hardcoded strings found.") + "\n";
  }

  const byFile = new Map<string, HardcodedFinding[]>();
  for (const finding of findings) {
    const list = byFile.get(finding.file) ?? [];
    list.push(finding);
    byFile.set(finding.file, list);
  }

  const g = glyphs();
  const lines: string[] = [`\n${color(`${g.arrow} Hardcoded strings (${findings.length})`, C.bold + C.cyan)}`];
  for (const [file, fileFindings] of byFile) {
    lines.push(`\n  ${color(file, C.bold)} ${color(`(${fileFindings.length})`, C.dim)}`);
    for (const finding of fileFindings) {
      const location = `${finding.line}:${finding.column}`;
      const label = finding.attribute === undefined ? finding.kind : `${finding.kind}:${finding.attribute}`;
      lines.push(
        `    ${color(g.bullet, C.dim)} ${color(location.padEnd(10), C.yellow)} ${color(label, C.dim)}  ${finding.text}`,
      );
    }
  }
  return lines.join("\n") + "\n";
}

export interface DoctorResult {
  readonly missing: readonly MissingKeyEntry[];
  readonly hardcoded: readonly HardcodedFinding[];
  readonly skipped: {
    readonly missing: boolean;
    readonly hardcoded: boolean;
  };
}

export function formatDoctor(result: DoctorResult, format: OutputFormat): string {
  if (format === "json") {
    return (
      JSON.stringify(
        {
          missing: result.missing,
          hardcoded: result.hardcoded,
          summary: {
            missing: result.missing.length,
            hardcoded: result.hardcoded.length,
          },
        },
        null,
        2,
      ) + "\n"
    );
  }

  const lines: string[] = [banner("dialekt doctor")];

  if (result.skipped.hardcoded) {
    lines.push(info("  Hardcoded-string scan skipped."));
  } else {
    lines.push(formatHardcoded(result.hardcoded, "pretty").trimEnd());
  }

  if (result.skipped.missing) {
    lines.push(info("  Missing-key check skipped."));
  } else {
    lines.push(formatMissingKeys(result.missing, "pretty").trimEnd());
  }

  const total = result.missing.length + result.hardcoded.length;
  lines.push("");
  if (total === 0) {
    lines.push(success("No translation issues found."));
  } else {
    lines.push(
      color(
        `Found ${result.missing.length} missing key(s) and ${result.hardcoded.length} hardcoded string(s).`,
        C.bold + C.yellow,
      ),
    );
  }

  return lines.join("\n") + "\n";
}
