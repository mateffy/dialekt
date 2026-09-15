import { describe, expect, it } from "vitest";
import { formatDoctor, formatHardcoded } from "./hardcoded-formatters.js";
import type { HardcodedFinding } from "../hardcoded/types.js";

const findings: readonly HardcodedFinding[] = [
  {
    file: "src/App.tsx",
    line: 3,
    column: 9,
    endLine: 3,
    endColumn: 20,
    text: "Hello world",
    kind: "jsx-text",
    language: "typescriptreact",
    confidence: 0.9,
  },
  {
    file: "src/App.tsx",
    line: 4,
    column: 20,
    endLine: 4,
    endColumn: 27,
    text: "Save",
    kind: "jsx-attribute",
    language: "typescriptreact",
    attribute: "label",
    confidence: 0.7,
  },
];

describe("formatHardcoded", () => {
  it("serialises findings as JSON", () => {
    const parsed = JSON.parse(formatHardcoded(findings, "json"));
    expect(parsed).toEqual(findings);
  });

  it("shows a success message when empty", () => {
    expect(formatHardcoded([], "pretty")).toContain("No hardcoded strings");
  });

  it("groups findings by file with locations in pretty mode", () => {
    const output = formatHardcoded(findings, "pretty");
    expect(output).toContain("src/App.tsx");
    expect(output).toContain("3:9");
    expect(output).toContain("Hello world");
    expect(output).toContain("jsx-attribute:label");
  });
});

describe("formatDoctor", () => {
  const missing = [{ adapter: "laravel", locale: "de", resource: "auth", key: "login" }];

  it("serialises both sections and a summary as JSON", () => {
    const parsed = JSON.parse(
      formatDoctor({ missing, hardcoded: findings, skipped: { missing: false, hardcoded: false } }, "json"),
    );
    expect(parsed.summary).toEqual({ missing: 1, hardcoded: 2 });
    expect(parsed.missing).toEqual(missing);
    expect(parsed.hardcoded).toHaveLength(2);
  });

  it("renders both sections in pretty mode", () => {
    const output = formatDoctor(
      { missing, hardcoded: findings, skipped: { missing: false, hardcoded: false } },
      "pretty",
    );
    expect(output).toContain("dialekt doctor");
    expect(output).toContain("Hardcoded strings");
    expect(output).toContain("Missing keys");
  });

  it("notes skipped sections", () => {
    const output = formatDoctor(
      { missing: [], hardcoded: [], skipped: { missing: true, hardcoded: true } },
      "pretty",
    );
    expect(output).toContain("Hardcoded-string scan skipped");
    expect(output).toContain("Missing-key check skipped");
    expect(output).toContain("No translation issues found");
  });
});
