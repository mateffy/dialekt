import { Effect } from 'effect';
import { Path } from '@effect/platform/Path';
import { FileSystem } from '@effect/platform/FileSystem';
import type {
  ResourceRef,
  TranslationAdapter,
  AdapterReadError,
  AdapterWriteError,
} from '@dialekt/core';
import {
  AdapterReadError as AdapterReadErrorClass,
  AdapterWriteError as AdapterWriteErrorClass,
  NodePlatformLayer,
} from '@dialekt/core';
import { readMessageFile, writeMessageFile } from './message-file.js';
import { findUnusedParaglideKeys } from './unused-keys.js';

export interface ParaglideAdapterOptions {
  readonly messagesDir: string;
  readonly scanPaths?: readonly string[];
}

export function paraglide(options: ParaglideAdapterOptions): TranslationAdapter {
  const { messagesDir, scanPaths = [] } = options;

  return {
    name: 'paraglide',
    capabilities: {
      canCreateResource: true,
      unusedKeyDetection: true,
    },

    listLocales: () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem;
        const path = yield* Path;
        const exists = yield* fs.exists(messagesDir).pipe(Effect.orElseSucceed(() => false));
        if (!exists) return [];
        const entries = yield* fs.readDirectory(messagesDir).pipe(
          Effect.orElseSucceed(() => [] as string[]),
        );
        const locales: string[] = [];
        for (const entry of entries) {
          if (entry.endsWith('.json')) {
            locales.push(entry.replace(/\.json$/, ''));
          }
        }
        return locales;
      }).pipe(
        Effect.mapError(
          (cause) =>
            new AdapterReadErrorClass({
              adapter: 'paraglide',
              locale: '',
              resource: '',
              cause,
            }) as AdapterReadError,
        ),
        Effect.provide([NodePlatformLayer]),
      ) as Effect.Effect<readonly string[], AdapterReadError, never>,

    listResources: () =>
      Effect.succeed([{ key: 'messages', label: 'messages' }]),

    readResource: (locale, resource) =>
      Effect.gen(function* () {
        const path = yield* Path;
        const filePath = path.join(messagesDir, `${locale}.json`);
        const result = yield* readMessageFile(filePath).pipe(
          Effect.mapError(
            (cause) =>
              new AdapterReadErrorClass({
                adapter: 'paraglide',
                locale,
                resource: resource.key,
                cause,
              }) as AdapterReadError,
          ),
        );
        return result.translations;
      }).pipe(Effect.provide([NodePlatformLayer])) as Effect.Effect<Record<string, string>, AdapterReadError, never>,

    writeResource: (locale, resource, entries) =>
      Effect.gen(function* () {
        const path = yield* Path;
        const filePath = path.join(messagesDir, `${locale}.json`);
        const existing = yield* readMessageFile(filePath).pipe(Effect.orElseSucceed(() => ({
          translations: {},
          meta: {},
        })));
        yield* writeMessageFile(filePath, entries, existing.meta).pipe(
          Effect.mapError(
            (cause) =>
              new AdapterWriteErrorClass({
                adapter: 'paraglide',
                locale,
                resource: resource.key,
                cause,
              }) as AdapterWriteError,
          ),
        );
      }).pipe(Effect.provide([NodePlatformLayer])) as Effect.Effect<void, AdapterWriteError, never>,

    findUnusedKeys: (locale, resource) =>
      Effect.gen(function* () {
        const path = yield* Path;
        const adapterScanPaths =
          scanPaths.length > 0 ? scanPaths : [path.resolve(messagesDir, '..')];
        const keys = yield* Effect.gen(function* () {
          const map = yield* paraglide(options).readResource(locale, resource);
          return Object.keys(map);
        });
        return yield* findUnusedParaglideKeys(adapterScanPaths, keys);
      }).pipe(Effect.provide([NodePlatformLayer])) as Effect.Effect<readonly string[], AdapterReadError, never>,
  };
}
