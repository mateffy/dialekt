import { describe, expect, it } from "vitest";
import { layers } from "./architecture";

describe("architecture rules", () => {
  it("layers is an array", () => {
    expect(Array.isArray(layers)).toBe(true);
  });
  it("layers contains at least one rule", () => {
    expect(layers.length).toBeGreaterThan(0);
  });
});
