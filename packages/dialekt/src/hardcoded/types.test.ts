import { describe, expect, it } from "vitest";
import { HardcodedScanError } from "./types.js";
import type {
  HardcodedConfig,
  HardcodedFinding,
  HardcodedIgnore,
  HardcodedScanner,
  ResolvedHardcodedOptions,
} from "./types.js";

describe("hardcoded types", () => {
  it("carries a finding with a location and confidence", () => {
    const finding: HardcodedFinding = {
      file: "src/App.tsx",
      line: 1,
      column: 2,
      endLine: 1,
      endColumn: 7,
      text: "Hello",
      kind: "jsx-text",
      language: "typescriptreact",
      confidence: 0.9,
    };
    expect(finding.text).toBe("Hello");
    expect(finding.confidence).toBeGreaterThan(0);
  });

  it("accepts a bottom-of-object ignore list", () => {
    const ignore: HardcodedIgnore[] = [
      { file: "src/App.tsx", text: "Acme", kind: "jsx-text", reason: "Brand" },
    ];
    const config: HardcodedConfig = {
      enabled: true,
      minLength: 2,
      ignoredAttributes: ["data-cy"],
      ignoredValues: ["OK"],
      languages: { blade: { ignoredValues: ["FAQ"] } },
      ignore,
    };
    expect(config.ignore).toHaveLength(1);
    expect(config.ignore?.[0]?.reason).toBe("Brand");
  });

  it("expresses resolved options as sets", () => {
    const options: ResolvedHardcodedOptions = {
      minLength: 3,
      ignoredAttributes: new Set(["type"]),
      ignoredValues: new Set(["ok"]),
    };
    expect(options.ignoredAttributes.has("type")).toBe(true);
  });

  it("defines the scanner contract", () => {
    const scanner: HardcodedScanner = {
      name: "test",
      languages: ["typescript"],
      extensions: [".ts"],
      scan: () => [],
    };
    expect(scanner.scan).toBeTypeOf("function");
  });
});

describe("HardcodedScanError", () => {
  it("is a tagged error with a path and cause", () => {
    const error = new HardcodedScanError({ path: "src/App.tsx", cause: "boom" });
    expect(error._tag).toBe("HardcodedScanError");
    expect(error.path).toBe("src/App.tsx");
    expect(error.cause).toBe("boom");
  });
});
