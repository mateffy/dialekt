import { describe, expect, it } from "vitest";
import {
  formatMissingKeys,
  formatUnusedKeys,
  formatValidate,
  formatLanguages,
  formatTranslate,
  formatAdd,
  formatBenchmark,
  formatError,
  formatInit,
} from "./formatters.js";

describe("formatMissingKeys", () => {
  it("returns JSON array in json mode", () => {
    const entries = [{ adapter: "a", locale: "de", resource: "r", key: "k" }];
    const result = formatMissingKeys(entries, "json");
    expect(JSON.parse(result)).toEqual(entries);
  });

  it("returns success message when empty in pretty mode", () => {
    const result = formatMissingKeys([], "pretty");
    expect(result).toContain("complete");
  });

  it("groups by adapter, locale, resource in pretty mode", () => {
    const entries = [
      { adapter: "a1", locale: "de", resource: "auth", key: "k1" },
      { adapter: "a1", locale: "de", resource: "auth", key: "k2" },
      { adapter: "a1", locale: "fr", resource: "auth", key: "k3" },
    ];
    const result = formatMissingKeys(entries, "pretty");
    expect(result).toContain("a1");
    expect(result).toContain("de");
    expect(result).toContain("fr");
    expect(result).toContain("auth");
    expect(result).toContain("k1");
    expect(result).toContain("k2");
    expect(result).toContain("k3");
  });
});

describe("formatUnusedKeys", () => {
  it("returns JSON array in json mode", () => {
    const entries = [{ adapter: "a", locale: "en", resource: "r", key: "old" }];
    const result = formatUnusedKeys(entries, "json");
    expect(JSON.parse(result)).toEqual(entries);
  });

  it("returns success message when empty in pretty mode", () => {
    const result = formatUnusedKeys([], "pretty");
    expect(result).toContain("referenced");
  });

  it("groups entries in pretty mode", () => {
    const entries = [{ adapter: "a", locale: "en", resource: "r", key: "old" }];
    const result = formatUnusedKeys(entries, "pretty");
    expect(result).toContain("a");
    expect(result).toContain("old");
  });
});

describe("formatValidate", () => {
  it("returns JSON in json mode", () => {
    const result = formatValidate({ passing: true, entries: [] }, "json");
    const parsed = JSON.parse(result);
    expect(parsed.passing).toBe(true);
  });

  it("returns success message when passing in pretty mode", () => {
    const result = formatValidate({ passing: true, entries: [] }, "pretty");
    expect(result).toContain("up to date");
  });

  it("returns table when failing in pretty mode", () => {
    const result = formatValidate(
      { passing: false, entries: [{ adapter: "a", locale: "de", resource: "r", count: 3 }] },
      "pretty",
    );
    expect(result).toContain("Missing");
    expect(result).toContain("a");
    expect(result).toContain("de");
    expect(result).toContain("3");
  });
});

describe("formatLanguages", () => {
  it("returns JSON in json mode", () => {
    const result = formatLanguages([{ adapter: "a", locales: ["en", "de"] }], "json");
    expect(JSON.parse(result)).toEqual([{ adapter: "a", locales: ["en", "de"] }]);
  });

  it("returns warning when empty in pretty mode", () => {
    const result = formatLanguages([], "pretty");
    expect(result).toContain("No adapters");
  });

  it("lists adapters and locales in pretty mode", () => {
    const result = formatLanguages([{ adapter: "laravel", locales: ["en", "de"] }], "pretty");
    expect(result).toContain("laravel");
    expect(result).toContain("en");
    expect(result).toContain("de");
  });
});

