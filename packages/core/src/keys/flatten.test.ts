import { describe, expect, it } from 'vitest';
import { flattenObject, unflattenObject, diffKeys } from './flatten.js';

describe('flattenObject', () => {
  it('flattens nested objects to dot-notation keys', () => {
    expect(
      flattenObject({
        validation: { email: 'Email', nested: { deep: 'x' } },
      }),
    ).toEqual({ 'validation.email': 'Email', 'validation.nested.deep': 'x' });
  });

  it('returns {} for an empty object', () => {
    expect(flattenObject({})).toEqual({});
  });

  it('preserves empty string values', () => {
    expect(flattenObject({ a: '' })).toEqual({ a: '' });
  });

  it('handles deeply nested structures', () => {
    expect(
      flattenObject({ a: { b: { c: { d: { e: 'deep' } } } } }),
    ).toEqual({ 'a.b.c.d.e': 'deep' });
  });

  it('ignores arrays (not flattened)', () => {
    expect(flattenObject({ items: ['first', 'second'] })).toEqual({});
  });

  it('ignores mixed arrays and objects', () => {
    expect(flattenObject({ items: [{ name: 'a' }, { name: 'b' }] })).toEqual({});
  });

  it('ignores null values', () => {
    expect(flattenObject({ a: null })).toEqual({});
  });

  it('ignores numeric values', () => {
    expect(flattenObject({ count: 42 })).toEqual({});
  });

  it('ignores boolean values', () => {
    expect(flattenObject({ enabled: true })).toEqual({});
  });

  it('preserves unicode values', () => {
    expect(flattenObject({ greeting: 'Héllo 🌍' })).toEqual({
      greeting: 'Héllo 🌍',
    });
  });
});

describe('unflattenObject', () => {
  it('rebuilds nested structure from dot-notation keys', () => {
    expect(unflattenObject({ 'validation.email': 'Email' })).toEqual({
      validation: { email: 'Email' },
    });
  });

  it('round-trips with flattenObject', () => {
    const original = { a: { b: { c: '1' }, d: '2' } };
    expect(unflattenObject(flattenObject(original))).toEqual(original);
  });

  it('handles deeply nested keys', () => {
    expect(
      unflattenObject({ 'a.b.c.d.e': 'deep' }),
    ).toEqual({ a: { b: { c: { d: { e: 'deep' } } } } });
  });

  it('treats numeric keys as object properties, not array indices', () => {
    expect(unflattenObject({ 'items.0': 'first', 'items.1': 'second' })).toEqual({
      items: { '0': 'first', '1': 'second' },
    });
  });

  it('handles empty flat object', () => {
    expect(unflattenObject({})).toEqual({});
  });

  it('handles single-level keys', () => {
    expect(unflattenObject({ a: '1', b: '2' })).toEqual({ a: '1', b: '2' });
  });
});

describe('diffKeys', () => {
  it('returns keys present in source but missing in target', () => {
    expect(diffKeys({ a: '1', b: '2' }, { a: '1' })).toEqual(['b']);
  });

  it('returns [] when target has all source keys', () => {
    expect(diffKeys({ a: '1' }, { a: '1', b: '2' })).toEqual([]);
  });

  it('returns all keys when target is empty', () => {
    expect(diffKeys({ a: '1', b: '2' }, {})).toEqual(['a', 'b']);
  });

  it('returns [] when source is empty', () => {
    expect(diffKeys({}, { a: '1' })).toEqual([]);
  });

  it('handles keys with different values', () => {
    expect(diffKeys({ a: '1' }, { a: '2' })).toEqual([]);
  });

  it('handles nested flattened keys', () => {
    expect(diffKeys({ 'a.b': '1', 'a.c': '2' }, { 'a.b': '1' })).toEqual(['a.c']);
  });
});
