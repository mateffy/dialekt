import type { DialektConfig } from "../config/types.js";

export interface CliFlags {
  readonly config?: string | undefined;
  readonly adapter?: string | undefined;
  readonly strategy?: "one-shot" | "tool-loop-agent" | undefined;
  readonly baseLanguage?: string | undefined;
  readonly language?: readonly string[] | undefined;
  readonly name?: readonly string[] | undefined;
  readonly skipNames?: boolean | undefined;
  readonly skipLanguages?: boolean | undefined;
  readonly fast?: boolean | undefined;
  readonly langDir?: string | undefined;
}

export function resolveEffectiveConfig(flags: CliFlags, loaded: DialektConfig): DialektConfig {
  return {
    ...loaded,
    sourceLocale: flags.baseLanguage ?? loaded.sourceLocale,
    targetLocales:
      flags.language && flags.language.length > 0 ? flags.language : loaded.targetLocales,
    strategy: flags.strategy ?? loaded.strategy,
    adapters: flags.adapter
      ? loaded.adapters.filter((a: { name: string }) => a.name === flags.adapter)
      : loaded.adapters,
  };
}
