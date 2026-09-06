import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, readFileIfExists, writeFileEnsuringDir } from "dialekt";
import { FileSystem } from "@effect/platform";
//#region src/adapter.ts
function readError(locale, resource, cause) {
	return new AdapterReadError({
		adapter: "properties",
		locale,
		resource,
		cause
	});
}
function writeError(locale, resource, cause) {
	return new AdapterWriteError({
		adapter: "properties",
		locale,
		resource,
		cause
	});
}
const HEX_DIGIT_COUNT = 4;
const HEX_RADIX = 16;
const UNICODE_ESCAPE_RE = new RegExp(`\\\\u([0-9a-fA-F]{${HEX_DIGIT_COUNT}})`, "g");
function decodeUnicodeEscapes(value) {
	return value.replace(UNICODE_ESCAPE_RE, (_, hex) => String.fromCharCode(Number.parseInt(hex, HEX_RADIX)));
}
function encodeUnicodeEscapes(value) {
	let result = "";
	for (const char of value) {
		const code = char.charCodeAt(0);
		if (code > 127) result += `\\u${code.toString(HEX_RADIX).padStart(HEX_DIGIT_COUNT, "0")}`;
		else result += char;
	}
	return result;
}
function parseProperties(content) {
	const result = {};
	const lines = content.split("\n");
	let currentLine = "";
	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (line === "" || line.startsWith("#") || line.startsWith("!")) continue;
		if (line.endsWith("\\")) {
			currentLine += line.slice(0, -1);
			continue;
		}
		currentLine += line;
		const separatorIdx = currentLine.indexOf("=");
		if (separatorIdx === -1) {
			currentLine = "";
			continue;
		}
		const key = currentLine.slice(0, separatorIdx).trim();
		result[key] = decodeUnicodeEscapes(currentLine.slice(separatorIdx + 1).trim());
		currentLine = "";
	}
	return result;
}
function writeProperties(entries) {
	const lines = [];
	for (const [key, value] of Object.entries(entries)) {
		const escaped = encodeUnicodeEscapes(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t");
		lines.push(`${key}=${escaped}`);
	}
	return lines.join("\n") + "\n";
}
function readPropertiesResource(dir, locale, resource) {
	return Effect.gen(function* () {
		const content = yield* readFileIfExists((yield* Path).join(dir, `${locale}.properties`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
		if (content === null) return {};
		return parseProperties(content);
	});
}
function writePropertiesResource(dir, locale, resource, entries) {
	return Effect.gen(function* () {
		yield* writeFileEnsuringDir((yield* Path).join(dir, `${locale}.properties`), writeProperties(entries)).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
	});
}
function properties(options) {
	const { dir, resourceKey = "messages" } = options;
	const resource = {
		key: resourceKey,
		label: `${resourceKey}.properties`
	};
	return {
		name: "properties",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: false
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			if (!(yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false)))) return [];
			return (yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))).filter((e) => e.endsWith(".properties")).map((e) => e.replace(/\.properties$/, ""));
		}).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)),
		listResources: () => Effect.succeed([resource]),
		readResource: (locale, _) => readPropertiesResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)),
		writeResource: (locale, _, entries) => writePropertiesResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer))
	};
}
//#endregion
export { properties };
