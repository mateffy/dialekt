import {
  select,
  requireSibling,
  noGodFile,
  noHardcodedSecret,
  noImportFrom,
  defineArchitecture,
} from "gesetz";
import {
  noConsoleLog,
  noEmptyCatch,
  noTypedAny,
  typescriptSyntaxBackend,
} from "@gesetz/typescript";
import { noRunPromiseScattered, noThrowInEffectGen } from "@gesetz/effect-ts";

export const everyFileNeedsTest = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts", "**/index.ts", "**/*.config.ts", "packages/dialekt/src/cli/main.ts")
  .label("Every source file needs a sibling .test.ts")
  .category("organization")
  .check(requireSibling(".test.ts"));

export const noGiantFiles = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No files over 400 lines")
  .category("structure")
  .check(noGodFile({ maxLines: 400 }));

export const noAny = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No `any` types")
  .category("strictness")
  .check(noTypedAny());

export const noEmptyCatches = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No empty catch blocks")
  .category("strictness")
  .check(noEmptyCatch());

export const noConsole = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts", "**/cli/**")
  .label("No console.log outside the CLI package")
  .category("cleanup")
  .check(noConsoleLog({ allowWarnError: true }));

export const noSecrets = select("packages/*/src/**/*")
  .label("No hardcoded secrets")
  .category("security")
  .check(noHardcodedSecret());

// Custom project-specific rule: raw node:fs / node:child_process / node:path
// are banned outside the two designated platform-wiring files.
export const noRawNodeIO = select("packages/*/src/**/*.ts")
  .exclude(
    "**/*.test.ts",
    "packages/dialekt/src/cli/main.ts",
    "packages/dialekt/src/sdk/node-layer.ts",
    "packages/dialekt/src/config/load-config.ts",
  )
  .label("Use @effect/platform, not raw node:fs/node:child_process/node:path")
  .category("organization")
  .check(
    noImportFrom(/^node:(fs|child_process|path)$/, {
      message:
        "Raw Node I/O is banned here. Use @effect/platform FileSystem/Command/Path via dependency injection instead.",
    }),
  );

export const noRunPromiseOutsideEntryPoints = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("Effect.runPromise only at entry points")
  .category("organization")
  .check(
    noRunPromiseScattered({
      entryPoints: ["packages/dialekt/src/cli/main.ts", "packages/dialekt/src/sdk/node-layer.ts"],
    }),
  );

export const noThrowInGen = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No throw inside Effect.gen — use Effect.fail")
  .category("strictness")
  .check(noThrowInEffectGen());
