import { FileSystem, Path } from "@effect/platform";
import { Effect } from "effect";
import type { DialektConfig } from "../config/types.js";
import { NodePlatformLayer } from "../sdk/node-layer.js";
import {
  HardcodedScanError,
  type HardcodedConfig,
  type HardcodedFinding,
  type HardcodedIgnore,
  type HardcodedLanguage,
  type HardcodedScanner,
} from "./types.js";
import { resolveHardcodedOptions } from "./filter.js";
import { jsxScanner } from "./scanners/jsx.js";
import { bladeScanner } from "./scanners/blade.js";

export const DEFAULT_SCANNERS: readonly HardcodedScanner[] = [jsxScanner, bladeScanner];

const SKIPPED_DIRECTORIES = new Set([
  ".cache",
  ".git",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "storage",
  "vendor",
]);

const EXTENSION_LANGUAGE: readonly (readonly [string, HardcodedLanguage])[] = [
  [".blade.php", "blade"],
  [".tsx", "typescriptreact"],
  [".jsx", "javascriptreact"],
  [".ts", "typescript"],
  [".js", "javascript"],
];

const SCAN_CONCURRENCY = 10;

export interface HardcodedScanOptions {
  readonly scanPaths: readonly string[];
  readonly config?: HardcodedConfig | undefined;
  readonly ignore?: readonly HardcodedIgnore[];
  readonly scanners?: readonly HardcodedScanner[];
}

export function languageForFile(file: string): HardcodedLanguage | null {
  const lower = file.toLowerCase();
  for (const [extension, language] of EXTENSION_LANGUAGE) {
    if (lower.endsWith(extension)) return language;
  }
  return null;
}

export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

export function isIgnoredFinding(
  finding: HardcodedFinding,
  ignore: readonly HardcodedIgnore[],
): boolean {
  const file = normalizePath(finding.file);
  return ignore.some((entry) => {
    if (entry.text !== finding.text) return false;
    if (entry.kind !== undefined && entry.kind !== finding.kind) return false;
    const pattern = normalizePath(entry.file);
    return file === pattern || file.endsWith(`/${pattern}`);
  });
}

function isSkippedFile(relativePath: string): boolean {
  return normalizePath(relativePath)
    .split("/")
    .some((segment) => SKIPPED_DIRECTORIES.has(segment));
}

function scannerFor(
  language: HardcodedLanguage,
  scanners: readonly HardcodedScanner[],
): HardcodedScanner | null {
  return scanners.find((candidate) => candidate.languages.includes(language)) ?? null;
}

function dedupeAndSort(findings: readonly HardcodedFinding[]): readonly HardcodedFinding[] {
  const seen = new Set<string>();
  const unique: HardcodedFinding[] = [];
  for (const finding of findings) {
    const key = `${finding.file}:${finding.line}:${finding.column}:${finding.kind}:${finding.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }
  return unique.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column,
  );
}

export function scanHardcoded(
  options: HardcodedScanOptions,
): Effect.Effect<
  readonly HardcodedFinding[],
  HardcodedScanError,
  FileSystem.FileSystem | Path.Path
> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const scanners = options.scanners ?? DEFAULT_SCANNERS;
    const findings: HardcodedFinding[] = [];

    for (const scanPath of options.scanPaths) {
      const exists = yield* fs.exists(scanPath).pipe(Effect.orElseSucceed(() => false));
      if (!exists) continue;

      const entries = yield* fs
        .readDirectory(scanPath, { recursive: true })
        .pipe(Effect.orElseSucceed(() => [] as string[]));

      const files = entries
        .map((entry) => ({ entry, language: languageForFile(entry) }))
        .filter(
          (candidate): candidate is { entry: string; language: HardcodedLanguage } =>
            !isSkippedFile(candidate.entry) && candidate.language !== null,
        );

      const perFile = yield* Effect.forEach(
        files,
        (candidate) =>
          Effect.gen(function* () {
            const scanner = scannerFor(candidate.language, scanners);
            if (scanner === null) return [];
            const filePath = path.join(scanPath, candidate.entry);
            const content = yield* fs
              .readFileString(filePath)
              .pipe(Effect.orElseSucceed(() => null));
            if (content === null) return [];
            const file = normalizePath(filePath);
            return yield* Effect.try({
              try: () =>
                scanner.scan({
                  file,
                  language: candidate.language,
                  content,
                  options: resolveHardcodedOptions(options.config, candidate.language),
                }),
              catch: (cause) => new HardcodedScanError({ path: file, cause }),
            });
          }),
        { concurrency: SCAN_CONCURRENCY },
      );

      for (const result of perFile) {
        for (const finding of result) findings.push(finding);
      }
    }

    const filtered = findings.filter(
      (finding) => !isIgnoredFinding(finding, options.ignore ?? []),
    );
    return dedupeAndSort(filtered);
  });
}

/** Scan a project using `config.hardcoded`, with all platform services provided. */
export function scanProjectHardcoded(
  config: DialektConfig,
): Effect.Effect<readonly HardcodedFinding[], HardcodedScanError> {
  const hardcoded = config.hardcoded;
  if (hardcoded?.enabled === false) return Effect.succeed([]);
  return scanHardcoded({
    scanPaths: hardcoded?.scanPaths ?? ["."],
    config: hardcoded,
    ignore: hardcoded?.ignore ?? [],
  }).pipe(Effect.provide(NodePlatformLayer));
}
