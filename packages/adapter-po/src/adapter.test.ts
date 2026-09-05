import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { NodePlatformLayer } from "dialekt";
import { po } from "./adapter.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("po adapter", () => {
  const testDir = join(tmpdir(), `po-adapter-test-${Date.now()}`);

  it("round-trips write and read", async () => {
    mkdirSync(testDir, { recursive: true });
    const adapter = po({ dir: testDir });
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

  it("lists locales from filenames", async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, "en.po"), "");
    writeFileSync(join(testDir, "de.po"), "");
    const result = await Effect.runPromise(
      po({ dir: testDir }).listLocales().pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toContain("en");
    expect(result).toContain("de");
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns {} for missing locale", async () => {
    mkdirSync(testDir, { recursive: true });
    const result = await Effect.runPromise(
      po({ dir: testDir })
        .readResource("missing", { key: "messages", label: "messages" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toEqual({});
    rmSync(testDir, { recursive: true, force: true });
  });

  it("reads plural forms", async () => {
    mkdirSync(testDir, { recursive: true });
    const content = `msgid "items"
msgid_plural "items"
msgstr[0] "1 item"
msgstr[1] "%d items"
`;
    writeFileSync(join(testDir, "de.po"), content);
    const result = await Effect.runPromise(
      po({ dir: testDir })
        .readResource("de", { key: "messages", label: "messages" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result["items.one"]).toBe("1 item");
    expect(result["items.other"]).toBe("%d items");
    rmSync(testDir, { recursive: true, force: true });
  });

  it("handles capabilities", () => {
    const adapter = po({ dir: testDir });
    expect(adapter.name).toBe("po");
    expect(adapter.capabilities.canCreateResource).toBe(true);
    expect(adapter.capabilities.unusedKeyDetection).toBe(false);
  });
});
