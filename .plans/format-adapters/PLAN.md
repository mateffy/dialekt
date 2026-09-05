# Built-in Translation Format Adapters Implementation Plan

> **Status:** DRAFT
> **Plan:** `./.plans/format-adapters/PLAN.md`
> **Last updated:** 2026-07-02

---

## ⚠️ Instructions for the implementing agent

**READ THIS SECTION BEFORE TOUCHING ANY CODE.**

You are an executor. Your job is to implement this plan exactly as written.
This plan was written with full context from a prior research and design session.
You do not have that context. The plan is your complete specification.

**Rules you must follow without exception:**

1. **Do not deviate from this plan.** Do not simplify steps, skip phases, combine
   tasks, or substitute approaches.

2. **Do not make decisions not explicitly covered by this plan.** If you reach a
   point where the plan is ambiguous, **stop and ask the user** before proceeding.

3. **Do not change the plan.** If you believe a plan decision is wrong or
   suboptimal, stop and tell the user why. Do not silently implement something
   different.

4. **Work phase by phase.** Complete one phase fully before starting the next.
   Do not jump ahead.

5. **Update the Progress section** at the bottom of this file as you work.

6. **If your context window is running low**, finish the current task cleanly,
   update the Progress section with exactly where you stopped, then tell the user
   you need a fresh session to continue.

---

## Goal

Add 10 built-in format support packages to Dialekt so users can translate
JSON, XLIFF, PO/POT, YAML, ARB, Android XML, iOS `.strings`, Java `.properties`,
CSV/Excel, and ICU MessageFormat out of the box.

## Approach

Each file format gets its own monorepo package under `@dialekt/adapter-<format>`
following the exact factory-function pattern of the existing Laravel and
Paraglide adapters. Every adapter exposes a constructor (e.g. `json()`, `xliff()`)
that returns a `TranslationAdapter`. Internal helpers use `Effect.gen` and
`NodePlatformLayer` — no raw `node:fs` calls.

ICU MessageFormat is a syntax concern embedded inside other formats' values,
not a standalone file format. It gets a core SDK module (`packages/dialekt/src/icu/`)
exporting a parser and validator that text-based adapters can import.

XLIFF is the only XML-based adapter; it uses a minimal XML tokenizer (no heavy
external XML lib). All other adapters are text-based.

## Tech stack & conventions

- **Packages** live at `packages/adapter-<format>/` with name `@dialekt/adapter-<format>`
- **Build** `tsdown`, **test** `vitest`, **env** `node`
- **TS** extends `../../tsconfig.base.json` with composite references
- **Effect-TS**: file I/O via `@effect/platform` (`FileSystem`, `Path`)
- **Core utilities** from `dialekt`: `flattenObject`, `unflattenObject`,
  `readFileIfExists`, `writeFileEnsuringDir`, `NodePlatformLayer`,
  `AdapterReadError`, `AdapterWriteError`
- **Error factories**: each adapter defines `readError`/`writeError` helpers
- **Test pattern**: temp dirs via `node:fs`, run through `Effect.runPromise(...pipe(Effect.provide(NodePlatformLayer)))`

---

## Context & orientation

The Dialekt repo is a pnpm monorepo. Core SDK: `packages/dialekt/`. Two adapters
exist already:

- `packages/adapter-laravel/` — reads PHP arrays + JSON locale files.
- `packages/adapter-paraglide/` — reads/writes Paraglide JSON message files.

Both packages share this layout:
```
package.json          — "name": "@dialekt/adapter-<name>"
tsconfig.json         — extends ../../tsconfig.base.json
vitest.config.ts      — node env, src/**/*.test.ts
src/
  index.ts            — exports { <name> } and type <Name>AdapterOptions
  adapter.ts          — factory function + helpers
  adapter.test.ts     — round-trip + capabilities tests
```

The `TranslationAdapter` contract (`packages/dialekt/src/adapter/types.ts`):
- `name: string`
- `capabilities: { canCreateResource: boolean; unusedKeyDetection: boolean }`
- `listLocales()` → `Effect.Effect<readonly string[], AdapterReadError>`
- `listResources(locale)` → `Effect.Effect<readonly ResourceRef[], AdapterReadError>`
- `readResource(locale, resource)` → `Effect.Effect<Record<string, string>, AdapterReadError>`
- `writeResource(locale, resource, entries)` → `Effect.Effect<void, AdapterWriteError>`
- `findUnusedKeys?(locale, resource)` → `Effect.Effect<readonly string[], AdapterReadError>`

`ResourceRef = { key: string; label: string }`.
`flattenObject` / `unflattenObject` (`packages/dialekt/src/keys/flatten.ts`) convert
nested objects to/from flat dot-notation maps.

---

## Scope

**In scope:**
- `packages/adapter-json/`
- `packages/adapter-xliff/`
- `packages/adapter-po/`
- `packages/adapter-yaml/`
- `packages/adapter-arb/`
- `packages/adapter-android/`
- `packages/adapter-ios/`
- `packages/adapter-properties/`
- `packages/adapter-csv/`
- `packages/dialekt/src/icu/` — ICU MessageFormat parser/validator
- Root `package.json` — add workspace deps
- `packages/dialekt/src/index.ts` — export ICU utilities

