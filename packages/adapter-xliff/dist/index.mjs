import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, readFileIfExists, writeFileEnsuringDir } from "dialekt";
import { FileSystem } from "@effect/platform";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
//#region src/adapter.ts
const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: "@_"
});
const builder = new XMLBuilder({
	ignoreAttributes: false,
	attributeNamePrefix: "@_"
});
function readError(locale, resource, cause) {
	return new AdapterReadError({
		adapter: "xliff",
		locale,
		resource,
		cause
	});
}
function writeError(locale, resource, cause) {
	return new AdapterWriteError({
		adapter: "xliff",
		locale,
		resource,
		cause
	});
}
function normalizeUnits(raw) {
	if (!raw) return [];
	return (Array.isArray(raw) ? raw : [raw]).filter((u) => u && typeof u === "object").map((u) => ({
		id: String(u["@_id"] ?? ""),
		source: String(u.source ?? ""),
		target: u.target !== void 0 ? String(u.target) : void 0,
		note: u.note !== void 0 ? String(u.note) : void 0
	}));
}
function parseXliff(xml) {
	const parsed = parser.parse(xml);
	const file = (parsed.xliff ?? parsed).file ?? {};
	const rawUnits = (file.body ?? {})["trans-unit"];
	return {
		sourceLang: String(file["@_source-language"] ?? ""),
		targetLang: String(file["@_target-language"] ?? ""),
		units: normalizeUnits(rawUnits)
	};
}
const XML_VERSION = "1.0";
const XML_ENCODING = "UTF-8";
const XLIFF_VERSION = "1.2";
const XLIFF_XMLNS = "urn:oasis:names:tc:xliff:document:1.2";
function buildXliffObject(sourceLang, targetLang, units) {
	return {
		"?xml": {
			"@_version": XML_VERSION,
			"@_encoding": XML_ENCODING
		},
		xliff: {
			"@_version": XLIFF_VERSION,
			"@_xmlns": XLIFF_XMLNS,
			file: {
				"@_source-language": sourceLang,
				"@_target-language": targetLang,
				"@_datatype": "plaintext",
				body: { "trans-unit": units.map((u) => ({
					"@_id": u.id,
					source: u.source,
					...u.target !== void 0 ? { target: u.target } : {},
					...u.note !== void 0 ? { note: u.note } : {}
				})) }
			}
		}
	};
}
function readXliffResource(dir, locale, resource) {
	return Effect.gen(function* () {
		const content = yield* readFileIfExists((yield* Path).join(dir, `${locale}.xlf`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
		if (content === null) return {};
		const parsed = parseXliff(content);
		const result = {};
		for (const unit of parsed.units) result[unit.id] = unit.target ?? unit.source;
		return result;
	});
}
function writeXliffResource(dir, locale, resource, entries) {
	return Effect.gen(function* () {
		const filePath = (yield* Path).join(dir, `${locale}.xlf`);
		const existing = yield* readFileIfExists(filePath).pipe(Effect.orElseSucceed(() => null));
		let parsed;
		if (existing !== null) parsed = parseXliff(existing);
		else parsed = {
			sourceLang: "en",
			targetLang: locale,
			units: []
		};
		const unitMap = /* @__PURE__ */ new Map();
		for (const u of parsed.units) unitMap.set(u.id, u);
		const newUnits = [];
		for (const [key, value] of Object.entries(entries)) {
			const existingUnit = unitMap.get(key);
			newUnits.push({
				id: key,
				source: existingUnit?.source ?? key,
				target: value,
				note: existingUnit?.note
			});
		}
		const obj = buildXliffObject(parsed.sourceLang, locale, newUnits);
		yield* writeFileEnsuringDir(filePath, builder.build(obj)).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
	});
}
function xliff(options) {
	const { dir, resourceKey = "messages" } = options;
	const resource = {
		key: resourceKey,
		label: `${resourceKey}.xlf`
	};
	return {
		name: "xliff",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: false
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			if (!(yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false)))) return [];
			const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
			const locales = [];
			const path_ = yield* Path;
			for (const file of entries.filter((e) => e.endsWith(".xlf"))) {
				const content = yield* readFileIfExists(path_.join(dir, file)).pipe(Effect.orElseSucceed(() => null));
				if (content !== null) {
					const parsed = parseXliff(content);
					if (parsed.targetLang) locales.push(parsed.targetLang);
				}
			}
			return locales;
		}).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)),
		listResources: () => Effect.succeed([resource]),
		readResource: (locale, _) => readXliffResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)),
		writeResource: (locale, _, entries) => writeXliffResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer))
	};
}
//#endregion
export { xliff };
