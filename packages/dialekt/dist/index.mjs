import { A as UnknownProviderError, C as computeMissingKeys, D as buildSystemPrompt, E as createOneShotStrategy, F as diffKeys, I as flattenObject, L as unflattenObject, M as readFileIfExists, N as writeFileEnsuringDir, O as buildUserPrompt, P as chunkKeys, S as loadConfig, T as createToolLoopStrategy, _ as keyValue, a as formatLanguages, b as warning, c as formatUnusedKeys, d as color, f as detectFormat, g as info, h as glyphs, j as resolveModel, k as TranslationFailedError, l as formatValidate, m as failure, n as formatBenchmark, o as formatMissingKeys, p as drawTable, r as formatError, s as formatTranslate, t as formatAdd, u as banner, v as sectionHeader, w as runTranslation, x as ConfigLoadError, y as success } from "./formatters-C26a4MID.mjs";
import { Data, Effect } from "effect";
import { NodeContext } from "@effect/platform-node";
import { Command } from "@effect/platform";
//#region src/config/define-config.ts
function defineConfig(config) {
	return config;
}
//#endregion
//#region src/adapter/types.ts
var AdapterReadError = class extends Data.TaggedError("AdapterReadError") {};
var AdapterWriteError = class extends Data.TaggedError("AdapterWriteError") {};
//#endregion
//#region src/sdk/node-layer.ts
/**
* The only file in this package (besides cli/main.ts) permitted to know
* this is running on Node.js. Provides FileSystem, Path, and
* CommandExecutor. Swapping to Bun/Deno later means swapping this one
* import for @effect/platform-bun's equivalent — nothing else changes.
*/
const NodePlatformLayer = NodeContext.layer;
//#endregion
//#region src/sdk/php-array-reader.ts
var PhpExecutionError = class extends Data.TaggedError("PhpExecutionError") {};
const DUMP_SCRIPT = "echo json_encode(is_array($v = require $argv[1]) ? $v : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);";
function readPhpArrayAsJson(absolutePath) {
	return Effect.gen(function* () {
		const cmd = Command.make("php", "-r", DUMP_SCRIPT, "--", absolutePath);
		const output = yield* Command.string(cmd).pipe(Effect.mapError((cause) => new PhpExecutionError({
			path: absolutePath,
			cause
		})));
		return yield* Effect.try({
			try: () => JSON.parse(output),
			catch: (cause) => new PhpExecutionError({
				path: absolutePath,
				cause
			})
		});
	});
}
//#endregion
export { AdapterReadError, AdapterWriteError, ConfigLoadError, NodePlatformLayer, PhpExecutionError, TranslationFailedError, UnknownProviderError, banner, buildSystemPrompt, buildUserPrompt, chunkKeys, color, computeMissingKeys, createOneShotStrategy, createToolLoopStrategy, defineConfig, detectFormat, diffKeys, drawTable, failure, flattenObject, formatAdd, formatBenchmark, formatError, formatLanguages, formatMissingKeys, formatTranslate, formatUnusedKeys, formatValidate, glyphs, info, keyValue, loadConfig, readFileIfExists, readPhpArrayAsJson, resolveModel, runTranslation, sectionHeader, success, unflattenObject, warning, writeFileEnsuringDir };