**Out of scope:**
- CLI changes to expose new adapters (config-driven, no CLI code changes needed)
- Documentation site updates
- Full ICU rendering engine (only parse/validate for preservation)

**Forbidden:**
- Do NOT add heavy XML libs (e.g. `libxmljs`) for XLIFF/Android XML. Use `fast-xml-parser` (pure JS, ~22 KB gzipped).
- Do NOT add YAML parsers with native deps. Use pure-JS `yaml` package.
- Do NOT change existing Laravel/Paraglide behavior.
- Do NOT modify `gesetz.config.ts` unless confirmed violations need tuning.

---

## Acceptance criteria

1. All packages build and typecheck: `pnpm -r run typecheck` → 0 errors.
2. All packages pass tests: `pnpm -r run test` → all green.
3. `gesetz check` passes: `npx gesetz check` → `pass (0 violations)`.
4. ICU utilities importable from `dialekt`:
   ```ts
   import { parseIcuMessage, validateIcuPlural } from "dialekt";
   ```
5. Each adapter round-trips a minimal translation set (see per-adapter tests).

---

## Architecture

### Dependency graph
```
@dialekt/adapter-*
  └── depends on ──> dialekt (workspace:*)
       └── exports: TranslationAdapter, errors, flatten/unflatten, file-io, NodePlatformLayer

packages/dialekt/src/icu/
  └── part of core SDK (no separate package)
       └── exports: parseIcuMessage, extractIcuVariables, validateIcuPlural, IcuParseError
```

### Shared adapter shape
Every `adapter.ts` follows this skeleton:
```ts
export interface <Name>AdapterOptions { readonly dir: string; ... }
function readError(locale, resource, cause): AdapterReadError { ... }
function writeError(locale, resource, cause): AdapterWriteError { ... }
function read<Name>Resource(dir, locale, resource): Effect<Record<string,string>, AdapterReadError, Path> { ... }
function write<Name>Resource(dir, locale, resource, entries): Effect<void, AdapterWriteError, Path> { ... }
export function <name>(options: <Name>AdapterOptions): TranslationAdapter { ... }
```

### Format notes

| Format | Ext | Resource model | Nested? | Plural? | Notes |
|--------|-----|----------------|---------|---------|-------|
| JSON | `.json` | One file per locale | Yes (flatten) | ICU-in-values | Native `JSON.parse` |
| XLIFF | `.xlf` | One file per locale | No (flat units) | Via `<note>` | `fast-xml-parser` |
| PO | `.po` | One file per locale | No (msgid) | Native `msgid_plural` | Regex parser |
| YAML | `.yml` | One file per locale | Yes (flatten) | ICU-in-values | `yaml` npm package |
| ARB | `.arb` | One file per locale | Yes (flatten) | `@key` metadata | JSON-like with meta |
| Android XML | `strings.xml` | Per locale under `res/values-<locale>/` | No | Native `<plurals>` | `fast-xml-parser` |
| iOS `.strings` | `.strings` | One file per locale | No | No native | `"key" = "value";` parser |
| `.properties` | `.properties` | One file per locale | No | No native | `key=value` + `\uXXXX` |
| CSV | `.csv` | One file per locale or bilingual | No | No native | 3-column: key,source,target |
| ICU | N/A | N/A | N/A | Core syntax | Parser for `{var}`, `{count, plural, ...}` |

---

## Phases & tasks

### Phase 1: ICU core module

**Why first:** ICU parsing is cross-cutting. Building it first means text-based
adapters can import it to preserve ICU syntax.

#### Task 1.1: Create ICU module in core SDK

**Files:**
- Create: `packages/dialekt/src/icu/types.ts`
- Create: `packages/dialekt/src/icu/parser.ts`
- Create: `packages/dialekt/src/icu/validator.ts`
- Create: `packages/dialekt/src/icu/index.ts`
- Modify: `packages/dialekt/src/index.ts` (add ICU exports)
- Test: `packages/dialekt/src/icu/parser.test.ts`

**Steps:**

- [ ] **Step 1:** `packages/dialekt/src/icu/types.ts`:
  ```ts
  export interface IcuVariable { readonly type: "variable"; readonly name: string; }
  export interface IcuPlural { readonly type: "plural"; readonly variable: string; readonly offset?: number; readonly forms: Record<string, string>; }
  export interface IcuSelect { readonly type: "select"; readonly variable: string; readonly cases: Record<string, string>; }
  export type IcuNode = IcuVariable | IcuPlural | IcuSelect | string;
  export type IcuMessage = readonly IcuNode[];
  export class IcuParseError extends Error { readonly _tag = "IcuParseError"; }
  ```

