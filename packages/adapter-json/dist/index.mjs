import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, flattenObject, readFileIfExists, unflattenObject, writeFileEnsuringDir } from "dialekt";
import { FileSystem } from "@effect/platform";
//#region src/adapter.ts
function readError(locale, resource, cause) {
	return new AdapterReadError({
		adapter: "json",
		locale,
		resource,
		cause
	});
}
function writeError(locale, resource, cause) {
	return new AdapterWriteError({
		adapter: "json",
		locale,
		resource,
		cause
	});
}
function readJsonResource(dir, locale, resource) {
	return Effect.gen(function* () {
		const content = yield* readFileIfExists((yield* Path).join(dir, `${locale}.json`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
		if (content === null) return {};
		return flattenObject(yield* Effect.try({
			try: () => JSON.parse(content),
			catch: (cause) => readError(locale, resource.key, cause)
		}));
	});
}
function writeJsonResource(dir, locale, resource, entries) {
	return Effect.gen(function* () {
		yield* writeFileEnsuringDir((yield* Path).join(dir, `${locale}.json`), `${JSON.stringify(unflattenObject(entries), null, 2)}\n`).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
	});
}
function json(options) {
	const { dir, resourceKey = "messages" } = options;
	const resource = {
		key: resourceKey,
		label: `${resourceKey}.json`
	};
	return {
		name: "json",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: false
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			if (!(yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false)))) return [];
			return (yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))).filter((e) => e.endsWith(".json")).map((e) => e.replace(/\.json$/, ""));
		}).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)),
		listResources: () => Effect.succeed([resource]),
		readResource: (locale, _) => readJsonResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)),
		writeResource: (locale, _, entries) => writeJsonResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer))
	};
}
//#endregion
export { json };
