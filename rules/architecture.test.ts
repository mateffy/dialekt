import { describe, expect, it } from "vitest";
import { runRule } from "./_test-helper.js";
import { layers } from "./architecture.js";

describe("architecture rules", () => {
  it("returns an array of rules", () => {
    expect(Array.isArray(layers)).toBe(true);
    expect(layers.length).toBeGreaterThan(0);
  });

  it.each(layers)("$id has metadata", (rule) => {
    expect(rule.id).toBeTruthy();
    expect(rule.description).toBeTruthy();
    expect(rule.run).toBeDefined();
  });

  it("prevents core from importing adapters", async () => {
    const rule = layers.find((r) => r.id === "architecture-layer-violations");
    expect(rule).toBeDefined();

    const violations = await runRule(rule!, {
      "packages/dialekt/src/foo.ts": "import { bar } from '../../adapter-laravel/src/bar';\nexport const foo = bar;",
      "packages/adapter-laravel/src/bar.ts": "export const bar = 1;",
    });

    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows adapters to import from core", async () => {
    const rule = layers.find((r) => r.id === "architecture-layer-violations");
    expect(rule).toBeDefined();

    const violations = await runRule(rule!, {
      "packages/adapter-laravel/src/bar.ts": "import { foo } from '../../dialekt/src/foo';\nexport const bar = foo;",
      "packages/dialekt/src/foo.ts": "export const foo = 1;",
    });

    expect(violations).toHaveLength(0);
  });
});
