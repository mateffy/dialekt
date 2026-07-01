import { describe, expect, it } from "vitest";
import { Effect, Either } from "effect";
import { MockLanguageModelV3 } from "ai/test";
import { createOneShotStrategy } from "./one-shot-strategy.js";
import { TranslationFailedError } from "./types.js";

describe("createOneShotStrategy", () => {
  it("returns translated map on success", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async (options: { prompt: unknown }) => {
        return {
          text: "",
          content: [
            {
              type: "text",
              text: JSON.stringify({ hello: "Hallo", bye: "Tschüss" }),
            },
          ],
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 4, text: 4, reasoning: 0 },
          },
          response: {
            modelId: "mock",
            timestamp: new Date(),
          },
          request: { body: {} },
          warnings: [],
        };
      },
    });

    const strategy = createOneShotStrategy({
      model,
      retry: { maxAttempts: 3, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: "en",
      targetLocale: "de",
      sourceMap: { hello: "Hello", bye: "Bye" },
      targetMap: {},
      keys: ["hello", "bye"],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({ hello: "Hallo", bye: "Tschüss" });
  });

  it("retries when model omits a key and fails after exhaustion", async () => {
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        calls++;
        return {
          text: "",
          content: [
            {
              type: "text",
              text: JSON.stringify({ hello: "Hallo" }),
            },
          ],
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 2, text: 2, reasoning: 0 },
          },
          response: {
            modelId: "mock",
            timestamp: new Date(),
          },
          request: { body: {} },
          warnings: [],
        };
      },
    });

    const strategy = createOneShotStrategy({
      model,
      retry: { maxAttempts: 2, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: "en",
      targetLocale: "de",
      sourceMap: { hello: "Hello", bye: "Bye" },
      targetMap: {},
      keys: ["hello", "bye"],
    };

    const exit = (await Effect.runPromise(
      Effect.either(strategy.translateChunk(ctx)),
    )) as Either.Either<unknown, TranslationFailedError>;
    expect(calls).toBeGreaterThan(1);
    if (exit._tag === "Left") {
      expect(exit.left._tag).toBe("TranslationFailedError");
    } else {
      throw new Error("Expected Left");
    }
  });

  it("handles empty keys", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        text: "",
        content: [{ type: "text", text: JSON.stringify({}) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        response: { modelId: "mock", timestamp: new Date() },
        request: { body: {} },
        warnings: [],
      }),
    });

    const strategy = createOneShotStrategy({
      model,
      retry: { maxAttempts: 1, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: "en",
      targetLocale: "de",
      sourceMap: {},
      targetMap: {},
      keys: [],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({});
  });

  it("handles malformed JSON response by retrying", async () => {
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        calls++;
        return {
          text: "",
          content: [{ type: "text", text: calls < 2 ? "not-json" : JSON.stringify({ k: "v" }) }],
          finishReason: { unified: "stop" as const, raw: "stop" },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          response: { modelId: "mock", timestamp: new Date() },
          request: { body: {} },
          warnings: [],
        };
      },
    });

    const strategy = createOneShotStrategy({
      model,
      retry: { maxAttempts: 3, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: "en",
      targetLocale: "de",
      sourceMap: { k: "K" },
      targetMap: {},
      keys: ["k"],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({ k: "v" });
    expect(calls).toBeGreaterThan(1);
  });

  it("fails after all retries exhausted", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        text: "",
        content: [{ type: "text", text: "not-json" }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        response: { modelId: "mock", timestamp: new Date() },
        request: { body: {} },
        warnings: [],
      }),
    });

    const strategy = createOneShotStrategy({
      model,
      retry: { maxAttempts: 2, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: "en",
      targetLocale: "de",
      sourceMap: { k: "K" },
      targetMap: {},
      keys: ["k"],
    };

    const exit = (await Effect.runPromise(
      Effect.either(strategy.translateChunk(ctx)),
    )) as Either.Either<unknown, TranslationFailedError>;
    if (exit._tag === "Left") {
      expect(exit.left._tag).toBe("TranslationFailedError");
    } else {
      throw new Error("Expected Left");
    }
  });

  it("handles model returning extra keys (ignores them)", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        text: "",
        content: [{ type: "text", text: JSON.stringify({ hello: "Hallo", extra: "ignored" }) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        response: { modelId: "mock", timestamp: new Date() },
        request: { body: {} },
        warnings: [],
      }),
    });

    const strategy = createOneShotStrategy({
      model,
      retry: { maxAttempts: 1, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: "en",
      targetLocale: "de",
      sourceMap: { hello: "Hello" },
      targetMap: {},
      keys: ["hello"],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({ hello: "Hallo" });
  });

  it("handles single key translation", async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        text: "",
        content: [{ type: "text", text: JSON.stringify({ greeting: "Hallo" }) }],
        finishReason: { unified: "stop" as const, raw: "stop" },
        usage: {
          inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 1, text: 1, reasoning: 0 },
        },
        response: { modelId: "mock", timestamp: new Date() },
        request: { body: {} },
        warnings: [],
      }),
    });

    const strategy = createOneShotStrategy({
      model,
      retry: { maxAttempts: 1, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: "en",
      targetLocale: "de",
      sourceMap: { greeting: "Hello" },
      targetMap: {},
      keys: ["greeting"],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({ greeting: "Hallo" });
  });
});
