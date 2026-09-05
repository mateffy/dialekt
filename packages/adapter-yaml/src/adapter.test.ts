import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import { NodePlatformLayer } from "dialekt";
import { yaml } from "./adapter.js";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("yaml adapter", () => {
  const testDir = join(tmpdir(), `yaml-adapter-test-${Date.now()}`);

  it("round-trips write and read", async () => {
    mkdirSync(testDir, { recursive: true });
    const adapter = yaml({ dir: testDir });
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
    writeFileSync(join(testDir, "en.yml"), "{}");
    writeFileSync(join(testDir, "de.yml"), "{}");
    const result = await Effect.runPromise(
      yaml({ dir: testDir }).listLocales().pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toContain("en");
    expect(result).toContain("de");
    rmSync(testDir, { recursive: true, force: true });
  });

  it("returns {} for missing locale", async () => {
    mkdirSync(testDir, { recursive: true });
    const result = await Effect.runPromise(
      yaml({ dir: testDir })
        .readResource("missing", { key: "messages", label: "messages" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toEqual({});
    rmSync(testDir, { recursive: true, force: true });
  });

  it("reads nested objects as flat keys", async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, "en.yml"), "button:\n  save: Save\n");
    const result = await Effect.runPromise(
      yaml({ dir: testDir })
        .readResource("en", { key: "messages", label: "messages" })
        .pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(result).toEqual({ "button.save": "Save" });
    rmSync(testDir, { recursive: true, force: true });
  });

  it("handles capabilities", () => {
    const adapter = yaml({ dir: testDir });
    expect(adapter.name).toBe("yaml");
    expect(adapter.capabilities.canCreateResource).toBe(true);
    expect(adapter.capabilities.unusedKeyDetection).toBe(false);
  });
});
