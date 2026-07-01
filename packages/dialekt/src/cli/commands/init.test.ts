import { describe, expect, it } from "vitest";
import { Effect } from "effect";
import {
  resolveAdapter,
  buildConfigContent,
  detectPackageManager,
  runInit,
  installCommand,
  type InitDeps,
  type PackageManager,
} from "./init.js";

describe("resolveAdapter", () => {
  it("maps laravel to the correct package", () => {
    const a = resolveAdapter("laravel");
    expect(a.packageName).toBe("@dialekt/adapter-laravel");
    expect(a.importName).toBe("laravel");
    expect(a.configCall).toContain("langDir");
  });

  it("maps paraglide to the correct package", () => {
    const a = resolveAdapter("paraglide");
    expect(a.packageName).toBe("@dialekt/adapter-paraglide");
    expect(a.importName).toBe("paraglide");
    expect(a.configCall).toContain("messagesDir");
  });

  it("strips npm: prefix", () => {
    const a = resolveAdapter("npm:@custom/adapter");
    expect(a.packageName).toBe("@custom/adapter");
    expect(a.importName).toBe("adapter");
  });

  it("uses raw package name when no prefix", () => {
    const a = resolveAdapter("my-translator");
    expect(a.packageName).toBe("my-translator");
    expect(a.importName).toBe("my_translator");
  });
});

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
});

describe("detectPackageManager", () => {
  function makeFs(existsMap: Record<string, boolean>) {
    return {
      exists: (p: string) => Effect.succeed(existsMap[p] ?? false),
    };
  }

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

  it("defaults to npm when no lockfile found", async () => {
    const pm = await Effect.runPromise(detectPackageManager(makeFs({}), "/project"));
    expect(pm).toBe("npm");
  });
});

describe("installCommand", () => {
  it("builds pnpm command", () => {
    const cmd = installCommand("pnpm", ["dialekt", "@dialekt/adapter-laravel"]);
    expect(cmd).toBeDefined();
  });

  it("builds npm command", () => {
    const cmd = installCommand("npm", ["dialekt"]);
    expect(cmd).toBeDefined();
  });

  it("builds yarn command", () => {
    const cmd = installCommand("yarn", ["dialekt"]);
    expect(cmd).toBeDefined();
  });

  it("builds bun command", () => {
    const cmd = installCommand("bun", ["dialekt"]);
    expect(cmd).toBeDefined();
  });
});

describe("runInit", () => {
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

  it("errors when no adapters are specified", async () => {
    const logs: string[] = [];
    const program = runInit(
      { adapter: [], noInstall: false },
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
      { adapter: ["laravel"], noInstall: false },
      "/project",
      makeDeps({ configExists: true }),
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("already exists");
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
      { adapter: ["laravel"], noInstall: false },
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
      { adapter: ["laravel", "paraglide"], noInstall: false },
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

  it("skips install with --no-install", async () => {
    const logs: string[] = [];
    const installCalls: { pm: PackageManager; packages: ReadonlyArray<string> }[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: (pm, packages) => Effect.sync(() => installCalls.push({ pm, packages })),
      writeFile: () => Effect.void,
    };

    const program = runInit(
      { adapter: ["laravel"], noInstall: true },
      "/project",
      deps,
      (msg: string) => Effect.sync(() => logs.push(msg)),
    );
    await Effect.runPromise(program);

    expect(installCalls).toHaveLength(0);
    expect(logs[0]).toContain("skipped");
  });

  it("handles custom npm adapter", async () => {
    const written: { path: string; content: string }[] = [];

    const deps: InitDeps = {
      exists: () => Effect.succeed(false),
      runInstall: () => Effect.void,
      writeFile: (path, content) => Effect.sync(() => written.push({ path, content })),
    };

    const program = runInit(
      { adapter: ["npm:@custom/adapter"], noInstall: false },
      "/project",
      deps,
    );
    await Effect.runPromise(program);

    expect(written).toHaveLength(1);
    expect(written[0]!.content).toContain("import { adapter } from '@custom/adapter';");
    expect(written[0]!.content).toContain("@custom/adapter");
  });

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
  });

  it("propagates install failures", async () => {
    const deps = makeDeps({ installResult: "fail" });
    const program = runInit({ adapter: ["laravel"], noInstall: false }, "/project", deps);
    await expect(Effect.runPromise(program)).rejects.toThrow("install failed");
  });
});
