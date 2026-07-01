import { describe, expect, it } from 'vitest';
import { Effect, Layer } from 'effect';
import { FileSystem, Path } from '@effect/platform';
import { readMessageFile, writeMessageFile } from './message-file.js';

function makeFsLayer(files: Record<string, string>) {
  const stub = FileSystem.makeNoop({
    exists: (path) => Effect.succeed(path in files),
    readFileString: (path) =>
      path in files ? Effect.succeed(files[path]!) : Effect.fail(new Error('ENOENT') as never),
    writeFileString: (path, content) => {
      files[path] = content;
      return Effect.void;
    },
    makeDirectory: () => Effect.void,
  });
  return Layer.succeed(FileSystem.FileSystem, stub);
}

describe('readMessageFile', () => {
  it('reads flat translations and preserves meta keys', async () => {
    const files = {
      '/messages/en.json': JSON.stringify({
        $schema: 'https://inlang.com/schema',
        greeting: 'Hello',
        farewell: 'Goodbye',
      }),
    };
    const program = readMessageFile('/messages/en.json').pipe(Effect.provide(makeFsLayer(files)));
    const result = await Effect.runPromise(program);
    expect(result.translations).toEqual({ greeting: 'Hello', farewell: 'Goodbye' });
    expect(result.meta).toEqual({ $schema: 'https://inlang.com/schema' });
  });

  it('returns empty for missing file', async () => {
    const program = readMessageFile('/messages/missing.json').pipe(Effect.provide(makeFsLayer({})));
    const result = await Effect.runPromise(program);
    expect(result.translations).toEqual({});
    expect(result.meta).toEqual({});
  });

  it('flattens nested objects', async () => {
    const files = {
      '/messages/en.json': JSON.stringify({
        nav: { home: 'Home', about: 'About' },
      }),
    };
    const program = readMessageFile('/messages/en.json').pipe(Effect.provide(makeFsLayer(files)));
    const result = await Effect.runPromise(program);
    expect(result.translations).toEqual({ 'nav.home': 'Home', 'nav.about': 'About' });
  });
});

describe('writeMessageFile', () => {
  it('round-trips translations and meta', async () => {
    const files: Record<string, string> = {};
    const program = writeMessageFile(
      '/messages/de.json',
      { greeting: 'Hallo' },
      { $schema: 'https://inlang.com/schema' },
    ).pipe(Effect.provide(makeFsLayer(files)), Effect.provide(Path.layer));
    await Effect.runPromise(program);
    expect(files['/messages/de.json']).toContain('Hallo');
    expect(files['/messages/de.json']).toContain('$schema');
  });
});
