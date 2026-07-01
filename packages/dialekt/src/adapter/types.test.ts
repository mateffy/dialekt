import { describe, expect, it } from 'vitest';
import { AdapterReadError, AdapterWriteError } from './types.js';

describe('AdapterReadError', () => {
  it('carries adapter/locale/resource/cause', () => {
    const err = new AdapterReadError({
      adapter: 'laravel',
      locale: 'en',
      resource: 'validation',
      cause: new Error('boom'),
    });
    expect(err._tag).toBe('AdapterReadError');
    expect(err.adapter).toBe('laravel');
    expect(err.locale).toBe('en');
    expect(err.resource).toBe('validation');
  });

  it('carries string cause', () => {
    const err = new AdapterReadError({
      adapter: 'paraglide',
      locale: 'de',
      resource: 'messages',
      cause: 'file not found',
    });
    expect(err._tag).toBe('AdapterReadError');
    expect(err.cause).toBe('file not found');
  });

  it('preserves Error cause identity', () => {
    const cause = new Error('disk full');
    const err = new AdapterReadError({
      adapter: 'laravel',
      locale: 'fr',
      resource: 'auth',
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it('accepts empty locale and resource', () => {
    const err = new AdapterReadError({
      adapter: 'test',
      locale: '',
      resource: '',
      cause: 'unknown',
    });
    expect(err.locale).toBe('');
    expect(err.resource).toBe('');
  });

  it('accepts various adapter names', () => {
    for (const name of ['laravel', 'paraglide', 'symfony', 'custom']) {
      const err = new AdapterReadError({
        adapter: name,
        locale: 'en',
        resource: 'x',
        cause: 'test',
      });
      expect(err.adapter).toBe(name);
    }
  });
});

describe('AdapterWriteError', () => {
  it('carries adapter/locale/resource/cause', () => {
    const err = new AdapterWriteError({
      adapter: 'paraglide',
      locale: 'de',
      resource: 'messages',
      cause: 'disk full',
    });
    expect(err._tag).toBe('AdapterWriteError');
    expect(err.adapter).toBe('paraglide');
    expect(err.locale).toBe('de');
    expect(err.resource).toBe('messages');
  });

  it('carries Error cause', () => {
    const cause = new Error('permission denied');
    const err = new AdapterWriteError({
      adapter: 'laravel',
      locale: 'en',
      resource: 'validation',
      cause,
    });
    expect(err.cause).toBe(cause);
  });

  it('accepts empty strings', () => {
    const err = new AdapterWriteError({
      adapter: '',
      locale: '',
      resource: '',
      cause: '',
    });
    expect(err.adapter).toBe('');
  });
});
