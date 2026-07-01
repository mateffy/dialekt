import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { NodePlatformLayer } from 'dialekt';
import { findUnusedParaglideKeys } from './unused-keys.js';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('findUnusedParaglideKeys', () => {
  it('finds keys not referenced in source files', async () => {
    const dir = join(tmpdir(), `paraglide-unused-${Date.now()}`);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'page.tsx'), "const t = m.greeting({ name: 'x' });");

    const program = findUnusedParaglideKeys([join(dir, 'src')], ['greeting', 'farewell']).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual(['farewell']);

    rmSync(dir, { recursive: true, force: true });
  });

  it('finds m.key reference without call parens', async () => {
    const dir = join(tmpdir(), `paraglide-unused-ref-${Date.now()}`);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'util.ts'), 'export const msg = m.greeting;');

    const program = findUnusedParaglideKeys([join(dir, 'src')], ['greeting']).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual([]);

    rmSync(dir, { recursive: true, force: true });
  });

  it('does not treat prefixes as matches', async () => {
    const dir = join(tmpdir(), `paraglide-unused-prefix-${Date.now()}`);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'page.ts'), 'm.greeting();');

    const program = findUnusedParaglideKeys([join(dir, 'src')], ['greet', 'greeting']).pipe(
      Effect.provide(NodePlatformLayer),
    );
    const result = await Effect.runPromise(program);
    expect(result).toEqual(['greet']);

    rmSync(dir, { recursive: true, force: true });
  });
});