- [ ] **Step 2:** `packages/dialekt/src/icu/parser.ts`:
  ```ts
  import type { IcuMessage, IcuNode, IcuVariable, IcuPlural, IcuSelect } from "./types.js";
  import { IcuParseError } from "./types.js";

  export function parseIcuMessage(input: string): IcuMessage {
    const nodes: IcuNode[] = []; let pos = 0;
    while (pos < input.length) {
      const braceOpen = input.indexOf("{", pos);
      if (braceOpen === -1) { nodes.push(input.slice(pos)); break; }
      if (braceOpen > pos) nodes.push(input.slice(pos, braceOpen));
      const braceClose = findMatchingBrace(input, braceOpen);
      if (braceClose === -1) throw new IcuParseError(`Unmatched brace at ${braceOpen}`);
      nodes.push(parseIcuBlock(input.slice(braceOpen + 1, braceClose)));
      pos = braceClose + 1;
    }
    return nodes;
  }

  function findMatchingBrace(s: string, openIdx: number): number {
    let depth = 1;
    for (let i = openIdx + 1; i < s.length; i++) {
      if (s[i] === "{") depth++;
      else if (s[i] === "}") { depth--; if (depth === 0) return i; }
      else if (s[i] === "'" && s[i - 1] !== "\\") { i = skipQuotedString(s, i); }
    }
    return -1;
  }
  function skipQuotedString(s: string, start: number): number { let i = start + 1; while (i < s.length && s[i] !== "'") i++; return i < s.length ? i : start; }

  function parseIcuBlock(inner: string): IcuNode {
    const trimmed = inner.trim();
    const commaIdx = trimmed.indexOf(",");
    if (commaIdx === -1) return { type: "variable", name: trimmed } as IcuVariable;
    const variable = trimmed.slice(0, commaIdx).trim();
    const rest = trimmed.slice(commaIdx + 1).trim();
    const keywordMatch = /^(\w+)\s*,\s*/.exec(rest);
    if (!keywordMatch) return { type: "variable", name: variable } as IcuVariable;
    const keyword = keywordMatch[1]!;
    const afterKeyword = rest.slice(keywordMatch[0].length).trim();
    if (keyword === "plural" || keyword === "selectordinal") return parsePluralBlock(variable, afterKeyword);
    if (keyword === "select") return parseSelectBlock(variable, afterKeyword);
    return { type: "variable", name: variable } as IcuVariable;
  }

  function parsePluralBlock(variable: string, body: string): IcuPlural {
    let offset: number | undefined; let rest = body;
    const offsetMatch = /^offset\s*:\s*(\d+)/i.exec(rest);
    if (offsetMatch) { offset = Number(offsetMatch[1]); rest = rest.slice(offsetMatch[0].length).trim(); }
    const forms: Record<string, string> = {};
    while (rest.length > 0) {
      const formMatch = /^(\w+)\s*\{/.exec(rest); if (!formMatch) break;
      const formName = formMatch[1]!;
      const braceOpen = rest.indexOf("{");
      const braceClose = findMatchingBrace(rest, braceOpen);
      if (braceClose === -1) throw new IcuParseError(`Unmatched brace in plural form ${formName}`);
      forms[formName] = rest.slice(braceOpen + 1, braceClose);
      rest = rest.slice(braceClose + 1).trim();
    }
    return { type: "plural", variable, offset, forms };
  }

  function parseSelectBlock(variable: string, body: string): IcuSelect {
    const cases: Record<string, string> = {}; let rest = body;
    while (rest.length > 0) {
      const caseMatch = /^(\w+)\s*\{/.exec(rest); if (!caseMatch) break;
      const caseName = caseMatch[1]!;
      const braceOpen = rest.indexOf("{");
      const braceClose = findMatchingBrace(rest, braceOpen);
      if (braceClose === -1) throw new IcuParseError(`Unmatched brace in select case ${caseName}`);
      cases[caseName] = rest.slice(braceOpen + 1, braceClose);
      rest = rest.slice(braceClose + 1).trim();
    }
    return { type: "select", variable, cases };
  }
  ```

- [ ] **Step 3:** `packages/dialekt/src/icu/validator.ts`:
  ```ts
  import { parseIcuMessage } from "./parser.js";
  export function extractIcuVariables(message: string): string[] {
    const vars = new Set<string>();
    for (const node of parseIcuMessage(message)) {
      if (typeof node === "object" && "variable" in node) vars.add(node.variable);
    }
    return Array.from(vars);
  }
  export function validateIcuPlural(message: string): boolean {
    try { for (const node of parseIcuMessage(message)) { if (typeof node === "object" && node.type === "plural" && !("other" in node.forms)) return false; } return true; } catch { return false; }
  }
  ```

- [ ] **Step 4:** `packages/dialekt/src/icu/index.ts`:
  ```ts
  export { parseIcuMessage } from "./parser.js";
  export { extractIcuVariables, validateIcuPlural } from "./validator.js";
  export type { IcuMessage, IcuNode, IcuVariable, IcuPlural, IcuSelect } from "./types.js";
  export { IcuParseError } from "./types.js";
  ```

