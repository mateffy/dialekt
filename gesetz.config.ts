import { defineConfig } from 'gesetz';
import { typescriptSyntaxBackend } from '@gesetz/typescript';
import { oxlint } from '@gesetz/oxlint';
import { oxfmt } from '@gesetz/oxfmt';
import { vitest } from '@gesetz/vitest';
import * as quality from './rules/quality';
import { layers } from './rules/architecture';

export default defineConfig({
  adapters: [typescriptSyntaxBackend],
  rules: [
    quality.everyFileNeedsTest,
    quality.noGiantFiles,
    quality.noAny,
    quality.noEmptyCatches,
    quality.noConsole,
    quality.noSecrets,
    quality.noRawNodeIO,
    quality.noRunPromiseOutsideEntryPoints,
    quality.noThrowInGen,
    ...layers,
    oxlint({ pattern: 'packages/*/src/**/*.ts' }),
    oxfmt({ pattern: 'packages/*/src/**/*.ts', check: true }),
    vitest({ pattern: 'packages' }),
  ],
});
