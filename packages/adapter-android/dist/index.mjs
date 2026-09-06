import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, readFileIfExists, writeFileEnsuringDir } from "dialekt";
import { FileSystem } from "@effect/platform";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
//#region src/adapter.ts
const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_",
	preserveOrder: false
});
const builder = new XMLBuilder({
	ignoreAttributes: false,
	attributeNamePrefix: "@_"
});
function readError(locale, resource, cause) {
	return new AdapterReadError({
		adapter: "android",
		locale,
		resource,
		cause
	});
}
function writeError(locale, resource, cause) {
	return new AdapterWriteError({
		adapter: "android",
		locale,
		resource,
		cause
	});
}
function normalizeArray(raw) {
	if (!raw) return [];
	return Array.isArray(raw) ? raw : [raw];
}
function readAndroidResource(dir, locale, resource) {
	return Effect.gen(function* () {
		const content = yield* readFileIfExists((yield* Path).join(dir, `res/values-${locale}/strings.xml`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
		if (content === null) return {};
		const resources = parser.parse(content).resources ?? {};
		const result = {};
		for (const stringItem of normalizeArray(resources.string)) {
			const name = String(stringItem["@_name"] ?? "");
			const value = String(stringItem["#text"] ?? "");
			if (name) result[name] = value;
		}
		for (const pluralItem of normalizeArray(resources.plurals)) {
			const pluralName = String(pluralItem["@_name"] ?? "");
			for (const item of normalizeArray(pluralItem.item)) {
				const quantity = String(item["@_quantity"] ?? "");
				const value = String(item["#text"] ?? "");
				if (pluralName && quantity) result[`${pluralName}.${quantity}`] = value;
			}
		}
		return result;
	});
}
function writeAndroidResource(dir, locale, resource, entries) {
	return Effect.gen(function* () {
		const filePath = (yield* Path).join(dir, `res/values-${locale}/strings.xml`);
		const strings = [];
		const pluralsMap = {};
		for (const [key, value] of Object.entries(entries)) {
			const pluralMatch = /^(.+)\.(one|other|zero|two|few|many)$/.exec(key);
			if (pluralMatch) {
				const base = pluralMatch[1];
				const quantity = pluralMatch[2];
				pluralsMap[base] ??= {};
				pluralsMap[base][quantity] = value;
			} else strings.push({
				"@_name": key,
				"#text": value
			});
		}
		const pluralEntries = [];
		for (const [name, items] of Object.entries(pluralsMap)) pluralEntries.push({
			"@_name": name,
			item: Object.entries(items).map(([quantity, value]) => ({
				"@_quantity": quantity,
				"#text": value
			}))
		});
		const obj = { resources: {
			...strings.length > 0 ? { string: strings } : {},
			...pluralEntries.length > 0 ? { plurals: pluralEntries } : {}
		} };
		yield* writeFileEnsuringDir(filePath, `<?xml version="1.0" encoding="utf-8"?>\n${builder.build(obj)}\n`).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
	});
}
function android(options) {
	const { dir, resourceKey = "strings" } = options;
	const resource = {
		key: resourceKey,
		label: "strings.xml"
	};
	return {
		name: "android",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: false
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			const resDir = (yield* Path).join(dir, "res");
			if (!(yield* fs.exists(resDir).pipe(Effect.orElseSucceed(() => false)))) return [];
			return (yield* fs.readDirectory(resDir).pipe(Effect.orElseSucceed(() => []))).filter((e) => e.startsWith("values-")).map((e) => e.replace(/^values-/, ""));
		}).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)),
		listResources: () => Effect.succeed([resource]),
		readResource: (locale, _) => readAndroidResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)),
		writeResource: (locale, _, entries) => writeAndroidResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer))
	};
}
//#endregion
export { android };
