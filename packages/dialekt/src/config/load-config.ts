import { createJiti } from "jiti";
import { Effect, Data } from "effect";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import type { DialektConfig } from "./types.js";

/** Parse a simple KEY=VAL .env file. Returns a map, skips comments and blanks. */
function parseEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

export class ConfigLoadError extends Data.TaggedError("ConfigLoadError")<{
  readonly path: string;
  readonly cause: unknown;
}> {}

/** Package specifiers the config file might import that jiti can't resolve from cwd. */
const knownSpecifiers = [
  "dialekt",
  "@dialekt/adapter-android",
  "@dialekt/adapter-arb",
  "@dialekt/adapter-csv",
  "@dialekt/adapter-ios",
  "@dialekt/adapter-json",
  "@dialekt/adapter-laravel",
  "@dialekt/adapter-paraglide",
  "@dialekt/adapter-po",
  "@dialekt/adapter-properties",
  "@dialekt/adapter-xliff",
  "@dialekt/adapter-yaml",
];

export function loadConfig(configPath: string): Effect.Effect<DialektConfig, ConfigLoadError> {
  return Effect.tryPromise({
    try: async () => {
      // Resolve dialekt-family packages from this module's own context,
      // not from the user's cwd (where they aren't installed).
      const virtualModules: Record<string, unknown> = {};
      for (const spec of knownSpecifiers) {
        try {
          // Use dynamic import() — it resolves ESM specifiers correctly
          // from this module's location (inside the dialekt package).
          virtualModules[spec] = await import(spec);
        } catch {
          // adapter not installed, skip
        }
      }

      const jiti = createJiti(process.cwd(), { virtualModules });
      const absolutePath = resolve(configPath);
      const mod = (await jiti.import(absolutePath, { default: true })) as DialektConfig;

      // Load explicitly requested .env files into process.env.
      for (const envPath of mod.env ?? []) {
        const resolved = resolve(envPath);
        if (existsSync(resolved)) {
          for (const [k, v] of Object.entries(parseEnvFile(resolved))) {
            process.env[k] ??= v; // don't override existing env vars
          }
        }
      }

      return mod;
    },
    catch: (cause) => new ConfigLoadError({ path: configPath, cause }),
  });
}