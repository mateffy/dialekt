import { describe, expect, it } from "vitest";
import { Effect, Option } from "effect";
import {
  resolveAdapter,
  buildConfigContent,
  detectPackageManager,
  runInit,
  installCommand,
  installCommandString,
  type InitDeps,
  type PackageManager,
} from "./init.js";
import { formatInit } from "../formatters.js";

// ─── helpers ────────────────────────────────────────────────────────────────

function makeFs(existsMap: Record<string, boolean>) {
  return {
    exists: (p: string) => Effect.succeed(existsMap[p] ?? false),
  };
}

function makeDeps(
  opts: {
    configExists?: boolean;
    installResult?: "ok" | "fail";
    pm?: PackageManager;
  } = {},
): InitDeps {
  return {
    exists: (path: string) => Effect.succeed(opts.configExists ?? false),
    runInstall: (_pm: PackageManager, _packages: ReadonlyArray<string>) =>
      opts.installResult === "fail" ? Effect.fail(new Error("install failed")) : Effect.void,
    writeFile: (_path: string, _content: string) => Effect.void,
  };
}

function extractCommandParts(cmd: unknown): { command: string; args: string[] } {
  const c = cmd as { command: string; args: string[] };
  return { command: c.command, args: c.args };
}

// ─── resolveAdapter ─────────────────────────────────────────────────────────

describe("resolveAdapter", () => {
  it("maps laravel to the correct package", () => {
    const a = resolveAdapter("laravel");
    expect(a.packageName).toBe("@dialekt/adapter-laravel");
    expect(a.importName).toBe("laravel");
    expect(a.configCall).toContain("langDir");
    expect(a.configCall).toContain("scanPaths");
  });

  it("maps paraglide to the correct package", () => {
    const a = resolveAdapter("paraglide");
    expect(a.packageName).toBe("@dialekt/adapter-paraglide");
    expect(a.importName).toBe("paraglide");
    expect(a.configCall).toContain("messagesDir");
    expect(a.configCall).toContain("scanPaths");
  });

  it("strips npm: prefix", () => {
    const a = resolveAdapter("npm:@custom/adapter");
    expect(a.packageName).toBe("@custom/adapter");
    expect(a.importName).toBe("adapter");
  });

  it("strips npm: prefix from unscoped package", () => {
    const a = resolveAdapter("npm:my-adapter");
    expect(a.packageName).toBe("my-adapter");
    expect(a.importName).toBe("my_adapter");
  });

  it("uses raw package name when no prefix", () => {
    const a = resolveAdapter("my-translator");
    expect(a.packageName).toBe("my-translator");
    expect(a.importName).toBe("my_translator");
  });

  it("sanitises special characters in import name", () => {
    const a = resolveAdapter("@scope/pkg-name");
    expect(a.importName).toBe("pkg_name");
    expect(a.packageName).toBe("@scope/pkg-name");
  });

  it("generates a placeholder configCall for unknown adapters", () => {
    const a = resolveAdapter("unknown-adapter");
    expect(a.configCall).toBe("unknown_adapter({ /* configure me */ })");
  });
});

// ─── buildConfigContent ─────────────────────────────────────────────────────