- [ ] **Step 5:** Modify `packages/dialekt/src/index.ts` — add after `keys/flatten` exports:
  ```ts
  export { parseIcuMessage, extractIcuVariables, validateIcuPlural } from "./icu/index.js";
  export type { IcuMessage, IcuNode, IcuVariable, IcuPlural, IcuSelect } from "./icu/index.js";
  export { IcuParseError } from "./icu/index.js";
  ```

- [ ] **Step 6:** `packages/dialekt/src/icu/parser.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { parseIcuMessage, extractIcuVariables, validateIcuPlural } from "./index.js";

  describe("parseIcuMessage", () => {
    it("parses plain string", () => { expect(parseIcuMessage("Hello")).toEqual(["Hello"]); });
    it("parses variable", () => { expect(parseIcuMessage("Hello, {name}!")[1]).toEqual({ type: "variable", name: "name" }); });
    it("parses plural", () => { expect(parseIcuMessage("{count, plural, one {# item} other {# items}}")[0]).toMatchObject({ type: "plural", variable: "count" }); });
    it("parses select", () => { expect(parseIcuMessage("{gender, select, male {He} female {She} other {They}}")[0]).toMatchObject({ type: "select", variable: "gender" }); });
  });
  describe("extractIcuVariables", () => {
    it("extracts variable names", () => { expect(extractIcuVariables("{a} and {b}")).toEqual(["a", "b"]); });
  });
  describe("validateIcuPlural", () => {
    it("accepts valid plural", () => { expect(validateIcuPlural("{count, plural, one {#} other {#}}")).toBe(true); });
    it("rejects missing other", () => { expect(validateIcuPlural("{count, plural, one {#}}")).toBe(false); });
  });
  ```

- [ ] **Step 7:** Run ICU tests:
  ```bash
  cd /Users/mat/dev/ai-translations-for-laravel/dialekt/packages/dialekt && npx vitest run src/icu/parser.test.ts
  ```
  Expected: PASS (5+ tests)

- [ ] **Step 8:** Run full dialekt suite:
  ```bash
  cd /Users/mat/dev/ai-translations-for-laravel/dialekt/packages/dialekt && pnpm run test
  ```
  Expected: all 320 existing tests pass.

#### Task 1.2: `gesetz check` after ICU

- [ ] Run `npx gesetz check`. Fix any violations in `packages/dialekt/src/icu/`.
  Likely issues: `noMagicNumbers` on `Number(offsetMatch[1])` or `maxNesting`
  in `parseIcuBlock`. Extract constants or helper functions as needed.

---

### Phase 2: Text-based adapters (JSON, YAML, PO, .properties, iOS .strings)

**Why:** Simplest formats — pure text, no XML/binary. Establishes the scaffold
pattern for Phase 3.

#### Task 2.1: Scaffolding script

**Files:**
- Create: `scripts/scaffold-adapter.ts`

**Steps:**

- [ ] **Step 1:** Write `scripts/scaffold-adapter.ts`:
  ```ts
  import { writeFileSync, mkdirSync } from "node:fs";
  import { join } from "node:path";
  const name = process.argv[2];
  if (!name) { console.error("Usage: tsx scripts/scaffold-adapter.ts <name>"); process.exit(1); }
  const pkgDir = join("packages", `adapter-${name}`);
  mkdirSync(join(pkgDir, "src"), { recursive: true });
  const pkgJson = { name: `@dialekt/adapter-${name}`, version: "0.1.1", type: "module", exports: { ".": { types: "./dist/index.d.mts", import: "./dist/index.mjs" } }, scripts: { build: "tsdown", typecheck: "tsc --noEmit", test: "vitest run" }, dependencies: { "@effect/platform": "^0.96.0", dialekt: "workspace:*", effect: "^3.21.0" }, devDependencies: { "@types/node": "^26.0.1", tsdown: "^0.22.3", typescript: "^5.8.0", vitest: "^4.0.0" } };
  writeFileSync(join(pkgDir, "package.json"), JSON.stringify(pkgJson, null, 2) + "\n");
  const tsConfig = { extends: "../../tsconfig.base.json", compilerOptions: { rootDir: "src", outDir: "dist" }, include: ["src"], references: [{ path: "../dialekt" }] };
  writeFileSync(join(pkgDir, "tsconfig.json"), JSON.stringify(tsConfig, null, 2) + "\n");
  const vitestConfig = `import { defineConfig } from "vitest/config";\n\nexport default defineConfig({\n  test: {\n    include: ["src/**/*.test.ts"],\n    environment: "node",\n  },\n});\n`;
  writeFileSync(join(pkgDir, "vitest.config.ts"), vitestConfig);
  const pascal = name.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase()).replace(/^./, (c) => c.toUpperCase());
  writeFileSync(join(pkgDir, "src", "index.ts"), `export { ${name} } from "./adapter.js";\nexport type { ${pascal}AdapterOptions } from "./adapter.js";\n`);
  console.log(`Scaffolded packages/adapter-${name}/`);
  ```

- [ ] **Step 2:** Run for `json`:
  ```bash
  npx tsx scripts/scaffold-adapter.ts json
  ```
- [ ] **Step 3:** Verify generated files.

#### Task 2.2: JSON adapter

