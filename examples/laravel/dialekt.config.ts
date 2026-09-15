import { defineConfig } from "dialekt";
import { laravel } from "@dialekt/adapter-laravel";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de", "fr", "es"],
  strategy: "one-shot",
  model: { provider: "openai", modelId: "gpt-4o" },
  fastModel: { provider: "openai", modelId: "gpt-4o-mini" },
  chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 },
  retry: { maxAttempts: 3, baseDelayMs: 1000 },
  adapters: [
    laravel({
      langDir: "./lang",
      scanPaths: ["./app", "./resources/views"],
    }),
  ],
  hardcoded: {
    scanPaths: ["./resources/views", "./app"],
    // Manual allow-list. Keep this at the very bottom: it tends to grow.
    ignore: [
      {
        file: "resources/views/welcome.blade.php",
        text: "FAQ",
        reason: "Acronym, identical in every supported language",
      },
    ],
  },
});