describe("buildConfigContent", () => {
  it("generates config for a single adapter", () => {
    const content = buildConfigContent([
      {
        packageName: "@dialekt/adapter-laravel",
        importName: "laravel",
        configCall: `laravel({ langDir: './lang' })`,
      },
    ]);
    expect(content).toContain("import { defineConfig } from 'dialekt';");
    expect(content).toContain("import { laravel } from '@dialekt/adapter-laravel';");
    expect(content).toContain("laravel({ langDir: './lang' })");
    expect(content).toContain("sourceLocale: 'en'");
    expect(content).toContain("targetLocales: ['de']");
    expect(content).toContain("strategy: 'one-shot'");
    expect(content).toContain("model: {");
  });

  it("generates config for multiple adapters", () => {
    const content = buildConfigContent([
      {
        packageName: "@dialekt/adapter-laravel",
        importName: "laravel",
        configCall: `laravel({ langDir: './lang' })`,
      },
      {
        packageName: "@dialekt/adapter-paraglide",
        importName: "paraglide",
        configCall: `paraglide({ messagesDir: './messages' })`,
      },
    ]);
    expect(content).toContain("import { laravel } from '@dialekt/adapter-laravel';");
    expect(content).toContain("import { paraglide } from '@dialekt/adapter-paraglide';");
    expect(content).toContain("laravel({ langDir: './lang' })");
    expect(content).toContain("paraglide({ messagesDir: './messages' })");
  });

  it("puts adapters on separate lines with commas between them", () => {
    const content = buildConfigContent([
      { packageName: "a", importName: "a", configCall: "a()" },
      { packageName: "b", importName: "b", configCall: "b()" },
    ]);
    const lines = content.split("\n");
    const aLine = lines.findIndex((l) => l.includes("a()"));
    const bLine = lines.findIndex((l) => l.includes("b()"));
    expect(aLine).toBeGreaterThan(0);
    expect(bLine).toBeGreaterThan(0);
    expect(aLine).not.toBe(bLine);
    // the adapter before the last should end with a comma
    expect(lines[aLine]).toContain(",");
  });
});

// ─── detectPackageManager ───────────────────────────────────────────────────

describe("detectPackageManager", () => {
  it("detects pnpm from pnpm-lock.yaml", async () => {
    const pm = await Effect.runPromise(
      detectPackageManager(makeFs({ "/project/pnpm-lock.yaml": true }), "/project"),
    );
    expect(pm).toBe("pnpm");
  });

  it("detects npm from package-lock.json", async () => {
    const pm = await Effect.runPromise(
      detectPackageManager(makeFs({ "/project/package-lock.json": true }), "/project"),
    );
    expect(pm).toBe("npm");
  });

  it("detects yarn from yarn.lock", async () => {
    const pm = await Effect.runPromise(
      detectPackageManager(makeFs({ "/project/yarn.lock": true }), "/project"),
    );
    expect(pm).toBe("yarn");
  });

  it("detects bun from bun.lock", async () => {
    const pm = await Effect.runPromise(
      detectPackageManager(makeFs({ "/project/bun.lock": true }), "/project"),
    );
    expect(pm).toBe("bun");
  });

  it("detects bun from bun.lockb", async () => {
    const pm = await Effect.runPromise(
      detectPackageManager(makeFs({ "/project/bun.lockb": true }), "/project"),
    );
    expect(pm).toBe("bun");
  });

  it("defaults to npm when no lockfile found", async () => {
    const pm = await Effect.runPromise(detectPackageManager(makeFs({}), "/project"));
    expect(pm).toBe("npm");
  });

  it("prefers pnpm over npm when both lockfiles exist", async () => {
    const pm = await Effect.runPromise(
      detectPackageManager(
        makeFs({
          "/project/pnpm-lock.yaml": true,
          "/project/package-lock.json": true,
        }),
        "/project",
      ),
    );
    expect(pm).toBe("pnpm");
  });

  it("prefers npm over yarn when both lockfiles exist", async () => {
    const pm = await Effect.runPromise(
      detectPackageManager(
        makeFs({
          "/project/package-lock.json": true,
          "/project/yarn.lock": true,
        }),
        "/project",
      ),
    );
    expect(pm).toBe("npm");
  });

  it("prefers yarn over bun when both lockfiles exist", async () => {
    const pm = await Effect.runPromise(
      detectPackageManager(
        makeFs({
          "/project/yarn.lock": true,
          "/project/bun.lockb": true,
        }),
        "/project",
      ),
    );
    expect(pm).toBe("yarn");
  });

  it("prefers bun.lockb over bun.lock when both exist", async () => {
    const pm = await Effect.runPromise(
      detectPackageManager(
        makeFs({
          "/project/bun.lockb": true,
          "/project/bun.lock": true,
        }),
        "/project",
      ),
    );
    expect(pm).toBe("bun");
  });

  it("uses the cwd to construct lockfile paths", async () => {
    const calls: string[] = [];
    const fs = {
      exists: (p: string) => {
        calls.push(p);
        return Effect.succeed(false);
      },
    };
    await Effect.runPromise(detectPackageManager(fs, "/some/other/project"));
    expect(calls[0]).toContain("/some/other/project/pnpm-lock.yaml");
    expect(calls[1]).toContain("/some/other/project/package-lock.json");
  });
});

