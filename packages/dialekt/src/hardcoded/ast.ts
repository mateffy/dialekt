import { parse } from "@ast-grep/napi";
import type { HardcodedFinding, HardcodedKind, HardcodedLanguage } from "./types.js";

export interface AstPosition {
  readonly line: number;
  readonly column: number;
  readonly index: number;
}

export interface AstRange {
  readonly start: AstPosition;
  readonly end: AstPosition;
}

/**
 * The minimal slice of a tree-sitter node that scanners need. Keeping this
 * structural (instead of leaking `SgNode`) makes scanners easy to fake in
 * tests and keeps the parse backend swappable.
 */
export interface AstNode {
  kind(): string;
  text(): string;
  range(): AstRange;
  children(): readonly AstNode[];
}

const NEWLINE = 10;
const FIRST_LINE = 1;

/** Parse `content` with the tree-sitter grammar registered under `language`. */
export function parseSource(language: string, content: string): AstNode {
  return parse(language, content).root() as AstNode;
}

/** Depth-first pre-order traversal. Return `false` from `visit` to skip a subtree. */
export function walkAst(node: AstNode, visit: (node: AstNode) => boolean | void): void {
  const shouldDescend = visit(node);
  if (shouldDescend === false) return;
  for (const child of node.children()) walkAst(child, visit);
}

/** Find the first descendant (including `node`) matching `predicate`. */
export function findFirst(
  node: AstNode,
  predicate: (candidate: AstNode) => boolean,
): AstNode | null {
  if (predicate(node)) return node;
  for (const child of node.children()) {
    const found = findFirst(child, predicate);
    if (found !== null) return found;
  }
  return null;
}

export function positionAt(
  content: string,
  index: number,
): { readonly line: number; readonly column: number } {
  const bounded = Math.max(0, Math.min(index, content.length));
  let line = FIRST_LINE;
  let lineStart = 0;
  for (let i = 0; i < bounded; i += 1) {
    if (content.charCodeAt(i) === NEWLINE) {
      line += 1;
      lineStart = i + 1;
    }
  }
  return { line, column: bounded - lineStart + 1 };
}

export interface TrimmedSlice {
  /** Whitespace-collapsed text that callers should evaluate. */
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** Trim `raw` and express the result as absolute character indices in the file. */
export function trimSlice(raw: string, absoluteStart: number): TrimmedSlice | null {
  const leading = raw.length - raw.trimStart().length;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const start = absoluteStart + leading;
  return {
    text: trimmed.replace(/\s+/g, " "),
    start,
    end: start + trimmed.length - 1,
  };
}

export interface FindingArgs {
  readonly file: string;
  readonly language: HardcodedLanguage;
  readonly kind: HardcodedKind;
  readonly content: string;
  readonly slice: TrimmedSlice;
  readonly confidence: number;
  readonly attribute?: string;
}

/** Turn an absolute slice into a located finding. */
export function toFinding(args: FindingArgs): HardcodedFinding {
  const start = positionAt(args.content, args.slice.start);
  const end = positionAt(args.content, args.slice.end);
  const finding: HardcodedFinding = {
    file: args.file,
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
    text: args.slice.text,
    kind: args.kind,
    language: args.language,
    confidence: args.confidence,
  };
  return args.attribute === undefined ? finding : { ...finding, attribute: args.attribute };
}
