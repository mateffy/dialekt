import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, flattenObject, readFileIfExists, unflattenObject, writeFileEnsuringDir } from "dialekt";
import { FileSystem } from "@effect/platform";
import { parse, stringify } from "yaml";
//#region src/adapter.ts
function readError(locale, resource, cause) {
	return new AdapterReadError({
		adapter: "yaml",
		locale,
		resource,
		cause
	});
}
function writeError(locale, resource, cause) {
	return new AdapterWriteError({
		adapter: "yaml",
		locale,
		resource,
		cause
	});
}
function readYamlResource(dir, locale, resource) {
	return Effect.gen(function* () {
		const content = yield* readFileIfExists((yield* Path).join(dir, `${locale}.yml`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
		if (content === null) return {};
		return flattenObject(yield* Effect.try({
			try: () => parse(content),
			catch: (cause) => readError(locale, resource.key, cause)
		}));
	});
}
function writeYamlResource(dir, locale, resource, entries) {
	return Effect.gen(function* () {
		yield* writeFileEnsuringDir((yield* Path).join(dir, `${locale}.yml`), `${stringify(unflattenObject(entries))}\n`).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
	});
}
function yaml(options) {
	const { dir, resourceKey = "messages" } = options;
	const resource = {
		key: resourceKey,
		label: `${resourceKey}.yml`
	};
	return {
		name: "yaml",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: false
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			if (!(yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false)))) return [];
			return (yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))).filter((e) => e.endsWith(".yml")).map((e) => e.replace(/\.yml$/, ""));
		}).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)),
		listResources: () => Effect.succeed([resource]),
		readResource: (locale, _) => readYamlResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)),
		writeResource: (locale, _, entries) => writeYamlResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer))
	};
}
//#endregion
export { yaml };