// ─── installCommand ─────────────────────────────────────────────────────────

describe("installCommand", () => {
  it("builds pnpm command with dev flag and packages", () => {
    const cmd = installCommand("pnpm", ["dialekt", "@dialekt/adapter-laravel"]);
    const parts = extractCommandParts(cmd);
    expect(parts.args).toEqual(["add", "-D", "dialekt", "@dialekt/adapter-laravel"]);
  });

  it("builds npm command with --save-dev flag", () => {
    const cmd = installCommand("npm", ["dialekt"]);
    const parts = extractCommandParts(cmd);
    expect(parts.args).toEqual(["install", "--save-dev", "dialekt"]);
  });

  it("builds yarn command with -D flag", () => {
    const cmd = installCommand("yarn", ["dialekt"]);
    const parts = extractCommandParts(cmd);
    expect(parts.args).toEqual(["add", "-D", "dialekt"]);
  });

  it("builds bun command with -d flag", () => {
    const cmd = installCommand("bun", ["dialekt"]);
    const parts = extractCommandParts(cmd);
    expect(parts.args).toEqual(["add", "-d", "dialekt"]);
  });

  it("includes all packages in order", () => {
    const cmd = installCommand("npm", ["pkg-a", "pkg-b", "pkg-c"]);
    const parts = extractCommandParts(cmd);
    const pkgIndices = parts.args
      .map((a, i) => (a.startsWith("pkg-") ? i : -1))
      .filter((i) => i >= 0);
    expect(pkgIndices[0]!).toBeLessThan(pkgIndices[1]!);
    expect(pkgIndices[1]!).toBeLessThan(pkgIndices[2]!);
  });
});

// ─── installCommandString ───────────────────────────────────────────────────

describe("installCommandString", () => {
  it("returns pnpm command", () => {
    expect(installCommandString("pnpm", ["dialekt", "@dialekt/adapter-laravel"])).toBe(
      "pnpm add -D dialekt @dialekt/adapter-laravel",
    );
  });

  it("returns npm command", () => {
    expect(installCommandString("npm", ["dialekt"])).toBe("npm install --save-dev dialekt");
  });

  it("returns yarn command", () => {
    expect(installCommandString("yarn", ["dialekt"])).toBe("yarn add -D dialekt");
  });

  it("returns bun command", () => {
    expect(installCommandString("bun", ["dialekt", "@dialekt/adapter-laravel"])).toBe(
      "bun add -d dialekt @dialekt/adapter-laravel",
    );
  });

  it("joins multiple packages with spaces", () => {
    const result = installCommandString("pnpm", ["a", "b", "c"]);
    expect(result).toBe("pnpm add -D a b c");
  });

  it("handles scoped packages correctly", () => {
    const result = installCommandString("npm", ["@scope/pkg", "@other/pkg"]);
    expect(result).toBe("npm install --save-dev @scope/pkg @other/pkg");
  });
});

// ─── runInit ────────────────────────────────────────────────────────────────

