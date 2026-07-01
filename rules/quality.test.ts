import { describe, expect, it } from 'vitest';
import {
  everyFileNeedsTest,
  noGiantFiles,
  noAny,
  noEmptyCatches,
  noConsole,
  noSecrets,
  noRawNodeIO,
  noRunPromiseOutsideEntryPoints,
  noThrowInGen,
} from './quality';

describe('quality rules', () => {
  it('everyFileNeedsTest is categorized as organization', () => {
    expect(everyFileNeedsTest.category).toBe('organization');
  });
  it('noGiantFiles is categorized as structure', () => {
    expect(noGiantFiles.category).toBe('structure');
  });
  it('noAny is categorized as strictness', () => {
    expect(noAny.category).toBe('strictness');
  });
  it('noEmptyCatches is categorized as strictness', () => {
    expect(noEmptyCatches.category).toBe('strictness');
  });
  it('noConsole is categorized as cleanup', () => {
    expect(noConsole.category).toBe('cleanup');
  });
  it('noSecrets is categorized as security', () => {
    expect(noSecrets.category).toBe('security');
  });
  it('noRawNodeIO is categorized as organization', () => {
    expect(noRawNodeIO.category).toBe('organization');
  });
  it('noRunPromiseOutsideEntryPoints is categorized as organization', () => {
    expect(noRunPromiseOutsideEntryPoints.category).toBe('organization');
  });
  it('noThrowInGen is categorized as strictness', () => {
    expect(noThrowInGen.category).toBe('strictness');
  });
});
