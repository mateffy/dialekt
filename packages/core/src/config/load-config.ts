import { createJiti } from 'jiti';
import { Effect, Data } from 'effect';
import { resolve } from 'node:path';
import type { DialektConfig } from './types.js';

export class ConfigLoadError extends Data.TaggedError('ConfigLoadError')<{
  readonly path: string;
  readonly cause: unknown;
}> {}

export function loadConfig(configPath: string): Effect.Effect<DialektConfig, ConfigLoadError> {
  return Effect.tryPromise({
    try: async () => {
      const jiti = createJiti(process.cwd());
      const absolutePath = resolve(configPath);
      const mod = await jiti.import(absolutePath, { default: true });
      return mod as DialektConfig;
    },
    catch: (cause) => new ConfigLoadError({ path: configPath, cause }),
  });
}
