import { $ as NodePlatformLayer, A as buildUserPrompt, B as DEFAULT_SCANNERS, C as ConfigLoadError, D as createToolLoopStrategy, E as runTranslation, F as writeFileEnsuringDir, G as scanProjectHardcoded, H as languageForFile, I as chunkKeys, J as DEFAULT_HARDCODED_MIN_LENGTH, K as bladeScanner, L as diffKeys, M as UnknownProviderError, N as resolveModel, O as createOneShotStrategy, P as readFileIfExists, Q as resolveHardcodedOptions, R as flattenObject, S as warning, T as computeMissingKeys, U as normalizePath, V as isIgnoredFinding, W as scanHardcoded, X as isIgnoredAttribute, Y as DEFAULT_IGNORED_ATTRIBUTES, Z as isLikelyTranslatable, _ as glyphs, a as formatError, b as sectionHeader, c as formatMissingKeys, d as formatValidate, et as HardcodedScanError, f as banner, g as failure, h as drawTable, i as formatBenchmark, j as TranslationFailedError, k as buildSystemPrompt, l as formatTranslate, m as detectFormat, n as formatHardcoded, p as color, q as jsxScanner, r as formatAdd, s as formatLanguages, t as formatDoctor, u as formatUnusedKeys, v as info, w as loadConfig, x as success, y as keyValue, z as unflattenObject } from "./hardcoded-formatters-B7waLxzt.mjs";
import { Data, Effect } from "effect";
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
export { AdapterReadError, AdapterWriteError, ConfigLoadError, DEFAULT_HARDCODED_MIN_LENGTH, DEFAULT_IGNORED_ATTRIBUTES, DEFAULT_SCANNERS, HardcodedScanError, IcuParseError, NodePlatformLayer, PhpExecutionError, TranslationFailedError, UnknownProviderError, banner, bladeScanner, buildSystemPrompt, buildUserPrompt, chunkKeys, color, computeMissingKeys, createOneShotStrategy, createToolLoopStrategy, defineConfig, detectFormat, diffKeys, drawTable, extractIcuVariables, failure, flattenObject, formatAdd, formatBenchmark, formatDoctor, formatError, formatHardcoded, formatLanguages, formatMissingKeys, formatTranslate, formatUnusedKeys, formatValidate, glyphs, info, isIgnoredAttribute, isIgnoredFinding, isLikelyTranslatable, jsxScanner, keyValue, languageForFile, loadConfig, normalizePath, parseIcuMessage, readFileIfExists, readPhpArrayAsJson, readPhpArraysBatch, resolveHardcodedOptions, resolveModel, runTranslation, scanHardcoded, scanProjectHardcoded, sectionHeader, success, unflattenObject, validateIcuPlural, warning, writeFileEnsuringDir };