describe("runInit", () => {
  it("errors when no adapters are specified", async () => {
    const logs: string[] = [];
    const program = runInit(
      { adapter: [], noInstall: false, pm: Option.none() },
      "/project",
      makeDeps(),
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("No adapters specified");
  });

  it("errors when config already exists", async () => {
    const logs: string[] = [];
    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.none() },
      "/project",
      makeDeps({ configExists: true }),
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("already exists");
  });

  it("does NOT install when config already exists", async () => {
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];
    const deps: InitDeps = {
      exists: () => Effect.succeed(true),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: () => Effect.void,
    };
    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.none() },
      "/project",
      deps,
    );
    await Effect.runPromise(program);
    expect(installCalls).toHaveLength(0);
  });

  it("does NOT write config when it already exists", async () => {
    const written: string[] = [];
    const deps: InitDeps = {
      exists: () => Effect.succeed(true),
      runInstall: () => Effect.void,
      writeFile: (path) => Effect.sync(() => written.push(path)),
    };
    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.none() },
      "/project",
      deps,
    );
    await Effect.runPromise(program);
    expect(written).toHaveLength(0);
  });

  it("initializes with a single adapter", async () => {
    const logs: string[] = [];
    const written: { path: string; content: string }[] = [];
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: (path, content) => Effect.sync(() => written.push({ path, content })),
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.none() },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("dialekt initialized");
    expect(written).toHaveLength(1);
    expect(written[0]!.path).toBe("/project/dialekt.config.ts");
    expect(written[0]!.content).toContain("@dialekt/adapter-laravel");
    expect(installCalls).toHaveLength(1);
    expect(installCalls[0]!.packages).toContain("dialekt");
    expect(installCalls[0]!.packages).toContain("@dialekt/adapter-laravel");
  });

  it("initializes with multiple adapters", async () => {
    const logs: string[] = [];
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel", "paraglide"], noInstall: false, pm: Option.none() },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(installCalls).toHaveLength(1);
    expect(installCalls[0]!.packages).toContain("dialekt");
    expect(installCalls[0]!.packages).toContain("@dialekt/adapter-laravel");
    expect(installCalls[0]!.packages).toContain("@dialekt/adapter-paraglide");
  });

  it("dialekt package is always first in the install list", async () => {
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["npm:@custom/adapter"], noInstall: false, pm: Option.none() },
      "/project",
      deps,
    );
    await Effect.runPromise(program);

    expect(installCalls[0]!.packages[0]).toBe("dialekt");
  });

  it("skips install with --no-install and prints the run command", async () => {
    const logs: string[] = [];
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: true, pm: Option.none() },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(installCalls).toHaveLength(0);
    // When stdout is not a TTY, detectFormat returns json
    // Verify the JSON output contains the correct fields
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.skippedInstall).toBe(true);
    expect(parsed.installCommands[0]).toContain("npm install --save-dev");
    expect(parsed.installCommands[0]).toContain("dialekt");
  });

  it("writes config file even when --no-install", async () => {
    const written: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: (path) => Effect.sync(() => written.push(path)),
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: true, pm: Option.none() },
      "/project",
      deps,
    );
    await Effect.runPromise(program);

    expect(written).toHaveLength(1);
    expect(written[0]).toBe("/project/dialekt.config.ts");
  });

  it("uses cwd to construct the config file path", async () => {
    const written: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: (path) => Effect.sync(() => written.push(path)),
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.none() },
      "/home/user/my-app",
      deps,
    );
    await Effect.runPromise(program);

    expect(written[0]).toBe("/home/user/my-app/dialekt.config.ts");
  });

  it("handles custom npm adapter", async () => {
    const written: { path: string; content: string }[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: (path, content) => Effect.sync(() => written.push({ path, content })),
    };

    const program = runInit(
      { adapter: ["npm:@custom/adapter"], noInstall: false, pm: Option.none() },
      "/project",
      deps,
    );
    await Effect.runPromise(program);

    expect(written).toHaveLength(1);
    expect(written[0]!.content).toContain("import { adapter } from '@custom/adapter';");
    expect(written[0]!.content).toContain("@custom/adapter");
  });

  it("propagates install failures", async () => {
    const deps = makeDeps({ installResult: "fail" });
    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.none() },
      "/project",
      deps,
    );
    await expect(Effect.runPromise(program)).rejects.toThrow("install failed");
  });

  // ── --pm flag ──────────────────────────────────────────────────────────

  it("respects --pm flag over auto-detection", async () => {
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.some("bun" as PackageManager) },
      "/project",
      deps,
    );
    await Effect.runPromise(program);

    expect(installCalls).toHaveLength(1);
    expect(installCalls[0]!.pm).toBe("bun");
  });

  it("--pm overrides auto-detection even when a lockfile exists", async () => {
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];

    const deps: InitDeps = {
      // project has a pnpm-lock.yaml but user explicitly asks for bun
      exists: (path: string) => Effect.succeed(path === "/project/pnpm-lock.yaml"),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.some("bun" as PackageManager) },
      "/project",
      deps,
    );
    await Effect.runPromise(program);

    expect(installCalls[0]!.pm).toBe("bun");
  });

  it("auto-detects pnpm when pnpm-lock.yaml exists and no --pm flag", async () => {
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];

    const deps: InitDeps = {
      exists: (path: string) => Effect.succeed(path === "/project/pnpm-lock.yaml"),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.none() },
      "/project",
      deps,
    );
    await Effect.runPromise(program);

    expect(installCalls[0]!.pm).toBe("pnpm");
  });

  it("--pm npm overrides auto-detection of a pnpm project", async () => {
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];

    const deps: InitDeps = {
      exists: (path: string) => Effect.succeed(path === "/project/pnpm-lock.yaml"),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: false, pm: Option.some("npm" as PackageManager) },
      "/project",
      deps,
    );
    await Effect.runPromise(program);

    expect(installCalls[0]!.pm).toBe("npm");
  });

  // ── --no-install + --pm combined ───────────────────────────────────────

  it("prints correct command when --pm bun --no-install", async () => {
    const logs: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: true, pm: Option.some("bun" as PackageManager) },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(logs[0]).toContain("bun add -d");
    expect(logs[0]).toContain("dialekt");
    expect(logs[0]).toContain("@dialekt/adapter-laravel");
  });

  it("prints correct command when --pm pnpm --no-install", async () => {
    const logs: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: true, pm: Option.some("pnpm" as PackageManager) },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(logs[0]).toContain("pnpm add -D");
    expect(logs[0]).toContain("dialekt");
  });

  it("prints correct command when --pm npm --no-install", async () => {
    const logs: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: true, pm: Option.some("npm" as PackageManager) },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(logs[0]).toContain("npm install --save-dev");
    expect(logs[0]).toContain("dialekt");
  });

  it("printed command includes all adapter packages when --no-install", async () => {
    const logs: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: () => Effect.void,
    };

    const program = runInit(
      {
        adapter: ["laravel", "paraglide"],
        noInstall: true,
        pm: Option.none(),
      },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(logs[0]).toContain("dialekt");
    expect(logs[0]).toContain("@dialekt/adapter-laravel");
    expect(logs[0]).toContain("@dialekt/adapter-paraglide");
  });

  // ── format handling ────────────────────────────────────────────────────

  it("outputs json when format is json", async () => {
    const logs: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: () => Effect.void,
    };

    const program = runInit(
      {
        adapter: ["laravel"],
        noInstall: true,
        pm: Option.none(),
        format: {
          _tag: "Some",
          value: "json",
        } as unknown as import("effect").Option.Option<string>,
      },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(logs).toHaveLength(1);
    const parsed = JSON.parse(logs[0]!);
    expect(parsed.success).toBe(true);
    expect(parsed.configPath).toBe("/project/dialekt.config.ts");
    expect(parsed.packageManager).toBe("npm");
    expect(parsed.skippedInstall).toBe(true);
    expect(parsed.installed).toEqual([]);
    expect(parsed.installCommands).toHaveLength(1);
    expect(parsed.installCommands[0]).toContain("npm install --save-dev");
  });

  it("json format: installCommands is empty when NOT --no-install", async () => {
    const logs: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: () => Effect.void,
    };

    const program = runInit(
      {
        adapter: ["laravel"],
        noInstall: false,
        pm: Option.none(),
        format: {
          _tag: "Some",
          value: "json",
        } as unknown as import("effect").Option.Option<string>,
      },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    const parsed = JSON.parse(logs[0]!);
    expect(parsed.installCommands).toEqual([]);
  });

  it("json format: error message has correct structure", async () => {
    const logs: string[] = [];

    const deps = makeDeps();

    const program = runInit(
      {
        adapter: [],
        noInstall: false,
        pm: Option.none(),
        format: {
          _tag: "Some",
          value: "json",
        } as unknown as import("effect").Option.Option<string>,
      },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    const parsed = JSON.parse(logs[0]!);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toContain("No adapters");
  });

  // ── pretty output checks ───────────────────────────────────────────────

  it("pretty format shows installed list when packages are installed", async () => {
    const logs: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: () => Effect.void,
    };

    const program = runInit(
      {
        adapter: ["laravel"],
        noInstall: false,
        pm: Option.none(),
        format: {
          _tag: "Some",
          value: "pretty",
        } as unknown as import("effect").Option.Option<string>,
      },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(logs[0]).toContain("Installed:");
    expect(logs[0]).toContain("dialekt");
  });

  it("pretty format does NOT show Installed section when --no-install", async () => {
    const logs: string[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: () => Effect.void,
    };

    const program = runInit(
      {
        adapter: ["laravel"],
        noInstall: true,
        pm: Option.none(),
        format: {
          _tag: "Some",
          value: "pretty",
        } as unknown as import("effect").Option.Option<string>,
      },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(logs[0]).not.toContain("Installed:");
  });
});

