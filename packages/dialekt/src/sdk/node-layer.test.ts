import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import { FileSystem } from '@effect/platform/FileSystem';
import { Path } from '@effect/platform/Path';
import { CommandExecutor } from '@effect/platform/CommandExecutor';
import { NodePlatformLayer } from './node-layer.js';

describe('NodePlatformLayer', () => {
  it('provides a working FileSystem service', async () => {
    const program = Effect.gen(function* () {
      const fs = yield* FileSystem;
      return yield* fs.exists(process.cwd());
    });
    const result = await Effect.runPromise(Effect.provide(program, NodePlatformLayer));
    expect(result).toBe(true);
  });

  it('provides a working Path service', async () => {
    const program = Effect.gen(function* () {
      const path = yield* Path;
      return path.join('a', 'b');
    });
    const result = await Effect.runPromise(Effect.provide(program, NodePlatformLayer));
    expect(result).toContain('a');
    expect(result).toContain('b');
  });

  it('provides a working CommandExecutor service', async () => {
    const program = Effect.gen(function* () {
      const executor = yield* CommandExecutor;
      return executor !== undefined;
    });
    const result = await Effect.runPromise(Effect.provide(program, NodePlatformLayer));
    expect(result).toBe(true);
  });

  it('can read a real file', async () => {
    const program = Effect.gen(function* () {
      const fs = yield* FileSystem;
      return yield* fs.readFileString(process.cwd() + '/package.json');
    });
    const result = await Effect.runPromise(Effect.provide(program, NodePlatformLayer));
    expect(result).toContain('name');
  });

  it('reports missing files correctly', async () => {
    const program = Effect.gen(function* () {
      const fs = yield* FileSystem;
      return yield* fs.exists('/nonexistent/path/that/should/not/exist');
    });
    const result = await Effect.runPromise(Effect.provide(program, NodePlatformLayer));
    expect(result).toBe(false);
  });
});
