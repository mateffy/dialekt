import { describe, expect, it } from 'vitest';
import { Effect, Either } from 'effect';
import { NodePlatformLayer } from '@dialekt/core';
import { laravel } from './adapter.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

function hasPhpBinary(): boolean {
  try {
    execSync('php -v', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe('laravel adapter', () => {
  const testDir = join(tmpdir(), `laravel-adapter-test-${Date.now()}`);

  it.skipIf(!hasPhpBinary())('reads a PHP domain resource', async () => {
    mkdirSync(join(testDir, 'en'), { recursive: true });
    writeFileSync(
      join(testDir, 'en', 'validation.php'),
      "<?php return ['email' => 'Email address'];",
    );

    const adapter = laravel({ langDir: testDir, scanPaths: [testDir] });
    const program = adapter.readResource('en', { key: 'validation', label: 'validation' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual({ email: 'Email address' });

    rmSync(testDir, { recursive: true, force: true });
  });

  it.skipIf(!hasPhpBinary())('returns {} for a missing resource', async () => {
    mkdirSync(join(testDir, 'en'), { recursive: true });

    const adapter = laravel({ langDir: testDir, scanPaths: [testDir] });
    const program = adapter.readResource('en', { key: 'missing', label: 'missing' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual({});

    rmSync(testDir, { recursive: true, force: true });
  });

  it.skipIf(!hasPhpBinary())('round-trips write and read', async () => {
    mkdirSync(join(testDir, 'de'), { recursive: true });

    const adapter = laravel({ langDir: testDir, scanPaths: [testDir] });
    const writeProgram = adapter
      .writeResource('de', { key: 'auth', label: 'auth' }, { login: 'Anmelden' })
      .pipe(Effect.provide(NodePlatformLayer));
    await Effect.runPromise(writeProgram);

    const readProgram = adapter.readResource('de', { key: 'auth', label: 'auth' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(readProgram);
    expect(result).toEqual({ login: 'Anmelden' });

    rmSync(testDir, { recursive: true, force: true });
  });

  it('reads a JSON locale resource', async () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'en.json'), JSON.stringify({ greeting: 'Hello' }));

    const adapter = laravel({ langDir: testDir, scanPaths: [testDir] });
    const program = adapter.readResource('en', { key: 'json', label: 'en.json' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual({ greeting: 'Hello' });

    rmSync(testDir, { recursive: true, force: true });
  });

  it('lists locales and resources', async () => {
    mkdirSync(join(testDir, 'en'), { recursive: true });
    mkdirSync(join(testDir, 'de'), { recursive: true });
    writeFileSync(join(testDir, 'en', 'validation.php'), '<?php return [];');

    const adapter = laravel({ langDir: testDir, scanPaths: [testDir] });
    const locales = await Effect.runPromise(adapter.listLocales().pipe(Effect.provide(NodePlatformLayer)));
    expect(locales).toContain('en');
    expect(locales).toContain('de');

    const resources = await Effect.runPromise(
      adapter.listResources('en').pipe(Effect.provide(NodePlatformLayer)),
    );
    expect(resources.map((r) => r.key)).toContain('validation');

    rmSync(testDir, { recursive: true, force: true });
  });

  it('finds unused keys', async () => {
    mkdirSync(join(testDir, 'en'), { recursive: true });
    writeFileSync(join(testDir, 'en', 'validation.php'), "<?php return ['email' => 'Email'];");
    mkdirSync(join(testDir, 'views'), { recursive: true });
    writeFileSync(join(testDir, 'views', 'page.blade.php'), "__('validation.email')");

    const adapter = laravel({ langDir: testDir, scanPaths: [join(testDir, 'views')] });
    const program = adapter
      .findUnusedKeys!('en', { key: 'validation', label: 'validation' })
      .pipe(Effect.provide(NodePlatformLayer));
    const result = await Effect.runPromise(program);
    expect(result).toEqual([]);

    rmSync(testDir, { recursive: true, force: true });
  });

  it.skipIf(!hasPhpBinary())('reads nested PHP arrays', async () => {
    mkdirSync(join(testDir, 'en'), { recursive: true });
    writeFileSync(
      join(testDir, 'en', 'nested.php'),
      "<?php return ['validation' => ['email' => 'Email', 'required' => 'Required']];",
    );

    const adapter = laravel({ langDir: testDir, scanPaths: [testDir] });
    const program = adapter.readResource('en', { key: 'nested', label: 'nested' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual({
      'validation.email': 'Email',
      'validation.required': 'Required',
    });

    rmSync(testDir, { recursive: true, force: true });
  });

  it('returns empty for missing JSON locale file', async () => {
    mkdirSync(testDir, { recursive: true });

    const adapter = laravel({ langDir: testDir, scanPaths: [testDir] });
    const program = adapter.readResource('en', { key: 'json', label: 'en.json' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual({});

    rmSync(testDir, { recursive: true, force: true });
  });

  it('handles capabilities flags', () => {
    const adapter = laravel({ langDir: testDir });
    expect(adapter.capabilities.canCreateResource).toBe(true);
    expect(adapter.capabilities.unusedKeyDetection).toBe(true);
  });

  it('reports adapter name', () => {
    const adapter = laravel({ langDir: testDir });
    expect(adapter.name).toBe('laravel');
  });

  it.skipIf(!hasPhpBinary())('writes JSON locale files', async () => {
    mkdirSync(testDir, { recursive: true });

    const adapter = laravel({ langDir: testDir, scanPaths: [testDir] });
    const writeProgram = adapter
      .writeResource('en', { key: 'json', label: 'en.json' }, { greeting: 'Hello' })
      .pipe(Effect.provide(NodePlatformLayer));
    await Effect.runPromise(writeProgram);

    const readProgram = adapter.readResource('en', { key: 'json', label: 'en.json' }).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(readProgram);
    expect(result).toEqual({ greeting: 'Hello' });

    rmSync(testDir, { recursive: true, force: true });
  });
});
