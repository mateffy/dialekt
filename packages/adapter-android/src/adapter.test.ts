import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { NodePlatformLayer } from "dialekt";
import { android } from "./adapter.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("android adapter", () => {
  const testDir = join(tmpdir(), `android-adapter-test-${Date.now()}`);

  it("round-trips write and read", async () => {
    mkdirSync(testDir, { recursive: true });
    const adapter = android({ dir: testDir });
    await Effect.runPromise(
      adapter
        .writeResource("de", { key: "strings", label: "strings.xml" }, { hello: "Hallo" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    const result = await Effect.runPromise(
      adapter
        .readResource("de", { key: "strings", label: "strings.xml" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toEqual({ hello: "Hallo" });
    rmSync(testDir, { recursive: true, force: true });
  });

  it("lists locales from values-* directories", async () => {
    mkdirSync(testDir, { recursive: true });
    mkdirSync(join(testDir, "res", "values-en"), { recursive: true });
    mkdirSync(join(testDir, "res", "values-de"), { recursive: true });
    writeFileSync(join(testDir, "res", "values-en", "strings.xml"), "<resources/>");
    writeFileSync(join(testDir, "res", "values-de", "strings.xml"), "<resources/>");
    const result = await Effect.runPromise(
      android({ dir: testDir }).listLocales().pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toContain("en");
    expect(result).toContain("de");
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns {} for missing locale", async () => {
    mkdirSync(testDir, { recursive: true });
    const result = await Effect.runPromise(
      android({ dir: testDir })
        .readResource("missing", { key: "strings", label: "strings.xml" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toEqual({});
    rmSync(testDir, { recursive: true, force: true });
  });

  it("reads plural forms", async () => {
    mkdirSync(testDir, { recursive: true });
    const content = `<resources>
  <string name="hello">Hello</string>
  <plurals name="items">
    <item quantity="one">1 item</item>
    <item quantity="other">%d items</item>
  </plurals>
</resources>`;
    mkdirSync(join(testDir, "res", "values-de"), { recursive: true });
    writeFileSync(join(testDir, "res", "values-de", "strings.xml"), content);
    const result = await Effect.runPromise(
      android({ dir: testDir })
        .readResource("de", { key: "strings", label: "strings.xml" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result["hello"]).toBe("Hello");
    expect(result["items.one"]).toBe("1 item");
    expect(result["items.other"]).toBe("%d items");
    rmSync(testDir, { recursive: true, force: true });
  });

  it("handles capabilities", () => {
    const adapter = android({ dir: testDir });
    expect(adapter.name).toBe("android");
    expect(adapter.capabilities.canCreateResource).toBe(true);
    expect(adapter.capabilities.unusedKeyDetection).toBe(false);
  });
});
