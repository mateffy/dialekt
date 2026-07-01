import { FileSystem, Path } from '@effect/platform';
import { Effect } from 'effect';
import type { ResourceRef, AdapterReadError } from 'dialekt';
import { AdapterReadError as AdapterReadErrorClass } from 'dialekt';

export function listLaravelLocales(langDir: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const entries = yield* fs.readDirectory(langDir).pipe(
      Effect.orElseSucceed(() => [] as string[]),
    );
    const locales: string[] = [];
    for (const entry of entries) {
      const fullPath = path.join(langDir, entry);
      const stat = yield* fs.stat(fullPath).pipe(Effect.option);
      if (
        stat._tag === 'Some' &&
        stat.value.type === 'Directory' &&
        entry !== 'vendor' &&
        entry !== 'lang'
      ) {
        locales.push(entry);
      }
    }
    return locales;
  }).pipe(
    Effect.mapError(
      (cause) =>
        new AdapterReadErrorClass({
          adapter: 'laravel',
          locale: '',
          resource: '',
          cause,
        }) as AdapterReadError,
    ),
  );
}

export function listLaravelResources(langDir: string, locale: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const localeDir = path.join(langDir, locale);

    const refs: ResourceRef[] = [];

    // PHP domain files
    const entries = yield* fs.readDirectory(localeDir).pipe(
      Effect.orElseSucceed(() => [] as string[]),
    );
    for (const entry of entries) {
      if (entry.endsWith('.php')) {
        const domain = entry.replace(/\.php$/, '');
        refs.push({ key: domain, label: domain });
      }
    }

    // JSON locale file (e.g. en.json)
    const jsonPath = path.join(langDir, `${locale}.json`);
    const jsonExists = yield* fs.exists(jsonPath).pipe(Effect.orElseSucceed(() => false));
    if (jsonExists) {
      refs.push({ key: 'json', label: `${locale}.json` });
    }

    return refs;
  }).pipe(
    Effect.mapError(
      (cause) =>
        new AdapterReadErrorClass({
          adapter: 'laravel',
          locale,
          resource: '',
          cause,
        }) as AdapterReadError,
    ),
  );
}
