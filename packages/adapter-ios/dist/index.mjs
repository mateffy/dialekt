import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, readFileIfExists, writeFileEnsuringDir } from "dialekt";
import { FileSystem } from "@effect/platform";
//#region src/adapter.ts
function readError(locale, resource, cause) {
	return new AdapterReadError({
		adapter: "ios",
		locale,
		resource,
		cause
	});
}
function writeError(locale, resource, cause) {
	return new AdapterWriteError({
		adapter: "ios",
		locale,
		resource,
		cause
	});
}
const HEX_DIGIT_COUNT = 4;
const HEX_RADIX = 16;
const UNICODE_ESCAPE_RE = new RegExp(`\\\\u([0-9a-fA-F]{${HEX_DIGIT_COUNT}})`, "g");
function unescapeStringsValue(value) {
	return value.replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/\\"/g, "\"").replace(/\\\\/g, "\\").replace(UNICODE_ESCAPE_RE, (_, hex) => String.fromCharCode(Number.parseInt(hex, HEX_RADIX)));
}
function escapeStringsValue(value) {
	return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n").replace(/\t/g, "\\t");
}
function parseStrings(content) {
	const result = {};
	let i = 0;
	while (i < content.length) {
		const ch = content[i];
		if (ch === void 0) break;
		if (ch === " " || ch === "	" || ch === "\n" || ch === "\r") {
			i++;
			continue;
		}
		if (ch === "/" && content[i + 1] === "*") {
			i += 2;
			while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) i++;
			i += 2;
			continue;
		}
		if (ch === "/" && content[i + 1] === "/") {
			while (i < content.length && content[i] !== "\n") i++;
			continue;
		}
		if (ch !== "\"") {
			i++;
			continue;
		}
		let key = "";
		i++;
		while (i < content.length) {
			const c = content[i];
			if (c === "\"" && content[i - 1] !== "\\") break;
			key += c;
			i++;
		}
		i++;
		while (i < content.length && (content[i] === " " || content[i] === "	")) i++;
		if (content[i] !== "=") continue;
		i++;
		while (i < content.length && (content[i] === " " || content[i] === "	")) i++;
		if (content[i] !== "\"") continue;
		i++;
		let value = "";
		while (i < content.length) {
			const c = content[i];
			if (c === "\"" && content[i - 1] !== "\\") break;
			value += c;
			i++;
		}
		i++;
		while (i < content.length && content[i] === " ") i++;
		if (content[i] === ";") i++;
		result[unescapeStringsValue(key)] = unescapeStringsValue(value);
	}
	return result;
}
function writeStrings(entries) {
	const lines = [];
	for (const [key, value] of Object.entries(entries)) lines.push(`"${escapeStringsValue(key)}" = "${escapeStringsValue(value)}";`);
	return lines.join("\n") + "\n";
}
function readStringsResource(dir, locale, resource) {
	return Effect.gen(function* () {
		const content = yield* readFileIfExists((yield* Path).join(dir, `${locale}.strings`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
		if (content === null) return {};
		return parseStrings(content);
	});
}
function writeStringsResource(dir, locale, resource, entries) {
	return Effect.gen(function* () {
		yield* writeFileEnsuringDir((yield* Path).join(dir, `${locale}.strings`), writeStrings(entries)).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
	});
}
function ios(options) {
	const { dir, resourceKey = "messages" } = options;
	const resource = {
		key: resourceKey,
		label: `${resourceKey}.strings`
	};
	return {
		name: "ios",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: false
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			if (!(yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false)))) return [];
			return (yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))).filter((e) => e.endsWith(".strings")).map((e) => e.replace(/\.strings$/, ""));
		}).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)),
		listResources: () => Effect.succeed([resource]),
		readResource: (locale, _) => readStringsResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)),
		writeResource: (locale, _, entries) => writeStringsResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer))
	};
}
//#endregion
export { ios };
