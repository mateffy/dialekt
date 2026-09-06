import { A as UnknownProviderError, C as computeMissingKeys, D as buildSystemPrompt, E as createOneShotStrategy, F as diffKeys, I as flattenObject, L as unflattenObject, M as readFileIfExists, N as writeFileEnsuringDir, O as buildUserPrompt, P as chunkKeys, S as loadConfig, T as createToolLoopStrategy, _ as keyValue, a as formatLanguages, b as warning, c as formatUnusedKeys, d as color, f as detectFormat, g as info, h as glyphs, j as resolveModel, k as TranslationFailedError, l as formatValidate, m as failure, n as formatBenchmark, o as formatMissingKeys, p as drawTable, r as formatError, s as formatTranslate, t as formatAdd, u as banner, v as sectionHeader, w as runTranslation, x as ConfigLoadError, y as success } from "./formatters-vHGsz_IO.mjs";
import { Data, Effect } from "effect";
import { NodeContext } from "@effect/platform-node";
import { Command } from "@effect/platform";
//#region src/config/define-config.ts
const defaultChunking = {
	maxTokens: 3e3,
	charsPerToken: 3,
	concurrency: 5,
	keysPerChunk: 10
};
const defaultRetry = {
	maxAttempts: 3,
	baseDelayMs: 1e3
};
function defineConfig(config) {
	return {
		...config,
		chunking: {
			...defaultChunking,
			...config.chunking
		},
		retry: {
			...defaultRetry,
			...config.retry
		}
	};
}
//#endregion
//#region src/adapter/types.ts
var AdapterReadError = class extends Data.TaggedError("AdapterReadError") {};
var AdapterWriteError = class extends Data.TaggedError("AdapterWriteError") {};
//#endregion
//#region src/icu/types.ts
var IcuParseError = class extends Error {
	_tag = "IcuParseError";
};
//#endregion
//#region src/icu/parser.ts
function parseIcuMessage(input) {
	const nodes = [];
	let pos = 0;
	while (pos < input.length) {
		const braceOpen = input.indexOf("{", pos);
		if (braceOpen === -1) {
			nodes.push(input.slice(pos));
			break;
		}
		if (braceOpen > pos) nodes.push(input.slice(pos, braceOpen));
		const braceClose = findMatchingBrace(input, braceOpen);
		if (braceClose === -1) throw new IcuParseError(`Unmatched brace at ${String(braceOpen)}`);
		nodes.push(parseIcuBlock(input.slice(braceOpen + 1, braceClose)));
		pos = braceClose + 1;
	}
	return nodes;
}
function findMatchingBrace(s, openIdx) {
	let depth = 1;
	for (let i = openIdx + 1; i < s.length; i++) if (s[i] === "{") depth++;
	else if (s[i] === "}") {
		depth--;
		if (depth === 0) return i;
	} else if (s[i] === "'" && s[i - 1] !== "\\") i = skipQuotedString(s, i);
	return -1;
}
function skipQuotedString(s, start) {
	let i = start + 1;
	while (i < s.length && s[i] !== "'") i++;
	return i < s.length ? i : start;
}
function parseIcuBlock(inner) {
	const trimmed = inner.trim();
	const commaIdx = trimmed.indexOf(",");
	if (commaIdx === -1) return {
		type: "variable",
		name: trimmed
	};
	const variable = trimmed.slice(0, commaIdx).trim();
	const rest = trimmed.slice(commaIdx + 1).trim();
	const keywordMatch = /^(\w+)\s*,\s*/.exec(rest);
	if (!keywordMatch) return {
		type: "variable",
		name: variable
	};
	const keyword = keywordMatch[1];
	const afterKeyword = rest.slice(keywordMatch[0].length).trim();
	if (keyword === "plural" || keyword === "selectordinal") return parsePluralBlock(variable, afterKeyword);
	if (keyword === "select") return parseSelectBlock(variable, afterKeyword);
	return {
		type: "variable",
		name: variable
	};
}
function parsePluralBlock(variable, body) {
	let offset;
	let rest = body;
	const offsetMatch = /^offset\s*:\s*(\d+)/i.exec(rest);
	if (offsetMatch) {
		offset = Number(offsetMatch[1]);
		rest = rest.slice(offsetMatch[0].length).trim();
	}
	const forms = {};
	while (rest.length > 0) {
		const formMatch = /^(\w+)\s*\{/.exec(rest);
		if (!formMatch) break;
		const formName = formMatch[1];
		const braceOpen = rest.indexOf("{");
		const braceClose = findMatchingBrace(rest, braceOpen);
		if (braceClose === -1) throw new IcuParseError(`Unmatched brace in plural form ${formName}`);
		forms[formName] = rest.slice(braceOpen + 1, braceClose);
		rest = rest.slice(braceClose + 1).trim();
	}
	return {
		type: "plural",
		variable,
		...offset !== void 0 ? { offset } : {},
		forms
	};
}
function parseSelectBlock(variable, body) {
	const cases = {};
	let rest = body;
	while (rest.length > 0) {
		const caseMatch = /^(\w+)\s*\{/.exec(rest);
		if (!caseMatch) break;
		const caseName = caseMatch[1];
		const braceOpen = rest.indexOf("{");
		const braceClose = findMatchingBrace(rest, braceOpen);
		if (braceClose === -1) throw new IcuParseError(`Unmatched brace in select case ${caseName}`);
		cases[caseName] = rest.slice(braceOpen + 1, braceClose);
		rest = rest.slice(braceClose + 1).trim();
	}
	return {
		type: "select",
		variable,
		cases
	};
}
//#endregion
//#region src/icu/validator.ts
function extractIcuVariables(message) {
	const vars = /* @__PURE__ */ new Set();
	for (const node of parseIcuMessage(message)) if (typeof node === "object") {
		if ("name" in node) vars.add(node.name);
		else if ("variable" in node) vars.add(node.variable);
	}
	return Array.from(vars);
}
function validateIcuPlural(message) {
	try {
		for (const node of parseIcuMessage(message)) if (typeof node === "object" && node.type === "plural" && !("other" in node.forms)) return false;
		return true;
	} catch {
		return false;
	}
}
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
const SINGLE_DUMP = "try { $v = require $argv[1]; } catch (\\Throwable $e) { $v = []; } echo json_encode(is_array($v) ? $v : [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);";
function readPhpArrayAsJson(absolutePath) {
	return Effect.gen(function* () {
		const cmd = Command.make("php", "-r", SINGLE_DUMP, "--", absolutePath);
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
/** Read multiple PHP files in a single PHP process. Returns a map of path → parsed array. */
function readPhpArraysBatch(absolutePaths) {
	if (absolutePaths.length === 0) return Effect.succeed({});
	return Effect.gen(function* () {
		const pathsJson = JSON.stringify(absolutePaths);
		const cmd = Command.make("php", "-r", "$paths = json_decode($argv[1], true); $out = []; foreach ($paths as $p) { try { $v = require $p; } catch (\\Throwable $e) { $v = []; } $out[$p] = is_array($v) ? $v : []; } echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);", "--", pathsJson);
		const output = yield* Command.string(cmd).pipe(Effect.mapError((cause) => new PhpExecutionError({
			path: absolutePaths[0],
			cause
		})));
		return yield* Effect.try({
			try: () => JSON.parse(output),
			catch: (cause) => new PhpExecutionError({
				path: absolutePaths[0],
				cause
			})
		});
	});
}
//#endregion
export { AdapterReadError, AdapterWriteError, ConfigLoadError, IcuParseError, NodePlatformLayer, PhpExecutionError, TranslationFailedError, UnknownProviderError, banner, buildSystemPrompt, buildUserPrompt, chunkKeys, color, computeMissingKeys, createOneShotStrategy, createToolLoopStrategy, defineConfig, detectFormat, diffKeys, drawTable, extractIcuVariables, failure, flattenObject, formatAdd, formatBenchmark, formatError, formatLanguages, formatMissingKeys, formatTranslate, formatUnusedKeys, formatValidate, glyphs, info, keyValue, loadConfig, parseIcuMessage, readFileIfExists, readPhpArrayAsJson, readPhpArraysBatch, resolveModel, runTranslation, sectionHeader, success, unflattenObject, validateIcuPlural, warning, writeFileEnsuringDir };
