import { describe, expect, it } from 'vitest';
import { TranslationFailedError } from './types.js';

describe('TranslationFailedError', () => {
  it('carries keys and cause', () => {
    const err = new TranslationFailedError({ keys: ['a'], cause: new Error('boom') });
    expect(err._tag).toBe('TranslationFailedError');
    expect(err.keys).toEqual(['a']);
  });

  it('carries multiple keys', () => {
    const err = new TranslationFailedError({ keys: ['a', 'b', 'c'], cause: 'network timeout' });
    expect(err.keys).toEqual(['a', 'b', 'c']);
  });

  it('accepts string cause', () => {
    const err = new TranslationFailedError({ keys: ['x'], cause: 'rate limited' });
    expect(err._tag).toBe('TranslationFailedError');
  });

  it('accepts Error cause', () => {
    const cause = new Error('model rejected');
    const err = new TranslationFailedError({ keys: ['y'], cause });
    expect(err._tag).toBe('TranslationFailedError');
  });

  it('accepts empty keys array', () => {
    const err = new TranslationFailedError({ keys: [], cause: 'unknown' });
    expect(err.keys).toEqual([]);
  });

  it('preserves cause object identity when Error', () => {
    const cause = new Error('specific');
    const err = new TranslationFailedError({ keys: ['z'], cause });
    expect(err.cause).toBe(cause);
  });
});
