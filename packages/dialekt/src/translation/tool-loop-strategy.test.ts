import { describe, expect, it } from 'vitest';
import { Effect, Either } from 'effect';
import { MockLanguageModelV3 } from 'ai/test';
import { createToolLoopStrategy } from './tool-loop-strategy.js';
import { TranslationFailedError } from './types.js';

describe('createToolLoopStrategy', () => {
  it('returns translated map when tool is called', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        text: '',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'submitTranslations',
            input: JSON.stringify({ hello: 'Hallo', bye: 'Tschüss' }),
          },
        ],
        finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 4, text: 0, reasoning: 0 },
        },
        response: {
          modelId: 'mock',
          timestamp: new Date(),
        },
        request: { body: {} },
        warnings: [],
      }),
    });

    const strategy = createToolLoopStrategy({
      model,
      retry: { maxAttempts: 3, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { hello: 'Hello', bye: 'Bye' },
      targetMap: {},
      keys: ['hello', 'bye'],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({ hello: 'Hallo', bye: 'Tschüss' });
  });

  it('retries when tool is not called and fails after exhaustion', async () => {
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        calls++;
        return {
          text: '',
          content: [{ type: 'text' as const, text: 'I will translate now' }],
          finishReason: { unified: 'stop' as const, raw: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 2, text: 2, reasoning: 0 },
          },
          response: {
            modelId: 'mock',
            timestamp: new Date(),
          },
          request: { body: {} },
          warnings: [],
        };
      },
    });

    const strategy = createToolLoopStrategy({
      model,
      retry: { maxAttempts: 2, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { hello: 'Hello', bye: 'Bye' },
      targetMap: {},
      keys: ['hello', 'bye'],
    };

    const exit = await Effect.runPromise(Effect.either(strategy.translateChunk(ctx))) as Either.Either<unknown, TranslationFailedError>;
    expect(calls).toBeGreaterThan(1);
    if (exit._tag === 'Left') {
      expect(exit.left._tag).toBe('TranslationFailedError');
    } else {
      throw new Error('Expected Left');
    }
  });

  it('handles empty keys', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        text: '',
        content: [{
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'submitTranslations',
          input: JSON.stringify({}),
        }],
        finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 0, reasoning: 0 } },
        response: { modelId: 'mock', timestamp: new Date() },
        request: { body: {} },
        warnings: [],
      }),
    });

    const strategy = createToolLoopStrategy({
      model,
      retry: { maxAttempts: 1, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: {},
      targetMap: {},
      keys: [],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({});
  });

  it('handles wrong tool name by retrying', async () => {
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        calls++;
        return {
          text: '',
          content: [{
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: calls < 2 ? 'wrongTool' : 'submitTranslations',
            input: JSON.stringify({ k: 'v' }),
          }],
          finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
          usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 0, reasoning: 0 } },
          response: { modelId: 'mock', timestamp: new Date() },
          request: { body: {} },
          warnings: [],
        };
      },
    });

    const strategy = createToolLoopStrategy({
      model,
      retry: { maxAttempts: 3, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { k: 'K' },
      targetMap: {},
      keys: ['k'],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({ k: 'v' });
    expect(calls).toBeGreaterThan(1);
  });

  it('handles malformed tool input by retrying', async () => {
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        calls++;
        return {
          text: '',
          content: [{
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'submitTranslations',
            input: calls < 2 ? 'not-json' : JSON.stringify({ k: 'v' }),
          }],
          finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
          usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 0, reasoning: 0 } },
          response: { modelId: 'mock', timestamp: new Date() },
          request: { body: {} },
          warnings: [],
        };
      },
    });

    const strategy = createToolLoopStrategy({
      model,
      retry: { maxAttempts: 3, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { k: 'K' },
      targetMap: {},
      keys: ['k'],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({ k: 'v' });
    expect(calls).toBeGreaterThan(1);
  });

  it('fails after all retries when tool never called', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        text: '',
        content: [{ type: 'text', text: 'I will translate now' }],
        finishReason: { unified: 'stop' as const, raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
        response: { modelId: 'mock', timestamp: new Date() },
        request: { body: {} },
        warnings: [],
      }),
    });

    const strategy = createToolLoopStrategy({
      model,
      retry: { maxAttempts: 2, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { k: 'K' },
      targetMap: {},
      keys: ['k'],
    };

    const exit = await Effect.runPromise(Effect.either(strategy.translateChunk(ctx))) as Either.Either<unknown, TranslationFailedError>;
    if (exit._tag === 'Left') {
      expect(exit.left._tag).toBe('TranslationFailedError');
    } else {
      throw new Error('Expected Left');
    }
  });

  it('handles single key', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        text: '',
        content: [{
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'submitTranslations',
          input: JSON.stringify({ greeting: 'Hallo' }),
        }],
        finishReason: { unified: 'tool-calls' as const, raw: 'tool_calls' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 0, reasoning: 0 } },
        response: { modelId: 'mock', timestamp: new Date() },
        request: { body: {} },
        warnings: [],
      }),
    });

    const strategy = createToolLoopStrategy({
      model,
      retry: { maxAttempts: 1, baseDelayMs: 10 },
    });

    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { greeting: 'Hello' },
      targetMap: {},
      keys: ['greeting'],
    };

    const result = await Effect.runPromise(strategy.translateChunk(ctx));
    expect(result).toEqual({ greeting: 'Hallo' });
  });
});