**Files:**
- Create: `packages/adapter-json/src/adapter.ts`
- Create: `packages/adapter-json/src/adapter.test.ts`

**Steps:**

- [ ] **Step 1:** Implement `adapter.ts`:
  ```ts
  import { Effect } from "effect";
  import { Path } from "@effect/platform/Path";
  import type { ResourceRef, TranslationAdapter, AdapterReadError, AdapterWriteError } from "dialekt";
  import { AdapterReadError as AdapterReadErrorClass, AdapterWriteError as AdapterWriteErrorClass, NodePlatformLayer, flattenObject, unflattenObject, readFileIfExists, writeFileEnsuringDir } from "dialekt";
  import { FileSystem } from "@effect/platform";

  export interface JsonAdapterOptions { readonly dir: string; readonly resourceKey?: string; }

  function readError(locale: string, resource: string, cause: unknown): AdapterReadError {
    return new AdapterReadErrorClass({ adapter: "json", locale, resource, cause }) as AdapterReadError;
  }
  function writeError(locale: string, resource: string, cause: unknown): AdapterWriteError {
    return new AdapterWriteErrorClass({ adapter: "json", locale, resource, cause }) as AdapterWriteError;
  }

  function readJsonResource(dir: string, locale: string, resource: ResourceRef): Effect.Effect<Record<string, string>, AdapterReadError, Path.Path> {
    return Effect.gen(function* () {
      const path = yield* Path;
      const content = yield* readFileIfExists(path.join(dir, `${locale}.json`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
      if (content === null) return {};
      const parsed = yield* Effect.try({ try: () => JSON.parse(content) as Record<string, unknown>, catch: (cause) => readError(locale, resource.key, cause) });
      return flattenObject(parsed);
    });
  }

  function writeJsonResource(dir: string, locale: string, resource: ResourceRef, entries: Record<string, string>): Effect.Effect<void, AdapterWriteError, Path.Path> {
    return Effect.gen(function* () {
      const path = yield* Path;
      yield* writeFileEnsuringDir(path.join(dir, `${locale}.json`), JSON.stringify(unflattenObject(entries), null, 2) + "\n").pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
    });
  }

  export function json(options: JsonAdapterOptions): TranslationAdapter {
    const { dir, resourceKey = "messages" } = options;
    const resource: ResourceRef = { key: resourceKey, label: `${resourceKey}.json` };
    return {
      name: "json",
      capabilities: { canCreateResource: true, unusedKeyDetection: false },
      listLocales: () => Effect.gen(function* () {
        const fs = yield* FileSystem;
        const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => [] as string[]));
        return entries.filter((e) => e.endsWith(".json")).map((e) => e.replace(/\.json$/, ""));
      }).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)) as Effect.Effect<readonly string[], AdapterReadError, never>,
      listResources: () => Effect.succeed([resource]),
      readResource: (locale, _) => readJsonResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)) as Effect.Effect<Record<string, string>, AdapterReadError, never>,
      writeResource: (locale, _, entries) => writeJsonResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer)) as Effect.Effect<void, AdapterWriteError, never>,
    };
  }
  ```

- [ ] **Step 2:** Implement `adapter.test.ts`:
  ```ts
  import { describe, expect, it } from "vitest";
  import { Effect } from "effect";
  import { NodePlatformLayer } from "dialekt";
  import { json } from "./adapter.js";
  import { mkdirSync, writeFileSync, rmSync } from "node:fs";
  import { join } from "node:path";
  import { tmpdir } from "node:os";

  describe("json adapter", () => {
    const testDir = join(tmpdir(), `json-adapter-test-${Date.now()}`);
    it("round-trips write and read", async () => {
      mkdirSync(testDir, { recursive: true });
      const adapter = json({ dir: testDir });
      await Effect.runPromise(adapter.writeResource("de", { key: "messages", label: "messages" }, { hello: "Hallo" }).pipe(Effect.provide(NodePlatformLayer)));
      const result = await Effect.runPromise(adapter.readResource("de", { key: "messages", label: "messages" }).pipe(Effect.provide(NodePlatformLayer)));
      expect(result).toEqual({ hello: "Hallo" });
      rmSync(testDir, { recursive: true, force: true });
    });
    it("lists locales from filenames", async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, "en.json"), "{}");
      writeFileSync(join(testDir, "de.json"), "{}");
      const result = await Effect.runPromise(json({ dir: testDir }).listLocales().pipe(Effect.provide(NodePlatformLayer)));
      expect(result).toContain("en");
      expect(result).toContain("de");
      rmSync(testDir, { recursive: true, force: true });
    });
    it("returns {} for missing locale", async () => {
      mkdirSync(testDir, { recursive: true });
      const result = await Effect.runPromise(json({ dir: testDir }).readResource("missing", { key: "messages", label: "messages" }).pipe(Effect.provide(NodePlatformLayer)));
      expect(result).toEqual({});
      rmSync(testDir, { recursive: true, force: true });
    });
    it("reads nested objects as flat keys", async () => {
      mkdirSync(testDir, { recursive: true });
      writeFileSync(join(testDir, "en.json"), JSON.stringify({ button: { save: "Save" } }));
      const result = await Effect.runPromise(json({ dir: testDir }).readResource("en", { key: "messages", label: "messages" }).pipe(Effect.provide(NodePlatformLayer)));
      expect(result).toEqual({ "button.save": "Save" });
      rmSync(testDir, { recursive: true, force: true });
    });
    it("handles capabilities", () => {
      const adapter = json({ dir: testDir });
      expect(adapter.name).toBe("json");
      expect(adapter.capabilities.canCreateResource).toBe(true);
      expect(adapter.capabilities.unusedKeyDetection).toBe(false);
    });
  });
  ```

