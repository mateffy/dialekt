import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from './prompt.js';

describe('buildSystemPrompt', () => {
  it('contains from and to language', () => {
    const prompt = buildSystemPrompt('en', 'de');
    expect(prompt).toContain('en');
    expect(prompt).toContain('de');
    expect(prompt).toContain('Do not escape Unicode');
  });

  it('mentions placeholder preservation', () => {
    const prompt = buildSystemPrompt('en', 'ja');
    expect(prompt).toContain(':attribute');
    expect(prompt).toContain(':min');
    expect(prompt).toContain(':max');
  });

  it('instructs to not add or remove keys', () => {
    const prompt = buildSystemPrompt('en', 'fr');
    expect(prompt).toContain('Do not add or remove keys');
  });

  it('mentions double quote escaping', () => {
    const prompt = buildSystemPrompt('en', 'es');
    expect(prompt).toContain('double quotes');
  });

  it('handles same-language translation edge case', () => {
    const prompt = buildSystemPrompt('en', 'en');
    expect(prompt).toContain('en');
  });

  it('handles long locale codes', () => {
    const prompt = buildSystemPrompt('zh-Hans', 'zh-Hant');
    expect(prompt).toContain('zh-Hans');
    expect(prompt).toContain('zh-Hant');
  });
});

describe('buildUserPrompt', () => {
  it('contains XML tags and key list', () => {
    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { hello: 'Hello' },
      targetMap: {},
      keys: ['hello'],
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain('<source-file>');
    expect(prompt).toContain('<existing-translations>');
    expect(prompt).toContain('<keys-to-translate>');
    expect(prompt).toContain('hello');
    expect(prompt).toContain('Translate ALL keys');
  });

  it('includes existing translations for context', () => {
    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { a: 'A', b: 'B' },
      targetMap: { a: 'already translated' },
      keys: ['b'],
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain('already translated');
    expect(prompt).toContain('"b"');
  });

  it('handles empty keys list', () => {
    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { hello: 'Hello' },
      targetMap: {},
      keys: [],
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain('<keys-to-translate>');
    expect(prompt).toContain('{}');
  });

  it('handles keys with missing values in sourceMap', () => {
    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { hello: 'Hello' },
      targetMap: {},
      keys: ['hello', 'missing'],
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain('"missing"');
    expect(prompt).toContain('""');
  });

  it('handles special characters in values', () => {
    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'ja',
      sourceMap: { greeting: 'Hello \n World \t!' },
      targetMap: {},
      keys: ['greeting'],
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain('Hello');
  });

  it('handles unicode values', () => {
    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'ja',
      sourceMap: { emoji: 'Hello 🌍' },
      targetMap: {},
      keys: ['emoji'],
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain('🌍');
  });

  it('includes multiple keys in keys-to-translate', () => {
    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap: { a: 'A', b: 'B', c: 'C' },
      targetMap: {},
      keys: ['a', 'b', 'c'],
    };
    const prompt = buildUserPrompt(ctx);
    expect(prompt).toContain('"a"');
    expect(prompt).toContain('"b"');
    expect(prompt).toContain('"c"');
  });

  it('round-trips JSON sourceMap without corruption', () => {
    const sourceMap = { key: 'value with "quotes" and \\ backslash' };
    const ctx = {
      sourceLocale: 'en',
      targetLocale: 'de',
      sourceMap,
      targetMap: {},
      keys: ['key'],
    };
    const prompt = buildUserPrompt(ctx);
    const jsonMatch = prompt.match(/<source-file>\n([\s\S]*?)\n<\/source-file>/)?.[1];
    expect(jsonMatch).toBeDefined();
    expect(() => JSON.parse(jsonMatch!)).not.toThrow();
  });
});
