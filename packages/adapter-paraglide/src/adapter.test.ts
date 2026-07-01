import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { NodePlatformLayer } from '@dialekt/core';
import { paraglide } from './adapter.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('paraglide adapter', () => {
  const testDir = join(tmpdir(), `paraglide-adapter-test-${Date.now()}`);

  it('reads a message resource', async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'en.json'), JSON.stringify({ greeting: 'Hello' }));

    const adapter = paraglide({ messagesDir: testDir, scanPaths: [testDir] });
    const program = adapter.readResource('en', { key: 'messages', label: 'messages' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual({ greeting: 'Hello' });

    rmSync(testDir, { recursive: true, force: true });
  });

  it('lists locales from filenames', async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'en.json'), '{}');
    writeFileSync(join(testDir, 'de.json'), '{}');

    const adapter = paraglide({ messagesDir: testDir });
    const program = adapter.listLocales().pipe(Effect.provide(NodePlatformLayer));
    const result = await Effect.runPromise(program);
    expect(result).toContain('en');
    expect(result).toContain('de');

    rmSync(testDir, { recursive: true, force: true });
  });

  it('lists exactly one resource', async () => {
    const adapter = paraglide({ messagesDir: testDir });
    const program = adapter.listResources('en').pipe(Effect.provide(NodePlatformLayer));
    const result = await Effect.runPromise(program);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ key: 'messages', label: 'messages' });
  });

  it('round-trips write and read preserving meta', async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, 'de.json'),
      JSON.stringify({ $schema: 'https://inlang.com/schema', greeting: 'Hallo' }),
    );

    const adapter = paraglide({ messagesDir: testDir });
    const writeProgram = adapter
      .writeResource('de', { key: 'messages', label: 'messages' }, { greeting: 'Hallo!', farewell: 'Tschüss' })
      .pipe(Effect.provide(NodePlatformLayer));
    await Effect.runPromise(writeProgram);

    const readProgram = adapter.readResource('de', { key: 'messages', label: 'messages' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(readProgram);
    expect(result).toEqual({ greeting: 'Hallo!', farewell: 'Tschüss' });

    rmSync(testDir, { recursive: true, force: true });
  });

  it('finds unused keys', async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'en.json'), JSON.stringify({ greeting: 'Hello', farewell: 'Goodbye' }));
    mkdirSync(join(testDir, 'src'), { recursive: true });
    writeFileSync(join(testDir, 'src', 'page.ts'), 'm.greeting();');

    const adapter = paraglide({ messagesDir: testDir, scanPaths: [join(testDir, 'src')] });
    const program = adapter
      .findUnusedKeys!('en', { key: 'messages', label: 'messages' })
      .pipe(Effect.provide(NodePlatformLayer));
    const result = await Effect.runPromise(program);
    expect(result).toEqual(['farewell']);

    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty for missing locale file', async () => {
    mkdirSync(testDir, { recursive: true });

    const adapter = paraglide({ messagesDir: testDir });
    const program = adapter.readResource('missing', { key: 'messages', label: 'messages' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual({});

    rmSync(testDir, { recursive: true, force: true });
  });

  it('handles empty messages directory', async () => {
    mkdirSync(testDir, { recursive: true });

    const adapter = paraglide({ messagesDir: testDir });
    const program = adapter.listLocales().pipe(Effect.provide(NodePlatformLayer));
    const result = await Effect.runPromise(program);
    expect(result).toEqual([]);

    rmSync(testDir, { recursive: true, force: true });
  });

  it('handles capabilities flags', () => {
    const adapter = paraglide({ messagesDir: testDir });
    expect(adapter.capabilities.canCreateResource).toBe(true);
    expect(adapter.capabilities.unusedKeyDetection).toBe(true);
  });

  it('reports adapter name', () => {
    const adapter = paraglide({ messagesDir: testDir });
    expect(adapter.name).toBe('paraglide');
  });

  it('ignores non-JSON files', async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'README.md'), '# Messages');
    writeFileSync(join(testDir, 'en.json'), '{}');

    const adapter = paraglide({ messagesDir: testDir });
    const program = adapter.listLocales().pipe(Effect.provide(NodePlatformLayer));
    const result = await Effect.runPromise(program);
    expect(result).toEqual(['en']);

    rmSync(testDir, { recursive: true, force: true });
  });

  it('preserves meta keys on write', async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, 'de.json'),
      JSON.stringify({ $schema: 'https://inlang.com/schema', module: 'messages' }),
    );

    const adapter = paraglide({ messagesDir: testDir });
    const writeProgram = adapter
      .writeResource('de', { key: 'messages', label: 'messages' }, { hello: 'Hallo' })
      .pipe(Effect.provide(NodePlatformLayer));
    await Effect.runPromise(writeProgram);

    const readProgram = adapter.readResource('de', { key: 'messages', label: 'messages' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(readProgram);
    expect(result).toEqual({ hello: 'Hallo' });

    rmSync(testDir, { recursive: true, force: true });
  });
});
