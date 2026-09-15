import { describe, expect, it } from "vitest";
import { bladeScanner } from "./blade.js";
import { resolveHardcodedOptions } from "../filter.js";
import type { HardcodedFinding } from "../types.js";

function scan(content: string): readonly HardcodedFinding[] {
  return bladeScanner.scan({
    file: "resources/views/welcome.blade.php",
    language: "blade",
    content,
    options: resolveHardcodedOptions(undefined, "blade"),
  });
}

function texts(findings: readonly HardcodedFinding[]): string[] {
  return findings.map((finding) => finding.text);
}

describe("bladeScanner", () => {
  it("finds raw text between tags", () => {
    const findings = scan(`<div><h1>Hello world</h1><p>Learn more</p></div>`);
    expect(texts(findings)).toEqual(["Hello world", "Learn more"]);
    expect(findings[0]?.kind).toBe("html-text");
  });

  it("ignores Blade directives and translated expressions", () => {
    const findings = scan(
      `@if ($user)<p>Welcome back</p>@endif{{ __("Already translated") }}@lang("Nope")`,
    );
    expect(texts(findings)).toEqual(["Welcome back"]);
  });

  it("keeps translatable attributes and drops technical ones", () => {
    const findings = scan(
      `<input type="text" wire:model="name" placeholder="Enter your name" title="About us" />`,
    );
    const attributes = findings.map((finding) => [finding.attribute, finding.text]);
    expect(attributes).toContainEqual(["placeholder", "Enter your name"]);
    expect(attributes).toContainEqual(["title", "About us"]);
    expect(attributes.some(([attribute]) => attribute === "type")).toBe(false);
    expect(attributes.some(([attribute]) => attribute === "wire:model")).toBe(false);
  });

  it("recovers copy from text mixed with expressions", () => {
    const findings = scan(`<p>Hello {{ $name }}, you have {{ $count }} messages</p>`);
    expect(texts(findings)).toEqual(["Hello , you have messages"]);
  });

  it("returns nothing for a template that is fully translated", () => {
    const findings = scan(`<h1>{{ __('Welcome') }}</h1><p>@lang('Dashboard')</p>`);
    expect(findings).toEqual([]);
  });
});
