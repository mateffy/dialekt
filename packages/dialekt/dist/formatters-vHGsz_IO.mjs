import { Data, Effect, Schedule } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { Output, ToolLoopAgent, generateText, hasToolCall, tool } from "ai";
import { z } from "zod";
import { createJiti } from "jiti";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
//#region src/keys/flatten.ts
function flattenObject(input, prefix = "") {
	const output = {};
	for (const [key, value] of Object.entries(input)) {
		const fullKey = prefix === "" ? key : `${prefix}.${key}`;
		if (typeof value === "object" && value !== null && !Array.isArray(value)) Object.assign(output, flattenObject(value, fullKey));
		else if (typeof value === "string") output[fullKey] = value;
	}
	return output;
}
/**
* Unflatten dot-separated keys into a nested object.
*
* Special handling: when the input has BOTH a plain scalar key (e.g. `password`)
* AND dotted keys that would nest under it (e.g. `password.letters`), the dotted
* keys are kept as literal dot-containing keys at the top level — they are NOT
* nested. This preserves round-trip fidelity for PHP files that use dot-notation
* keys alongside plain scalar keys.
*/
function unflattenObject(input) {
	const conflictParent = /* @__PURE__ */ new Set();
	for (const key of Object.keys(input)) {
		const dot = key.indexOf(".");
		if (dot < 0) continue;
		const parent = key.slice(0, dot);
		if (input[parent] !== void 0) conflictParent.add(parent);
	}
	const output = {};
	for (const [key, value] of Object.entries(input)) {
		if (conflictParent.size > 0) {
			const dot = key.indexOf(".");
			if (dot > 0 && conflictParent.has(key.slice(0, dot))) {
				output[key] = value;
				continue;
			}
			if (conflictParent.has(key)) {
				output[key] = value;
				continue;
			}
		}
		const segments = key.split(".");
		let cursor = output;
		for (let i = 0; i < segments.length - 1; i++) {
			const segment = segments[i];
			const existing = cursor[segment];
			if (typeof existing !== "object" || existing === null || Array.isArray(existing)) cursor[segment] = {};
			cursor = cursor[segment];
		}
		cursor[segments[segments.length - 1]] = value;
	}
	return output;
}
function diffKeys(source, target) {
	return Object.keys(source).filter((key) => !(key in target));
}
//#endregion
//#region src/translation/chunking.ts
const PROMPT_OVERHEAD = 600;
const ITEM_JSON_OVERHEAD = 20;
const MIN_EFFECTIVE_MAX_CHARS = 200;
function chunkKeys(keys, sourceMap, targetMap, config) {
	if (config.keysPerChunk !== void 0 && config.keysPerChunk > 0) {
		const size = config.keysPerChunk;
		const out = [];
		for (let i = 0; i < keys.length; i += size) out.push(keys.slice(i, i + size));
		return out;
	}
	const maxChars = config.maxTokens * config.charsPerToken;
	const effectiveMaxChars = Math.max(MIN_EFFECTIVE_MAX_CHARS, maxChars - PROMPT_OVERHEAD);
	const chunks = [];
	let currentChunk = [];
	let currentChars = 0;
	for (const key of keys) {
		const value = sourceMap[key] ?? "";
		const itemChars = key.length + value.length + ITEM_JSON_OVERHEAD;
		if (itemChars > effectiveMaxChars && currentChunk.length === 0) {
			chunks.push([key]);
			continue;
		}
		if (currentChunk.length > 0 && currentChars + itemChars > effectiveMaxChars) {
			chunks.push(currentChunk);
			currentChunk = [];
			currentChars = 0;
		}
		currentChunk.push(key);
		currentChars += itemChars;
	}
	if (currentChunk.length > 0) chunks.push(currentChunk);
	if (chunks.length === 0 && keys.length > 0) return keys.map((key) => [key]);
	return chunks;
}
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
//#region src/translation/model-registry.ts
var UnknownProviderError = class extends Data.TaggedError("UnknownProviderError") {};
function isLanguageModel(v) {
	return typeof v.doGenerate === "function" || typeof v.specificationVersion !== "undefined";
}
/**
* The one file in the entire codebase allowed to import AI SDK provider packages.
* Accepts both { provider, modelId } specs and live LanguageModel instances.
*/
function resolveModel(config) {
	return Effect.gen(function* () {
		if (isLanguageModel(config)) return config;
		const { provider, modelId } = config;
		return yield* Effect.tryPromise({
			try: async () => {
				switch (provider) {
					case "openai": {
						const { openai } = await import("@ai-sdk/openai");
						return openai(modelId);
					}
					case "openrouter": {
						const { createOpenAI } = await import("@ai-sdk/openai");
						return createOpenAI({
							baseURL: "https://openrouter.ai/api/v1",
							apiKey: process.env.OPENROUTER_API_KEY ?? ""
						})(modelId);
					}
					case "anthropic": {
						const { anthropic } = await import("@ai-sdk/anthropic");
						return anthropic(modelId);
					}
					case "google": {
						const { google } = await import("@ai-sdk/google");
						return google(modelId);
					}
					default: throw new UnknownProviderError({ provider });
				}
			},
			catch: (cause) => cause instanceof UnknownProviderError ? cause : new UnknownProviderError({ provider })
		});
	});
}
//#endregion
//#region src/translation/types.ts
var TranslationFailedError = class extends Data.TaggedError("TranslationFailedError") {};
//#endregion
//#region src/translation/prompt.ts
function buildSystemPrompt(from, to) {
	return `You are a professional software translator specializing in application localization.
You translate language strings from ${from} to ${to}.

Rules:
- Maintain consistent tone, formality, and terminology with existing translations.
- Do not translate proper nouns, brand names, or technical identifiers unless localization is standard.
- Preserve placeholders like :attribute, :min, :max, etc. Do not translate them.
- Use the exact same placeholder format as the source string.
- Return ONLY the requested keys. Do not add or remove keys.
- Do not escape Unicode characters with \\u notation. Write them directly.
- Escape double quotes in translations with a backslash when needed.`;
}
function buildUserPrompt(ctx) {
	const sourceJson = JSON.stringify(ctx.sourceMap, null, 2);
	const targetJson = JSON.stringify(ctx.targetMap, null, 2);
	const keysWithValues = {};
	for (const key of ctx.keys) keysWithValues[key] = ctx.sourceMap[key] ?? "";
	const keysJson = JSON.stringify(keysWithValues, null, 2);
	return `Translate the following language strings from ${ctx.sourceLocale} to ${ctx.targetLocale}.

<source-file>
${sourceJson}
</source-file>

<existing-translations>
${targetJson}
</existing-translations>

<keys-to-translate>
${keysJson}
</keys-to-translate>

Translate ALL keys listed in <keys-to-translate>. Use the existing translations and source file as context for consistency.`;
}
//#endregion
//#region src/translation/one-shot-strategy.ts
function tryTranslateChunk$1(model, ctx, onTrace) {
	return Effect.gen(function* () {
		const schema = z.object(Object.fromEntries(ctx.keys.map((key) => [key, z.string()])));
		const start = Date.now();
		const result = yield* Effect.tryPromise({
			try: () => generateText({
				model,
				system: buildSystemPrompt(ctx.sourceLocale, ctx.targetLocale),
				prompt: buildUserPrompt(ctx),
				output: Output.object({ schema })
			}),
			catch: (cause) => new Error(String(cause))
		});
		const durationMs = Date.now() - start;
		const output = result.output;
		onTrace?.({
			sourceLocale: ctx.sourceLocale,
			targetLocale: ctx.targetLocale,
			...ctx.resource !== void 0 ? { resource: ctx.resource } : {},
			keys: ctx.keys,
			sourceTexts: ctx.sourceMap,
			text: result.text ?? "",
			output,
			durationMs,
			promptTokens: result.usage?.promptTokens ?? result.usage?.inputTokens ?? 0,
			completionTokens: result.usage?.completionTokens ?? result.usage?.outputTokens ?? 0
		});
		const missing = ctx.keys.filter((key) => !(key in output));
		if (missing.length > 0) return yield* Effect.fail(/* @__PURE__ */ new Error(`Model omitted keys: ${missing.join(", ")}`));
		return output;
	});
}
function createOneShotStrategy(deps) {
	return {
		name: "one-shot",
		translateChunk: (ctx) => tryTranslateChunk$1(deps.model, ctx, deps.onTrace).pipe(Effect.retry(Schedule.exponential(`${deps.retry.baseDelayMs} millis`).pipe(Schedule.compose(Schedule.recurs(deps.retry.maxAttempts - 1)))), Effect.mapError((cause) => new TranslationFailedError({
			keys: ctx.keys,
			cause
		})))
	};
}
//#endregion
//#region src/translation/tool-loop-strategy.ts
function tryTranslateChunk(model, ctx, onTrace) {
	return Effect.gen(function* () {
		const schema = z.object(Object.fromEntries(ctx.keys.map((key) => [key, z.string()])));
		let captured = null;
		const submitTranslations = tool({
			description: "Submit the final translations for every requested key. Call this exactly once, with every key filled in.",
			inputSchema: schema,
			execute: (input) => {
				captured = input;
				return Promise.resolve({ ok: true });
			}
		});
		const agent = new ToolLoopAgent({
			model,
			instructions: buildSystemPrompt(ctx.sourceLocale, ctx.targetLocale),
			tools: { submitTranslations },
			stopWhen: hasToolCall("submitTranslations")
		});
		yield* Effect.tryPromise({
			try: () => agent.generate({ prompt: buildUserPrompt(ctx) }),
			catch: (cause) => new Error(String(cause))
		});
		if (captured === null) return yield* Effect.fail(/* @__PURE__ */ new Error("Agent finished without calling submitTranslations"));
		const result = captured;
		onTrace?.({
			sourceLocale: ctx.sourceLocale,
			targetLocale: ctx.targetLocale,
			keys: ctx.keys,
			sourceTexts: ctx.sourceMap,
			text: "",
			output: result,
			durationMs: 0,
			promptTokens: 0,
			completionTokens: 0,
			...ctx.resource !== void 0 ? { resource: ctx.resource } : {}
		});
		const missing = ctx.keys.filter((key) => !(key in result));
		if (missing.length > 0) return yield* Effect.fail(/* @__PURE__ */ new Error(`Model omitted keys: ${missing.join(", ")}`));
		return result;
	});
}
function createToolLoopStrategy(deps) {
	return {
		name: "tool-loop-agent",
		translateChunk: (ctx) => tryTranslateChunk(deps.model, ctx, deps.onTrace).pipe(Effect.retry(Schedule.exponential(`${deps.retry.baseDelayMs} millis`).pipe(Schedule.compose(Schedule.recurs(deps.retry.maxAttempts - 1)))), Effect.mapError((cause) => new TranslationFailedError({
			keys: ctx.keys,
			cause
		})))
	};
}
//#endregion
//#region src/translation/orchestrator.ts
/**
* Translate missing keys in one resource file. Chunks translate serially within
* a resource so we can write after each chunk (resumability). Different resources
* run in parallel since they write to different files.
*/
function translateResource(adapter, strategy, chunking, sourceLocale, targetLocale, resource, failures, onProgress) {
	return Effect.gen(function* () {
		const sourceMap = yield* adapter.readResource(sourceLocale, resource);
		const targetMap = yield* adapter.readResource(targetLocale, resource);
		const missing = diffKeys(sourceMap, targetMap);
		if (missing.length === 0) return;
		const chunkCfg = {
			maxTokens: chunking.maxTokens,
			charsPerToken: chunking.charsPerToken
		};
		if (chunking.keysPerChunk !== void 0) chunkCfg.keysPerChunk = chunking.keysPerChunk;
		const chunks = chunkKeys(missing, sourceMap, targetMap, chunkCfg);
		const ctx = {
			sourceLocale,
			targetLocale,
			sourceMap,
			targetMap
		};
		const merged = { ...targetMap };
		for (const keys of chunks) {
			const chunkCtx = {
				...ctx,
				keys,
				resource: resource.label
			};
			onProgress?.({
				type: "chunk-start",
				locale: targetLocale,
				resource: resource.label
			});
			const result = yield* Effect.either(strategy.translateChunk(chunkCtx));
			if (result._tag === "Right") {
				Object.assign(merged, result.right);
				yield* adapter.writeResource(targetLocale, resource, { ...merged });
				onProgress?.({
					type: "chunk-complete",
					locale: targetLocale,
					resource: resource.label
				});
			} else {
				failures.push(result.left);
				onProgress?.({
					type: "chunk-fail",
					locale: targetLocale,
					resource: resource.label
				});
			}
		}
	});
}
function runTranslation(config, onProgress) {
	return Effect.gen(function* () {
		const failures = [];
		for (const adapter of config.adapters) {
			const allLocales = yield* adapter.listLocales();
			const sourceLocale = config.sourceLocale;
			let targetLocales = config.targetLocales.length > 0 ? config.targetLocales.filter((l) => l !== sourceLocale) : allLocales.filter((l) => l !== sourceLocale);
			if (targetLocales.length === 0) targetLocales = allLocales.filter((l) => l !== sourceLocale);
			const localeJobs = [];
			for (const locale of targetLocales) {
				const allRes = yield* adapter.listResources(sourceLocale);
				const filtered = config.resourceFilter ? allRes.filter((r) => r.key === config.resourceFilter || r.label === config.resourceFilter || r.key.startsWith(config.resourceFilter)) : allRes;
				let totalMissing = 0;
				let totalChunks = 0;
				for (const resource of filtered) {
					const srcMap = yield* adapter.readResource(sourceLocale, resource);
					const tgtMap = yield* adapter.readResource(locale, resource);
					const missing = diffKeys(srcMap, tgtMap);
					totalMissing += missing.length;
					if (missing.length > 0) {
						const c = chunkKeys(missing, srcMap, tgtMap, {
							maxTokens: config.chunking.maxTokens,
							charsPerToken: config.chunking.charsPerToken,
							...config.chunking.keysPerChunk !== void 0 ? { keysPerChunk: config.chunking.keysPerChunk } : {}
						});
						totalChunks += c.length;
					}
				}
				onProgress?.({
					type: "locale-scanned",
					locale,
					missingKeys: totalMissing,
					chunksTotal: totalChunks
				});
				localeJobs.push({
					locale,
					resources: [...filtered]
				});
			}
			yield* Effect.forEach(localeJobs, ({ locale, resources }) => Effect.gen(function* () {
				onProgress?.({
					type: "locale-start",
					locale,
					resourcesTotal: resources.length
				});
				let chOk = 0;
				let chFail = 0;
				if ((yield* Effect.forEach(resources, (res) => translateResource(adapter, config.strategy, {
					maxTokens: config.chunking.maxTokens,
					charsPerToken: config.chunking.charsPerToken,
					...config.chunking.keysPerChunk !== void 0 ? { keysPerChunk: config.chunking.keysPerChunk } : {}
				}, sourceLocale, locale, res, failures, (e) => {
					if (e.type === "chunk-complete") chOk++;
					else if (e.type === "chunk-fail") chFail++;
					onProgress?.(e);
				}).pipe(Effect.either), {
					concurrency: config.chunking.concurrency,
					discard: false
				})).some((r) => r._tag === "Left") || chFail > 0) onProgress?.({
					type: "locale-error",
					locale
				});
				else onProgress?.({
					type: "locale-done",
					locale
				});
			}), { concurrency: config.chunking.concurrency });
		}
		if (failures.length > 0) return yield* Effect.fail(new TranslationFailedError({
			keys: failures.flatMap((f) => [...f.keys]),
			cause: failures.map((f) => f.cause)
		}));
	});
}
//#endregion
//#region src/translation/missing-keys.ts
function computeMissingKeys(adapter, sourceLocale, targetLocales) {
	return Effect.gen(function* () {
		const resources = yield* adapter.listResources(sourceLocale);
		return (yield* Effect.forEach(resources, (resource) => Effect.gen(function* () {
			const sourceMap = yield* adapter.readResource(sourceLocale, resource);
			return (yield* Effect.forEach(targetLocales, (locale) => Effect.gen(function* () {
				const missing = diffKeys(sourceMap, yield* adapter.readResource(locale, resource));
				return missing.length > 0 ? [{
					adapter: adapter.name,
					locale,
					resource,
					missing
				}] : [];
			}), { concurrency: targetLocales.length })).flat();
		}), { concurrency: Math.min(resources.length, 10) })).flat();
	});
}
//#endregion
//#region src/config/load-config.ts
/** Parse a simple KEY=VAL .env file. Returns a map, skips comments and blanks. */
function parseEnvFile(path) {
	const out = {};
	for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq < 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let val = trimmed.slice(eq + 1).trim();
		if (val.startsWith("\"") && val.endsWith("\"") || val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
		out[key] = val;
	}
	return out;
}
var ConfigLoadError = class extends Data.TaggedError("ConfigLoadError") {};
/** Package specifiers the config file might import that jiti can't resolve from cwd. */
const knownSpecifiers = [
	"dialekt",
	"@dialekt/adapter-android",
	"@dialekt/adapter-arb",
	"@dialekt/adapter-csv",
	"@dialekt/adapter-ios",
	"@dialekt/adapter-json",
	"@dialekt/adapter-laravel",
	"@dialekt/adapter-paraglide",
	"@dialekt/adapter-po",
	"@dialekt/adapter-properties",
	"@dialekt/adapter-xliff",
	"@dialekt/adapter-yaml"
];
function loadConfig(configPath) {
	return Effect.tryPromise({
		try: async () => {
			const virtualModules = {};
			for (const spec of knownSpecifiers) try {
				virtualModules[spec] = await import(spec);
			} catch {}
			const jiti = createJiti(process.cwd(), { virtualModules });
			const absolutePath = resolve(configPath);
			const mod = await jiti.import(absolutePath, { default: true });
			for (const envPath of mod.env ?? []) {
				const resolved = resolve(envPath);
				if (existsSync(resolved)) for (const [k, v] of Object.entries(parseEnvFile(resolved))) process.env[k] ??= v;
			}
			return mod;
		},
		catch: (cause) => new ConfigLoadError({
			path: configPath,
			cause
		})
	});
}
//#endregion
//#region src/cli/format.ts
/**
* Environment variables that signal dialekt is running inside an AI agent.
* When any is set (truthy), or stdout is not a TTY, JSON mode is the default.
*/
const AGENT_ENV_VARS = [
	"CLAUDE_CODE",
	"CLAUDECODE",
	"CURSOR",
	"CURSOR_TRACE_ID",
	"DEVIN",
	"GEMINI_CLI",
	"AGENT_TASK_ID",
	"AIDER_CHAT"
];
/**
* Resolves the output format from explicit flag and environment.
* Precedence: explicit `--format` > auto-detection.
*
* Auto-detection picks `json` when stdout is not a TTY or an agent env var
* is present; otherwise `pretty`.
*/
function detectFormat(explicit) {
	if (explicit !== void 0) return explicit;
	if (!process.stdout.isTTY) return "json";
	if (AGENT_ENV_VARS.some((k) => process.env[k])) return "json";
	return "pretty";
}
const C$1 = {
	reset: "\x1B[0m",
	bold: "\x1B[1m",
	dim: "\x1B[2m",
	red: "\x1B[31m",
	green: "\x1B[32m",
	yellow: "\x1B[33m",
	blue: "\x1B[34m",
	cyan: "\x1B[36m",
	white: "\x1B[37m"
};
function isTty() {
	return process.stdout.isTTY === true;
}
/** Wraps text in ANSI codes only when stdout is a TTY; otherwise returns it bare. */
function color(text, ...codes) {
	if (!isTty()) return text;
	return `${codes.join("")}${text}${C$1.reset}`;
}
const PRETTY_GLYPHS = {
	hLine: String.fromCharCode(9472),
	vLine: String.fromCharCode(9474),
	cornerTL: String.fromCharCode(9484),
	cornerTR: String.fromCharCode(9488),
	cornerBL: String.fromCharCode(9492),
	cornerBR: String.fromCharCode(9496),
	teeRight: String.fromCharCode(9500),
	teeLeft: String.fromCharCode(9508),
	teeDown: String.fromCharCode(9516),
	teeUp: String.fromCharCode(9524),
	cross: String.fromCharCode(9532),
	bullet: String.fromCharCode(8226),
	arrow: String.fromCharCode(8594),
	check: String.fromCharCode(10003),
	crossMark: String.fromCharCode(10007),
	warn: String.fromCharCode(9888)
};
const ASCII_GLYPHS = {
	hLine: "-",
	vLine: "|",
	cornerTL: "+",
	cornerTR: "+",
	cornerBL: "+",
	cornerBR: "+",
	teeRight: "+",
	teeLeft: "+",
	teeDown: "+",
	teeUp: "+",
	cross: "+",
	bullet: "*",
	arrow: ">",
	check: "+",
	crossMark: "x",
	warn: "!"
};
function glyphs() {
	return isTty() ? PRETTY_GLYPHS : ASCII_GLYPHS;
}
function drawTable(headers, rows) {
	const g = glyphs();
	const colWidths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)));
	const pad = (text, width) => text.padEnd(width);
	const hLine = g.cornerTL + colWidths.map((w) => g.hLine.repeat(w + 2)).join(g.teeDown) + g.cornerTR;
	const headerRow = g.vLine + headers.map((h, i) => ` ${color(pad(h, colWidths[i]), C$1.bold)} `).join(g.vLine) + g.vLine;
	const separator = g.teeRight + colWidths.map((w) => g.hLine.repeat(w + 2)).join(g.cross) + g.teeLeft;
	const dataRows = rows.map((row) => g.vLine + row.map((cell, i) => ` ${pad(cell, colWidths[i])} `).join(g.vLine) + g.vLine);
	const bottomLine = g.cornerBL + colWidths.map((w) => g.hLine.repeat(w + 2)).join(g.teeUp) + g.cornerBR;
	return [
		hLine,
		headerRow,
		separator,
		...dataRows,
		bottomLine
	].join("\n");
}
const BANNER_SIDE_PADDING = 4;
const BANNER_MIN_WIDTH = 40;
function banner(title) {
	const line = glyphs().hLine.repeat(Math.max(title.length + BANNER_SIDE_PADDING, BANNER_MIN_WIDTH));
	return `${color(line, C$1.dim)}\n  ${color(title, C$1.bold + C$1.cyan)}\n${color(line, C$1.dim)}`;
}
function sectionHeader(label) {
	return `\n${color(`${glyphs().arrow} ${label}`, C$1.bold + C$1.cyan)}`;
}
function success(text) {
	return `${color(`${glyphs().check} ${text}`, C$1.green)}`;
}
function failure(text) {
	return `${color(`${glyphs().crossMark} ${text}`, C$1.red)}`;
}
function warning(text) {
	return `${color(`${glyphs().warn} ${text}`, C$1.yellow)}`;
}
function info(text) {
	return color(text, C$1.dim);
}
function keyValue(key, value) {
	return `  ${color(key, C$1.bold)} ${value}`;
}
//#endregion
//#region src/cli/formatters.ts
/**
* Command-specific formatters for the dialekt CLI output.
*
* Imports the core utilities from `format.ts` and builds structured
* pretty / JSON renderers for each dialekt command.
*/
const C = {
	reset: "\x1B[0m",
	bold: "\x1B[1m",
	dim: "\x1B[2m",
	red: "\x1B[31m",
	green: "\x1B[32m",
	yellow: "\x1B[33m",
	blue: "\x1B[34m",
	cyan: "\x1B[36m"
};
const D = C.dim;
const W = C.reset;
function formatMissingKeys(entries, format) {
	if (format === "json") return JSON.stringify(entries, null, 2) + "\n";
	if (entries.length === 0) return success("All translations are complete. No missing keys.") + "\n";
	const grouped = /* @__PURE__ */ new Map();
	for (const e of entries) {
		const byAdapter = grouped.get(e.adapter) ?? /* @__PURE__ */ new Map();
		const byLocale = byAdapter.get(e.locale) ?? /* @__PURE__ */ new Map();
		const keys = byLocale.get(e.resource) ?? [];
		keys.push(e.key);
		byLocale.set(e.resource, keys);
		byAdapter.set(e.locale, byLocale);
		grouped.set(e.adapter, byAdapter);
	}
	const lines = [];
	const g = glyphs();
	const total = entries.length;
	lines.push(sectionHeader(`Missing keys (${total})`));
	for (const [adapter, byLocale] of grouped) {
		let adapterTotal = 0;
		for (const byResource of byLocale.values()) for (const keys of byResource.values()) adapterTotal += keys.length;
		lines.push(`\n  ${color(adapter, C.bold + C.blue)} ${color(`(${adapterTotal})`, C.dim)}`);
		for (const [locale, byResource] of byLocale) {
			let localeTotal = 0;
			for (const keys of byResource.values()) localeTotal += keys.length;
			lines.push(`    ${color(`${g.arrow} ${locale}`, C.yellow)} ${color(`(${localeTotal})`, C.dim)}`);
			for (const [resource, keys] of byResource) {
				lines.push(`      ${color(resource, C.bold)}`);
				for (const key of keys) lines.push(`        ${color(g.bullet, C.dim)} ${key}`);
			}
		}
	}
	return lines.join("\n") + "\n";
}
function formatUnusedKeys(entries, format) {
	if (format === "json") return JSON.stringify(entries, null, 2) + "\n";
	if (entries.length === 0) return success("All keys are referenced in source files. No unused keys.") + "\n";
	const grouped = /* @__PURE__ */ new Map();
	for (const e of entries) {
		const byAdapter = grouped.get(e.adapter) ?? /* @__PURE__ */ new Map();
		const byLocale = byAdapter.get(e.locale) ?? /* @__PURE__ */ new Map();
		const keys = byLocale.get(e.resource) ?? [];
		keys.push(e.key);
		byLocale.set(e.resource, keys);
		byAdapter.set(e.locale, byLocale);
		grouped.set(e.adapter, byAdapter);
	}
	const lines = [];
	const g = glyphs();
	const total = entries.length;
	lines.push(sectionHeader(`Unused keys (${total})`));
	for (const [adapter, byLocale] of grouped) {
		let adapterTotal = 0;
		for (const byResource of byLocale.values()) for (const keys of byResource.values()) adapterTotal += keys.length;
		lines.push(`\n  ${color(adapter, C.bold + C.blue)} ${color(`(${adapterTotal})`, C.dim)}`);
		for (const [locale, byResource] of byLocale) {
			let localeTotal = 0;
			for (const keys of byResource.values()) localeTotal += keys.length;
			lines.push(`    ${color(`${g.arrow} ${locale}`, C.yellow)} ${color(`(${localeTotal})`, C.dim)}`);
			for (const [resource, keys] of byResource) {
				lines.push(`      ${color(resource, C.bold)}`);
				for (const key of keys) lines.push(`        ${color(g.bullet, C.dim)} ${key}`);
			}
		}
	}
	return lines.join("\n") + "\n";
}
function formatValidate(result, format) {
	if (format === "json") return JSON.stringify(result, null, 2) + "\n";
	if (result.passing) return "\n" + success("All translations are up to date.") + "\n";
	const rows = result.entries.map((e) => [
		e.adapter,
		e.locale,
		e.resource,
		e.count.toString()
	]);
	const lines = [];
	lines.push(failure(`Missing keys found in ${result.entries.length} resource(s)`));
	lines.push("");
	lines.push(drawTable([
		"Adapter",
		"Locale",
		"Resource",
		"Missing"
	], rows));
	lines.push("");
	lines.push(color(`Run ${color("dialekt translate", C.bold + C.cyan)} to fill missing keys.`, C.dim));
	return lines.join("\n") + "\n";
}
function formatLanguages(entries, format) {
	if (format === "json") return JSON.stringify(entries, null, 2) + "\n";
	if (entries.length === 0) return warning("No adapters configured.") + "\n";
	const lines = [];
	const g = glyphs();
	for (const e of entries) {
		lines.push(`  ${color(e.adapter, C.bold + C.blue)}`);
		lines.push(`    ${color(`${g.arrow}`, C.dim)} ${e.locales.join(color(", ", C.dim))}`);
	}
	return lines.join("\n") + "\n";
}
function formatTranslate(result, format) {
	if (format === "json") return JSON.stringify(result, null, 2) + "\n";
	if (result.success) {
		const lines = [success(result.message)];
		if (result.stats) {
			lines.push("");
			lines.push(keyValue("Adapters:", result.stats.adaptersProcessed.toString()));
			lines.push(keyValue("Locales:", result.stats.localesTranslated.toString()));
			lines.push(keyValue("Keys translated:", result.stats.keysTranslated.toString()));
			if (result.stats.totalSourceKeys !== void 0) lines.push(keyValue("Source keys:", result.stats.totalSourceKeys.toString()));
			if (result.stats.chunkStats) {
				const cs = result.stats.chunkStats;
				lines.push("");
				lines.push(D + "  chunks  total time     avg    min    max" + W);
				const time = cs.avgDurationMs * cs.chunkCount;
				lines.push(`  ${cs.chunkCount.toString().padEnd(7)} ${formatMs(time).padEnd(13)} ${formatMs(cs.avgDurationMs).padEnd(6)} ${formatMs(cs.minDurationMs).padEnd(6)} ${formatMs(cs.maxDurationMs)}`);
				lines.push("");
				lines.push(D + "  tokens           count" + W);
				lines.push(`  prompt           ${cs.totalPromptTokens.toLocaleString()}`);
				lines.push(`  completion       ${cs.totalCompletionTokens.toLocaleString()}`);
				lines.push(`  total            ${(cs.totalPromptTokens + cs.totalCompletionTokens).toLocaleString()}`);
				lines.push("");
				lines.push(keyValue("Est. cost:", `$${cs.estimatedCostUsd.toFixed(4)}`));
			}
			if (result.stats.perLocale) {
				lines.push("");
				lines.push(D + "  locale       translated  remaining" + W);
				for (const [loc, { translated, remaining }] of Object.entries(result.stats.perLocale).sort()) {
					const t = translated > 0 ? C.green + String(translated) + W : D + "—" + W;
					const r = remaining > 0 ? C.yellow + String(remaining) + W : C.green + "0" + W;
					lines.push(`  ${padEnd(loc, 12)} ${t}        ${r}`);
				}
			}
		}
		return lines.join("\n") + "\n";
	}
	return failure(result.message) + "\n";
}
function formatMs(ms) {
	if (ms >= 6e4) return (ms / 6e4).toFixed(1) + "m";
	if (ms >= 1e3) return (ms / 1e3).toFixed(1) + "s";
	return Math.round(ms) + "ms";
}
function formatAdd(result, format) {
	if (format === "json") return JSON.stringify(result, null, 2) + "\n";
	if (result.success) {
		const lines = [success(result.message)];
		if (result.addedResources && result.addedResources.length > 0) {
			lines.push("");
			lines.push(color("Added to:", C.dim));
			for (const r of result.addedResources) lines.push(`  ${color(glyphs().bullet, C.dim)} ${r}`);
		}
		return lines.join("\n") + "\n";
	}
	return failure(result.message) + "\n";
}
function formatInit(result, format) {
	if (format === "json") return JSON.stringify(result, null, 2) + "\n";
	if (!result.success) return failure(result.message) + "\n";
	const lines = [];
	lines.push(success(result.message));
	if (result.configPath) {
		lines.push("");
		lines.push(keyValue("Config:", result.configPath));
	}
	if (result.packageManager) lines.push(keyValue("Package manager:", result.packageManager));
	if (result.installed && result.installed.length > 0) {
		lines.push("");
		lines.push(color("Installed:", C.dim));
		for (const pkg of result.installed) lines.push(`  ${color(glyphs().bullet, C.dim)} ${pkg}`);
	}
	if (result.skippedInstall) {
		lines.push("");
		if (result.installCommands && result.installCommands.length > 0) {
			lines.push(color("Run the following to install:", C.dim));
			for (const cmd of result.installCommands) lines.push(`  ${color(`$ ${cmd}`, C.cyan)}`);
		} else lines.push(info("Install skipped. Run your package manager manually to install the packages above."));
	}
	return lines.join("\n") + "\n";
}
function formatBenchmark(entries, format) {
	if (format === "json") return JSON.stringify(entries, null, 2) + "\n";
	if (entries.length === 0) return warning("No benchmark data available.") + "\n";
	const lines = [];
	lines.push(banner("Benchmark Results"));
	const rows = entries.map((e) => [
		e.strategyName,
		`${e.succeededChunks}/${e.totalChunks}`,
		`${e.totalDurationMs.toFixed(0)}ms`,
		`${e.averageDurationMsPerChunk.toFixed(1)}ms`,
		e.totalAttempts.toString()
	]);
	lines.push("");
	lines.push(drawTable([
		"Strategy",
		"Chunks",
		"Total",
		"Avg/Chunk",
		"Attempts"
	], rows));
	return lines.join("\n") + "\n";
}
function formatError(message, format) {
	if (format === "json") return JSON.stringify({ error: message }, null, 2) + "\n";
	return failure(message) + "\n";
}
function padEnd(s, n) {
	return s.length >= n ? s : s + " ".repeat(n - s.length);
}
//#endregion
export { UnknownProviderError as A, computeMissingKeys as C, buildSystemPrompt as D, createOneShotStrategy as E, diffKeys as F, flattenObject as I, unflattenObject as L, readFileIfExists as M, writeFileEnsuringDir as N, buildUserPrompt as O, chunkKeys as P, loadConfig as S, createToolLoopStrategy as T, keyValue as _, formatLanguages as a, warning as b, formatUnusedKeys as c, color as d, detectFormat as f, info as g, glyphs as h, formatInit as i, resolveModel as j, TranslationFailedError as k, formatValidate as l, failure as m, formatBenchmark as n, formatMissingKeys as o, drawTable as p, formatError as r, formatTranslate as s, formatAdd as t, banner as u, sectionHeader as v, runTranslation as w, ConfigLoadError as x, success as y };
