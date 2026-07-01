import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { FileSystem, Path } from '@effect/platform';
import { NodePlatformLayer } from 'dialekt';
import { listLaravelLocales, listLaravelResources } from './resources.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('listLaravelLocales', () => {
  it('detects locales from directory structure', async () => {
    const dir = join(tmpdir(), `laravel-locales-${Date.now()}`);
    mkdirSync(join(dir, 'en'), { recursive: true });
    mkdirSync(join(dir, 'de'), { recursive: true });
    mkdirSync(join(dir, 'es'), { recursive: true });

    const program = listLaravelLocales(dir).pipe(Effect.provide(NodePlatformLayer));
    const result = await Effect.runPromise(program);
    expect(result).toContain('en');
    expect(result).toContain('de');
    expect(result).toContain('es');

    rmSync(dir, { recursive: true, force: true });
  });

  it('excludes vendor and lang directories', async () => {
    const dir = join(tmpdir(), `laravel-locales-exclude-${Date.now()}`);
    mkdirSync(join(dir, 'en'), { recursive: true });
    mkdirSync(join(dir, 'vendor'), { recursive: true });
    mkdirSync(join(dir, 'lang'), { recursive: true });

    const program = listLaravelLocales(dir).pipe(Effect.provide(NodePlatformLayer));
    const result = await Effect.runPromise(program);
    expect(result).toContain('en');
    expect(result).not.toContain('vendor');
    expect(result).not.toContain('lang');

    rmSync(dir, { recursive: true, force: true });
  });
});

describe('listLaravelResources', () => {
  it('lists PHP domain files and JSON file', async () => {
    const dir = join(tmpdir(), `laravel-resources-${Date.now()}`);
    mkdirSync(join(dir, 'en'), { recursive: true });
    writeFileSync(join(dir, 'en', 'validation.php'), '<?php return [];');
    writeFileSync(join(dir, 'en', 'auth.php'), '<?php return [];');
    writeFileSync(join(dir, 'en.json'), '{}');

    const program = listLaravelResources(dir, 'en').pipe(Effect.provide(NodePlatformLayer));
    const result = await Effect.runPromise(program);
    const keys = result.map((r) => r.key);
    expect(keys).toContain('validation');
    expect(keys).toContain('auth');
    expect(keys).toContain('json');

    rmSync(dir, { recursive: true, force: true });
  });
});
