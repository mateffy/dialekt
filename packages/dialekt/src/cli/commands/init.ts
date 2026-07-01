import { Command, Options } from "@effect/cli";
import { Effect, Console, Option } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { Command as PlatformCommand } from "@effect/platform";
import type { CommandExecutor } from "@effect/platform/CommandExecutor";
import { NodeContext } from "@effect/platform-node";
import { detectFormat, type OutputFormat } from "../format.js";
import { formatInit, type InitResult } from "../formatters.js";
import { writeFileEnsuringDir } from "../../sdk/file-io.js";

export interface InitFlags {
  readonly adapter: ReadonlyArray<string>;
  readonly noInstall: boolean;
  readonly format?: Option.Option<string>;
}

export interface AdapterInfo {
  readonly packageName: string;
  readonly importName: string;
  readonly configCall: string;
}

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export interface InitDeps {
  readonly exists: (path: string) => Effect.Effect<boolean, unknown, never>;
  readonly runInstall: (
    pm: PackageManager,
    packages: ReadonlyArray<string>,
  ) => Effect.Effect<void, unknown, never>;
  readonly writeFile: (path: string, content: string) => Effect.Effect<void, unknown, never>;
}

export function resolveAdapter(raw: string): AdapterInfo {
  if (raw === "laravel") {
    return {
      packageName: "@dialekt/adapter-laravel",
      importName: "laravel",
      configCall: `laravel({ langDir: './lang', scanPaths: ['./app', './resources/views'] })`,
    };
  }
  if (raw === "paraglide") {
    return {
      packageName: "@dialekt/adapter-paraglide",
      importName: "paraglide",
      configCall: `paraglide({ messagesDir: './messages', scanPaths: ['./src'] })`,
    };
  }
  const NPM_PREFIX = "npm:";
  const pkg = raw.startsWith(NPM_PREFIX) ? raw.slice(NPM_PREFIX.length) : raw;
  const VALID_IDENTIFIER_RE = /[^a-zA-Z_\d]/g;
  const base = pkg.replace(/^@[^/]+\//, "").replace(VALID_IDENTIFIER_RE, "_");
  return {
    packageName: pkg,
    importName: base,
    configCall: `${base}({ /* configure me */ })`,
  };
}

export function buildConfigContent(adapters: ReadonlyArray<AdapterInfo>): string {
  const imports = [
    `import { defineConfig } from 'dialekt';`,
    ...adapters.map((a) => `import { ${a.importName} } from '${a.packageName}';`),
  ];
  const adapterLines = adapters.map((a) => `    ${a.configCall}`).join(",\n");
  return `${imports.join("\n")}

export default defineConfig({
  sourceLocale: 'en',
  targetLocales: ['de'],
  strategy: 'one-shot',
  model: { provider: 'openai', modelId: 'gpt-4o-mini' },
  adapters: [
${adapterLines}
  ],
});
`;
}

export function detectPackageManager(
  fs: { readonly exists: (p: string) => Effect.Effect<boolean, unknown, never> },
  cwd: string,
): Effect.Effect<PackageManager, unknown, never> {
  return Effect.gen(function* () {
    if (yield* fs.exists(`${cwd}/pnpm-lock.yaml`)) return "pnpm";
    if (yield* fs.exists(`${cwd}/package-lock.json`)) return "npm";
    if (yield* fs.exists(`${cwd}/yarn.lock`)) return "yarn";
    if (yield* fs.exists(`${cwd}/bun.lock`)) return "bun";
    return "npm";
  });
}

export function installCommand(
  pm: PackageManager,
  packages: ReadonlyArray<string>,
): PlatformCommand.Command {
  const args: string[] =
    pm === "pnpm"
      ? ["add", "-D", ...packages]
      : pm === "npm"
        ? ["install", "--save-dev", ...packages]
        : pm === "yarn"
          ? ["add", "-D", ...packages]
          : ["add", "-d", ...packages];
  return PlatformCommand.make(pm, ...args);
}

export function makeLiveDeps(): InitDeps {
  return {
    exists: (path) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        return yield* fs.exists(path);
      }).pipe(Effect.provide([NodeContext.layer])) as Effect.Effect<boolean, unknown, never>,
    runInstall: (pm, packages) =>
      Effect.gen(function* () {
        const cmd = installCommand(pm, packages);
        yield* PlatformCommand.string(cmd);
      }).pipe(Effect.provide([NodeContext.layer])) as Effect.Effect<void, unknown, never>,
    writeFile: (path, content) =>
      writeFileEnsuringDir(path, content).pipe(
        Effect.provide([NodeContext.layer]),
      ) as Effect.Effect<void, unknown, never>,
  };
}

export function runInit(
  flags: InitFlags,
  cwd: string,
  deps: InitDeps,
  logger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.log(msg),
): Effect.Effect<void, unknown, never> {
  return Effect.gen(function* () {
    const format = detectFormat(
      flags.format !== undefined
        ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
        : undefined,
    );

    if (flags.adapter.length === 0) {
      yield* logger(
        formatInit(
          { success: false, message: "No adapters specified. Use --adapter <name>" },
          format,
        ),
      );
      return;
    }

    const configPath = `${cwd}/dialekt.config.ts`;

    if (yield* deps.exists(configPath)) {
      yield* logger(
        formatInit({ success: false, message: `${configPath} already exists.` }, format),
      );
      return;
    }

    const adapterInfos = flags.adapter.map(resolveAdapter);
    const allPackages = ["dialekt", ...adapterInfos.map((a) => a.packageName)];

    const pm = yield* detectPackageManager(deps, cwd);

    if (!flags.noInstall) {
      yield* deps.runInstall(pm, allPackages);
    }

    const content = buildConfigContent(adapterInfos);
    yield* deps.writeFile(configPath, content);

    const result: InitResult = {
      success: true,
      message: "dialekt initialized.",
      configPath,
      packageManager: pm,
      installed: flags.noInstall ? [] : allPackages,
      skippedInstall: flags.noInstall,
    };

    yield* logger(formatInit(result, format));
  });
}

export const initCommand = Command.make(
  "init",
  {
    adapter: Options.repeated(Options.text("adapter")),
    noInstall: Options.boolean("no-install").pipe(Options.withDefault(false)),
    format: Options.optional(Options.text("format")),
  },
  (flags) => {
    const cwd = process.cwd();
    const deps = makeLiveDeps();
    return runInit(
      {
        adapter: flags.adapter,
        noInstall: flags.noInstall,
        format: flags.format,
      },
      cwd,
      deps,
    );
  },
);
