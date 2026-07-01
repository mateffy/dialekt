import { Data, Effect, Schedule } from "effect";
import { Output, ToolLoopAgent, generateText, hasToolCall, tool } from "ai";
import { z } from "zod";
import { createJiti } from "jiti";
import { resolve } from "node:path";
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
function unflattenObject(input) {
	const output = {};
	for (const [dottedKey, value] of Object.entries(input)) {
		const segments = dottedKey.split(".");
		let cursor = output;
		for (let i = 0; i < segments.length - 1; i++) {
			const segment = segments[i];
			if (typeof cursor[segment] !== "object" || cursor[segment] === null) cursor[segment] = {};
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
	const maxChars = config.maxTokens * config.charsPerToken;
	const sourceJson = JSON.stringify(sourceMap);
	const targetJson = JSON.stringify(targetMap);
	const contextOverhead = (sourceJson?.length ?? 0) + (targetJson?.length ?? 0) + PROMPT_OVERHEAD;
	const effectiveMaxChars = Math.max(MIN_EFFECTIVE_MAX_CHARS, maxChars - contextOverhead);
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
//#region src/translation/model-registry.ts
var UnknownProviderError = class extends Data.TaggedError("UnknownProviderError") {};
/**
* The one file in the entire codebase allowed to import AI SDK provider packages.
*/
function resolveModel(config) {
	return Effect.tryPromise({
		try: async () => {
			switch (config.provider) {
				case "openai": {
					const { openai } = await import("@ai-sdk/openai");
					return openai(config.modelId);
				}
				case "anthropic": {
					const { anthropic } = await import("@ai-sdk/anthropic");
					return anthropic(config.modelId);
				}
				case "google": {
					const { google } = await import("@ai-sdk/google");
					return google(config.modelId);
				}
				default: throw new UnknownProviderError({ provider: config.provider });
			}
		},
		catch: (cause) => cause instanceof UnknownProviderError ? cause : new UnknownProviderError({ provider: config.provider })
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
async function tryTranslateChunk$1(model, ctx) {
	const schema = z.object(Object.fromEntries(ctx.keys.map((key) => [key, z.string()])));
	const { output } = await generateText({
		model,
		system: buildSystemPrompt(ctx.sourceLocale, ctx.targetLocale),
		prompt: buildUserPrompt(ctx),
		output: Output.object({ schema })
	});
	const missing = ctx.keys.filter((key) => !(key in output));
	if (missing.length > 0) throw new Error(`Model omitted keys: ${missing.join(", ")}`);
	return output;
}
function createOneShotStrategy(deps) {
	return {
		name: "one-shot",
		translateChunk: (ctx) => Effect.tryPromise({
			try: () => tryTranslateChunk$1(deps.model, ctx),
			catch: (cause) => cause
		}).pipe(Effect.retry(Schedule.exponential(`${deps.retry.baseDelayMs} millis`).pipe(Schedule.compose(Schedule.recurs(deps.retry.maxAttempts - 1)))), Effect.mapError((cause) => new TranslationFailedError({
			keys: ctx.keys,
			cause
		})))
	};
}
//#endregion
//#region src/translation/tool-loop-strategy.ts
async function tryTranslateChunk(model, ctx) {
	const schema = z.object(Object.fromEntries(ctx.keys.map((key) => [key, z.string()])));
	let captured = null;
	const submitTranslations = tool({
		description: "Submit the final translations for every requested key. Call this exactly once, with every key filled in.",
		inputSchema: schema,
		execute: async (input) => {
			captured = input;
			return { ok: true };
		}
	});
	await new ToolLoopAgent({
		model,
		instructions: buildSystemPrompt(ctx.sourceLocale, ctx.targetLocale),
		tools: { submitTranslations },
		stopWhen: hasToolCall("submitTranslations")
	}).generate({ prompt: buildUserPrompt(ctx) });
	if (captured === null) throw new Error("Agent finished without calling submitTranslations");
	const missing = ctx.keys.filter((key) => !(key in captured));
	if (missing.length > 0) throw new Error(`Model omitted keys: ${missing.join(", ")}`);
	return captured;
}
function createToolLoopStrategy(deps) {
	return {
		name: "tool-loop-agent",
		translateChunk: (ctx) => Effect.tryPromise({
			try: () => tryTranslateChunk(deps.model, ctx),
			catch: (cause) => cause
		}).pipe(Effect.retry(Schedule.exponential(`${deps.retry.baseDelayMs} millis`).pipe(Schedule.compose(Schedule.recurs(deps.retry.maxAttempts - 1)))), Effect.mapError((cause) => new TranslationFailedError({
			keys: ctx.keys,
			cause
		})))
	};
}
//#endregion
//#region src/translation/orchestrator.ts
function runTranslation(config) {
	return Effect.gen(function* () {
		const failures = [];
		for (const adapter of config.adapters) {
			const locales = config.targetLocales.length > 0 ? config.targetLocales : yield* adapter.listLocales();
			const sourceLocale = config.sourceLocale;
			const targetLocales = locales.filter((l) => l !== sourceLocale);
			for (const locale of targetLocales) {
				const resources = yield* adapter.listResources(sourceLocale);
				for (const resource of resources) {
					const sourceMap = yield* adapter.readResource(sourceLocale, resource);
					const targetMap = yield* adapter.readResource(locale, resource);
					const missing = diffKeys(sourceMap, targetMap);
					if (missing.length === 0) continue;
					const chunks = chunkKeys(missing, sourceMap, targetMap, {
						maxTokens: config.chunking.maxTokens,
						charsPerToken: config.chunking.charsPerToken
					});
					const translatedChunks = [];
					yield* Effect.forEach(chunks, (chunkKeysArr) => Effect.gen(function* () {
						const result = yield* config.strategy.translateChunk({
							sourceLocale,
							targetLocale: locale,
							sourceMap,
							targetMap,
							keys: chunkKeysArr
						});
						translatedChunks.push(result);
					}).pipe(Effect.catchAll((err) => {
						failures.push(err);
						return Effect.void;
					})), {
						concurrency: config.chunking.concurrency,
						discard: true
					});
					const merged = { ...targetMap };
					for (const chunk of translatedChunks) Object.assign(merged, chunk);
					yield* adapter.writeResource(locale, resource, merged);
				}
			}
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
			}))).flat();
		}))).flat();
	});
}
//#endregion
//#region src/config/load-config.ts
var ConfigLoadError = class extends Data.TaggedError("ConfigLoadError") {};
function loadConfig(configPath) {
	return Effect.tryPromise({
		try: async () => {
			const jiti = createJiti(process.cwd());
			const absolutePath = resolve(configPath);
			return await jiti.import(absolutePath, { default: true });
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
const C = {
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
	return `${codes.join("")}${text}${C.reset}`;
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
	const headerRow = g.vLine + headers.map((h, i) => ` ${color(pad(h, colWidths[i]), C.bold)} `).join(g.vLine) + g.vLine;
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
function banner(title) {
	const line = glyphs().hLine.repeat(Math.max(title.length + 4, 40));
	return `${color(line, C.dim)}\n  ${color(title, C.bold + C.cyan)}\n${color(line, C.dim)}`;
}
function sectionHeader(label) {
	return `\n${color(`${glyphs().arrow} ${label}`, C.bold + C.cyan)}`;
}
function success(text) {
	return `${color(`${glyphs().check} ${text}`, C.green)}`;
}
function failure(text) {
	return `${color(`${glyphs().crossMark} ${text}`, C.red)}`;
}
function warning(text) {
	return `${color(`${glyphs().warn} ${text}`, C.yellow)}`;
}
function info(text) {
	return color(text, C.dim);
}
function keyValue(key, value) {
	return `  ${color(key, C.bold)} ${value}`;
}
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
			lines.push(keyValue("Keys:", result.stats.keysTranslated.toString()));
		}
		return lines.join("\n") + "\n";
	}
	return failure(result.message) + "\n";
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
function formatBenchmark(entries, format) {
	if (format === "json") return JSON.stringify(entries, null, 2) + "\n";
	if (entries.length === 0) return warning("No benchmark data available.") + "\n";
	const lines = [];
	glyphs();
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
//#endregion
export { resolveModel as A, runTranslation as C, buildUserPrompt as D, buildSystemPrompt as E, diffKeys as M, flattenObject as N, TranslationFailedError as O, unflattenObject as P, computeMissingKeys as S, createOneShotStrategy as T, sectionHeader as _, failure as a, ConfigLoadError as b, formatError as c, formatTranslate as d, formatUnusedKeys as f, keyValue as g, info as h, drawTable as i, chunkKeys as j, UnknownProviderError as k, formatLanguages as l, glyphs as m, color as n, formatAdd as o, formatValidate as p, detectFormat as r, formatBenchmark as s, banner as t, formatMissingKeys as u, success as v, createToolLoopStrategy as w, loadConfig as x, warning as y };
