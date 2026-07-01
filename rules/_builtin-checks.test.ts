import { describe, it, expect } from "vitest";
import { runRule } from "./_test-helper.js";
import { noTypedAny, noDefaultExport, noAsUnknownAs } from "@gesetz/typescript";
import { select } from "gesetz";

describe("built-in check integration", () => {
  it("noTypedAny flags explicit any", async () => {
    const rule = select("packages/*/src/**/*.ts")
      .check(noTypedAny());
    const violations = await runRule(rule, {
      "packages/dialekt/src/bad.ts": "const x: any = 1;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("noDefaultExport flags export default", async () => {
    const rule = select("packages/*/src/**/*.ts")
      .check(noDefaultExport());
    const violations = await runRule(rule, {
      "packages/dialekt/src/bad.ts": "export default function foo() {}",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("noAsUnknownAs flags double cast", async () => {
    const rule = select("packages/*/src/**/*.ts")
      .check(noAsUnknownAs());
    const violations = await runRule(rule, {
      "packages/dialekt/src/bad.ts": "const x = {} as unknown as string;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });
});
