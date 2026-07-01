import { describe, it, expect } from "vitest";
import { runRule } from "./_test-helper.js";
import { noPattern, select } from "gesetz";

const noAnyRule = select("packages/*/src/**/*.ts")
  .label("No any")
  .category("strictness")
  .check(noPattern(/: any\b/));

describe("test helper", () => {
  it("flags a file with : any", async () => {
    const violations = await runRule(noAnyRule, {
      "packages/dialekt/src/foo.ts": "const x: any = 1;",
    });
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0].message).toMatch(/any/i);
  });

  it("allows a clean file", async () => {
    const violations = await runRule(noAnyRule, {
      "packages/dialekt/src/foo.ts": "const x: string = 'hello';",
    });
    expect(violations).toHaveLength(0);
  });
});
