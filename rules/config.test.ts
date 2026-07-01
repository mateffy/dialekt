import { describe, expect, it } from "vitest";
import config from "../gesetz.config.js";

describe("gesetz config", () => {
  it("exports a valid resolved config", () => {
    expect(config).toBeDefined();
    expect(config.projectRoot).toBe(process.cwd());
    expect(Array.isArray(config.rules)).toBe(true);
    expect(config.rules.length).toBeGreaterThan(0);
  });

  it("has expected categories represented", () => {
    const categories = new Set(config.rules.map((r: any) => r.category).filter(Boolean));
    expect(categories.has("organization")).toBe(true);
    expect(categories.has("strictness")).toBe(true);
    expect(categories.has("structure")).toBe(true);
    expect(categories.has("cleanup")).toBe(true);
    expect(categories.has("security")).toBe(true);
  });

  it("includes architecture layer rules", () => {
    const hasArch = config.rules.some((r: any) => r.id === "architecture-layer-violations");
    expect(hasArch).toBe(true);
  });

  it("registers the TypeScript syntax backend", () => {
    expect(config.adapters.length).toBeGreaterThan(0);
    expect(config.adapters.some((a: any) => a.extensions.includes(".ts"))).toBe(true);
  });
});
