import { describe, expect, it } from "vitest";
import { renderPhpArray, renderPhpFile } from "./php-array-writer.js";

describe("renderPhpArray", () => {
  it("renders an empty array", () => {
    expect(renderPhpArray({})).toBe("[]");
  });

  it("renders flat key-value pairs", () => {
    const result = renderPhpArray({ hello: "Hello" });
    expect(result).toContain("'hello' => 'Hello'");
  });

  it("renders nested objects", () => {
    const result = renderPhpArray({ validation: { email: "Email address" } });
    expect(result).toContain("'validation' => [");
    expect(result).toContain("    'email' => 'Email address',");
  });

  it("escapes single quotes", () => {
    const result = renderPhpArray({ key: "it's" });
    expect(result).toContain("'it\\'s'");
  });

  it("escapes backslashes", () => {
    const result = renderPhpArray({ key: "a\\b" });
    expect(result).toContain("'a\\\\b'");
  });

  it("preserves unicode literally", () => {
    const result = renderPhpArray({ key: "Héllo 🌍 — 日本語" });
    expect(result).toContain("Héllo 🌍 — 日本語");
  });

  it("preserves empty string", () => {
    const result = renderPhpArray({ key: "" });
    expect(result).toContain("'key' => '',");
  });

  it("preserves double quotes without escaping", () => {
    const result = renderPhpArray({ key: 'He said "hi"' });
    expect(result).toContain('"hi"');
  });

  it("renders numeric keys without quotes", () => {
    const result = renderPhpArray({ 0: "first", 1: "second" });
    expect(result).toContain("0 => 'first'");
    expect(result).toContain("1 => 'second'");
  });
});

describe("renderPhpFile", () => {
  it("wraps in PHP tags", () => {
    const result = renderPhpFile({ hello: "World" });
    expect(result.startsWith("<?php\n\nreturn ")).toBe(true);
    expect(result.endsWith(";\n")).toBe(true);
  });
});
