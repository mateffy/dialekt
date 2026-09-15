import { defineConfig } from "dialekt";

/**
 * Example for `dialekt hardcoded` and `dialekt doctor`.
 *
 * This project has no translation-file adapter on purpose: a real app would
 * also add `@dialekt/adapter-paraglide` (or another locale adapter) so that the
 * missing-key portion of `dialekt doctor` has something to report.
 */
export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  strategy: "one-shot",
  model: { provider: "openai", modelId: "gpt-4o" },
  fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
  chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
  retry: { maxAttempts: 3, baseDelayMs: 1000 },
  adapters: [],
  hardcoded: {
    scanPaths: ["./src"],
    // Values that are valid in every language.
    ignoredValues: ["OK"],
    languages: {
      typescriptreact: {
        // Extra props to treat as technical, merged with the built-in list.
        ignoredAttributes: ["data-cy"],
      },
    },
    // Manual allow-list. Keep this at the very bottom: it tends to grow.
    ignore: [
      {
        file: "src/App.tsx",
        text: "Acme Corp",
        reason: "Brand name, never translated",
      },
    ],
  },
});