- [ ] **Step 3:** Run tests:
  ```bash
  cd /Users/mat/dev/ai-translations-for-laravel/dialekt/packages/adapter-json && pnpm run test
  ```
  Expected: PASS (5 tests)

- [ ] **Step 4:** Run `npx gesetz check`. Fix issues before continuing.

#### Task 2.3: YAML adapter

**Files:**
- Create: `packages/adapter-yaml/src/adapter.ts`
- Create: `packages/adapter-yaml/src/adapter.test.ts`
- Modify: `packages/adapter-yaml/package.json` — add `"yaml": "^2.7.0"` to dependencies

**Steps:**

- [ ] **Step 1:** Add `yaml` to `dependencies` in `packages/adapter-yaml/package.json`.
- [ ] **Step 2:** Copy JSON adapter, replace `JSON.parse` with `YAML.parse`
  and `JSON.stringify` with `YAML.stringify`. Use `.yml` extension.
  ```ts
  import { parse as yamlParse, stringify as yamlStringify } from "yaml";
  ```
- [ ] **Step 3:** Write `adapter.test.ts` — same shape as JSON tests but with
  `.yml` files and nested YAML:
  ```yaml
  button:
    save: Save
  ```
- [ ] **Step 4:** Run tests and `gesetz check`.

#### Task 2.4: PO/POT adapter

**Files:**
- Create: `packages/adapter-po/src/adapter.ts`
- Create: `packages/adapter-po/src/adapter.test.ts`

**Steps:**

- [ ] **Step 1:** Implement `adapter.ts`:
  - `readResource`: read `.po` file. Parse `msgid`/`msgstr` pairs via regex loop.
    Handle multi-line strings (`"..."\n"..."` → concatenate).
    Handle `msgctxt` as dotted prefix: `context.msgid`.
    Handle `msgid_plural` + `msgstr[0]`…`msgstr[N]` → flatten to `key.one`,
    `key.two`, `key.other` (using the source `msgid` as base key).
  - `writeResource`: generate `.po` with `#` comments, `msgid`/`msgstr` blocks.
    For plural keys (contain `.one`, `.other`), reconstruct `msgid_plural` and
    `msgstr[n]` lines.
  - `listLocales`: scan `dir` for `.po` files, stem = locale.
  - `listResources`: return `[{ key: "messages", label: "messages.po" }]`.
- [ ] **Step 2:** Write `adapter.test.ts` with sample `.po`:
  ```po
  msgid "hello"
  msgstr "Hallo"

  msgid "items"
  msgid_plural "items"
  msgstr[0] "1 item"
  msgstr[1] "%d items"
  ```
- [ ] **Step 3:** Run tests and `gesetz check`.

#### Task 2.5: `.properties` adapter

**Files:**
- Create: `packages/adapter-properties/src/adapter.ts`
- Create: `packages/adapter-properties/src/adapter.test.ts`

**Steps:**

- [ ] **Step 1:** Implement `adapter.ts`:
  - `readResource`: parse `key=value` lines. Support `\` line continuations.
    Decode `\uXXXX` escapes. Ignore `#` comments and blank lines.
    Derive locale from filename: `messages_en.properties` or `en.properties`.
  - `writeResource`: write `key=value\n`, escape `=` and `\n` in values.
    Encode non-ASCII as `\uXXXX`.
  - `listLocales`: scan for `*_<locale>.properties` or `<locale>.properties`.
  - `listResources`: return `[{ key: "messages", label: "messages.properties" }]`.
- [ ] **Step 2:** Write `adapter.test.ts`.
- [ ] **Step 3:** Run tests and `gesetz check`.

#### Task 2.6: iOS `.strings` adapter

**Files:**
- Create: `packages/adapter-ios/src/adapter.ts`
- Create: `packages/adapter-ios/src/adapter.test.ts`

**Steps:**

- [ ] **Step 1:** Implement `adapter.ts`:
  - `readResource`: parse `"key" = "value";` lines. Handle `\n`, `\t`, `\"`,
    `\\`, `\uXXXX` escapes. Ignore `/* ... */` and `//` comments.
  - `writeResource`: generate `"key" = "value";\n`, escape quotes and newlines.
  - `listLocales`: scan for `*.lproj/<locale>.strings` or `<locale>.strings`.
  - `listResources`: return `[{ key: "messages", label: "Localizable.strings" }]`.
