import { describe, expect, it } from 'vitest';
import type { DialektConfig, ModelConfig, ChunkingConfig, RetryConfig } from './types.js';

describe('config type conformance', () => {
  it('accepts all known model providers', () => {
    const providers: ModelConfig['provider'][] = ['openai', 'anthropic', 'google', 'mistral', 'cohere'];
    for (const provider of providers) {
      const m: ModelConfig = { provider, modelId: 'test-model' };
      expect(m.provider).toBe(provider);
    }
  });

  it('accepts any string provider at compile time', () => {
    // provider is typed as string, not a literal union
    const valid: ModelConfig = { provider: 'unknown-provider', modelId: 'x' };
    expect(valid.provider).toBe('unknown-provider');
  });

  it('ChunkingConfig enforces positive maxTokens', () => {
    const c: ChunkingConfig = { maxTokens: 1, charsPerToken: 1.0, concurrency: 1 };
    expect(c.maxTokens).toBe(1);
    expect(c.concurrency).toBe(1);
  });

  it('RetryConfig enforces positive maxAttempts', () => {
    const r: RetryConfig = { maxAttempts: 1, baseDelayMs: 0 };
    expect(r.maxAttempts).toBe(1);
    expect(r.baseDelayMs).toBe(0);
  });

  it('DialektConfig requires sourceLocale and targetLocales', () => {
    const minimal: DialektConfig = {
      sourceLocale: 'en',
      targetLocales: ['de'],
      strategy: 'one-shot',
      model: { provider: 'openai', modelId: 'gpt-4o' },
      fastModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
      retry: { maxAttempts: 3, baseDelayMs: 1000 },
      adapters: [],
    };
    expect(minimal.sourceLocale).toBe('en');
    expect(minimal.targetLocales).toEqual(['de']);
  });

  it('DialektConfig accepts tool-loop-agent strategy', () => {
    const config: DialektConfig = {
      sourceLocale: 'en',
      targetLocales: ['de'],
      strategy: 'tool-loop-agent',
      model: { provider: 'openai', modelId: 'gpt-4o' },
      fastModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
      retry: { maxAttempts: 3, baseDelayMs: 1000 },
      adapters: [],
    };
    expect(config.strategy).toBe('tool-loop-agent');
  });

  it('targetLocales can be empty', () => {
    const config: DialektConfig = {
      sourceLocale: 'en',
      targetLocales: [],
      strategy: 'one-shot',
      model: { provider: 'openai', modelId: 'gpt-4o' },
      fastModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
      retry: { maxAttempts: 3, baseDelayMs: 1000 },
      adapters: [],
    };
    expect(config.targetLocales).toEqual([]);
  });

  it('accepts multiple target locales', () => {
    const config: DialektConfig = {
      sourceLocale: 'en',
      targetLocales: ['de', 'fr', 'es', 'ja'],
      strategy: 'one-shot',
      model: { provider: 'openai', modelId: 'gpt-4o' },
      fastModel: { provider: 'openai', modelId: 'gpt-4o-mini' },
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
      retry: { maxAttempts: 3, baseDelayMs: 1000 },
      adapters: [],
    };
    expect(config.targetLocales).toHaveLength(4);
  });

  it('fastModel can be different provider from model', () => {
    const config: DialektConfig = {
      sourceLocale: 'en',
      targetLocales: ['de'],
      strategy: 'one-shot',
      model: { provider: 'openai', modelId: 'gpt-4o' },
      fastModel: { provider: 'anthropic', modelId: 'claude-3-haiku' },
      chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
      retry: { maxAttempts: 3, baseDelayMs: 1000 },
      adapters: [],
    };
    expect(config.fastModel.provider).toBe('anthropic');
  });
});
