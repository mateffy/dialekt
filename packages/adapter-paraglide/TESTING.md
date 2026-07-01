# @dialekt/adapter-paraglide Testing Guide

## Tested Areas Map

| Export                                 | Test File                  | Status |
| -------------------------------------- | -------------------------- | ------ |
| `paraglide()` adapter                  | `src/adapter.test.ts`      | ✅     |
| `readMessageFile` / `writeMessageFile` | `src/message-file.test.ts` | ✅     |
| `findUnusedParaglideKeys`              | `src/unused-keys.test.ts`  | ✅     |

## Known Coverage Gaps

- Invalid JSON in message files — `readMessageFile` would throw but no explicit unhappy-path test
- Nested objects in Paraglide JSON — `readMessageFile` flattens them but no explicit test for deeply nested structures
- `scanPaths` edge cases with binary files or very large files

## Specialties & Watch-Outs

- Tests create real temp directories via `node:fs` and clean up with `rmSync`.
- `writeMessageFile` preserves `$schema` and other meta keys by reading existing file first.
- `findUnusedParaglideKeys` matches `m.keyName()` and `m.keyName` (without parens) patterns.
- The adapter always reports exactly one resource (`messages`).

## Running Tests

```bash
pnpm --filter @dialekt/adapter-paraglide test
```