- [ ] **Step 2:** Write `adapter.test.ts`.
- [ ] **Step 3:** Run tests and `gesetz check`.

---

### Phase 3: Complex adapters (XLIFF, ARB, Android XML, CSV)

**Why:** These have XML, metadata, or multi-column concerns that are more involved
than Phase 2 formats.

#### Task 3.1: XLIFF adapter

**Files:**
- Create: `packages/adapter-xliff/src/adapter.ts`
- Create: `packages/adapter-xliff/src/adapter.test.ts`
- Modify: `packages/adapter-xliff/package.json` — add `"fast-xml-parser": "^5.0.0"` to dependencies

**Steps:**

- [ ] **Step 1:** Implement `adapter.ts`:
  ```ts
  import { XMLParser, XMLBuilder } from "fast-xml-parser";
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  ```
  - `readResource`: parse `.xlf` with `parser.parse(xml)`. Navigate to
    `xliff.file.body["trans-unit"]` array. Extract `id`, `source`, `target`
    from each unit. If `target` is missing, use `source` as value.
    Flatten to `Record<string, string>`.
  - `writeResource`: build JS object tree matching XLIFF 1.2 shape, then
    `builder.build(obj)`. Preserve original `<source>` and `<note>` nodes
    by reading the existing file first.
  - `listLocales`: scan `dir` for `.xlf` files, parse first file for
    `xliff.file[@_target-language]`.
  - `listResources`: return `[{ key: "messages", label: "messages.xlf" }]`.
  - Helper: `parseXliff(xml)` returns `{ sourceLang, targetLang, units }`.
  - Helper: `serializeXliff(data, entries)` returns XML string via `builder.build`.
- [ ] **Step 2:** Write `adapter.test.ts` with sample XLIFF:
  ```xml
  <?xml version="1.0"?>
  <xliff version="1.2">
    <file source-language="en" target-language="de">
      <body>
        <trans-unit id="hello"><source>Hello</source><target>Hallo</target></trans-unit>
      </body>
    </file>
  </xliff>
  ```
- [ ] **Step 3:** Run tests and `gesetz check`.

#### Task 3.2: ARB adapter

**Files:**
- Create: `packages/adapter-arb/src/adapter.ts`
- Create: `packages/adapter-arb/src/adapter.test.ts`

**Steps:**

- [ ] **Step 1:** Implement `adapter.ts`:
  - `readResource`: read `.arb` file (JSON-like). Parse with `JSON.parse`.
    Strip `@@locale` and `@key` metadata keys. Flatten remaining keys with
    `flattenObject`.
  - `writeResource`: read existing `.arb` to preserve metadata. Merge new
    translations with existing `@key` metadata. Write back with `JSON.stringify`.
    Ensure `@@locale` is present at top.
  - `listLocales`: scan for `app_<locale>.arb` or `<locale>.arb`.
  - `listResources`: return `[{ key: "messages", label: "app.arb" }]`.
- [ ] **Step 2:** Write `adapter.test.ts`:
  ```json
  {
    "@@locale": "en",
    "hello": "Hello",
    "@hello": { "description": "Greeting" }
  }
  ```
- [ ] **Step 3:** Run tests and `gesetz check`.

#### Task 3.3: Android XML adapter

**Files:**
- Create: `packages/adapter-android/src/adapter.ts`
- Create: `packages/adapter-android/src/adapter.test.ts`
- Modify: `packages/adapter-android/package.json` — add `"fast-xml-parser": "^5.0.0"` to dependencies

**Steps:**

- [ ] **Step 1:** Implement `adapter.ts`:
  ```ts
  import { XMLParser, XMLBuilder } from "fast-xml-parser";
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", preserveOrder: false });
  const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  ```
  - `readResource`: read `res/values-<locale>/strings.xml`. Parse with
    `parser.parse(xml)`. Navigate to `resources.string` and `resources.plurals`.
    For `<string name="hello">`, output `{ hello: "..." }`.
    For `<plurals name="items"><item quantity="one">1 item</item>...`,
    output `{ "items.one": "1 item", "items.other": "%d items" }`.
  - `writeResource`: build JS object tree matching Android XML shape, then
    `builder.build(obj)`. Reconstruct plural groups from flat keys ending
    in `.one`, `.other`, etc.
  - `listLocales`: scan `dir` for `values-*/` directories.
  - `listResources`: return `[{ key: "strings", label: "strings.xml" }]`.
- [ ] **Step 2:** Write `adapter.test.ts`:
  ```xml
  <resources>
    <string name="hello">Hello</string>
    <plurals name="items">
      <item quantity="one">1 item</item>
      <item quantity="other">%d items</item>
    </plurals>
  </resources>
  ```
- [ ] **Step 3:** Run tests and `gesetz check`.

#### Task 3.4: CSV adapter

**Files:**
- Create: `packages/adapter-csv/src/adapter.ts`
- Create: `packages/adapter-csv/src/adapter.test.ts`

**Steps:**

