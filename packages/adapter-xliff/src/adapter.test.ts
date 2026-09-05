import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { NodePlatformLayer } from "dialekt";
import { xliff } from "./adapter.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("xliff adapter", () => {
  const testDir = join(tmpdir(), `xliff-adapter-test-${Date.now()}`);

  it("round-trips write and read", async () => {
    mkdirSync(testDir, { recursive: true });
    const adapter = xliff({ dir: testDir });
    await Effect.runPromise(
      adapter
        .writeResource("de", { key: "messages", label: "messages" }, { hello: "Hallo" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    const result = await Effect.runPromise(
      adapter
        .readResource("de", { key: "messages", label: "messages" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toEqual({ hello: "Hallo" });
    rmSync(testDir, { recursive: true, force: true });
  });

  it("lists locales from target-language", async () => {
    mkdirSync(testDir, { recursive: true });
    const sample = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="de" datatype="plaintext">
    <body>
      <trans-unit id="hello"><source>Hello</source><target>Hallo</target></trans-unit>
    </body>
  </file>
</xliff>`;
    writeFileSync(join(testDir, "de.xlf"), sample);
    const result = await Effect.runPromise(
      xliff({ dir: testDir }).listLocales().pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toContain("de");
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns {} for missing locale", async () => {
    mkdirSync(testDir, { recursive: true });
    const result = await Effect.runPromise(
      xliff({ dir: testDir })
        .readResource("missing", { key: "messages", label: "messages" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toEqual({});
    rmSync(testDir, { recursive: true, force: true });
  });

  it("preserves source when reading untranslated entries", async () => {
    mkdirSync(testDir, { recursive: true });
    const sample = `<?xml version="1.0" encoding="UTF-8"?>
<xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2">
  <file source-language="en" target-language="de" datatype="plaintext">
    <body>
      <trans-unit id="hello"><source>Hello</source></trans-unit>
    </body>
  </file>
</xliff>`;
    writeFileSync(join(testDir, "de.xlf"), sample);
    const result = await Effect.runPromise(
      xliff({ dir: testDir })
        .readResource("de", { key: "messages", label: "messages" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toEqual({ hello: "Hello" });
    rmSync(testDir, { recursive: true, force: true });
  });

  it("handles capabilities", () => {
    const adapter = xliff({ dir: testDir });
    expect(adapter.name).toBe("xliff");
    expect(adapter.capabilities.canCreateResource).toBe(true);
    expect(adapter.capabilities.unusedKeyDetection).toBe(false);
  });
});