describe("formatTranslate", () => {
  it("returns JSON in json mode", () => {
    const result = formatTranslate({ success: true, message: "Done" }, "json");
    expect(JSON.parse(result)).toEqual({ success: true, message: "Done" });
  });

  it("returns success text in pretty mode", () => {
    const result = formatTranslate({ success: true, message: "Done" }, "pretty");
    expect(result).toContain("Done");
  });

  it("includes stats in pretty mode", () => {
    const result = formatTranslate(
      {
        success: true,
        message: "Done",
        stats: { adaptersProcessed: 1, localesTranslated: 2, keysTranslated: 5 },
      },
      "pretty",
    );
    expect(result).toContain("Adapters:");
    expect(result).toContain("1");
    expect(result).toContain("Locales:");
    expect(result).toContain("2");
  });

  it("returns failure text in pretty mode", () => {
    const result = formatTranslate({ success: false, message: "Failed" }, "pretty");
    expect(result).toContain("Failed");
  });
});

describe("formatAdd", () => {
  it("returns JSON in json mode", () => {
    const result = formatAdd({ success: true, message: "Done" }, "json");
    expect(JSON.parse(result)).toEqual({ success: true, message: "Done" });
  });

  it("returns success text in pretty mode", () => {
    const result = formatAdd({ success: true, message: "Done" }, "pretty");
    expect(result).toContain("Done");
  });

  it("lists added resources in pretty mode", () => {
    const result = formatAdd(
      { success: true, message: "Done", addedResources: ["a/en/messages"] },
      "pretty",
    );
    expect(result).toContain("a/en/messages");
  });
});

describe("formatBenchmark", () => {
  it("returns JSON in json mode", () => {
    const entries = [
      {
        strategyName: "s",
        totalChunks: 1,
        succeededChunks: 1,
        failedChunks: 0,
        totalDurationMs: 100,
        averageDurationMsPerChunk: 100,
        totalAttempts: 1,
      },
    ];
    const result = formatBenchmark(entries, "json");
    expect(JSON.parse(result)).toEqual(entries);
  });

  it("returns warning when empty in pretty mode", () => {
    const result = formatBenchmark([], "pretty");
    expect(result).toContain("No benchmark");
  });

  it("renders table in pretty mode", () => {
    const entries = [
      {
        strategyName: "one-shot",
        totalChunks: 2,
        succeededChunks: 2,
        failedChunks: 0,
        totalDurationMs: 200,
        averageDurationMsPerChunk: 100,
        totalAttempts: 2,
      },
    ];
    const result = formatBenchmark(entries, "pretty");
    expect(result).toContain("Benchmark");
    expect(result).toContain("one-shot");
    expect(result).toContain("2/2");
  });
});

describe("formatInit", () => {
  it("returns JSON in json mode", () => {
    const result = formatInit(
      {
        success: true,
        message: "Initialized",
        configPath: "./dialekt.config.ts",
        packageManager: "pnpm",
        installed: ["dialekt"],
      },
      "json",
    );
    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.configPath).toBe("./dialekt.config.ts");
  });

  it("returns failure text in pretty mode for errors", () => {
    const result = formatInit({ success: false, message: "Already exists" }, "pretty");
    expect(result).toContain("Already exists");
  });

  it("shows config path and packages in pretty mode", () => {
    const result = formatInit(
      {
        success: true,
        message: "dialekt initialized.",
        configPath: "./dialekt.config.ts",
        packageManager: "pnpm",
        installed: ["dialekt", "@dialekt/adapter-laravel"],
      },
      "pretty",
    );
    expect(result).toContain("dialekt initialized");
    expect(result).toContain("dialekt.config.ts");
    expect(result).toContain("pnpm");
    expect(result).toContain("@dialekt/adapter-laravel");
  });

  it("shows skipped install message", () => {
    const result = formatInit(
      {
        success: true,
        message: "dialekt initialized.",
        configPath: "./dialekt.config.ts",
        skippedInstall: true,
      },
      "pretty",
    );
    expect(result).toContain("skipped");
  });
});

describe("formatError", () => {
  it("returns JSON in json mode", () => {
    const result = formatError("Something broke", "json");
    expect(JSON.parse(result)).toEqual({ error: "Something broke" });
  });

  it("returns failure text in pretty mode", () => {
    const result = formatError("Something broke", "pretty");
    expect(result).toContain("Something broke");
  });
});
