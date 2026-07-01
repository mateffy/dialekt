import { describe, expect, it } from "vitest";
import { Effect, Either } from "effect";
import { loadConfig, ConfigLoadError } from "./load-config.js";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  it("loads a valid dialekt.config.ts", async () => {
    const dir = join(tmpdir(), `dialekt-load-config-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const configPath = join(dir, "dialekt.config.ts");
    writeFileSync(
      configPath,
      `export default { sourceLocale: 'en', targetLocales: ['de'], strategy: 'one-shot', model: { provider: 'openai', modelId: 'gpt-4o' }, fastModel: { provider: 'openai', modelId: 'gpt-4o-mini' }, chunking: { maxTokens: 3000, charsPerToken: 3.0, concurrency: 3 }, retry: { maxAttempts: 3, baseDelayMs: 1000 }, adapters: [] };`,
    );

    const result = await Effect.runPromise(loadConfig(configPath));
    expect(result.sourceLocale).toBe("en");
    expect(result.targetLocales).toEqual(["de"]);

    rmSync(dir, { recursive: true, force: true });
  });

  it("returns ConfigLoadError for a nonexistent path", async () => {
    const program = loadConfig("/nonexistent/path/config.ts");
    const exit = (await Effect.runPromise(Effect.either(program))) as Either.Either<
      unknown,
      ConfigLoadError
    >;
    if (exit._tag === "Left") {
      expect(exit.left._tag).toBe("ConfigLoadError");
      expect(exit.left.path).toBe("/nonexistent/path/config.ts");
    } else {
      throw new Error("Expected Left");
    }
  });
});
