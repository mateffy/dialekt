import {
  select,
  requireSibling,
  noGodFile,
  noHardcodedSecret,
  noImportFrom,
  requireImportFrom,
  noPattern,
  noDeepNesting,
  noDebuggingResidueFiles,
} from "gesetz";
import {
  noConsoleLog,
  noEmptyCatch,
  noTypedAny,
  noAsUnknownAs as checkNoAsUnknownAs,
  noDefaultExport as checkNoDefaultExport,
  noEnum as checkNoEnum,
  noBarrelFile as checkNoBarrelFile,
  noMagicNumbers as checkNoMagicNumbers,
  noTrivialComment as checkNoTrivialComment,
  requireExplicitReturnType as checkRequireExplicitReturnType,
  requireMinTestScore as checkRequireMinTestScore,
} from "@gesetz/typescript";
import {
  noRunPromiseScattered,
  noThrowInEffectGen,
  noYieldWithoutStar as checkNoYieldWithoutStar,
  noUnboundedEffectAll as checkNoUnboundedEffectAll,
} from "@gesetz/effect-ts";

// ───────────────────────────────────────────────
// Organization
// ───────────────────────────────────────────────

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

export const noDefaultExports = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts", "**/*.config.ts", "packages/dialekt/src/cli/commands/init.ts")
  .label("Use named exports, not export default")
  .category("organization")
  .check(checkNoDefaultExport());

export const noBarrelFiles = select("packages/*/src/**/index.ts")
  .exclude("packages/dialekt/src/index.ts")
  .label("Avoid barrel files that only re-export")
  .category("organization")
  .check(checkNoBarrelFile({ maxReexports: 5 }));

export const requireVitestImport = select("packages/*/src/**/*.test.ts")
  .label("Test files must import the test runner")
  .category("organization")
  .check(requireImportFrom("vitest"));

// ───────────────────────────────────────────────
// Strictness
// ───────────────────────────────────────────────

export const noAny = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No `any` types")
  .category("strictness")
  .check(noTypedAny());

export const noAsUnknownAs = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts", "**/*.config.ts")
  .label("No `as unknown as` double-casts")
  .category("strictness")
  .check(checkNoAsUnknownAs());

export const noEmptyCatches = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No empty catch blocks")
  .category("strictness")
  .check(noEmptyCatch());

export const noEnums = select("packages/*/src/**/*.ts")
  .label("No TypeScript enums — use union types or as const")
  .category("strictness")
  .check(checkNoEnum());

export const noNonNullAssertions = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No non-null assertions (`!`) — add runtime checks or discriminated unions")
  .category("strictness")
  .check(
    noPattern(/\w+!\.[a-zA-Z_$]/, {
      message: "Non-null assertion `!` bypasses type safety. Use optional chaining, null checks, or discriminated unions instead.",
    }),
  );

export const noTsSuppress = select("packages/*/src/**/*.ts")
  .label("No `@ts-ignore` or `@ts-expect-error` without ticket")
  .category("strictness")
  .check(
    noPattern(/@ts-ignore(?!.*Ticket:)|@ts-expect-error(?!.*Ticket:)/, {
      message: "Do not suppress the compiler. Fix the root cause, or add a `Ticket:` justification.",
    }),
  );

export const noMutableExports = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No mutable exports — export const with readonly shapes")
  .category("strictness")
  .check(
    noPattern(/\bexport\s+(let|var)\s+/, {
      message: "Mutable exports create hidden state bugs. Use `export const` with Readonly/Freeze or a controlled store.",
    }),
  );

export const requireExplicitReturn = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts", "**/*.config.ts", "**/index.ts")
  .label("Public functions and methods need explicit return types")
  .category("strictness")
  .check(checkRequireExplicitReturnType({ ignore: /^(test|it|describe|beforeEach|afterEach)$/ }));

export const noThrowInGen = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No throw inside Effect.gen — use Effect.fail")
  .category("strictness")
  .check(noThrowInEffectGen());

export const noYieldWithoutStar = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("Effect.gen must use `yield*`, not plain `yield`")
  .category("strictness")
  .check(checkNoYieldWithoutStar());

export const noUnboundedEffectAll = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("Effect.all must specify concurrency")
  .category("strictness")
  .check(checkNoUnboundedEffectAll());

export const noPromiseAll = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("Use Effect.all, not Promise.all")
  .category("strictness")
  .check(
    noPattern(/Promise\.all\(/, {
      message: "Promise.all loses the error channel and tracing. Use Effect.all with bounded concurrency instead.",
    }),
  );

export const noAsyncInEffectSource = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts", "**/*.config.ts")
  .label("Source files should not define async functions — return Effect instead")
  .category("strictness")
  .check(
    noPattern(/\basync\s+function\b/, {
      message:
        "Async functions leak Promise-based glue code. Rewrite to return Effect.Effect<A,E,R> and compose with yield* at the boundary.",
    }),
  );

// ───────────────────────────────────────────────
// Structure
// ───────────────────────────────────────────────

export const noMagicNumbers = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts", "**/cli/main.ts")
  .label("No unexplained numeric literals")
  .category("structure")
  .check(checkNoMagicNumbers({ ignore: [0, 1, -1, 2, 10, 100, 1000, 3] }));

export const maxNesting = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("Keep nesting shallow (max 6 levels)")
  .category("structure")
  .check(noDeepNesting({ maxLevels: 6 }));

export const minTestQuality = select("packages/*/src/**/*.test.ts")
  .label("Tests must meet minimum quality score")
  .category("structure")
  .check(
    checkRequireMinTestScore({
      minScore: 35,
      assertionThresholds: [1, 3, 5, 8],
      assertionBonus: 5,
      testCountThresholds: [2, 4, 6],
      testCountBonus: 5,
      trivialAssertions: ["toBeTrue", "toBeTruthy", "toBeDefined", "toBeNull"],
      trivialPenalty: -15,
      errorIndicators: ["toThrow", "rejects", "catchAll"],
      errorBonus: 10,
      varietyBonus: 5,
    }),
  );

// ───────────────────────────────────────────────
// Cleanup
// ───────────────────────────────────────────────

export const noConsole = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts", "**/cli/**")
  .label("No console.log outside the CLI package")
  .category("cleanup")
  .check(noConsoleLog({ allowWarnError: true }));

export const noTrivialComments = select("packages/*/src/**/*.ts")
  .exclude("**/*.test.ts")
  .label("No AI-generated narration comments")
  .category("cleanup")
  .check(checkNoTrivialComment());

export const noDebugFiles = select("packages/*/src/**/*")
  .label("No debugging residue files")
  .category("cleanup")
  .check(noDebuggingResidueFiles());

// ───────────────────────────────────────────────
// Security
// ───────────────────────────────────────────────

export const noSecrets = select("packages/*/src/**/*")
  .label("No hardcoded secrets")
  .category("security")
  .check(noHardcodedSecret());

// ───────────────────────────────────────────────
// Effect-TS / Platform discipline
// ───────────────────────────────────────────────

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
