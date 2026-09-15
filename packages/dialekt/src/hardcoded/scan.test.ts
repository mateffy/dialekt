import { describe, expect, it } from "vitest";
import { Effect, Layer } from "effect";
import { FileSystem, Path } from "@effect/platform";
import {
  isIgnoredFinding,
  languageForFile,
  normalizePath,
  scanHardcoded,
  type HardcodedScanOptions,
} from "./scan.js";
import type { HardcodedFinding, HardcodedIgnore } from "./types.js";

interface ScanFixture extends HardcodedScanOptions {
  readonly fixtureFiles: Record<string, string>;
  readonly fixtureDirectories: Record<string, readonly string[]>;
}

function makeFsLayer(files: Record<string, string>, directories: Record<string, readonly string[]>) {
  const stub = FileSystem.makeNoop({
    exists: (target) => Effect.succeed(target in directories || target in files),
    readDirectory: (target) => Effect.succeed([...(directories[target] ?? [])]),
    readFileString: (target) =>
      target in files
        ? Effect.succeed(files[target] ?? "")
        : Effect.fail(new Error(`ENOENT: ${target}`) as never),
  });
  return Layer.succeed(FileSystem.FileSystem, stub);
}

function run(options: ScanFixture): Promise<readonly HardcodedFinding[]> {
  return Effect.runPromise(
    scanHardcoded(options).pipe(
      Effect.provide(makeFsLayer(options.fixtureFiles, options.fixtureDirectories)),
      Effect.provide(Path.layer),
    ),
  );
}

function finding(overrides: Partial<HardcodedFinding>): HardcodedFinding {
  return {
    file: "src/App.tsx",
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 5,
    text: "Hello",
    kind: "jsx-text",
    language: "typescriptreact",
    confidence: 0.9,
    ...overrides,
  };
}

describe("languageForFile", () => {
  it("maps each supported extension", () => {
    expect(languageForFile("src/App.tsx")).toBe("typescriptreact");
    expect(languageForFile("src/App.jsx")).toBe("javascriptreact");
    expect(languageForFile("src/util.ts")).toBe("typescript");
    expect(languageForFile("src/util.js")).toBe("javascript");
    expect(languageForFile("views/welcome.blade.php")).toBe("blade");
    expect(languageForFile("README.md")).toBeNull();
  });
});

describe("normalizePath", () => {
  it("converts backslashes and strips a leading ./", () => {
    expect(normalizePath(".\\src\\App.tsx")).toBe("src/App.tsx");
  });
});

describe("isIgnoredFinding", () => {
  it("matches by file suffix and exact text", () => {
    const ignore: HardcodedIgnore[] = [{ file: "App.tsx", text: "Hello" }];
    expect(isIgnoredFinding(finding({}), ignore)).toBe(true);
  });

  it("does not match when the text changed", () => {
    const ignore: HardcodedIgnore[] = [{ file: "App.tsx", text: "Goodbye" }];
    expect(isIgnoredFinding(finding({}), ignore)).toBe(false);
  });

  it("honours the optional kind discriminator", () => {
    const ignore: HardcodedIgnore[] = [{ file: "App.tsx", text: "Hello", kind: "jsx-attribute" }];
    expect(isIgnoredFinding(finding({ kind: "jsx-text" }), ignore)).toBe(false);
  });
});

describe("scanHardcoded", () => {
  const base: ScanFixture = {
    scanPaths: ["."],
    fixtureDirectories: {
      ".": [
        "src/App.tsx",
        "views/welcome.blade.php",
        "node_modules/pkg/index.tsx",
        "README.md",
      ],
    },
    fixtureFiles: {
      "src/App.tsx": `export function App() { return <h1>Hello world</h1>; }`,
      "views/welcome.blade.php": `<h1>Welcome home</h1>`,
      "node_modules/pkg/index.tsx": `<h1>Dependency copy</h1>`,
    },
  };

  it("scans matching files and skips ignored directories", async () => {
    const findings = await run(base);
    expect(findings.map((item) => item.text)).toEqual(["Hello world", "Welcome home"]);
    expect(findings.map((item) => item.file)).toEqual([
      "src/App.tsx",
      "views/welcome.blade.php",
    ]);
  });

  it("applies the manual ignore list", async () => {
    const findings = await run({
      ...base,
      ignore: [{ file: "src/App.tsx", text: "Hello world" }],
    });
    expect(findings.map((item) => item.text)).toEqual(["Welcome home"]);
  });

  it("applies configured ignored values", async () => {
    const findings = await run({
      ...base,
      config: { ignoredValues: ["Hello world"] },
    });
    expect(findings.map((item) => item.text)).toEqual(["Welcome home"]);
  });

  it("returns nothing when the scan path is missing", async () => {
    const findings = await run({ ...base, scanPaths: ["/does-not-exist"] });
    expect(findings).toEqual([]);
  });
});
