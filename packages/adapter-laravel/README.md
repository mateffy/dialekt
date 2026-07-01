<div>
  <img src="../../resources/icon.svg" align="left" width="175">
</div>

# `@dialekt/adapter-laravel`

Laravel adapter for [dialekt](https://github.com/mateffy/dialekt). Reads and writes PHP array translation files (`lang/{locale}/{resource}.php`) and JSON string files (`lang/{locale}.json`), scans Blade views and PHP controllers for `__()`, `@lang()`, and `trans()` calls, and reports unused keys.

<br>

## Install

```bash
npm install -D @dialekt/adapter-laravel
```

## Use

```ts
import { defineConfig } from "dialekt";
import { laravel } from "@dialekt/adapter-laravel";

export default defineConfig({
  sourceLocale: "en",
  targetLocales: ["de", "fr"],
  adapters: [
    laravel({
      langDir: "./lang",
      scanPaths: ["./app", "./resources/views"],
    }),
  ],
});
```

## Full documentation

See the [dialekt GitHub README](https://github.com/mateffy/dialekt) for commands, translation strategies, and the programmatic API.
