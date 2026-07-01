import { describe, expect, it } from "vitest";
import { chunkKeys } from "./chunking.js";

describe("chunkKeys", () => {
  it("keeps a small key set in a single chunk", () => {
    const source = { a: "A", b: "B" };
    const target = {};
    const chunks = chunkKeys(["a", "b"], source, target, { maxTokens: 3000, charsPerToken: 3.0 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(["a", "b"]);
  });

  it("splits a large key set into multiple chunks", () => {
    const source: Record<string, string> = {};
    for (let i = 0; i < 150; i++) {
      source[`key_${i}`] = `This is the value number ${i} with some extra text to make it longer`;
    }
    const target = {};
    const keys = Object.keys(source);
    const chunks = chunkKeys(keys, source, target, { maxTokens: 3000, charsPerToken: 3.0 });
    expect(chunks.length).toBeGreaterThan(1);
    const allKeys = chunks.flat();
    expect(allKeys).toHaveLength(keys.length);
    expect(new Set(allKeys).size).toBe(keys.length);
  });

  it("preserves all keys across chunks without loss or duplication", () => {
    const source: Record<string, string> = {};
    for (let i = 0; i < 60; i++) {
      source[`k${i}`] = "word ".repeat(10);
    }
    const target = {};
    const keys = Object.keys(source);
    const chunks = chunkKeys(keys, source, target, { maxTokens: 3000, charsPerToken: 3.0 });
    const flattened = chunks.flat();
    expect(flattened.sort()).toEqual([...keys].sort());
  });

  it("keeps a single oversized key in its own chunk", () => {
    const source = { long: "x".repeat(5000) };
    const target = {};
    const chunks = chunkKeys(["long"], source, target, { maxTokens: 3000, charsPerToken: 3.0 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(["long"]);
  });

  it("reduces effective chunk size when file context is huge", () => {
    const source: Record<string, string> = {};
    for (let i = 0; i < 26; i++) {
      source[String.fromCharCode(97 + i)] = "word ".repeat(50);
    }
    const target = {};
    const keys = Object.keys(source).slice(0, 10);
    const chunks = chunkKeys(keys, source, target, { maxTokens: 3000, charsPerToken: 3.0 });
    expect(chunks.length).toBeGreaterThan(0);
  });

  it("falls back to one key per chunk when the context exceeds the limit", () => {
    const source: Record<string, string> = {};
    for (let i = 0; i < 100; i++) {
      source[`key_${i}`] = "word ".repeat(100);
    }
    const target = { ...source };
    const chunks = chunkKeys(["key_0", "key_1"], source, target, {
      maxTokens: 10,
      charsPerToken: 3.0,
    });
    expect(chunks[0]).toEqual(["key_0"]);
    expect(chunks[1]).toEqual(["key_1"]);
  });

  it("returns [] for empty keys", () => {
    expect(chunkKeys([], {}, {}, { maxTokens: 3000, charsPerToken: 3.0 })).toEqual([]);
  });

  it("still includes keys not present in source (uses empty string as value)", () => {
    const source = { a: "A" };
    const chunks = chunkKeys(["missing"], source, {}, { maxTokens: 3000, charsPerToken: 3.0 });
    expect(chunks).toEqual([["missing"]]);
  });

  it("handles keys with empty values", () => {
    const source = { a: "", b: "" };
    const chunks = chunkKeys(["a", "b"], source, {}, { maxTokens: 3000, charsPerToken: 3.0 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(["a", "b"]);
  });

  it("handles single key", () => {
    const source = { only: "value" };
    const chunks = chunkKeys(["only"], source, {}, { maxTokens: 3000, charsPerToken: 3.0 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(["only"]);
  });

  it("handles very large number of keys", () => {
    const source: Record<string, string> = {};
    for (let i = 0; i < 1000; i++) {
      source[`key_${i}`] = "v";
    }
    const keys = Object.keys(source);
    const chunks = chunkKeys(keys, source, {}, { maxTokens: 3000, charsPerToken: 3.0 });
    const all = chunks.flat();
    expect(all).toHaveLength(1000);
  });

  it("handles keys with special characters", () => {
    const source = { "key.with.dots": "value", "key-with-dashes": "value2" };
    const chunks = chunkKeys(
      ["key.with.dots", "key-with-dashes"],
      source,
      {},
      { maxTokens: 3000, charsPerToken: 3.0 },
    );
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(["key.with.dots", "key-with-dashes"]);
  });

  it("respects MIN_EFFECTIVE_MAX_CHARS even with zero maxTokens", () => {
    const source = { a: "A", b: "B" };
    const chunks = chunkKeys(["a", "b"], source, {}, { maxTokens: 0, charsPerToken: 3.0 });
    // MIN_EFFECTIVE_MAX_CHARS is 200, so both small keys fit in one chunk
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(["a", "b"]);
  });
});
