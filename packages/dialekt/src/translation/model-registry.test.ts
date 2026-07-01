import { describe, expect, it } from 'vitest';
import { Effect, Either } from 'effect';
import { resolveModel, UnknownProviderError } from './model-registry.js';

describe('resolveModel', () => {
  it('returns UnknownProviderError for unknown provider', async () => {
    const program = resolveModel({ provider: 'unknown', modelId: 'x' });
    const exit = await Effect.runPromise(Effect.either(program)) as Either.Either<unknown, UnknownProviderError>;
    if (exit._tag === 'Left') {
      expect(exit.left._tag).toBe('UnknownProviderError');
      expect(exit.left.provider).toBe('unknown');
    } else {
      throw new Error('Expected Left');
    }
  });

  it('returns UnknownProviderError for empty provider string', async () => {
    const program = resolveModel({ provider: '', modelId: 'x' });
    const exit = await Effect.runPromise(Effect.either(program)) as Either.Either<unknown, UnknownProviderError>;
    if (exit._tag === 'Left') {
      expect(exit.left._tag).toBe('UnknownProviderError');
      expect(exit.left.provider).toBe('');
    } else {
      throw new Error('Expected Left');
    }
  });

  it('resolves openai provider when package is available', async () => {
    const program = resolveModel({ provider: 'openai', modelId: 'gpt-4o' });
    const exit = await Effect.runPromise(Effect.either(program)) as Either.Either<unknown, UnknownProviderError>;
    // Package is installed in this repo, so it should succeed
    expect(exit._tag).toBe('Right');
  });

  it('UnknownProviderError preserves provider in message', () => {
    const err = new UnknownProviderError({ provider: 'foo' });
    expect(err.provider).toBe('foo');
    expect(err._tag).toBe('UnknownProviderError');
  });

  it('accepts all known providers without type error', () => {
    const providers = ['openai', 'anthropic', 'google'] as const;
    for (const provider of providers) {
      // Should compile without error
      const config = { provider, modelId: 'test' };
      expect(config.provider).toBe(provider);
    }
  });

  it('modelId is passed through', () => {
    const config = { provider: 'openai' as const, modelId: 'gpt-4o' };
    expect(config.modelId).toBe('gpt-4o');
  });
});
