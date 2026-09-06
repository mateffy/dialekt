import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, readFileIfExists, writeFileEnsuringDir } from "dialekt";
import { FileSystem } from "@effect/platform";
//#region src/adapter.ts
function readError(locale, resource, cause) {
	return new AdapterReadError({
		adapter: "csv",
		locale,
		resource,
		cause
	});
}
function writeError(locale, resource, cause) {
	return new AdapterWriteError({
		adapter: "csv",
		locale,
		resource,
		cause
	});
}
function parseCsv(content) {
	const lines = content.split("\n").filter((line) => line.trim() !== "");
	if (lines.length === 0) return {};
	const header = lines[0].split(",").map((h) => h.trim());
	const keyIndex = header.indexOf("key");
	const targetIndex = header.indexOf("target");
	if (keyIndex === -1 || targetIndex === -1) return {};
	const result = {};
	for (let i = 1; i < lines.length; i++) {
		const cells = lines[i].split(",").map((c) => c.trim());
		const key = cells[keyIndex];
		const target = cells[targetIndex];
		if (key !== void 0 && target !== void 0) result[key] = target;
	}
	return result;
}
function writeCsv(entries, existingSource) {
	const lines = ["key,source,target"];
	for (const [key, target] of Object.entries(entries)) {
		const source = existingSource?.[key] ?? "";
		lines.push(`${key},${source},${target}`);
	}
	return lines.join("\n") + "\n";
}
function readCsvResource(dir, locale, resource) {
	return Effect.gen(function* () {
		const content = yield* readFileIfExists((yield* Path).join(dir, `${locale}.csv`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
		if (content === null) return {};
		return parseCsv(content);
	});
}
function writeCsvResource(dir, locale, resource, entries) {
	return Effect.gen(function* () {
		const filePath = (yield* Path).join(dir, `${locale}.csv`);
		const existing = yield* readFileIfExists(filePath).pipe(Effect.orElseSucceed(() => null));
		const sourceMap = {};
		if (existing !== null) {
			const lines = existing.split("\n").filter((line) => line.trim() !== "");
			if (lines.length > 0) {
				const header = lines[0].split(",").map((h) => h.trim());
				const keyIndex = header.indexOf("key");
				const sourceIndex = header.indexOf("source");
				for (let i = 1; i < lines.length; i++) {
					const cells = lines[i].split(",").map((c) => c.trim());
					if (keyIndex !== -1 && sourceIndex !== -1) {
						const key = cells[keyIndex];
						const source = cells[sourceIndex];
						if (key !== void 0 && source !== void 0) sourceMap[key] = source;
					}
				}
			}
		}
		yield* writeFileEnsuringDir(filePath, writeCsv(entries, sourceMap)).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
	});
}
function csv(options) {
	const { dir, resourceKey = "messages" } = options;
	const resource = {
		key: resourceKey,
		label: `${resourceKey}.csv`
	};
	return {
		name: "csv",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: false
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			if (!(yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false)))) return [];
			return (yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))).filter((e) => e.endsWith(".csv")).map((e) => e.replace(/\.csv$/, ""));
		}).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)),
		listResources: () => Effect.succeed([resource]),
		readResource: (locale, _) => readCsvResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)),
		writeResource: (locale, _, entries) => writeCsvResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer))
	};
}
//#endregion
export { csv };