// ─── formatInit (formatter integration) ─────────────────────────────────────

describe("formatInit", () => {
  it("pretty format shows Run the following when skipped with commands", () => {
    const output = formatInit(
      {
        success: true,
        message: "initialized.",
        skippedInstall: true,
        installCommands: ["npm install --save-dev dialekt @dialekt/adapter-laravel"],
      },
      "pretty",
    );
    expect(output).toContain("Run the following to install");
    expect(output).toContain("npm install --save-dev dialekt @dialekt/adapter-laravel");
  });

  it("pretty format shows generic message when skipped but no commands", () => {
    const output = formatInit(
      {
        success: true,
        message: "initialized.",
        skippedInstall: true,
        installCommands: [],
      },
      "pretty",
    );
    expect(output).toContain("Install skipped");
    expect(output).not.toContain("Run the following");
  });

  it("pretty format includes packageManager when provided", () => {
    const output = formatInit(
      {
        success: true,
        message: "initialized.",
        packageManager: "pnpm",
        installCommands: [],
      },
      "pretty",
    );
    expect(output).toContain("Package manager:");
    expect(output).toContain("pnpm");
  });

  it("pretty format includes configPath when provided", () => {
    const output = formatInit(
      {
        success: true,
        message: "initialized.",
        configPath: "/app/dialekt.config.ts",
        installCommands: [],
      },
      "pretty",
    );
    expect(output).toContain("Config:");
    expect(output).toContain("/app/dialekt.config.ts");
  });

  it("json format includes all fields when successful", () => {
    const output = formatInit(
      {
        success: true,
        message: "initialized.",
        configPath: "/app/dialekt.config.ts",
        packageManager: "bun",
        installed: ["dialekt", "@dialekt/adapter-laravel"],
        skippedInstall: false,
        installCommands: [],
      },
      "json",
    );
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(true);
    expect(parsed.configPath).toBe("/app/dialekt.config.ts");
    expect(parsed.packageManager).toBe("bun");
    expect(parsed.installed).toEqual(["dialekt", "@dialekt/adapter-laravel"]);
    expect(parsed.skippedInstall).toBe(false);
    expect(parsed.installCommands).toEqual([]);
  });

  it("json format: installCommands is included even when skipped is false", () => {
    const output = formatInit(
      {
        success: true,
        message: "initialized.",
        skippedInstall: false,
        installCommands: [],
      },
      "json",
    );
    const parsed = JSON.parse(output);
    expect(parsed.installCommands).toEqual([]);
    expect(parsed.skippedInstall).toBe(false);
  });

  it("json format: installCommands populated when skipped", () => {
    const output = formatInit(
      {
        success: true,
        message: "initialized.",
        skippedInstall: true,
        installCommands: ["pnpm add -D dialekt"],
      },
      "json",
    );
    const parsed = JSON.parse(output);
    expect(parsed.installCommands).toEqual(["pnpm add -D dialekt"]);
  });

  it("json format: failure message is preserved", () => {
    const output = formatInit(
      {
        success: false,
        message: "config already exists.",
      },
      "json",
    );
    const parsed = JSON.parse(output);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toBe("config already exists.");
  });

  it("pretty format: failure is shown as an error", () => {
    const output = formatInit(
      {
        success: false,
        message: "something went wrong",
      },
      "pretty",
    );
    expect(output).not.toContain("Run the following");
    expect(output).not.toContain("Config:");
    expect(output).not.toContain("Package manager:");
  });
});
