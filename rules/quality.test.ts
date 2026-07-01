import { describe, expect, it } from "vitest";
import { runRule } from "./_test-helper.js";
import * as quality from "./quality.js";

// ───────────────────────────────────────────────
// Metadata
// ───────────────────────────────────────────────

const rules = Object.entries(quality).filter(([_, r]) => "id" in (r as object));

describe("rule metadata", () => {
  it.each(rules)("%s has a stable id, description and category", (_name, rule) => {
    expect((rule as any).id).toBeTruthy();
    expect((rule as any).description).toBeTruthy();
    expect((rule as any).category).toBeTruthy();
  });
});

// ───────────────────────────────────────────────
// Organization
// ───────────────────────────────────────────────

describe("everyFileNeedsTest", () => {
  it("flags a source file without a sibling test", async () => {
    const violations = await runRule(quality.everyFileNeedsTest, {
      "packages/dialekt/src/foo.ts": "export const foo = 1;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows a source file with a sibling test", async () => {
    const violations = await runRule(quality.everyFileNeedsTest, {
      "packages/dialekt/src/foo.ts": "export const foo = 1;",
      "packages/dialekt/src/foo.test.ts": "import { test } from 'vitest';",
    });
    expect(violations).toHaveLength(0);
  });

  it("ignores excluded patterns", async () => {
    const violations = await runRule(quality.everyFileNeedsTest, {
      "packages/dialekt/src/index.ts": "export * from './foo';",
      "packages/dialekt/src/cli/main.ts": "console.log('entry');",
      "packages/dialekt/src/foo.config.ts": "export const c = 1;",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noDefaultExports", () => {
  it("flags export default", async () => {
    const violations = await runRule(quality.noDefaultExports, {
      "packages/dialekt/src/bad.ts": "export default function foo() {}",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows named exports", async () => {
    const violations = await runRule(quality.noDefaultExports, {
      "packages/dialekt/src/good.ts": "export function foo() {}",
    });
    expect(violations).toHaveLength(0);
  });

  it("ignores config files", async () => {
    const violations = await runRule(quality.noDefaultExports, {
      "packages/dialekt/src/vitest.config.ts": "export default defineConfig({});",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noBarrelFiles", () => {
  it("flags an index.ts with many re-exports", async () => {
    const content = Array.from({ length: 6 }, (_, i) => `export * from './mod${i}';`).join("\n");
    const violations = await runRule(quality.noBarrelFiles, {
      "packages/other/src/index.ts": content,
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows an index.ts with few re-exports", async () => {
    const violations = await runRule(quality.noBarrelFiles, {
      "packages/other/src/index.ts": "export * from './foo';\nexport * from './bar';",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("requireVitestImport", () => {
  it("flags a test file without vitest import", async () => {
    const violations = await runRule(quality.requireVitestImport, {
      "packages/dialekt/src/foo.test.ts": "const x = 1;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows a test file importing vitest", async () => {
    const violations = await runRule(quality.requireVitestImport, {
      "packages/dialekt/src/foo.test.ts": "import { describe, it, expect } from 'vitest';",
    });
    expect(violations).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────
// Strictness
// ───────────────────────────────────────────────

describe("noAny", () => {
  it("flags explicit any", async () => {
    const violations = await runRule(quality.noAny, {
      "packages/dialekt/src/bad.ts": "const x: any = 1;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows strict types", async () => {
    const violations = await runRule(quality.noAny, {
      "packages/dialekt/src/good.ts": "const x: string = 'hello';",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noAsUnknownAs", () => {
  it("flags double cast", async () => {
    const violations = await runRule(quality.noAsUnknownAs, {
      "packages/dialekt/src/bad.ts": "const x = {} as unknown as string;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows safe casting", async () => {
    const violations = await runRule(quality.noAsUnknownAs, {
      "packages/dialekt/src/good.ts": "const x = 'hello' as string;",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noEmptyCatches", () => {
  it("flags empty catch", async () => {
    const violations = await runRule(quality.noEmptyCatches, {
      "packages/dialekt/src/bad.ts": "try { foo(); } catch { }",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows handled catch", async () => {
    const violations = await runRule(quality.noEmptyCatches, {
      "packages/dialekt/src/good.ts": "try { foo(); } catch (e) {\n  return e;\n}",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noEnums", () => {
  it("flags enum declaration", async () => {
    const violations = await runRule(quality.noEnums, {
      "packages/dialekt/src/bad.ts": "enum Status { Active, Inactive }",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows union types", async () => {
    const violations = await runRule(quality.noEnums, {
      "packages/dialekt/src/good.ts": "type Status = 'active' | 'inactive';",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noNonNullAssertions", () => {
  it("flags non-null assertion", async () => {
    const violations = await runRule(quality.noNonNullAssertions, {
      "packages/dialekt/src/bad.ts": "const name = user!.name;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows optional chaining", async () => {
    const violations = await runRule(quality.noNonNullAssertions, {
      "packages/dialekt/src/good.ts": "const name = user?.name;",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noTsSuppress", () => {
  it("flags @ts-ignore without ticket", async () => {
    const violations = await runRule(quality.noTsSuppress, {
      "packages/dialekt/src/bad.ts": "// @ts-ignore\nconst x = bad;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("flags @ts-expect-error without ticket", async () => {
    const violations = await runRule(quality.noTsSuppress, {
      "packages/dialekt/src/bad.ts": "// @ts-expect-error\nconst x = bad;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows @ts-expect-error with Ticket justification", async () => {
    const violations = await runRule(quality.noTsSuppress, {
      "packages/dialekt/src/good.ts": "// @ts-expect-error — upstream bug; Ticket: https://github.com/x/y/issues/1\nconst x = bad;",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noMutableExports", () => {
  it("flags export let", async () => {
    const violations = await runRule(quality.noMutableExports, {
      "packages/dialekt/src/bad.ts": "export let count = 0;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("flags export var", async () => {
    const violations = await runRule(quality.noMutableExports, {
      "packages/dialekt/src/bad.ts": "export var count = 0;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows export const", async () => {
    const violations = await runRule(quality.noMutableExports, {
      "packages/dialekt/src/good.ts": "export const count = 0;",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("requireExplicitReturn", () => {
  it("flags function without return type", async () => {
    const violations = await runRule(quality.requireExplicitReturn, {
      "packages/dialekt/src/bad.ts": "export function foo(x: number) { return x + 1; }",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows function with return type", async () => {
    const violations = await runRule(quality.requireExplicitReturn, {
      "packages/dialekt/src/good.ts": "export function foo(x: number): number { return x + 1; }",
    });
    expect(violations).toHaveLength(0);
  });

  it("ignores test helpers", async () => {
    const violations = await runRule(quality.requireExplicitReturn, {
      "packages/dialekt/src/foo.test.ts": "function setup() { return 1; }",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noThrowInGen", () => {
  it("flags throw inside Effect.gen", async () => {
    const violations = await runRule(quality.noThrowInGen, {
      "packages/dialekt/src/bad.ts": `import { Effect } from "effect";\nconst p = Effect.gen(function* () { throw new Error("bad"); });`,
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows Effect.fail inside gen", async () => {
    const violations = await runRule(quality.noThrowInGen, {
      "packages/dialekt/src/good.ts": `import { Effect } from "effect";\nconst p = Effect.gen(function* () { yield* Effect.fail(new Error("bad")); });`,
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noYieldWithoutStar", () => {
  it("flags plain yield in Effect.gen", async () => {
    const violations = await runRule(quality.noYieldWithoutStar, {
      "packages/dialekt/src/bad.ts": `import { Effect } from "effect";\nconst p = Effect.gen(function* () { const x = yield Effect.succeed(1); });`,
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows yield* in gen", async () => {
    const violations = await runRule(quality.noYieldWithoutStar, {
      "packages/dialekt/src/good.ts": `import { Effect } from "effect";\nconst p = Effect.gen(function* () { const x = yield* Effect.succeed(1); });`,
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noUnboundedEffectAll", () => {
  it("flags Effect.all without concurrency", async () => {
    const violations = await runRule(quality.noUnboundedEffectAll, {
      "packages/dialekt/src/bad.ts": `import { Effect } from "effect";\nconst p = Effect.all([Effect.succeed(1), Effect.succeed(2)]);`,
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows Effect.all with concurrency", async () => {
    const violations = await runRule(quality.noUnboundedEffectAll, {
      "packages/dialekt/src/good.ts": `import { Effect } from "effect";\nconst p = Effect.all([Effect.succeed(1)], { concurrency: 5 });`,
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noPromiseAll", () => {
  it("flags Promise.all", async () => {
    const violations = await runRule(quality.noPromiseAll, {
      "packages/dialekt/src/bad.ts": "const p = Promise.all([fetch('/a'), fetch('/b')]);",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows Effect.all", async () => {
    const violations = await runRule(quality.noPromiseAll, {
      "packages/dialekt/src/good.ts": `import { Effect } from "effect";\nconst p = Effect.all([]);`,
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noAsyncInEffectSource", () => {
  it("flags async function in source", async () => {
    const violations = await runRule(quality.noAsyncInEffectSource, {
      "packages/dialekt/src/bad.ts": "async function helper() { return 1; }",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows regular functions", async () => {
    const violations = await runRule(quality.noAsyncInEffectSource, {
      "packages/dialekt/src/good.ts": "function helper(): number { return 1; }",
    });
    expect(violations).toHaveLength(0);
  });

  it("ignores config files", async () => {
    const violations = await runRule(quality.noAsyncInEffectSource, {
      "packages/dialekt/src/vite.config.ts": "export default async function () {}",
    });
    expect(violations).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────
// Structure
// ───────────────────────────────────────────────

describe("noGiantFiles", () => {
  it("flags a file over 400 lines", async () => {
    const lines = Array.from({ length: 405 }, (_, i) => `const line${i} = ${i};`).join("\n");
    const violations = await runRule(quality.noGiantFiles, {
      "packages/dialekt/src/big.ts": lines,
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows a small file", async () => {
    const violations = await runRule(quality.noGiantFiles, {
      "packages/dialekt/src/small.ts": "export const a = 1;",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noMagicNumbers", () => {
  it("flags unexplained literal", async () => {
    const violations = await runRule(quality.noMagicNumbers, {
      "packages/dialekt/src/bad.ts": "const delay = 750;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows whitelisted numbers", async () => {
    const violations = await runRule(quality.noMagicNumbers, {
      "packages/dialekt/src/good.ts": "const zero = 0; const one = 1;",
    });
    expect(violations).toHaveLength(0);
  });

  it("allows numbers in const declarations", async () => {
    const violations = await runRule(quality.noMagicNumbers, {
      "packages/dialekt/src/good.ts": "const MAX_RETRY = 750;",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("maxNesting", () => {
  it("flags deeply nested code", async () => {
    const code = [
      "if (a) {",
      "  if (b) {",
      "    if (c) {",
      "      if (d) {",
      "        if (e) {",
      "          if (f) {",
      "            if (g) {",
      "              console.log(1);",
      "            }",
      "          }",
      "        }",
      "      }",
      "    }",
      "  }",
      "}",
    ].join("\n");
    const violations = await runRule(quality.maxNesting, {
      "packages/dialekt/src/bad.ts": code,
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows shallow nesting", async () => {
    const code = [
      "if (a) {",
      "  if (b) {",
      "    console.log(1);",
      "  }",
      "}",
    ].join("\n");
    const violations = await runRule(quality.maxNesting, {
      "packages/dialekt/src/good.ts": code,
    });
    expect(violations).toHaveLength(0);
  });
});

describe("minTestQuality", () => {
  it("flags a low-quality test file", async () => {
    const violations = await runRule(quality.minTestQuality, {
      "packages/dialekt/src/foo.test.ts": `import { test, expect } from "vitest";\ntest("x", () => { expect(true).toBeDefined(); });`,
    });
    // Very low score should definitely fail (trivial assertion penalty)
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows a rich test file", async () => {
    const content = [
      `import { describe, test, expect } from "vitest";`,
      `describe("suite", () => {`,
      `  test("happy", () => { expect(1 + 1).toBe(2); });`,
      `  test("unhappy", () => { expect(() => { throw new Error(); }).toThrow(); });`,
      `  test("async", async () => { expect(await Promise.resolve(1)).toBe(1); });`,
      `  test("mixed", () => {`,
      `    expect(1).toBe(1);`,
      `    expect("a").toBe("a");`,
      `    expect([]).toHaveLength(0);`,
      `  });`,
      `});`,
    ].join("\n");
    const violations = await runRule(quality.minTestQuality, {
      "packages/dialekt/src/foo.test.ts": content,
    });
    expect(violations).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────
// Cleanup
// ───────────────────────────────────────────────

describe("noConsole", () => {
  it("flags console.log", async () => {
    const violations = await runRule(quality.noConsole, {
      "packages/dialekt/src/bad.ts": "console.log('hello');",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows console.warn and console.error", async () => {
    const violations = await runRule(quality.noConsole, {
      "packages/dialekt/src/good.ts": "console.warn('warn'); console.error('err');",
    });
    expect(violations).toHaveLength(0);
  });

  it("ignores CLI files", async () => {
    const violations = await runRule(quality.noConsole, {
      "packages/dialekt/src/cli/run.ts": "console.log('hello');",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noTrivialComments", () => {
  it("flags AI narration comment", async () => {
    const violations = await runRule(quality.noTrivialComments, {
      "packages/dialekt/src/bad.ts": "// Import React\nimport React from 'react';",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows meaningful comments", async () => {
    const violations = await runRule(quality.noTrivialComments, {
      "packages/dialekt/src/good.ts": "// We retry 3 times because the API is flaky.\nconst retries = 3;",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noDebugFiles", () => {
  it("flags residue file names", async () => {
    const violations = await runRule(quality.noDebugFiles, {
      "packages/dialekt/src/foo_backup.ts": "export const a = 1;",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows clean file names", async () => {
    const violations = await runRule(quality.noDebugFiles, {
      "packages/dialekt/src/foo.ts": "export const a = 1;",
    });
    expect(violations).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────
// Security
// ───────────────────────────────────────────────

describe("noSecrets", () => {
  it("flags hardcoded api key", async () => {
    const violations = await runRule(quality.noSecrets, {
      "packages/dialekt/src/bad.ts": 'const api_key = "sk-1234567890abcdef";',
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows safe placeholder", async () => {
    const violations = await runRule(quality.noSecrets, {
      "packages/dialekt/src/good.ts": 'const api_key = process.env.API_KEY;',
    });
    expect(violations).toHaveLength(0);
  });
});

// ───────────────────────────────────────────────
// Effect-TS / Platform
// ───────────────────────────────────────────────

describe("noRawNodeIO", () => {
  it("flags node:fs import", async () => {
    const violations = await runRule(quality.noRawNodeIO, {
      "packages/dialekt/src/bad.ts": "import { readFileSync } from 'node:fs';",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows @effect/platform imports", async () => {
    const violations = await runRule(quality.noRawNodeIO, {
      "packages/dialekt/src/good.ts": "import { FileSystem } from '@effect/platform';",
    });
    expect(violations).toHaveLength(0);
  });

  it("ignores designated wiring files", async () => {
    const violations = await runRule(quality.noRawNodeIO, {
      "packages/dialekt/src/sdk/node-layer.ts": "import { readFileSync } from 'node:fs';",
    });
    expect(violations).toHaveLength(0);
  });
});

describe("noRunPromiseOutsideEntryPoints", () => {
  it("flags Effect.runPromise in a helper", async () => {
    const violations = await runRule(quality.noRunPromiseOutsideEntryPoints, {
      "packages/dialekt/src/bad.ts": "const x = await Effect.runPromise(Effect.succeed(1));",
    });
    expect(violations.length).toBeGreaterThan(0);
  });

  it("allows Effect.runPromise at entry point", async () => {
    const violations = await runRule(quality.noRunPromiseOutsideEntryPoints, {
      "packages/dialekt/src/cli/main.ts": "await Effect.runPromise(program);",
    });
    expect(violations).toHaveLength(0);
  });
});
