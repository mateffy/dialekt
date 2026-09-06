import { Effect } from "effect";
import { Path } from "@effect/platform/Path";
import { AdapterReadError, AdapterWriteError, NodePlatformLayer, flattenObject, readFileIfExists, unflattenObject, writeFileEnsuringDir } from "dialekt";
import { FileSystem } from "@effect/platform";
//#region src/adapter.ts
function readError(locale, resource, cause) {
	return new AdapterReadError({
		adapter: "arb",
		locale,
		resource,
		cause
	});
}
function writeError(locale, resource, cause) {
	return new AdapterWriteError({
		adapter: "arb",
		locale,
		resource,
		cause
	});
}
function readArbResource(dir, locale, resource) {
	return Effect.gen(function* () {
		const content = yield* readFileIfExists((yield* Path).join(dir, `${locale}.arb`)).pipe(Effect.mapError((cause) => readError(locale, resource.key, cause)));
		if (content === null) return {};
		const parsed = yield* Effect.try({
			try: () => JSON.parse(content),
			catch: (cause) => readError(locale, resource.key, cause)
		});
		const filtered = {};
		for (const [key, value] of Object.entries(parsed)) if (!key.startsWith("@")) filtered[key] = value;
		return flattenObject(filtered);
	});
}
function writeArbResource(dir, locale, resource, entries) {
	return Effect.gen(function* () {
		const filePath = (yield* Path).join(dir, `${locale}.arb`);
		const existing = yield* readFileIfExists(filePath).pipe(Effect.orElseSucceed(() => null));
		const meta = {};
		if (existing !== null) {
			const parsed = JSON.parse(existing);
			for (const [key, value] of Object.entries(parsed)) if (key.startsWith("@")) meta[key] = value;
		}
		const output = {
			"@@locale": locale,
			...unflattenObject(entries)
		};
		for (const [key, value] of Object.entries(meta)) if (!output[key]) output[key] = value;
		yield* writeFileEnsuringDir(filePath, `${JSON.stringify(output, null, 2)}\n`).pipe(Effect.mapError((cause) => writeError(locale, resource.key, cause)));
	});
}
function arb(options) {
	const { dir, resourceKey = "messages" } = options;
	const resource = {
		key: resourceKey,
		label: `${resourceKey}.arb`
	};
	return {
		name: "arb",
		capabilities: {
			canCreateResource: true,
			unusedKeyDetection: false
		},
		listLocales: () => Effect.gen(function* () {
			const fs = yield* FileSystem.FileSystem;
			if (!(yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false)))) return [];
			return (yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []))).filter((e) => e.endsWith(".arb")).map((e) => e.replace(/\.arb$/, ""));
		}).pipe(Effect.mapError((cause) => readError("", "", cause)), Effect.provide(NodePlatformLayer)),
		listResources: () => Effect.succeed([resource]),
		readResource: (locale, _) => readArbResource(dir, locale, resource).pipe(Effect.provide(NodePlatformLayer)),
		writeResource: (locale, _, entries) => writeArbResource(dir, locale, resource, entries).pipe(Effect.provide(NodePlatformLayer))
	};
}
//#endregion
export { arb };
