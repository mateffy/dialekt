import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { FileSystem } from "@effect/platform/FileSystem";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, flattenObject, unflattenObject } from "@dialekt/core";
import { FileSystem as FileSystem$1, Path as Path$1 } from "@effect/platform";
//#region src/message-file.ts
function readMessageFile(path) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem$1.FileSystem;
		if (!(yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false)))) return {
			translations: {},
			meta: {}
		};
		const content = yield* fs.readFileString(path).pipe(Effect.orElseSucceed(() => "{}"));
		const parsed = yield* Effect.try({
			try: () => JSON.parse(content),
			catch: () => ({})
		}).pipe(Effect.orElseSucceed(() => ({})));
		const meta = {};
		const translations = {};
		for (const [key, value] of Object.entries(parsed)) if (key.startsWith("$")) meta[key] = value;
		else if (typeof value === "string") translations[key] = value;
		else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
			const flattened = flattenObject(value);
			for (const [flatKey, flatValue] of Object.entries(flattened)) if (typeof flatValue === "string") translations[`${key}.${flatKey}`] = flatValue;
		}
		return {
			translations,
			meta
		};
	});
}
function writeMessageFile(path, translations, meta) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem$1.FileSystem;
		const dir = (yield* Path$1.Path).dirname(path);
		yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orElseSucceed(() => void 0));
		const unflattened = unflattenObject(translations);
		const output = { ...meta };
		for (const [key, value] of Object.entries(unflattened)) output[key] = value;
		yield* fs.writeFileString(path, JSON.stringify(output, null, 2) + "\n").pipe(Effect.orElseSucceed(() => void 0));
	});
}
//#endregion
//#region src/unused-keys.ts
function findUnusedParaglideKeys(scanPaths, keys) {
	return Effect.gen(function* () {
		const fs = yield* FileSystem$1.FileSystem;
		const path = yield* Path$1.Path;
		const referenced = /* @__PURE__ */ new Set();
		for (const scanPath of scanPaths) {
			if (!(yield* fs.exists(scanPath).pipe(Effect.orElseSucceed(() => false)))) continue;
			const entries = yield* fs.readDirectory(scanPath, { recursive: true }).pipe(Effect.orElseSucceed(() => []));
			for (const relativePath of entries) {
				if (!relativePath.endsWith(".ts") && !relativePath.endsWith(".tsx") && !relativePath.endsWith(".js") && !relativePath.endsWith(".jsx") && !relativePath.endsWith(".svelte") && !relativePath.endsWith(".vue")) continue;
				const filePath = path.join(scanPath, relativePath);
				const content = yield* fs.readFileString(filePath).pipe(Effect.orElseSucceed(() => ""));
				for (const key of keys) if (new RegExp(`\\bm\\.${key}\\b`).test(content)) referenced.add(key);
			}
		}
		return keys.filter((key) => !referenced.has(key));
	}).pipe(Effect.mapError((cause) => new AdapterReadError({
		adapter: "paraglide",
		locale: "",
		resource: "messages",
		cause
	})));
}
//#endregion
//#region src/adapter.ts
function paraglide(options) {
	const { messagesDir, scanPaths = [] } = options;
	return {
		name: "paraglide",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: true
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem;
			yield* Path;
			if (!(yield* fs.exists(messagesDir).pipe(Effect.orElseSucceed(() => false)))) return [];
			const entries = yield* fs.readDirectory(messagesDir).pipe(Effect.orElseSucceed(() => []));
			const locales = [];
			for (const entry of entries) if (entry.endsWith(".json")) locales.push(entry.replace(/\.json$/, ""));
			return locales;
		}).pipe(Effect.mapError((cause) => new AdapterReadError({
			adapter: "paraglide",
			locale: "",
			resource: "",
			cause
		})), Effect.provide([NodePlatformLayer])),
		listResources: () => Effect.succeed([{
			key: "messages",
			label: "messages"
		}]),
		readResource: (locale, resource) => Effect.gen(function* () {
			return (yield* readMessageFile((yield* Path).join(messagesDir, `${locale}.json`)).pipe(Effect.mapError((cause) => new AdapterReadError({
				adapter: "paraglide",
				locale,
				resource: resource.key,
				cause
			})))).translations;
		}).pipe(Effect.provide([NodePlatformLayer])),
		writeResource: (locale, resource, entries) => Effect.gen(function* () {
			const filePath = (yield* Path).join(messagesDir, `${locale}.json`);
			yield* writeMessageFile(filePath, entries, (yield* readMessageFile(filePath).pipe(Effect.orElseSucceed(() => ({
				translations: {},
				meta: {}
			})))).meta).pipe(Effect.mapError((cause) => new AdapterWriteError({
				adapter: "paraglide",
				locale,
				resource: resource.key,
				cause
			})));
		}).pipe(Effect.provide([NodePlatformLayer])),
		findUnusedKeys: (locale, resource) => Effect.gen(function* () {
			const path = yield* Path;
			return yield* findUnusedParaglideKeys(scanPaths.length > 0 ? scanPaths : [path.resolve(messagesDir, "..")], yield* Effect.gen(function* () {
				const map = yield* paraglide(options).readResource(locale, resource);
				return Object.keys(map);
			}));
		}).pipe(Effect.provide([NodePlatformLayer]))
	};
}
//#endregion
export { paraglide };
