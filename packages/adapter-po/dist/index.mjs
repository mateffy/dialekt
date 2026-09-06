import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, readFileIfExists, writeFileEnsuringDir } from "dialekt";
import { FileSystem } from "@effect/platform";
//#region src/adapter.ts
function readError(locale, resource, cause) {
	return new AdapterReadError({
		adapter: "po",
		locale,
		resource,
		cause
	});
}
function writeError(locale, resource, cause) {
	return new AdapterWriteError({
		adapter: "po",
		locale,
		resource,
		cause
	});
}
function extractQuotedStrings(lines) {
	return lines.map((line) => {
		const trimmed = line.trim();
		const firstQuote = trimmed.indexOf("\"");
		const lastQuote = trimmed.lastIndexOf("\"");
		if (firstQuote !== -1 && lastQuote > firstQuote) return trimmed.slice(firstQuote + 1, lastQuote);
		return "";
	}).join("").replace(/\\n/g, "\n").replace(/\\t/g, "	").replace(/\\"/g, "\"").replace(/\\\\/g, "\\");
}
function parsePo(content) {
	const result = {};
	const lines = content.split("\n");
	let i = 0;
	let currentContext = "";
	let currentMsgid = null;
	let currentMsgidPlural = null;
	let currentMsgstr = [];
	let currentMsgstrPlural = {};
	let currentPluralIndex = null;
	function flushEntry() {
		if (currentMsgid !== null) {
			const key = currentContext ? `${currentContext}.${currentMsgid}` : currentMsgid;
			if (currentMsgidPlural !== null) {
				const indices = Object.keys(currentMsgstrPlural).map(Number).sort((a, b) => a - b);
				const one = indices.find((idx) => currentMsgstrPlural[idx] !== void 0);
				if (one !== void 0) result[`${key}.one`] = extractQuotedStrings(currentMsgstrPlural[one]);
				const last = indices[indices.length - 1];
				if (last !== void 0 && last !== one) result[`${key}.other`] = extractQuotedStrings(currentMsgstrPlural[last]);
			} else result[key] = extractQuotedStrings(currentMsgstr);
		}
		currentMsgid = null;
		currentMsgidPlural = null;
		currentMsgstr = [];
		currentMsgstrPlural = {};
		currentPluralIndex = null;
	}
	while (i < lines.length) {
		const trimmed = lines[i].trim();
		if (trimmed === "" || trimmed.startsWith("#")) {
			flushEntry();
			currentContext = "";
			i++;
			continue;
		}
		if (trimmed.startsWith("msgctxt \"")) {
			flushEntry();
			const ctxtLines = [trimmed];
			i++;
			while (i < lines.length && lines[i].trim().startsWith("\"")) {
				ctxtLines.push(lines[i].trim());
				i++;
			}
			currentContext = extractQuotedStrings(ctxtLines);
			continue;
		}
		if (trimmed.startsWith("msgid \"")) {
			flushEntry();
			const idLines = [trimmed];
			i++;
			while (i < lines.length && lines[i].trim().startsWith("\"")) {
				idLines.push(lines[i].trim());
				i++;
			}
			currentMsgid = extractQuotedStrings(idLines);
			continue;
		}
		if (trimmed.startsWith("msgid_plural \"")) {
			const pluralLines = [trimmed];
			i++;
			while (i < lines.length && lines[i].trim().startsWith("\"")) {
				pluralLines.push(lines[i].trim());
				i++;
			}
			currentMsgidPlural = extractQuotedStrings(pluralLines);
			continue;
		}
		const pluralMatch = /^msgstr\[(\d+)\]\s+"/.exec(trimmed);
		if (pluralMatch) {
			currentPluralIndex = Number(pluralMatch[1]);
			const strLines = [trimmed.slice(pluralMatch[0].indexOf("\""))];
			i++;
			while (i < lines.length && lines[i].trim().startsWith("\"")) {
				strLines.push(lines[i].trim());
				i++;
			}
			if (currentPluralIndex !== null) currentMsgstrPlural[currentPluralIndex] = strLines;
			continue;
		}
		if (trimmed.startsWith("msgstr \"")) {
			const strLines = [trimmed];
			i++;
			while (i < lines.length && lines[i].trim().startsWith("\"")) {
				strLines.push(lines[i].trim());
				i++;
			}
			currentMsgstr = strLines;
			continue;
		}
		i++;
	}
	flushEntry();
	return result;
}
function escapePoValue(value) {
	return "\"" + value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, "\\n").replace(/\t/g, "\\t") + "\"";
}
function writePo(entries) {
	const lines = [];
	const groups = {};
	for (const [key, value] of Object.entries(entries)) {
		const pluralMatch = /^(.+)\.(one|other)$/.exec(key);
		if (pluralMatch) {
			const base = pluralMatch[1];
			const form = pluralMatch[2];
			groups[base] ??= {};
			groups[base][form] = value;
		} else {
			groups[key] ??= {};
			groups[key].single = value;
		}
	}
	for (const [key, group] of Object.entries(groups)) if (group.single !== void 0) {
		lines.push(`msgid ${escapePoValue(key)}`);
		lines.push(`msgstr ${escapePoValue(group.single)}`);
		lines.push("");
	} else if (group.one !== void 0 || group.other !== void 0) {
		lines.push(`msgid ${escapePoValue(key)}`);
		lines.push(`msgid_plural ${escapePoValue(key)}`);
		lines.push(`msgstr[0] ${escapePoValue(group.one ?? group.other ?? "")}`);
		lines.push(`msgstr[1] ${escapePoValue(group.other ?? group.one ?? "")}`);
		lines.push("");
	}
	return lines.join("\n");
}
function readPoResource(dir, locale, resource) {
	return Effect.gen(function* () {
		const content = yield* readFileIfExists((yield* Path).join(dir, `${locale}.po`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
		if (content === null) return {};
		return parsePo(content);
	});
}
function writePoResource(dir, locale, resource, entries) {
	return Effect.gen(function* () {
		yield* writeFileEnsuringDir((yield* Path).join(dir, `${locale}.po`), writePo(entries)).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
	});
}
function po(options) {
	const { dir, resourceKey = "messages" } = options;
	const resource = {
		key: resourceKey,
		label: `${resourceKey}.po`
	};
	return {
		name: "po",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: false
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			if (!(yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false)))) return [];
			return (yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))).filter((e) => e.endsWith(".po")).map((e) => e.replace(/\.po$/, ""));
		}).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)),
		listResources: () => Effect.succeed([resource]),
		readResource: (locale, _) => readPoResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)),
		writeResource: (locale, _, entries) => writePoResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer))
	};
}
//#endregion
export { po };
