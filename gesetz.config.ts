import { defineConfig } from "gesetz";
import { typescriptSyntaxBackend } from "@gesetz/typescript";
import { oxlint } from "@gesetz/oxlint";
import { oxfmt } from "@gesetz/oxfmt";
import { vitest } from "@gesetz/vitest";
import * as quality from "./rules/quality";
import { layers } from "./rules/architecture";

export default defineConfig({
  adapters: [typescriptSyntaxBackend],
  rules: [
    // organization
    quality.everyFileNeedsTest,
    quality.noDefaultExports,
    quality.noBarrelFiles,
    quality.requireVitestImport,

    // strictness
    quality.noAny,
    quality.noAsUnknownAs,
    quality.noEmptyCatches,
    quality.noEnums,
    quality.noNonNullAssertions,
    quality.noTsSuppress,
    quality.noMutableExports,
    quality.requireExplicitReturn,
    quality.noThrowInGen,
    quality.noYieldWithoutStar,
    quality.noUnboundedEffectAll,
    quality.noPromiseAll,
    quality.noAsyncInEffectSource,

    // structure
    quality.noGiantFiles,
    quality.noMagicNumbers,
    quality.maxNesting,
    quality.minTestQuality,

    // cleanup
    quality.noConsole,
    quality.noTrivialComments,
    quality.noDebugFiles,

    // security
    quality.noSecrets,

    // effect-ts / platform
    quality.noRawNodeIO,
    quality.noRunPromiseOutsideEntryPoints,

    // architecture
    ...layers,

    // external tools
    oxlint({ pattern: "packages/*/src/**/*.ts" }),
    oxfmt({ pattern: "packages/*/src/**/*.ts" }),
    vitest({ pattern: "packages" }),
  ],
});
