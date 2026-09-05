import { describe, expect, it } from "vitest";
import { parseIcuMessage, extractIcuVariables, validateIcuPlural } from "./index.js";

describe("parseIcuMessage", () => {
  it("parses plain string", () => {
    expect(parseIcuMessage("Hello")).toEqual(["Hello"]);
  });

  it("parses variable", () => {
    const result = parseIcuMessage("Hello, {name}!");
    expect(result[1]).toEqual({ type: "variable", name: "name" });
  });

  it("parses plural", () => {
    const result = parseIcuMessage("{count, plural, one {# item} other {# items}}");
    expect(result[0]).toMatchObject({ type: "plural", variable: "count" });
  });

  it("parses select", () => {
    const result = parseIcuMessage("{gender, select, male {He} female {She} other {They}}");
    expect(result[0]).toMatchObject({ type: "select", variable: "gender" });
  });
});

describe("extractIcuVariables", () => {
  it("extracts variable names", () => {
    expect(extractIcuVariables("{a} and {b}")).toEqual(["a", "b"]);
  });
});

describe("validateIcuPlural", () => {
  it("accepts valid plural", () => {
    expect(validateIcuPlural("{count, plural, one {#} other {#}}")).toBe(true);
  });

  it("rejects missing other", () => {
    expect(validateIcuPlural("{count, plural, one {#}}")).toBe(false);
  });
});
