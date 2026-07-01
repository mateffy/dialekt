import { describe, expect, it, afterEach } from 'vitest';
import {
  detectFormat,
  color,
  drawTable,
  banner,
  sectionHeader,
  success,
  failure,
  warning,
  info,
  keyValue,
} from './format.js';

describe('detectFormat', () => {
  const originalTty = process.stdout.isTTY;
  const originalEnv = { ...process.env };

  afterEach(() => {
    Object.assign(process.stdout, { isTTY: originalTty });
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete (process.env as Record<string, string | undefined>)[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it('returns explicit format when provided', () => {
    expect(detectFormat('json')).toBe('json');
    expect(detectFormat('pretty')).toBe('pretty');
  });

  it('defaults to json when not a TTY', () => {
    Object.assign(process.stdout, { isTTY: false });
    expect(detectFormat()).toBe('json');
  });

  it('defaults to pretty when TTY and no agent env', () => {
    Object.assign(process.stdout, { isTTY: true });
    expect(detectFormat()).toBe('pretty');
  });

  it('defaults to json when agent env var is set', () => {
    Object.assign(process.stdout, { isTTY: true });
    process.env.CLAUDE_CODE = '1';
    expect(detectFormat()).toBe('json');
  });
});

describe('color', () => {
  it('returns bare text when not a TTY', () => {
    expect(color('hello', '\x1b[31m')).toBe('hello');
  });
});

describe('drawTable', () => {
  it('renders a table with headers and rows', () => {
    const table = drawTable(
      ['Name', 'Score'],
      [
        ['Alice', '10'],
        ['Bob', '8'],
      ],
    );
    expect(table).toContain('Name');
    expect(table).toContain('Score');
    expect(table).toContain('Alice');
    expect(table).toContain('Bob');
  });

  it('handles empty rows', () => {
    const table = drawTable(['A'], []);
    expect(table).toContain('A');
  });
});

describe('banner', () => {
  it('includes the title', () => {
    expect(banner('Results')).toContain('Results');
  });
});

describe('sectionHeader', () => {
  it('includes the label', () => {
    expect(sectionHeader('Missing keys')).toContain('Missing keys');
  });
});

describe('success', () => {
  it('includes the text', () => {
    expect(success('Done')).toContain('Done');
  });
});

describe('failure', () => {
  it('includes the text', () => {
    expect(failure('Failed')).toContain('Failed');
  });
});

describe('warning', () => {
  it('includes the text', () => {
    expect(warning('Warn')).toContain('Warn');
  });
});

describe('info', () => {
  it('returns dimmed text', () => {
    expect(info('note')).toBe('note');
  });
});

describe('keyValue', () => {
  it('formats key and value', () => {
    expect(keyValue('Name:', 'test')).toContain('Name:');
    expect(keyValue('Name:', 'test')).toContain('test');
  });
});
