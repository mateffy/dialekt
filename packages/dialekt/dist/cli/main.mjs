#!/usr/bin/env node
import { C as computeMissingKeys, E as createOneShotStrategy, N as writeFileEnsuringDir, P as chunkKeys, S as loadConfig, T as createToolLoopStrategy, a as formatLanguages, c as formatUnusedKeys, f as detectFormat, i as formatInit, j as resolveModel, l as formatValidate, n as formatBenchmark, o as formatMissingKeys, r as formatError, s as formatTranslate, t as formatAdd, w as runTranslation } from "../formatters-QGjIbJBA.mjs";
import { Console, Effect, Option } from "effect";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Command, FileSystem } from "@effect/platform";
import { Command as Command$1, Options } from "@effect/cli";
//#region src/cli/config-resolution.ts
function resolveEffectiveConfig(flags, loaded) {
	return {
		...loaded,
		sourceLocale: flags.baseLanguage ?? loaded.sourceLocale,
		targetLocales: flags.language && flags.language.length > 0 ? flags.language : loaded.targetLocales,
		strategy: flags.strategy ?? loaded.strategy,
		adapters: flags.adapter ? loaded.adapters.filter((a) => a.name === flags.adapter) : loaded.adapters
	};
}
//#endregion
//#region src/cli/progress.ts
const SPINNER = [
	"⠋",
	"⠙",
	"⠹",
	"⠸",
	"⠼",
	"⠴",
	"⠦",
	"⠧",
	"⠇",
	"⠏"
];
const DIM = "\x1B[2m";
const GREEN = "\x1B[32m";
const CYAN = "\x1B[36m";
const RED = "\x1B[31m";
const RESET = "\x1B[0m";
const COL_LOCALE = 9;
const COL_KEYS = 9;
const COL_CHUNKS = 8;
const COL_PROGRESS = 9;
var ProgressDisplay = class {
	rows = /* @__PURE__ */ new Map();
	order;
	timer = null;
	frame = 0;
	active = false;
	drawn = 0;
	fd;
	constructor(entries) {
		this.order = entries.map((e) => e.locale);
		for (const e of entries) this.rows.set(e.locale, {
			locale: e.locale,
			resources: e.resources,
			keys: 0,
			chunks: 0,
			completed: 0,
			failed: 0,
			status: "pending",
			startTime: 0
		});
		this.fd = process.stderr;
	}
	start() {
		if (this.active) return;
		this.active = true;
		this.draw();
		if (this.timer) clearInterval(this.timer);
		this.timer = setInterval(() => {
			this.frame = (this.frame + 1) % SPINNER.length;
			this.draw();
		}, 100);
	}
	localeStarted(locale) {
		const r = this.rows.get(locale);
		if (r && r.status === "pending") {
			r.status = "translating";
			r.startTime = Date.now();
		}
	}
	localeScanned(locale, keys, chunks) {
		const r = this.rows.get(locale);
		if (r) {
			r.keys = keys;
			r.chunks = chunks;
			if (chunks === 0 && keys === 0) {
				r.status = "no-missing";
				r.startTime = Date.now();
			}
		}
	}
	chunkComplete(locale) {
		const r = this.rows.get(locale);
		if (r && r.status === "translating") r.completed++;
	}
	chunkFailed(locale) {
		const r = this.rows.get(locale);
		if (r) r.failed++;
	}
	localeDone(locale) {
		const r = this.rows.get(locale);
		if (r && r.status !== "no-missing") r.status = "done";
	}
	localeError(locale) {
		const r = this.rows.get(locale);
		if (r && r.status !== "done") r.status = "error";
	}
	/** Called before writing chunk output to stderr — pauses the timer. */
	beforeChunkOutput() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.fd.write("\r\x1B[A\x1B[K");
	}
	/** Called after chunk output — restarts the timer and redraws. */
	afterChunkOutput() {
		this.timer = setInterval(() => {
			this.frame = (this.frame + 1) % SPINNER.length;
			this.draw();
		}, 100);
		this.draw();
	}
	finish() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.active = false;
		this.draw();
		this.fd.write("\n");
	}
	progressStr(row) {
		if (row.status === "no-missing") return "\x1B[32m—\x1B[0m";
		if (row.chunks === 0 && row.status === "done") return "\x1B[32m—\x1B[0m";
		if (row.status === "pending") return "\x1B[2m···\x1B[0m";
		return `${row.completed + row.failed}/${row.chunks}`;
	}
	draw() {
		if (this.drawn > 0) for (let i = 0; i < this.drawn; i++) this.fd.write("\x1B[1A\x1B[K");
		this.drawn = 0;
		for (const locale of this.order) {
			const row = this.rows.get(locale);
			const s = row.status === "translating" ? SPINNER[this.frame % SPINNER.length] + " " : row.status === "pending" ? "\x1B[2m··\x1B[0m " : "  ";
			const keysStr = row.keys > 0 ? String(row.keys) : "\x1B[2m···\x1B[0m";
			const chunksStr = row.chunks > 0 ? String(row.chunks) : "\x1B[2m···\x1B[0m";
			const progressStr = this.progressStr(row);
			let statusStr;
			switch (row.status) {
				case "pending":
					statusStr = "\x1B[2mpending\x1B[0m";
					break;
				case "translating":
					statusStr = "translating";
					break;
				case "done":
					statusStr = `${GREEN}✓${RESET} done ${DIM}${row.startTime > 0 ? ((Date.now() - row.startTime) / 1e3).toFixed(1) : "0.0"}s${RESET}`;
					break;
				case "no-missing":
					statusStr = `${GREEN}✓${RESET} ${DIM}complete${RESET}`;
					break;
				case "error":
					statusStr = row.failed > 0 ? `${RED}✗${RESET} ${row.failed} failed` : `${RED}✗${RESET} error`;
					break;
			}
			this.fd.write(`\r${s}${pad(row.locale, COL_LOCALE)} ${pad(keysStr, COL_KEYS)} ${pad(chunksStr, COL_CHUNKS)} ${pad(progressStr, COL_PROGRESS)} ${statusStr}\n`);
			this.drawn++;
		}
	}
};
function pad(s, n) {
	const plain = s.replace(/\x1b\[\d;]*m/g, "");
	const padLen = Math.max(0, n - plain.length);
	return s + " ".repeat(padLen);
}
/**
* A single-line animated status bar that shows what each concurrent thread
* is currently working on. Chunk output is rendered above it via the
* beforeOutput/afterOutput dance.
*/
var StatusBar = class {
	timer = null;
	frame = 0;
	slots = {};
	active = false;
	fd = process.stderr;
	/** Guard to prevent timer redraws during chunk card output. */
	writing = false;
	/** Update a slot with the locale+resource the thread is working on. */
	setSlot(locale, resource, progress) {
		this.slots[locale] = {
			resource,
			chunk: progress
		};
	}
	/** Clear a slot when a thread finishes its chunk. */
	clearSlot(locale) {
		delete this.slots[locale];
	}
	start() {
		if (this.active) return;
		this.active = true;
		this.draw();
		if (this.timer) clearInterval(this.timer);
		this.timer = setInterval(() => {
			this.frame = (this.frame + 1) % SPINNER.length;
			this.draw();
		}, 100);
	}
	/** Redraws the bottom line in place. Skips if a chunk card is being written. */
	draw() {
		if (this.writing) return;
		this.fd.write("\r\x1B[K");
		const entries = Object.entries(this.slots);
		if (entries.length === 0) this.fd.write(`${DIM}  waiting...${RESET}`);
		else {
			const s = SPINNER[this.frame % SPINNER.length];
			const parts = entries.map(([loc, { resource, chunk }]) => `${CYAN}${loc}${RESET}/${DIM}${resource ?? "?"}${RESET} ${chunk ?? "?"}`);
			this.fd.write(`${s}  ${parts.join("  ")}`);
		}
	}
	/**
	* Move cursor above status line, stop the animation timer,
	* and lock out concurrent chunk output.
	*/
	beforeOutput() {
		this.writing = true;
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.fd.write("\r\x1B[A\x1B[K");
	}
	/** Redraw status line and restart animation. */
	afterOutput() {
		setImmediate(() => {
			this.fd.write("\r\x1B[K");
			this.draw();
			this.writing = false;
			if (!this.timer) this.timer = setInterval(() => {
				this.frame = (this.frame + 1) % SPINNER.length;
				this.draw();
			}, 100);
		});
	}
	finish() {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
		this.active = false;
		this.fd.write("\r\x1B[K");
	}
};
//#endregion
//#region src/cli/commands/translate.ts
const D = "\x1B[2m";
const G = "\x1B[32m";
const C = "\x1B[36m";
const Y = "\x1B[33m";
const B = "\x1B[1m";
const W = "\x1B[0m";
function renderTraceToStderr(trace) {
	const { sourceLocale: sl, targetLocale: tl, resource, keys, sourceTexts, output } = trace;
	const TRUNCATE = 140;
	const out = process.stderr;
	const resLabel = resource ? D + resource + "\x1B[0m  " : "";
	out.write(`\n${D}┌${W} ${resLabel}${B}${keys.length} keys${W}  ${Y}${sl}${W} ${D}→${W} ${C}${tl}${W}\n${D}│${W}\n`);
	for (const key of keys) {
		if (!output[key] && !sourceTexts[key]) continue;
		out.write(`${D}│${W} ${C}${key}${W}\n`);
		out.write(`${D}│${W}  ${D}de${W}  ${(sourceTexts[key] ?? "").slice(0, TRUNCATE)}\n`);
		out.write(`${D}│${W}  ${G}${tl}${W}  ${(output[key] ?? "\x1B[2m(missing)\x1B[0m").slice(0, TRUNCATE)}\n`);
		out.write(`${D}│${W}\n`);
	}
	out.write(`${D}└${W}\n`);
}
function shouldShowProgress(flags) {
	if (!process.stdout.isTTY) return false;
	if (!flags.quiet) return false;
	if ((flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0) === "json") return false;
	return true;
}
function emitChunk(trace, chunkNum, total, bar) {
	const { sourceLocale, targetLocale, resource, keys, sourceTexts, output } = trace;
	const counter = `${G}${chunkNum}/${total}${W}`;
	const locPair = `${Y}${sourceLocale}${W} ${D}→${W} ${C}${targetLocale}${W}`;
	const res = resource ? `${D}${resource}${W}  ` : "";
	const TRUNCATE = 140;
	const lines = [];
	lines.push(`\n${D}┌${W} ${res}${B}${keys.length} keys${W}  ${locPair}  ${D}[${W}${counter}${D}]${W}`);
	lines.push(`${D}│${W}`);
	for (const key of keys) {
		const src = sourceTexts[key] ?? "";
		const tgt = output[key] ?? "\x1B[2m(missing)\x1B[0m";
		lines.push(`${D}│${W} ${C}${key}${W}`);
		lines.push(`${D}│${W}  ${D}de${W}  ${src.slice(0, TRUNCATE)}`);
		lines.push(`${D}│${W}  ${G}${targetLocale}${W}  ${tgt.slice(0, TRUNCATE)}`);
		lines.push(`${D}│${W}`);
	}
	lines.push(`${D}└${W}`);
	bar.beforeOutput();
	process.stderr.write(lines.join("\n") + "\n\n");
	bar.afterOutput();
}
const ROUND_TO_4_DP = 1e4;
const roundCost = (costUsd) => Math.round(costUsd * ROUND_TO_4_DP) / ROUND_TO_4_DP;
const DEEPSEEK_INPUT_PER_1M = .4;
const DEEPSEEK_OUTPUT_PER_1M = .6;
function runTranslate(flags, configLoader = loadConfig, modelResolver = resolveModel, translationRunner = runTranslation, logger = (msg) => Console.log(msg)) {
	return Effect.gen(function* () {
		const loaded = yield* configLoader(flags.config);
		const effective = resolveEffectiveConfig({
			baseLanguage: Option.getOrUndefined(flags.baseLanguage),
			language: Option.isSome(flags.language) ? [flags.language.value] : void 0,
			adapter: Option.getOrUndefined(flags.adapter),
			strategy: Option.getOrUndefined(flags.strategy) === "one-shot" || Option.getOrUndefined(flags.strategy) === "tool-loop-agent" ? Option.getOrUndefined(flags.strategy) : void 0
		}, loaded);
		const model = yield* modelResolver(flags.fast ? effective.fastModel : effective.model);
		const showProgress = shouldShowProgress(flags);
		const showStatus = !flags.quiet && process.stdout.isTTY;
		let bar = null;
		let display = null;
		if (showStatus) {
			bar = new StatusBar();
			bar.start();
		} else if (showProgress) {
			const rows = [];
			for (const a of effective.adapters) {
				const allLocales = yield* a.listLocales();
				const sourceLocale = effective.sourceLocale;
				const targets = effective.targetLocales && effective.targetLocales.length > 0 ? effective.targetLocales.filter((l) => l !== sourceLocale) : allLocales.filter((l) => l !== sourceLocale);
				for (const loc of targets) {
					const resources = yield* a.listResources(sourceLocale);
					rows.push({
						locale: loc,
						resources: resources.length
					});
				}
			}
			if (rows.length > 0) {
				display = new ProgressDisplay(rows);
				display.start();
			}
		}
		const chunkIdx = /* @__PURE__ */ new Map();
		const chunkTot = /* @__PURE__ */ new Map();
		const perLocaleTotal = /* @__PURE__ */ new Map();
		const perLocaleDone = /* @__PURE__ */ new Map();
		const cstats = {
			totalPromptTokens: 0,
			totalCompletionTokens: 0,
			totalDurationMs: 0,
			chunkCount: 0,
			minDurationMs: Infinity,
			maxDurationMs: 0
		};
		let translatedKeys = 0;
		const onTrace = !flags.quiet ? (trace) => {
			const locale = trace.targetLocale;
			perLocaleDone.set(locale, (perLocaleDone.get(locale) ?? 0) + trace.keys.length);
			const idx = (chunkIdx.get(locale) ?? 0) + 1;
			chunkIdx.set(locale, idx);
			const tot = chunkTot.get(locale) ?? 0;
			cstats.totalPromptTokens += trace.promptTokens;
			cstats.totalCompletionTokens += trace.completionTokens;
			cstats.totalDurationMs += trace.durationMs;
			cstats.chunkCount++;
			cstats.minDurationMs = Math.min(cstats.minDurationMs, trace.durationMs);
			cstats.maxDurationMs = Math.max(cstats.maxDurationMs, trace.durationMs);
			if (bar) emitChunk(trace, idx, tot, bar);
			else renderTraceToStderr(trace);
		} : void 0;
		const strategy = effective.strategy === "tool-loop-agent" ? createToolLoopStrategy({
			model,
			retry: effective.retry,
			...onTrace ? { onTrace } : {}
		}) : createOneShotStrategy({
			model,
			retry: effective.retry,
			...onTrace ? { onTrace } : {}
		});
		yield* translationRunner({
			adapters: effective.adapters,
			strategy,
			sourceLocale: effective.sourceLocale,
			targetLocales: effective.targetLocales ?? [],
			chunking: effective.chunking,
			resourceFilter: Option.getOrUndefined(flags.name)
		}, (event) => {
			switch (event.type) {
				case "locale-start":
					display?.localeStarted(event.locale);
					break;
				case "locale-scanned":
					display?.localeScanned(event.locale, event.missingKeys ?? 0, event.chunksTotal ?? 0);
					translatedKeys += event.missingKeys ?? 0;
					chunkTot.set(event.locale, event.chunksTotal ?? 0);
					perLocaleTotal.set(event.locale, (perLocaleTotal.get(event.locale) ?? 0) + (event.missingKeys ?? 0));
					break;
				case "chunk-start":
					if (bar && event.resource) bar.setSlot(event.locale, event.resource, "⏳");
					break;
				case "chunk-complete":
					display?.chunkComplete(event.locale);
					if (bar && event.resource) bar.clearSlot(event.locale);
					break;
				case "chunk-fail":
					display?.chunkFailed(event.locale);
					if (bar && event.resource) bar.clearSlot(event.locale);
					break;
				case "locale-done":
					display?.localeDone(event.locale);
					bar?.clearSlot(event.locale);
					break;
				case "locale-error":
					display?.localeError(event.locale);
					bar?.clearSlot(event.locale);
					break;
			}
		});
		if (bar) bar.finish();
		if (display) display.finish();
		const format = detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0);
		const targetCount = effective.targetLocales && effective.targetLocales.length > 0 ? effective.targetLocales.filter((l) => l !== effective.sourceLocale).length : 0;
		const msg = translatedKeys === 0 ? "All translations are already complete — nothing to translate." : "Translation complete.";
		const perLocale = {};
		let totalSource = 0;
		for (const [loc, tot] of perLocaleTotal) {
			totalSource += tot;
			perLocale[loc] = {
				translated: perLocaleDone.get(loc) ?? 0,
				remaining: Math.max(0, tot - (perLocaleDone.get(loc) ?? 0))
			};
		}
		const avgDuration = cstats.chunkCount > 0 ? cstats.totalDurationMs / cstats.chunkCount : 0;
		const costUsd = cstats.totalPromptTokens / 1e6 * DEEPSEEK_INPUT_PER_1M + cstats.totalCompletionTokens / 1e6 * DEEPSEEK_OUTPUT_PER_1M;
		const chunkStats = cstats.chunkCount > 0 ? {
			chunkCount: cstats.chunkCount,
			avgDurationMs: Math.round(avgDuration),
			minDurationMs: cstats.minDurationMs === Infinity ? 0 : cstats.minDurationMs,
			maxDurationMs: cstats.maxDurationMs,
			totalPromptTokens: cstats.totalPromptTokens,
			totalCompletionTokens: cstats.totalCompletionTokens,
			estimatedCostUsd: roundCost(costUsd)
		} : void 0;
		yield* logger(formatTranslate({
			success: true,
			message: msg,
			stats: {
				adaptersProcessed: effective.adapters.length,
				localesTranslated: targetCount,
				keysTranslated: translatedKeys,
				...totalSource > 0 ? { totalSourceKeys: totalSource } : {},
				...Object.keys(perLocale).length > 0 ? { perLocale } : {},
				...chunkStats ? { chunkStats } : {}
			}
		}, format));
	});
}
const translateCommand = Command$1.make("translate", {
	config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
	adapter: Options.optional(Options.text("adapter")),
	strategy: Options.optional(Options.text("strategy")),
	baseLanguage: Options.optional(Options.text("base-language")),
	language: Options.optional(Options.text("language")),
	name: Options.optional(Options.text("name")),
	skipNames: Options.boolean("skip-names"),
	skipLanguages: Options.boolean("skip-languages"),
	fast: Options.boolean("fast"),
	quiet: Options.boolean("quiet"),
	format: Options.optional(Options.text("format"))
}, (flags) => runTranslate(flags));
//#endregion
//#region src/cli/commands/validate.ts
function runValidate(flags, configLoader = loadConfig, missingKeysComputer = computeMissingKeys, logger = (msg) => Console.log(msg)) {
	return Effect.gen(function* () {
		const loaded = yield* configLoader(flags.config);
		const effective = resolveEffectiveConfig({
			baseLanguage: Option.getOrUndefined(flags.baseLanguage),
			language: Option.isSome(flags.language) ? [flags.language.value] : void 0,
			adapter: Option.getOrUndefined(flags.adapter)
		}, loaded);
		const entries = [];
		for (const a of effective.adapters) {
			const locales = yield* a.listLocales();
			const sourceLocale = effective.sourceLocale;
			const missingEntries = yield* missingKeysComputer(a, sourceLocale, locales.filter((l) => l !== sourceLocale));
			for (const entry of missingEntries) entries.push({
				adapter: entry.adapter,
				locale: entry.locale,
				resource: entry.resource.label,
				count: entry.missing.length
			});
		}
		const format = detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0);
		const passing = entries.length === 0;
		yield* logger(formatValidate({
			passing,
			entries
		}, format));
		if (!passing) yield* Effect.sync(() => {
			process.exitCode = 1;
		});
	}).pipe(Effect.mapError((e) => e));
}
const validateCommand = Command$1.make("validate", {
	config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
	adapter: Options.optional(Options.text("adapter")),
	baseLanguage: Options.optional(Options.text("base-language")),
	language: Options.optional(Options.text("language")),
	format: Options.optional(Options.text("format"))
}, (flags) => runValidate(flags));
//#endregion
//#region src/cli/commands/add.ts
function parseAddTokens(tokens, errorLogger) {
	return Effect.gen(function* () {
		const entriesByResource = {};
		for (const token of tokens) {
			const eqIdx = token.indexOf("=");
			if (eqIdx === -1) {
				yield* errorLogger(`Invalid token (missing '='): ${token}`);
				continue;
			}
			const key = token.slice(0, eqIdx);
			const value = token.slice(eqIdx + 1);
			const dotIdx = key.indexOf(".");
			if (dotIdx === -1) {
				yield* errorLogger(`Invalid key (no resource segment): ${key}`);
				continue;
			}
			const resource = key.slice(0, dotIdx);
			const subKey = key.slice(dotIdx + 1);
			if (!entriesByResource[resource]) entriesByResource[resource] = {};
			entriesByResource[resource][subKey] = value;
		}
		return entriesByResource;
	});
}
function runAdd(flags, tokens, configLoader = loadConfig, modelResolver = resolveModel, translationRunner = runTranslation, logger = (msg) => Console.log(msg), errorLogger = (msg) => Console.error(msg)) {
	return Effect.gen(function* () {
		const effective = resolveEffectiveConfig({}, yield* configLoader(flags.config));
		const entriesByResource = yield* parseAddTokens(tokens, errorLogger);
		const addedResources = [];
		for (const adapter of effective.adapters) for (const [resourceKey, entries] of Object.entries(entriesByResource)) {
			const resourceRef = {
				key: resourceKey,
				label: resourceKey
			};
			yield* adapter.writeResource(effective.sourceLocale, resourceRef, entries);
			addedResources.push(`${adapter.name}/${effective.sourceLocale}/${resourceKey}`);
		}
		const modelConfig = effective.model;
		const model = yield* modelResolver(modelConfig);
		const translationStrategy = effective.strategy === "tool-loop-agent" ? createToolLoopStrategy({
			model,
			retry: effective.retry
		}) : createOneShotStrategy({
			model,
			retry: effective.retry
		});
		yield* translationRunner({
			adapters: effective.adapters,
			strategy: translationStrategy,
			sourceLocale: effective.sourceLocale,
			targetLocales: (effective.targetLocales ?? []).filter((l) => l !== effective.sourceLocale),
			chunking: effective.chunking
		});
		const format = detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0);
		yield* logger(formatAdd({
			success: true,
			message: "Add + translate complete.",
			addedResources
		}, format));
	});
}
const addCommand = Command$1.make("add", {
	config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
	create: Options.boolean("create"),
	format: Options.optional(Options.text("format"))
}, ({ config, create, format }) => {
	const rawTokens = process.argv.slice(3).filter((t) => !t.startsWith("--") && !t.startsWith("-"));
	return runAdd({
		config,
		create,
		format
	}, rawTokens);
});
//#endregion
//#region src/cli/commands/missing.ts
function runMissing(flags, configLoader = loadConfig, missingKeysComputer = computeMissingKeys, logger = (msg) => Console.log(msg)) {
	return Effect.gen(function* () {
		const loaded = yield* configLoader(flags.config);
		const effective = resolveEffectiveConfig({
			baseLanguage: Option.getOrUndefined(flags.baseLanguage),
			language: Option.isSome(flags.language) ? [flags.language.value] : void 0,
			adapter: Option.getOrUndefined(flags.adapter)
		}, loaded);
		const allEntries = [];
		for (const a of effective.adapters) {
			const sourceLocale = effective.sourceLocale;
			const entries = yield* missingKeysComputer(a, sourceLocale, effective.targetLocales && effective.targetLocales.length > 0 ? effective.targetLocales.filter((l) => l !== sourceLocale) : (yield* a.listLocales()).filter((l) => l !== sourceLocale));
			for (const entry of entries) for (const key of entry.missing) allEntries.push({
				adapter: entry.adapter,
				locale: entry.locale,
				resource: entry.resource.label,
				key
			});
		}
		yield* logger(formatMissingKeys(allEntries, detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0)));
	}).pipe(Effect.mapError((e) => e));
}
const missingCommand = Command$1.make("missing", {
	config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
	adapter: Options.optional(Options.text("adapter")),
	baseLanguage: Options.optional(Options.text("base-language")),
	language: Options.optional(Options.text("language")),
	format: Options.optional(Options.text("format"))
}, (flags) => runMissing(flags));
//#endregion
//#region src/cli/commands/unused.ts
function resolveFormat(flag) {
	return detectFormat(flag !== void 0 ? Option.getOrUndefined(flag) : void 0);
}
function collectUnusedFromAdapter(a, sourceLocale, entries) {
	return Effect.gen(function* () {
		const resources = yield* a.listResources(sourceLocale);
		for (const resource of resources) {
			const unused = yield* a.findUnusedKeys(sourceLocale, resource);
			for (const key of unused) entries.push({
				adapter: a.name,
				locale: sourceLocale,
				resource: resource.label,
				key
			});
		}
	});
}
function runUnused(flags, configLoader = loadConfig, logger = (msg) => Console.log(msg), errorLogger = (msg) => Console.error(msg)) {
	return Effect.gen(function* () {
		const loaded = yield* configLoader(flags.config);
		const effective = resolveEffectiveConfig({
			baseLanguage: Option.getOrUndefined(flags.baseLanguage),
			adapter: Option.getOrUndefined(flags.adapter)
		}, loaded);
		const allEntries = [];
		for (const a of effective.adapters) {
			if (!a.capabilities.unusedKeyDetection) {
				yield* errorLogger(formatError(`Adapter '${a.name}' does not support unused-key detection.`, resolveFormat(flags.format)));
				continue;
			}
			const sourceLocale = effective.sourceLocale;
			yield* collectUnusedFromAdapter(a, sourceLocale, allEntries).pipe(Effect.mapError((cause) => cause));
		}
		yield* logger(formatUnusedKeys(allEntries, resolveFormat(flags.format)));
	}).pipe(Effect.mapError((e) => e));
}
const unusedCommand = Command$1.make("unused", {
	config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
	adapter: Options.optional(Options.text("adapter")),
	baseLanguage: Options.optional(Options.text("base-language")),
	format: Options.optional(Options.text("format"))
}, (flags) => runUnused(flags));
//#endregion
//#region src/cli/commands/languages.ts
function runLanguages(flags, configLoader = loadConfig, logger = (msg) => Console.log(msg)) {
	return Effect.gen(function* () {
		const effective = resolveEffectiveConfig({}, yield* configLoader(flags.config));
		const entries = [];
		for (const adapter of effective.adapters) {
			const locales = yield* adapter.listLocales();
			entries.push({
				adapter: adapter.name,
				locales
			});
		}
		yield* logger(formatLanguages(entries, detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0)));
	}).pipe(Effect.mapError((e) => e));
}
const languagesCommand = Command$1.make("languages", {
	config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
	format: Options.optional(Options.text("format"))
}, (flags) => runLanguages(flags));
//#endregion
//#region src/benchmark/metrics.ts
const DEEPSEEK_INPUT_PRICE = .4;
const DEEPSEEK_OUTPUT_PRICE = .6;
function summarizeBenchmarkResults(results) {
	const totalChunks = results.length;
	const succeededChunks = results.filter((r) => r.succeeded).length;
	const failedChunks = totalChunks - succeededChunks;
	const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
	const totalAttempts = results.reduce((sum, r) => sum + r.attemptCount, 0);
	const totalPromptTokens = results.reduce((sum, r) => sum + (r.promptTokens ?? 0), 0);
	const totalCompletionTokens = results.reduce((sum, r) => sum + (r.completionTokens ?? 0), 0);
	const estimatedCostUsd = totalPromptTokens / 1e6 * DEEPSEEK_INPUT_PRICE + totalCompletionTokens / 1e6 * DEEPSEEK_OUTPUT_PRICE;
	return {
		strategyName: results[0]?.strategyName ?? "one-shot",
		totalChunks,
		succeededChunks,
		failedChunks,
		totalDurationMs,
		averageDurationMsPerChunk: totalChunks > 0 ? totalDurationMs / totalChunks : 0,
		totalAttempts,
		totalPromptTokens,
		totalCompletionTokens,
		estimatedCostUsd
	};
}
let _globalUsage = null;
function consumeChunkUsage() {
	const u = _globalUsage ?? {
		promptTokens: 0,
		completionTokens: 0
	};
	_globalUsage = null;
	return u;
}
function runBenchmarkedChunk(strategy, ctx) {
	return Effect.gen(function* () {
		const start = Date.now();
		const result = yield* Effect.either(strategy.translateChunk(ctx));
		const durationMs = Date.now() - start;
		const usage = consumeChunkUsage();
		if (result._tag === "Right") return {
			strategyName: strategy.name,
			chunkKeyCount: ctx.keys.length,
			durationMs,
			attemptCount: 1,
			succeeded: true,
			errorMessage: void 0,
			...usage.promptTokens > 0 ? {
				promptTokens: usage.promptTokens,
				completionTokens: usage.completionTokens
			} : {}
		};
		return {
			strategyName: strategy.name,
			chunkKeyCount: ctx.keys.length,
			durationMs,
			attemptCount: 1,
			succeeded: false,
			errorMessage: String(result.left.cause),
			...usage.promptTokens > 0 ? {
				promptTokens: usage.promptTokens,
				completionTokens: usage.completionTokens
			} : {}
		};
	});
}
//#endregion
//#region src/benchmark/runner.ts
function runBenchmark(config) {
	return Effect.gen(function* () {
		const summaries = [];
		for (const strategy of config.strategies) {
			const results = yield* Effect.forEach(config.chunks, (chunk) => runBenchmarkedChunk(strategy, chunk), { concurrency: config.concurrency });
			summaries.push(summarizeBenchmarkResults(results));
		}
		return summaries;
	});
}
//#endregion
//#region src/cli/commands/benchmark.ts
const resolveKeysPerChunk = (flags, chunking) => {
	const fromFlag = Option.getOrUndefined(flags.chunkSize ?? Option.none());
	if (fromFlag !== void 0) return { keysPerChunk: fromFlag };
	if (chunking.keysPerChunk !== void 0) return { keysPerChunk: chunking.keysPerChunk };
	return {};
};
function runBenchmarkCommand(flags, deps) {
	return Effect.gen(function* () {
		yield* deps.errorLogger(formatError("Warning: This will make real API calls to the configured model provider(s) and may incur cost.", detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0)));
		const loaded = yield* deps.configLoader(flags.config);
		const effective = resolveEffectiveConfig({ adapter: Option.getOrUndefined(flags.adapter) }, loaded);
		const strategyNames = Option.getOrElse(flags.strategies, () => "one-shot,tool-loop-agent").split(",").map((s) => s.trim());
		const model = yield* deps.modelResolver(effective.model);
		const strategyList = strategyNames.map((name) => name === "tool-loop-agent" ? createToolLoopStrategy({
			model,
			retry: effective.retry
		}) : createOneShotStrategy({
			model,
			retry: effective.retry
		}));
		const allChunks = [];
		for (const a of effective.adapters) {
			const locales = yield* a.listLocales();
			const sourceLocale = effective.sourceLocale;
			const targets = locales.filter((l) => l !== sourceLocale);
			const missingEntries = yield* deps.missingKeysComputer(a, sourceLocale, targets);
			for (const entry of missingEntries) {
				const sourceMap = yield* a.readResource(sourceLocale, entry.resource);
				const targetMap = yield* a.readResource(entry.locale, entry.resource);
				const chunks = chunkKeys(entry.missing, sourceMap, targetMap, {
					maxTokens: effective.chunking.maxTokens,
					charsPerToken: effective.chunking.charsPerToken,
					...resolveKeysPerChunk(flags, effective.chunking)
				});
				for (const keys of chunks) allChunks.push({
					sourceLocale,
					targetLocale: entry.locale,
					sourceMap,
					targetMap,
					keys
				});
			}
		}
		const DEFAULT_SAMPLE_SIZE = 20;
		const sampled = allChunks.slice(0, Option.getOrElse(flags.sampleSize, () => DEFAULT_SAMPLE_SIZE));
		const summaries = yield* deps.benchmarkRunner({
			strategies: strategyList,
			chunks: sampled,
			concurrency: effective.chunking.concurrency
		});
		const format = detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0);
		const entries = summaries.map((s) => ({
			strategyName: s.strategyName,
			totalChunks: s.totalChunks,
			succeededChunks: s.succeededChunks,
			failedChunks: s.failedChunks,
			totalDurationMs: s.totalDurationMs,
			averageDurationMsPerChunk: s.averageDurationMsPerChunk,
			totalAttempts: s.totalAttempts,
			totalPromptTokens: s.totalPromptTokens,
			totalCompletionTokens: s.totalCompletionTokens,
			estimatedCostUsd: s.estimatedCostUsd
		}));
		yield* deps.logger(formatBenchmark(entries, format));
	});
}
const benchmarkCommand = Command$1.make("benchmark", {
	config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
	adapter: Options.optional(Options.text("adapter")),
	strategies: Options.optional(Options.text("strategies")),
	sampleSize: Options.optional(Options.integer("sample-size")),
	chunkSize: Options.optional(Options.integer("chunk-size")),
	format: Options.optional(Options.text("format"))
}, (flags) => runBenchmarkCommand(flags, {
	configLoader: loadConfig,
	modelResolver: resolveModel,
	missingKeysComputer: computeMissingKeys,
	benchmarkRunner: runBenchmark,
	logger: (msg) => Console.log(msg),
	errorLogger: (msg) => Console.error(msg)
}));
//#endregion
//#region src/cli/commands/init.ts
function resolveAdapter(raw) {
	if (raw === "laravel") return {
		packageName: "@dialekt/adapter-laravel",
		importName: "laravel",
		configCall: `laravel({ langDir: './lang', scanPaths: ['./app', './resources/views'] })`
	};
	if (raw === "paraglide") return {
		packageName: "@dialekt/adapter-paraglide",
		importName: "paraglide",
		configCall: `paraglide({ messagesDir: './messages', scanPaths: ['./src'] })`
	};
	const pkg = raw.startsWith("npm:") ? raw.slice(4) : raw;
	const base = pkg.replace(/^@[^/]+\//, "").replace(/[^a-zA-Z_\d]/g, "_");
	return {
		packageName: pkg,
		importName: base,
		configCall: `${base}({ /* configure me */ })`
	};
}
function buildConfigContent(adapters) {
	const imports = [`import { defineConfig } from 'dialekt';`, ...adapters.map((a) => `import { ${a.importName} } from '${a.packageName}';`)];
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
function detectPackageManager(fs, cwd) {
	return Effect.gen(function* () {
		if (yield* fs.exists(`${cwd}/pnpm-lock.yaml`)) return "pnpm";
		if (yield* fs.exists(`${cwd}/package-lock.json`)) return "npm";
		if (yield* fs.exists(`${cwd}/yarn.lock`)) return "yarn";
		if (yield* fs.exists(`${cwd}/bun.lockb`)) return "bun";
		if (yield* fs.exists(`${cwd}/bun.lock`)) return "bun";
		return "npm";
	});
}
function installCommand(pm, packages) {
	const args = pm === "pnpm" ? [
		"add",
		"-D",
		...packages
	] : pm === "npm" ? [
		"install",
		"--save-dev",
		...packages
	] : pm === "yarn" ? [
		"add",
		"-D",
		...packages
	] : [
		"add",
		"-d",
		...packages
	];
	return Command.make(pm, ...args);
}
function installCommandString(pm, packages) {
	const pkgList = packages.join(" ");
	switch (pm) {
		case "pnpm": return `pnpm add -D ${pkgList}`;
		case "npm": return `npm install --save-dev ${pkgList}`;
		case "yarn": return `yarn add -D ${pkgList}`;
		case "bun": return `bun add -d ${pkgList}`;
		default: return `npm install --save-dev ${pkgList}`;
	}
}
function makeLiveDeps() {
	return {
		exists: (path) => Effect.gen(function* () {
			return yield* (yield* FileSystem.FileSystem).exists(path);
		}).pipe(Effect.provide([NodeContext.layer])),
		runInstall: (pm, packages) => Effect.gen(function* () {
			const cmd = installCommand(pm, packages);
			yield* Command.string(cmd);
		}).pipe(Effect.provide([NodeContext.layer])),
		writeFile: (path, content) => writeFileEnsuringDir(path, content).pipe(Effect.provide([NodeContext.layer]))
	};
}
function runInit(flags, cwd, deps, logger = (msg) => Console.log(msg)) {
	return Effect.gen(function* () {
		const format = detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0);
		if (flags.adapter.length === 0) {
			yield* logger(formatInit({
				success: false,
				message: "No adapters specified. Use --adapter <name>"
			}, format));
			return;
		}
		const configPath = `${cwd}/dialekt.config.ts`;
		if (yield* deps.exists(configPath)) {
			yield* logger(formatInit({
				success: false,
				message: `${configPath} already exists.`
			}, format));
			return;
		}
		const adapterInfos = flags.adapter.map(resolveAdapter);
		const allPackages = ["dialekt", ...adapterInfos.map((a) => a.packageName)];
		const pm = Option.getOrUndefined(flags.pm) ?? (yield* detectPackageManager(deps, cwd));
		const installCmd = installCommandString(pm, allPackages);
		if (!flags.noInstall) yield* deps.runInstall(pm, allPackages);
		const content = buildConfigContent(adapterInfos);
		yield* deps.writeFile(configPath, content);
		yield* logger(formatInit({
			success: true,
			message: "dialekt initialized.",
			configPath,
			packageManager: pm,
			installed: flags.noInstall ? [] : allPackages,
			skippedInstall: flags.noInstall,
			installCommands: flags.noInstall ? [installCmd] : []
		}, format));
	});
}
const pmOption = Options.optional(Options.choice("pm", [
	"npm",
	"pnpm",
	"bun"
])).pipe(Options.withDescription("Package manager to use for installing dependencies (npm, pnpm, bun)"));
const initCommand = Command$1.make("init", {
	adapter: Options.repeated(Options.text("adapter")),
	noInstall: Options.boolean("no-install").pipe(Options.withDefault(false)),
	format: Options.optional(Options.text("format")),
	pm: pmOption
}, (flags) => {
	const cwd = process.cwd();
	const deps = makeLiveDeps();
	return runInit({
		adapter: flags.adapter,
		noInstall: flags.noInstall,
		format: flags.format,
		pm: flags.pm
	}, cwd, deps);
});
//#endregion
//#region src/cli/main.ts
const rootCommand = Command$1.make("dialekt").pipe(Command$1.withSubcommands([
	initCommand,
	translateCommand,
	validateCommand,
	addCommand,
	missingCommand,
	unusedCommand,
	languagesCommand,
	benchmarkCommand
]));
const cli = Command$1.run(rootCommand, {
	name: "dialekt",
	version: "0.1.0"
});
const program = Effect.provide(cli(process.argv), NodeContext.layer);
NodeRuntime.runMain(program);
//#endregion
export {};
