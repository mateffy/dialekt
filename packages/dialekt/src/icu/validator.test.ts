import { describe, expect, it } from "vitest";
import { extractIcuVariables, validateIcuPlural } from "./validator.js";

describe("extractIcuVariables", () => {
  it("extracts variable names", () => {
    expect(extractIcuVariables("{a} and {b}")).toEqual(["a", "b"]);
  });

  it("extracts plural variables", () => {
    expect(extractIcuVariables("{count, plural, one {#} other {#}}")).toEqual(["count"]);
  });

  it("extracts select variables", () => {
    expect(extractIcuVariables("{gender, select, male {He} other {They}}")).toEqual(["gender"]);
  });
});

describe("validateIcuPlural", () => {
  it("accepts valid plural", () => {
    expect(validateIcuPlural("{count, plural, one {#} other {#}}")).toBe(true);
  });

  it("rejects missing other", () => {
    expect(validateIcuPlural("{count, plural, one {#}}")).toBe(false);
  });

  it("rejects invalid syntax", () => {
    expect(validateIcuPlural("{count, plural, one")).toBe(false);
  });
});
