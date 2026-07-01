import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, flattenObject, readFileIfExists, readPhpArrayAsJson, unflattenObject, writeFileEnsuringDir } from "@dialekt/core";
import { FileSystem, Path as Path$1 } from "@effect/platform";
//#region src/php-array-writer.ts
function phpVarExport(value) {
	return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}
function renderPhpArray(value, indent = 0) {
	const entries = Object.entries(value);
	if (entries.length === 0) return "[]";
	const pad = "    ".repeat(indent);
	const innerPad = "    ".repeat(indent + 1);
	const lines = ["["];
	for (const [key, val] of entries) {
		const renderedKey = /^\d+$/.test(key) ? key : phpVarExport(key);
		const renderedValue = typeof val === "object" && val !== null && !Array.isArray(val) ? renderPhpArray(val, indent + 1) : typeof val === "string" ? phpVarExport(val) : String(val);
		lines.push(`${innerPad}${renderedKey} => ${renderedValue},`);
	}
	lines.push(`${pad}]`);
	return lines.join("\n");
}
function renderPhpFile(value) {
	return `<?php\n\nreturn ${renderPhpArray(value, 0)};\n`;
}
//#endregion
//#region src/resources.ts
function listLaravelLocales(langDir) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path$1.Path;
		const entries = yield* fs.readDirectory(langDir).pipe(Effect.orElseSucceed(() => []));
		const locales = [];
		for (const entry of entries) {
			const fullPath = path.join(langDir, entry);
			const stat = yield* fs.stat(fullPath).pipe(Effect.option);
			if (stat._tag === "Some" && stat.value.type === "Directory" && entry !== "vendor" && entry !== "lang") locales.push(entry);
		}
		return locales;
	}).pipe(Effect.mapError((cause) => new AdapterReadError({
		adapter: "laravel",
		locale: "",
		resource: "",
		cause
	})));
}
function listLaravelResources(langDir, locale) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path$1.Path;
		const localeDir = path.join(langDir, locale);
		const refs = [];
		const entries = yield* fs.readDirectory(localeDir).pipe(Effect.orElseSucceed(() => []));
		for (const entry of entries) if (entry.endsWith(".php")) {
			const domain = entry.replace(/\.php$/, "");
			refs.push({
				key: domain,
				label: domain
			});
		}
		const jsonPath = path.join(langDir, `${locale}.json`);
		if (yield* fs.exists(jsonPath).pipe(Effect.orElseSucceed(() => false))) refs.push({
			key: "json",
			label: `${locale}.json`
		});
		return refs;
	}).pipe(Effect.mapError((cause) => new AdapterReadError({
		adapter: "laravel",
		locale,
		resource: "",
		cause
	})));
}
//#endregion
//#region src/unused-keys.ts
function findUnusedLaravelKeys(scanPaths, domain, keys) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const path = yield* Path$1.Path;
		const referenced = /* @__PURE__ */ new Set();
		for (const scanPath of scanPaths) {
			if (!(yield* fs.exists(scanPath).pipe(Effect.orElseSucceed(() => false)))) continue;
			const entries = yield* fs.readDirectory(scanPath, { recursive: true }).pipe(Effect.orElseSucceed(() => []));
			for (const relativePath of entries) {
				if (!relativePath.endsWith(".php") && !relativePath.endsWith(".blade.php")) continue;
				const filePath = path.join(scanPath, relativePath);
				const content = yield* fs.readFileString(filePath).pipe(Effect.orElseSucceed(() => ""));
				const quotedStrings = [];
				for (const pattern of [/'((?:[^'\\]|\\.)*)'/g, /"((?:[^"\\]|\\.)*)"/g]) {
					let m;
					while ((m = pattern.exec(content)) !== null) if (m[1] !== void 0) quotedStrings.push(m[1]);
				}
				for (const str of quotedStrings) for (const key of keys) if (str === `${domain}.${key}`) referenced.add(key);
			}
		}
		return keys.filter((key) => !referenced.has(key));
	}).pipe(Effect.mapError((cause) => new AdapterReadError({
		adapter: "laravel",
		locale: "",
		resource: domain,
		cause
	})));
}
//#endregion
//#region src/adapter.ts
function laravel(options) {
	const { langDir, scanPaths = [] } = options;
	return {
		name: "laravel",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: true
		},
		listLocales: () => listLaravelLocales(langDir).pipe(Effect.provide(NodePlatformLayer)),
		listResources: (locale) => listLaravelResources(langDir, locale).pipe(Effect.provide(NodePlatformLayer)),
		readResource: (locale, resource) => Effect.gen(function* () {
			const path = yield* Path;
			if (resource.key === "json") {
				const content = yield* readFileIfExists(path.join(langDir, `${locale}.json`)).pipe(Effect.mapError((cause) => new AdapterReadError({
					adapter: "laravel",
					locale,
					resource: resource.key,
					cause
				})));
				if (content === null) return {};
				return yield* Effect.try({
					try: () => JSON.parse(content),
					catch: (cause) => new AdapterReadError({
						adapter: "laravel",
						locale,
						resource: resource.key,
						cause
					})
				});
			}
			return flattenObject(yield* readPhpArrayAsJson(path.join(langDir, locale, `${resource.key}.php`)).pipe(Effect.catchTag("PhpExecutionError", () => Effect.succeed({})), Effect.mapError((cause) => new AdapterReadError({
				adapter: "laravel",
				locale,
				resource: resource.key,
				cause
			}))));
		}).pipe(Effect.provide([NodePlatformLayer])),
		writeResource: (locale, resource, entries) => Effect.gen(function* () {
			const path = yield* Path;
			if (resource.key === "json") {
				yield* writeFileEnsuringDir(path.join(langDir, `${locale}.json`), JSON.stringify(entries, null, 2)).pipe(Effect.mapError((cause) => new AdapterWriteError({
					adapter: "laravel",
					locale,
					resource: resource.key,
					cause
				})));
				return;
			}
			yield* writeFileEnsuringDir(path.join(langDir, locale, `${resource.key}.php`), renderPhpFile(unflattenObject(entries))).pipe(Effect.mapError((cause) => new AdapterWriteError({
				adapter: "laravel",
				locale,
				resource: resource.key,
				cause
			})));
		}).pipe(Effect.provide([NodePlatformLayer])),
		findUnusedKeys: (locale, resource) => Effect.gen(function* () {
			const path = yield* Path;
			const adapterScanPaths = scanPaths.length > 0 ? scanPaths : [path.resolve(langDir, "..")];
			const keys = yield* Effect.gen(function* () {
				const map = yield* laravel(options).readResource(locale, resource);
				return Object.keys(map);
			});
			return yield* findUnusedLaravelKeys(adapterScanPaths, resource.key, keys);
		}).pipe(Effect.provide([NodePlatformLayer]))
	};
}
//#endregion
export { laravel };
