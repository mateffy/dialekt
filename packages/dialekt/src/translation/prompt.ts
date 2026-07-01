export function buildSystemPrompt(from: string, to: string): string {
  return `You are a professional software translator specializing in application localization.
You translate language strings from ${from} to ${to}.

Rules:
- Maintain consistent tone, formality, and terminology with existing translations.
- Do not translate proper nouns, brand names, or technical identifiers unless localization is standard.
- Preserve placeholders like :attribute, :min, :max, etc. Do not translate them.
- Use the exact same placeholder format as the source string.
- Return ONLY the requested keys. Do not add or remove keys.
- Do not escape Unicode characters with \\u notation. Write them directly.
- Escape double quotes in translations with a backslash when needed.`;
}

import type { TranslationContext } from "./types.js";

export function buildUserPrompt(ctx: TranslationContext): string {
  const sourceJson = JSON.stringify(ctx.sourceMap, null, 2);
  const targetJson = JSON.stringify(ctx.targetMap, null, 2);

  const keysWithValues: Record<string, string> = {};
  for (const key of ctx.keys) {
    keysWithValues[key] = ctx.sourceMap[key] ?? "";
  }
  const keysJson = JSON.stringify(keysWithValues, null, 2);

  return `Translate the following language strings from ${ctx.sourceLocale} to ${ctx.targetLocale}.

<source-file>
${sourceJson}
</source-file>

<existing-translations>
${targetJson}
</existing-translations>

<keys-to-translate>
${keysJson}
</keys-to-translate>

Translate ALL keys listed in <keys-to-translate>. Use the existing translations and source file as context for consistency.`;
}