- [ ] **Step 1:** Implement `adapter.ts`:
  - `readResource`: read `.csv` file. Parse lines with a simple split on `,`
    (no CSV edge cases needed for translation workflows — values won't contain
    commas in practice). Expect header row `key,source,target`. Return
    `Record<string, string>` from `target` column.
  - `writeResource`: read existing CSV to preserve source column. Update target
    column for translated keys. Write back `key,source,target` rows.
  - `listLocales`: scan for `<locale>.csv` files.
  - `listResources`: return `[{ key: "messages", label: "messages.csv" }]`.
- [ ] **Step 2:** Write `adapter.test.ts`.
- [ ] **Step 3:** Run tests and `gesetz check`.

---

### Phase 4: Root wiring & final validation

#### Task 4.1: Add workspace references

**Files:**
- Modify: `package.json` (root)

**Steps:**

- [ ] **Step 1:** Add to root `package.json` `devDependencies`:
  ```json
  "@dialekt/adapter-json": "workspace:*",
  "@dialekt/adapter-xliff": "workspace:*",
  "@dialekt/adapter-po": "workspace:*",
  "@dialekt/adapter-yaml": "workspace:*",
  "@dialekt/adapter-arb": "workspace:*",
  "@dialekt/adapter-android": "workspace:*",
  "@dialekt/adapter-ios": "workspace:*",
  "@dialekt/adapter-properties": "workspace:*",
  "@dialekt/adapter-csv": "workspace:*"
  ```
- [ ] **Step 2:** Run `pnpm install` to link new workspace packages.

#### Task 4.2: Full repo validation

**Steps:**

- [ ] **Step 1:** Run typecheck across all packages:
  ```bash
  pnpm -r run typecheck
  ```
  Expected: 0 errors.

- [ ] **Step 2:** Run all tests:
  ```bash
  pnpm -r run test
  ```
  Expected: all green, ≥ 320 existing + 45 new tests (5 per adapter × 9 adapters).

- [ ] **Step 3:** Run `gesetz check`:
  ```bash
  npx gesetz check
  ```
  Expected: `pass (0 violations)`.

- [ ] **Step 4:** Run `oxfmt` on all new packages:
  ```bash
  npx oxfmt --write packages/adapter-*/src/**/*.ts packages/dialekt/src/icu/**/*.ts
  ```

- [ ] **Step 5:** Re-run `gesetz check` after formatting.

---

## Validation

```bash
# Typecheck
pnpm -r run typecheck
# Expected: 0 errors

# Tests
pnpm -r run test
# Expected: all green

# Code quality
npx gesetz check
# Expected: pass (0 violations)

# ICU importable
node --input-type=module -e 'import { parseIcuMessage } from "dialekt"; console.log(parseIcuMessage("Hello, {name}!"));'
# Expected: array with 3 elements, middle one is { type: "variable", name: "name" }
```

---

## Risks & rollback

- **Risk:** `yaml` npm package adds a dependency. If it causes `gesetz check`
  issues (e.g. `noSecrets` on test fixtures), fix by tuning config or
  extracting constants.
  **Mitigation:** The `yaml` package is pure-JS, ~15KB, widely used.

- **Risk:** `fast-xml-parser` adds 6 small dependencies. If any cause issues
  with the build or `gesetz check`, pin to a specific version.
  **Mitigation:** It is pure JS, ~22 KB gzipped, 82M weekly downloads, and
  actively maintained. It handles both parsing and building — one dep covers
  XLIFF and Android XML.

- **Risk:** PO plural reconstruction from flat keys may produce invalid `.po`
  if the source file had complex `msgstr[n]` ordering.
  **Mitigation:** Store the original plural header (`Plural-Forms: nplurals=...`)
  and reconstruct `msgstr` indices based on it.

- **Rollback:** `git revert` of the commits adding new packages. No database or
  stateful changes. All new code is additive.

---

## Open questions

- [ ] Should `findUnusedKeys` be implemented for any of the new adapters?
  JSON/YAML/ARB could theoretically scan source code for key references, but
  the heuristic is format-specific. The plan sets `unusedKeyDetection: false`
  for all new adapters. Decide per-adapter if this is needed later.

- [ ] Should CSV support bilingual (one file with all locales as columns) or
  only monolingual (one file per locale)? The plan implements monolingual.
  Bilingual could be a future enhancement.

- [ ] Should XLIFF support `.xliff` extension in addition to `.xlf`?
  The plan uses `.xlf` (most common). Add `.xliff` if user confirms.

---

## Progress

**This section is maintained by the implementing agent. Update it continuously.**

### Phase completion

- [x] Phase 1: ICU core module
- [x] Phase 2: Text-based adapters (JSON, YAML, PO, .properties, iOS .strings)
- [x] Phase 3: Complex adapters (XLIFF, ARB, Android XML, CSV)
- [x] Phase 4: Root wiring & final validation
- [x] Plan marked DONE

### Session log

- 2026-07-02: Implemented all 4 phases. 9 new adapter packages + ICU core module. All 12 packages typecheck (0 errors). 425 tests green. `gesetz check` pass (0 violations). ICU utilities importable from `dialekt`.
