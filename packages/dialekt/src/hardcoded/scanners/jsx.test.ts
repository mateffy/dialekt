import { describe, expect, it } from "vitest";
import { jsxScanner } from "./jsx.js";
import { resolveHardcodedOptions } from "../filter.js";
import type { HardcodedFinding, HardcodedLanguage } from "../types.js";

function scan(content: string, language: HardcodedLanguage = "typescriptreact"): readonly HardcodedFinding[] {
  return jsxScanner.scan({
    file: "src/App.tsx",
    language,
    content,
    options: resolveHardcodedOptions(undefined, language),
  });
}

function texts(findings: readonly HardcodedFinding[]): string[] {
  return findings.map((finding) => finding.text);
}

describe("jsxScanner", () => {
  it("finds raw JSX text nodes", () => {
    const findings = scan(`export function App() {\n  return <h1>Hello world</h1>;\n}\n`);
    expect(texts(findings)).toEqual(["Hello world"]);
    expect(findings[0]?.kind).toBe("jsx-text");
    expect(findings[0]?.line).toBe(2);
  });

  it("finds translatable attributes and skips technical ones", () => {
    const findings = scan(
      `<button type="button" label="Hello" onClick={() => alert("hi")}>Save changes</button>;`,
    );
    const attributes = findings.filter((finding) => finding.kind === "jsx-attribute");
    expect(attributes.map((finding) => [finding.attribute, finding.text])).toEqual([
      ["label", "Hello"],
    ]);
    expect(texts(findings)).toContain("Save changes");
  });

  it("reports placeholder and aria-label but not className", () => {
    const findings = scan(
      `<div className="card"><input placeholder="Enter name" aria-label="Your name" /></div>;`,
    );
    const attributes = findings.map((finding) => finding.attribute).filter(Boolean);
    expect(attributes).toContain("placeholder");
    expect(attributes).toContain("aria-label");
    expect(attributes).not.toContain("className");
  });

  it("skips translation components and code elements", () => {
    const findings = scan(
      `<div><Trans>Already translated</Trans><code>const x = 1</code><p>Real copy</p></div>;`,
    );
    expect(texts(findings)).toEqual(["Real copy"]);
  });

  it("returns an empty list for a non-JSX module", () => {
    const findings = scan(`export const answer = 42;\n`, "typescript");
    expect(findings).toEqual([]);
  });
});
