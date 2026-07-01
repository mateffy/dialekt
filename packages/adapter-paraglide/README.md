<div>
  <img src="../../resources/icon.svg" align="left" width="175">
</div>

# `@dialekt/adapter-paraglide`

Paraglide adapter for [dialekt](https://github.com/mateffy/dialekt). Reads and writes inlang message-format JSON files (`messages/{locale}.json`), scans `.ts`, `.svelte`, and `.vue` source files for `m.key()` references, and reports unused keys.

<br>

## Install

```bash
npm install -D @dialekt/adapter-paraglide
```

## Use

```ts
import { defineConfig } from "dialekt";
import { paraglide } from "@dialekt/adapter-paraglide";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de", "fr", "es"],
  adapters: [
    paraglide({
      messagesDir: "./messages",
      scanPaths: ["./src"],
    }),
  ],
});
```

## Full documentation

See the [dialekt GitHub README](https://github.com/mateffy/dialekt) for commands, translation strategies, and the programmatic API.
