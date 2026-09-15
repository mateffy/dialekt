import { describe, expect, it } from "vitest";
import {
  DEFAULT_HARDCODED_MIN_LENGTH,
  isIgnoredAttribute,
  isLikelyTranslatable,
  resolveHardcodedOptions,
} from "./filter.js";
import type { HardcodedConfig } from "./types.js";

describe("resolveHardcodedOptions", () => {
  it("falls back to defaults when config is absent", () => {
    const options = resolveHardcodedOptions(undefined, "typescriptreact");
    expect(options.minLength).toBe(DEFAULT_HARDCODED_MIN_LENGTH);
    expect(options.ignoredAttributes.has("type")).toBe(true);
  });

  it("merges per-language attributes and values", () => {
    const config: HardcodedConfig = {
      minLength: 4,
      ignoredValues: ["OK"],
      languages: {
        typescriptreact: { minLength: 6, ignoredAttributes: ["data-cy"], ignoredValues: ["Cancel"] },
      },
    };
    const options = resolveHardcodedOptions(config, "typescriptreact");
    expect(options.minLength).toBe(6);
    expect(options.ignoredAttributes.has("data-cy")).toBe(true);
    expect(options.ignoredValues.has("ok")).toBe(true);
    expect(options.ignoredValues.has("cancel")).toBe(true);
  });
});

describe("isIgnoredAttribute", () => {
  const options = resolveHardcodedOptions(undefined, "typescriptreact");

  it("ignores technical attributes and namespaced directives", () => {
    for (const name of ["type", "className", "data-testid", "aria-hidden", "onClick", "wire:model"]) {
      expect(isIgnoredAttribute(name, options)).toBe(true);
    }
  });

  it("keeps translatable attributes", () => {
    for (const name of ["placeholder", "aria-label", "alt", "title", "label"]) {
      expect(isIgnoredAttribute(name, options)).toBe(false);
    }
  });
});

describe("isLikelyTranslatable", () => {
  const options = resolveHardcodedOptions(undefined, "typescriptreact");

  it("accepts human-readable copy", () => {
    expect(isLikelyTranslatable("Save changes", options)).toBe(true);
    expect(isLikelyTranslatable("Hello", options)).toBe(true);
  });

  it("rejects technical values", () => {
    for (const value of [
      "btn-primary",
      "data-testid",
      "https://example.com",
      "user@example.com",
      "SOME_CONSTANT",
      "12345",
      "/api/users",
      "e.g.",
    ]) {
      expect(isLikelyTranslatable(value, options)).toBe(false);
    }
  });

  it("rejects short strings and ignored values", () => {
    expect(isLikelyTranslatable("x", options)).toBe(false);
    const config: HardcodedConfig = { ignoredValues: ["OK"] };
    const withIgnores = resolveHardcodedOptions(config, "typescriptreact");
    expect(isLikelyTranslatable("OK", withIgnores)).toBe(false);
  });

  it("honours a custom minimum length", () => {
    const config: HardcodedConfig = { minLength: 10 };
    const strict = resolveHardcodedOptions(config, "typescriptreact");
    expect(isLikelyTranslatable("Short", strict)).toBe(false);
    expect(isLikelyTranslatable("A longer label", strict)).toBe(true);
  });
});
