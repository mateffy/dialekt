import { Data, Effect, Schedule } from "effect";
import { FileSystem, Path } from "@effect/platform";
import { NodeContext } from "@effect/platform-node";
import { parse } from "@ast-grep/napi";
import { Output, ToolLoopAgent, generateText, hasToolCall, tool } from "ai";
import { z } from "zod";
import { createJiti } from "jiti";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
//#region src/hardcoded/types.ts
var HardcodedScanError = class extends Data.TaggedError("HardcodedScanError") {};
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
//#region src/hardcoded/filter.ts
/**
* Attributes whose values are almost always technical (class names, identifiers,
* routes, handlers). Translatable attributes such as `alt`, `title`,
* `placeholder`, `label` and `aria-label` are deliberately absent so they get
* reported.
*/
const DEFAULT_IGNORED_ATTRIBUTES = [
	"accept",
	"acceptCharset",
	"action",
	"align",
	"allow",
	"allowFullScreen",
	"as",
	"async",
	"autoComplete",
	"autoFocus",
	"autoPlay",
	"capture",
	"cellPadding",
	"cellSpacing",
	"charSet",
	"checked",
	"cite",
	"class",
	"className",
	"colSpan",
	"cols",
	"content",
	"contentEditable",
	"controls",
	"coords",
	"crossOrigin",
	"data",
	"dateTime",
	"decoding",
	"default",
	"defaultChecked",
	"defaultValue",
	"defer",
	"dir",
	"disabled",
	"download",
	"draggable",
	"encType",
	"enterKeyHint",
	"fetchPriority",
	"fill",
	"form",
	"formAction",
	"headers",
	"height",
	"hidden",
	"high",
	"href",
	"hrefLang",
	"htmlFor",
	"httpEquiv",
	"id",
	"inputMode",
	"integrity",
	"kind",
	"lang",
	"list",
	"loading",
	"loop",
	"low",
	"max",
	"maxLength",
	"media",
	"method",
	"min",
	"minLength",
	"multiple",
	"muted",
	"name",
	"noValidate",
	"open",
	"optimum",
	"pattern",
	"ping",
	"playsInline",
	"poster",
	"preload",
	"readOnly",
	"referrerPolicy",
	"rel",
	"required",
	"reversed",
	"role",
	"rowSpan",
	"rows",
	"sandbox",
	"scope",
	"selected",
	"shape",
	"size",
	"slot",
	"span",
	"spellCheck",
	"src",
	"srcDoc",
	"srcLang",
	"srcSet",
	"start",
	"step",
	"stroke",
	"strokeWidth",
	"style",
	"tabIndex",
	"target",
	"translate",
	"type",
	"useMap",
	"value",
	"viewBox",
	"width",
	"wrap",
	"xmlns"
];
const TRANSLATABLE_ARIA_ATTRIBUTES = /* @__PURE__ */ new Set([
	"aria-description",
	"aria-label",
	"aria-placeholder",
	"aria-roledescription",
	"aria-valuetext"
]);
const FRAMEWORK_ATTRIBUTE_PREFIXES = [
	"wire:",
	"x-",
	"@",
	":",
	"v-",
	"bind:",
	"on:",
	"use:",
	"transition:",
	"in:",
	"out:",
	"animate:",
	"class:",
	"style:",
	"let:"
];
const EVENT_HANDLER_RE = /^on[A-Z]/;
const URL_RE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const TECHNICAL_CHARS_RE = /[{}<>;=|\\`[\]()]/;
const LETTER_RE = /\p{L}/u;
const WHITESPACE_RE = /\s/;
const NUMERIC_RE = /^[\d\s.,:%+-]+$/;
const CONSTANT_RE = /^[A-Z][A-Z0-9_]*$/;
const CSS_CLASS_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/i;
const IDENTIFIER_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i;
const BLADE_DIRECTIVE_RE = /^(?:@|#)/;
const DEFAULT_HARDCODED_MIN_LENGTH = 2;
/** Merge global config, per-language overrides and defaults for one language. */
function resolveHardcodedOptions(config, language) {
	const languageConfig = config?.languages?.[language];
	const ignoredAttributes = new Set(config?.ignoredAttributes ?? DEFAULT_IGNORED_ATTRIBUTES);
	for (const attribute of languageConfig?.ignoredAttributes ?? []) ignoredAttributes.add(attribute);
	const ignoredValues = /* @__PURE__ */ new Set();
	for (const value of config?.ignoredValues ?? []) ignoredValues.add(value.toLowerCase());
	for (const value of languageConfig?.ignoredValues ?? []) ignoredValues.add(value.toLowerCase());
	return {
		minLength: languageConfig?.minLength ?? config?.minLength ?? 2,
		ignoredAttributes,
		ignoredValues
	};
}
function isIgnoredAttribute(name, options) {
	if (options.ignoredAttributes.has(name)) return true;
	if (name.startsWith("data-")) return true;
	if (name.startsWith("aria-")) return !TRANSLATABLE_ARIA_ATTRIBUTES.has(name);
	if (EVENT_HANDLER_RE.test(name)) return true;
	return FRAMEWORK_ATTRIBUTE_PREFIXES.some((prefix) => name.startsWith(prefix));
}
/**
* Heuristic gate for "is this string worth translating?". It intentionally
* errs on the side of reporting and lets config prune the rest.
*/
function isLikelyTranslatable(text, options) {
	const value = text.trim();
	if (value.length < options.minLength) return false;
	if (options.ignoredValues.has(value.toLowerCase())) return false;
	if (!LETTER_RE.test(value)) return false;
	if (TECHNICAL_CHARS_RE.test(value)) return false;
	if (URL_RE.test(value)) return false;
	if (NUMERIC_RE.test(value)) return false;
	if (CONSTANT_RE.test(value)) return false;
	if (BLADE_DIRECTIVE_RE.test(value)) return false;
	if (value.startsWith("/") || value.startsWith(".") || value.includes("://")) return false;
	if (WHITESPACE_RE.test(value)) return true;
	if (value.includes("@") || value.includes(":") || value.includes("\\")) return false;
	if (value.includes(".")) return false;
	if (CSS_CLASS_RE.test(value)) return false;
	return !IDENTIFIER_RE.test(value);
}
//#endregion
//#region src/hardcoded/ast.ts
const NEWLINE = 10;
const FIRST_LINE = 1;
/** Parse `content` with the tree-sitter grammar registered under `language`. */
function parseSource(language, content) {
	return parse(language, content).root();
}
/** Depth-first pre-order traversal. Return `false` from `visit` to skip a subtree. */
function walkAst(node, visit) {
	if (visit(node) === false) return;
	for (const child of node.children()) walkAst(child, visit);
}
/** Find the first descendant (including `node`) matching `predicate`. */
function findFirst(node, predicate) {
	if (predicate(node)) return node;
	for (const child of node.children()) {
		const found = findFirst(child, predicate);
		if (found !== null) return found;
	}
	return null;
}
function positionAt(content, index) {
	const bounded = Math.max(0, Math.min(index, content.length));
	let line = FIRST_LINE;
	let lineStart = 0;
	for (let i = 0; i < bounded; i += 1) if (content.charCodeAt(i) === NEWLINE) {
		line += 1;
		lineStart = i + 1;
	}
	return {
		line,
		column: bounded - lineStart + 1
	};
}
/** Trim `raw` and express the result as absolute character indices in the file. */
function trimSlice(raw, absoluteStart) {
	const leading = raw.length - raw.trimStart().length;
	const trimmed = raw.trim();
	if (trimmed.length === 0) return null;
	const start = absoluteStart + leading;
	return {
		text: trimmed.replace(/\s+/g, " "),
		start,
		end: start + trimmed.length - 1
	};
}
/** Turn an absolute slice into a located finding. */
function toFinding(args) {
	const start = positionAt(args.content, args.slice.start);
	const end = positionAt(args.content, args.slice.end);
	const finding = {
		file: args.file,
		line: start.line,
		column: start.column,
		endLine: end.line,
		endColumn: end.column,
		text: args.slice.text,
		kind: args.kind,
		language: args.language,
		confidence: args.confidence
	};
	return args.attribute === void 0 ? finding : {
		...finding,
		attribute: args.attribute
	};
}
//#endregion
//#region src/hardcoded/scanners/jsx.ts
/** Components that already route their children through a translator. */
const TRANSLATION_COMPONENTS = /* @__PURE__ */ new Set([
	"Trans",
	"Translate",
	"FormattedMessage",
	"FormattedHTMLMessage"
]);
/** Elements whose text content is code or markup, never UI copy. */
const NON_TRANSLATABLE_ELEMENTS = /* @__PURE__ */ new Set([
	"code",
	"pre",
	"script",
	"style",
	"kbd",
	"samp"
]);
const JSX_LANGUAGES = [
	"javascript",
	"javascriptreact",
	"typescript",
	"typescriptreact"
];
const GRAMMAR_BY_LANGUAGE = {
	javascript: "js",
	javascriptreact: "jsx",
	typescript: "ts",
	typescriptreact: "tsx"
};
const NAME_KINDS = /* @__PURE__ */ new Set([
	"identifier",
	"member_expression",
	"jsx_namespaced_name",
	"nested_identifier",
	"property_identifier"
]);
const STRING_CONTENT_KINDS = /* @__PURE__ */ new Set(["string_fragment", "string_content"]);
function nameFromElement(node) {
	const nameNode = node.children().find((child) => NAME_KINDS.has(child.kind()));
	return nameNode === void 0 ? null : nameNode.text();
}
function elementName(node) {
	if (node.kind() === "jsx_element") {
		const opening = node.children().find((child) => child.kind() === "jsx_opening_element");
		return opening === void 0 ? null : nameFromElement(opening);
	}
	return nameFromElement(node);
}
function stringContent(node) {
	return node.children().find((child) => STRING_CONTENT_KINDS.has(child.kind())) ?? null;
}
function scanText$1(node, input, findings) {
	const slice = trimSlice(node.text(), node.range().start.index);
	if (slice === null || !isLikelyTranslatable(slice.text, input.options)) return;
	findings.push(toFinding({
		file: input.file,
		language: input.language,
		kind: "jsx-text",
		content: input.content,
		slice,
		confidence: .9
	}));
}
function scanAttribute$1(node, input, findings) {
	const nameNode = node.children().find((child) => child.kind() === "property_identifier");
	const valueNode = node.children().find((child) => child.kind() === "string" || child.kind() === "template_string");
	if (nameNode === void 0 || valueNode === void 0) return;
	const attribute = nameNode.text();
	if (isIgnoredAttribute(attribute, input.options)) return;
	const content = stringContent(valueNode);
	if (content === null) return;
	const slice = trimSlice(content.text(), content.range().start.index);
	if (slice === null || !isLikelyTranslatable(slice.text, input.options)) return;
	findings.push(toFinding({
		file: input.file,
		language: input.language,
		kind: "jsx-attribute",
		content: input.content,
		slice,
		confidence: .7,
		attribute
	}));
}
function scanJsx(input) {
	const root = parseSource(GRAMMAR_BY_LANGUAGE[input.language] ?? "tsx", input.content);
	const findings = [];
	walkAst(root, (node) => {
		const kind = node.kind();
		if (kind === "jsx_element" || kind === "jsx_self_closing_element") {
			const name = elementName(node);
			if (name !== null && (TRANSLATION_COMPONENTS.has(name) || NON_TRANSLATABLE_ELEMENTS.has(name))) return false;
		}
		if (kind === "jsx_text") scanText$1(node, input, findings);
		else if (kind === "jsx_attribute") scanAttribute$1(node, input, findings);
		return true;
	});
	return findings;
}
const jsxScanner = {
	name: "jsx",
	languages: JSX_LANGUAGES,
	extensions: [
		".js",
		".jsx",
		".ts",
		".tsx"
	],
	scan: scanJsx
};
//#endregion
//#region src/hardcoded/scanners/blade.ts
/**
* Blade expressions (`{{ }}`, `{!! !!}` and `@directive(...)`) are replaced
* with spaces of the same length. Length is preserved so the trimmed text still
* maps to the original file offsets.
*/
const BLADE_EXPRESSION_RE = /\{\{[\s\S]*?\}\}|\{!![\s\S]*?!!\}|(?<![\w.])@[a-zA-Z]+(?:\s*\([^)]*\))?/g;
function maskBladeExpressions(raw) {
	return raw.replace(BLADE_EXPRESSION_RE, (match) => " ".repeat(match.length));
}
function scanText(node, input, findings) {
	const slice = trimSlice(maskBladeExpressions(node.text()), node.range().start.index);
	if (slice === null || !isLikelyTranslatable(slice.text, input.options)) return;
	findings.push(toFinding({
		file: input.file,
		language: input.language,
		kind: "html-text",
		content: input.content,
		slice,
		confidence: .85
	}));
}
function scanAttribute(node, input, findings) {
	const nameNode = node.children().find((child) => child.kind() === "attribute_name");
	const valueNode = findFirst(node, (child) => child.kind() === "attribute_value");
	if (nameNode === void 0 || valueNode === null) return;
	const attribute = nameNode.text();
	if (isIgnoredAttribute(attribute, input.options)) return;
	const slice = trimSlice(valueNode.text(), valueNode.range().start.index);
	if (slice === null || !isLikelyTranslatable(slice.text, input.options)) return;
	findings.push(toFinding({
		file: input.file,
		language: input.language,
		kind: "html-attribute",
		content: input.content,
		slice,
		confidence: .7,
		attribute
	}));
}
function scanBlade(input) {
	const root = parseSource("html", input.content);
	const findings = [];
	walkAst(root, (node) => {
		const kind = node.kind();
		if (kind === "text") scanText(node, input, findings);
		else if (kind === "attribute") scanAttribute(node, input, findings);
		return true;
	});
	return findings;
}
const bladeScanner = {
	name: "blade",
	languages: ["blade"],
	extensions: [".blade.php"],
	scan: scanBlade
};
//#endregion
//#region src/hardcoded/scan.ts
const DEFAULT_SCANNERS = [jsxScanner, bladeScanner];
const SKIPPED_DIRECTORIES = /* @__PURE__ */ new Set([
	".cache",
	".git",
	".next",
	".nuxt",
	".svelte-kit",
	".turbo",
	"build",
	"coverage",
	"dist",
	"node_modules",
	"storage",
	"vendor"
]);
const EXTENSION_LANGUAGE = [
	[".blade.php", "blade"],
	[".tsx", "typescriptreact"],
	[".jsx", "javascriptreact"],
	[".ts", "typescript"],
	[".js", "javascript"]
];
const SCAN_CONCURRENCY = 10;
function languageForFile(file) {
	const lower = file.toLowerCase();
	for (const [extension, language] of EXTENSION_LANGUAGE) if (lower.endsWith(extension)) return language;
	return null;
}
function normalizePath(value) {
	return value.replace(/\\/g, "/").replace(/^\.\//, "");
}
function isIgnoredFinding(finding, ignore) {
	const file = normalizePath(finding.file);
	return ignore.some((entry) => {
		if (entry.text !== finding.text) return false;
		if (entry.kind !== void 0 && entry.kind !== finding.kind) return false;
		const pattern = normalizePath(entry.file);
		return file === pattern || file.endsWith(`/${pattern}`);
	});
}
function isSkippedFile(relativePath) {
	return normalizePath(relativePath).split("/").some((segment) => SKIPPED_DIRECTORIES.has(segment));
}
function scannerFor(language, scanners) {
	return scanners.find((candidate) => candidate.languages.includes(language)) ?? null;
}
function dedupeAndSort(findings) {
	const seen = /* @__PURE__ */ new Set();
	const unique = [];
	for (const finding of findings) {
		const key = `${finding.file}:${finding.line}:${finding.column}:${finding.kind}:${finding.text}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(finding);
	}
	return unique.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.column - b.column);
}
function scanHardcoded(options) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path.Path;
		const scanners = options.scanners ?? DEFAULT_SCANNERS;
		const findings = [];
		for (const scanPath of options.scanPaths) {
			if (!(yield* fs.exists(scanPath).pipe(Effect.orElseSucceed(() => false)))) continue;
			const files = (yield* fs.readDirectory(scanPath, { recursive: true }).pipe(Effect.orElseSucceed(() => []))).map((entry) => ({
				entry,
				language: languageForFile(entry)
			})).filter((candidate) => !isSkippedFile(candidate.entry) && candidate.language !== null);
			const perFile = yield* Effect.forEach(files, (candidate) => Effect.gen(function* () {
				const scanner = scannerFor(candidate.language, scanners);
				if (scanner === null) return [];
				const filePath = path.join(scanPath, candidate.entry);
				const content = yield* fs.readFileString(filePath).pipe(Effect.orElseSucceed(() => null));
				if (content === null) return [];
				const file = normalizePath(filePath);
				return yield* Effect.try({
					try: () => scanner.scan({
						file,
						language: candidate.language,
						content,
						options: resolveHardcodedOptions(options.config, candidate.language)
					}),
					catch: (cause) => new HardcodedScanError({
						path: file,
						cause
					})
				});
			}), { concurrency: SCAN_CONCURRENCY });
			for (const result of perFile) for (const finding of result) findings.push(finding);
		}
		return dedupeAndSort(findings.filter((finding) => !isIgnoredFinding(finding, options.ignore ?? [])));
	});
}
/** Scan a project using `config.hardcoded`, with all platform services provided. */
function scanProjectHardcoded(config) {
	const hardcoded = config.hardcoded;
	if (hardcoded?.enabled === false) return Effect.succeed([]);
	return scanHardcoded({
		scanPaths: hardcoded?.scanPaths ?? ["."],
		config: hardcoded,
		ignore: hardcoded?.ignore ?? []
	}).pipe(Effect.provide(NodePlatformLayer));
}
//#endregion
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
	const m = v;
	return typeof m["doGenerate"] === "function" || typeof m["specificationVersion"] !== "undefined";
}
const VALID_PROVIDERS = /* @__PURE__ */ new Set([
	"openai",
	"openrouter",
	"anthropic",
	"google"
]);
function loadProviderModel(provider, modelId) {
	return Effect.tryPromise({
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
			}
		},
		catch: (cause) => cause instanceof UnknownProviderError ? cause : new UnknownProviderError({ provider })
	});
}
function resolveModel(config) {
	return Effect.gen(function* () {
		if (isLanguageModel(config)) return config;
		const { provider, modelId } = config;
		if (!VALID_PROVIDERS.has(provider)) return yield* Effect.fail(new UnknownProviderError({ provider }));
		return yield* loadProviderModel(provider, modelId);
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
			promptTokens: result.usage?.inputTokens ?? 0,
			completionTokens: result.usage?.outputTokens ?? 0
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
* a resource so we can write after each chunk (resumability).
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
/** Translate all resources for one locale in parallel, tracking per-chunk progress. */
function translateLocale(adapter, strategy, chunking, sourceLocale, locale, resources, failures, onProgress) {
	return Effect.gen(function* () {
		onProgress?.({
			type: "locale-start",
			locale,
			resourcesTotal: resources.length
		});
		let chOk = 0;
		let chFail = 0;
		const chunkCfg = {
			maxTokens: chunking.maxTokens,
			charsPerToken: chunking.charsPerToken,
			...chunking.keysPerChunk !== void 0 ? { keysPerChunk: chunking.keysPerChunk } : {}
		};
		if ((yield* Effect.forEach(resources, (res) => translateResource(adapter, strategy, chunkCfg, sourceLocale, locale, res, failures, (e) => {
			if (e.type === "chunk-complete") chOk++;
			else if (e.type === "chunk-fail") chFail++;
			onProgress?.(e);
		}).pipe(Effect.either), {
			concurrency: chunking.concurrency,
			discard: false
		})).some((r) => r._tag === "Left") || chFail > 0) onProgress?.({
			type: "locale-error",
			locale
		});
		else onProgress?.({
			type: "locale-done",
			locale
		});
	});
}
/** Pre-scan a locale: count missing keys, compute chunk count. */
function preScanLocale(adapter, sourceLocale, locale, chunking, resourceFilter) {
	return Effect.gen(function* () {
		const allRes = yield* adapter.listResources(sourceLocale);
		const filtered = resourceFilter ? allRes.filter((r) => r.key === resourceFilter || r.label === resourceFilter || r.key.startsWith(resourceFilter)) : allRes;
		let missingKeys = 0;
		let chunksTotal = 0;
		for (const resource of filtered) {
			const srcMap = yield* adapter.readResource(sourceLocale, resource);
			const tgtMap = yield* adapter.readResource(locale, resource);
			const missing = diffKeys(srcMap, tgtMap);
			missingKeys += missing.length;
			if (missing.length > 0) {
				const cfg = {
					maxTokens: chunking.maxTokens,
					charsPerToken: chunking.charsPerToken,
					...chunking.keysPerChunk !== void 0 ? { keysPerChunk: chunking.keysPerChunk } : {}
				};
				chunksTotal += chunkKeys(missing, srcMap, tgtMap, cfg).length;
			}
		}
		return {
			locale,
			resources: filtered,
			missingKeys,
			chunksTotal
		};
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
			const localeJobs = yield* Effect.forEach(targetLocales, (locale) => preScanLocale(adapter, sourceLocale, locale, config.chunking, config.resourceFilter), { concurrency: Math.min(targetLocales.length, config.chunking.concurrency) });
			for (const job of localeJobs) onProgress?.({
				type: "locale-scanned",
				locale: job.locale,
				missingKeys: job.missingKeys,
				chunksTotal: job.chunksTotal
			});
			yield* Effect.forEach(localeJobs, ({ locale, resources }) => translateLocale(adapter, config.strategy, config.chunking, sourceLocale, locale, resources, failures, onProgress), { concurrency: config.chunking.concurrency });
		}
		if (failures.length > 0) return yield* Effect.fail(new TranslationFailedError({
			keys: failures.flatMap((f) => [...f.keys]),
			cause: failures.map((f) => f.cause)
		}));
	});
}
//#endregion
//#region src/translation/missing-keys.ts
function missingForLocale(adapter, sourceMap, locale, resource) {
	return Effect.gen(function* () {
		const missing = diffKeys(sourceMap, yield* adapter.readResource(locale, resource));
		return missing.length > 0 ? [{
			adapter: adapter.name,
			locale,
			resource,
			missing
		}] : [];
	});
}
function missingForResource(adapter, sourceLocale, targetLocales, resource) {
	return Effect.gen(function* () {
		const sourceMap = yield* adapter.readResource(sourceLocale, resource);
		return yield* Effect.forEach(targetLocales, (locale) => missingForLocale(adapter, sourceMap, locale, resource), { concurrency: targetLocales.length }).pipe(Effect.map((xs) => xs.flat()));
	});
}
function computeMissingKeys(adapter, sourceLocale, targetLocales) {
	return Effect.gen(function* () {
		const resources = yield* adapter.listResources(sourceLocale);
		const maxConcurrency = Math.min(resources.length, 10);
		return yield* Effect.forEach(resources, (resource) => missingForResource(adapter, sourceLocale, targetLocales, resource), { concurrency: maxConcurrency }).pipe(Effect.map((xs) => xs.flat()));
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
const C$2 = {
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
	return `${codes.join("")}${text}${C$2.reset}`;
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
	const headerRow = g.vLine + headers.map((h, i) => ` ${color(pad(h, colWidths[i]), C$2.bold)} `).join(g.vLine) + g.vLine;
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
	return `${color(line, C$2.dim)}\n  ${color(title, C$2.bold + C$2.cyan)}\n${color(line, C$2.dim)}`;
}
function sectionHeader(label) {
	return `\n${color(`${glyphs().arrow} ${label}`, C$2.bold + C$2.cyan)}`;
}
function success(text) {
	return `${color(`${glyphs().check} ${text}`, C$2.green)}`;
}
function failure(text) {
	return `${color(`${glyphs().crossMark} ${text}`, C$2.red)}`;
}
function warning(text) {
	return `${color(`${glyphs().warn} ${text}`, C$2.yellow)}`;
}
function info(text) {
	return color(text, C$2.dim);
}
function keyValue(key, value) {
	return `  ${color(key, C$2.bold)} ${value}`;
}
//#endregion
//#region src/cli/formatters.ts
/**
* Command-specific formatters for the dialekt CLI output.
*
* Imports the core utilities from `format.ts` and builds structured
* pretty / JSON renderers for each dialekt command.
*/
const C$1 = {
	reset: "\x1B[0m",
	bold: "\x1B[1m",
	dim: "\x1B[2m",
	red: "\x1B[31m",
	green: "\x1B[32m",
	yellow: "\x1B[33m",
	blue: "\x1B[34m",
	cyan: "\x1B[36m"
};
const D = C$1.dim;
const W = C$1.reset;
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
		lines.push(`\n  ${color(adapter, C$1.bold + C$1.blue)} ${color(`(${adapterTotal})`, C$1.dim)}`);
		for (const [locale, byResource] of byLocale) {
			let localeTotal = 0;
			for (const keys of byResource.values()) localeTotal += keys.length;
			lines.push(`    ${color(`${g.arrow} ${locale}`, C$1.yellow)} ${color(`(${localeTotal})`, C$1.dim)}`);
			for (const [resource, keys] of byResource) {
				lines.push(`      ${color(resource, C$1.bold)}`);
				for (const key of keys) lines.push(`        ${color(g.bullet, C$1.dim)} ${key}`);
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
		lines.push(`\n  ${color(adapter, C$1.bold + C$1.blue)} ${color(`(${adapterTotal})`, C$1.dim)}`);
		for (const [locale, byResource] of byLocale) {
			let localeTotal = 0;
			for (const keys of byResource.values()) localeTotal += keys.length;
			lines.push(`    ${color(`${g.arrow} ${locale}`, C$1.yellow)} ${color(`(${localeTotal})`, C$1.dim)}`);
			for (const [resource, keys] of byResource) {
				lines.push(`      ${color(resource, C$1.bold)}`);
				for (const key of keys) lines.push(`        ${color(g.bullet, C$1.dim)} ${key}`);
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
	lines.push(color(`Run ${color("dialekt translate", C$1.bold + C$1.cyan)} to fill missing keys.`, C$1.dim));
	return lines.join("\n") + "\n";
}
function formatLanguages(entries, format) {
	if (format === "json") return JSON.stringify(entries, null, 2) + "\n";
	if (entries.length === 0) return warning("No adapters configured.") + "\n";
	const lines = [];
	const g = glyphs();
	for (const e of entries) {
		lines.push(`  ${color(e.adapter, C$1.bold + C$1.blue)}`);
		lines.push(`    ${color(`${g.arrow}`, C$1.dim)} ${e.locales.join(color(", ", C$1.dim))}`);
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
				lines.push(`  ${cs.chunkCount.toString().padEnd(CHUNKS_COL_WIDTH)} ${formatMs(time).padEnd(TIME_COL_WIDTH)} ${formatMs(cs.avgDurationMs).padEnd(STAT_COL_WIDTH)} ${formatMs(cs.minDurationMs).padEnd(STAT_COL_WIDTH)} ${formatMs(cs.maxDurationMs)}`);
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
					const t = translated > 0 ? C$1.green + String(translated) + W : D + "—" + W;
					const r = remaining > 0 ? C$1.yellow + String(remaining) + W : C$1.green + "0" + W;
					lines.push(`  ${padEnd(loc, 12)} ${t}        ${r}`);
				}
			}
		}
		return lines.join("\n") + "\n";
	}
	return failure(result.message) + "\n";
}
function formatMs(ms) {
	const MS_PER_MINUTE = 6e4;
	const MS_PER_SECOND = 1e3;
	if (ms >= MS_PER_MINUTE) return (ms / MS_PER_MINUTE).toFixed(1) + "m";
	if (ms >= MS_PER_SECOND) return (ms / MS_PER_SECOND).toFixed(1) + "s";
	return Math.round(ms) + "ms";
}
const CHUNKS_COL_WIDTH = 7;
const TIME_COL_WIDTH = 13;
const STAT_COL_WIDTH = 6;
function formatAdd(result, format) {
	if (format === "json") return JSON.stringify(result, null, 2) + "\n";
	if (result.success) {
		const lines = [success(result.message)];
		if (result.addedResources && result.addedResources.length > 0) {
			lines.push("");
			lines.push(color("Added to:", C$1.dim));
			for (const r of result.addedResources) lines.push(`  ${color(glyphs().bullet, C$1.dim)} ${r}`);
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
		lines.push(color("Installed:", C$1.dim));
		for (const pkg of result.installed) lines.push(`  ${color(glyphs().bullet, C$1.dim)} ${pkg}`);
	}
	if (result.skippedInstall) {
		lines.push("");
		if (result.installCommands && result.installCommands.length > 0) {
			lines.push(color("Run the following to install:", C$1.dim));
			for (const cmd of result.installCommands) lines.push(`  ${color(`$ ${cmd}`, C$1.cyan)}`);
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
//#region src/cli/hardcoded-formatters.ts
const C = {
	reset: "\x1B[0m",
	bold: "\x1B[1m",
	dim: "\x1B[2m",
	cyan: "\x1B[36m",
	yellow: "\x1B[33m"
};
function formatHardcoded(findings, format) {
	if (format === "json") return JSON.stringify(findings, null, 2) + "\n";
	if (findings.length === 0) return success("No hardcoded strings found.") + "\n";
	const byFile = /* @__PURE__ */ new Map();
	for (const finding of findings) {
		const list = byFile.get(finding.file) ?? [];
		list.push(finding);
		byFile.set(finding.file, list);
	}
	const g = glyphs();
	const lines = [`\n${color(`${g.arrow} Hardcoded strings (${findings.length})`, C.bold + C.cyan)}`];
	for (const [file, fileFindings] of byFile) {
		lines.push(`\n  ${color(file, C.bold)} ${color(`(${fileFindings.length})`, C.dim)}`);
		for (const finding of fileFindings) {
			const location = `${finding.line}:${finding.column}`;
			const label = finding.attribute === void 0 ? finding.kind : `${finding.kind}:${finding.attribute}`;
			lines.push(`    ${color(g.bullet, C.dim)} ${color(location.padEnd(10), C.yellow)} ${color(label, C.dim)}  ${finding.text}`);
		}
	}
	return lines.join("\n") + "\n";
}
function formatDoctor(result, format) {
	if (format === "json") return JSON.stringify({
		missing: result.missing,
		hardcoded: result.hardcoded,
		summary: {
			missing: result.missing.length,
			hardcoded: result.hardcoded.length
		}
	}, null, 2) + "\n";
	const lines = [banner("dialekt doctor")];
	if (result.skipped.hardcoded) lines.push(info("  Hardcoded-string scan skipped."));
	else lines.push(formatHardcoded(result.hardcoded, "pretty").trimEnd());
	if (result.skipped.missing) lines.push(info("  Missing-key check skipped."));
	else lines.push(formatMissingKeys(result.missing, "pretty").trimEnd());
	const total = result.missing.length + result.hardcoded.length;
	lines.push("");
	if (total === 0) lines.push(success("No translation issues found."));
	else lines.push(color(`Found ${result.missing.length} missing key(s) and ${result.hardcoded.length} hardcoded string(s).`, C.bold + C.yellow));
	return lines.join("\n") + "\n";
}
//#endregion
export { NodePlatformLayer as $, buildUserPrompt as A, DEFAULT_SCANNERS as B, ConfigLoadError as C, createToolLoopStrategy as D, runTranslation as E, writeFileEnsuringDir as F, scanProjectHardcoded as G, languageForFile as H, chunkKeys as I, DEFAULT_HARDCODED_MIN_LENGTH as J, bladeScanner as K, diffKeys as L, UnknownProviderError as M, resolveModel as N, createOneShotStrategy as O, readFileIfExists as P, resolveHardcodedOptions as Q, flattenObject as R, warning as S, computeMissingKeys as T, normalizePath as U, isIgnoredFinding as V, scanHardcoded as W, isIgnoredAttribute as X, DEFAULT_IGNORED_ATTRIBUTES as Y, isLikelyTranslatable as Z, glyphs as _, formatError as a, sectionHeader as b, formatMissingKeys as c, formatValidate as d, HardcodedScanError as et, banner as f, failure as g, drawTable as h, formatBenchmark as i, TranslationFailedError as j, buildSystemPrompt as k, formatTranslate as l, detectFormat as m, formatHardcoded as n, formatInit as o, color as p, jsxScanner as q, formatAdd as r, formatLanguages as s, formatDoctor as t, formatUnusedKeys as u, info as v, loadConfig as w, success as x, keyValue as y, unflattenObject as z };
