import { A as resolveModel, C as runTranslation, D as buildUserPrompt, E as buildSystemPrompt, M as diffKeys, N as flattenObject, O as TranslationFailedError, P as unflattenObject, S as computeMissingKeys, T as createOneShotStrategy, _ as sectionHeader, a as formatMissingKeys, b as ConfigLoadError, c as formatValidate, d as detectFormat, f as drawTable, g as keyValue, h as info, i as formatLanguages, j as chunkKeys, k as UnknownProviderError, l as banner, m as glyphs, n as formatBenchmark, o as formatTranslate, p as failure, r as formatError, s as formatUnusedKeys, t as formatAdd, u as color, v as success, w as createToolLoopStrategy, x as loadConfig, y as warning } from "./formatters-De4Q-X1d.mjs";
import { Data, Effect } from "effect";
import { NodeContext } from "@effect/platform-node";
import { Command, FileSystem, Path } from "@effect/platform";
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
//#region src/sdk/file-io.ts
function readFileIfExists(path) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		if (!(yield* fs.exists(path))) return null;
		return yield* fs.readFileString(path);
	});
}
function writeFileEnsuringDir(path, content) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const dir = (yield* Path.Path).dirname(path);
		yield* fs.makeDirectory(dir, { recursive: true });
		yield* fs.writeFileString(path, content);
	});
}
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
