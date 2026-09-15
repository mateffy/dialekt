import { describe, expect, it } from "vitest";
import {
  findFirst,
  positionAt,
  trimSlice,
  walkAst,
  type AstNode,
  type AstPosition,
} from "./ast.js";

function fakeNode(
  kind: string,
  text: string,
  startIndex: number,
  children: readonly AstNode[] = [],
): AstNode {
  const start: AstPosition = { line: 0, column: 0, index: startIndex };
  const end: AstPosition = { line: 0, column: 0, index: startIndex + text.length };
  return {
    kind: () => kind,
    text: () => text,
    range: () => ({ start, end }),
    children: () => children,
  };
}

describe("positionAt", () => {
  it("reports 1-based line and column", () => {
    expect(positionAt("a\nbc", 3)).toEqual({ line: 2, column: 2 });
  });

  it("reports the first position as line 1 column 1", () => {
    expect(positionAt("hello", 0)).toEqual({ line: 1, column: 1 });
  });

  it("clamps indexes past the end of the content", () => {
    expect(positionAt("hi", 999)).toEqual({ line: 1, column: 3 });
  });
});

describe("trimSlice", () => {
  it("trims whitespace and keeps an absolute start index", () => {
    expect(trimSlice("  hi  ", 10)).toEqual({ text: "hi", start: 12, end: 13 });
  });

  it("collapses internal whitespace", () => {
    const slice = trimSlice("\n  Hello   world\n ", 0);
    expect(slice?.text).toBe("Hello world");
    expect(slice?.start).toBe(3);
  });

  it("returns null for whitespace-only input", () => {
    expect(trimSlice("   \n  ", 0)).toBeNull();
  });
});

describe("walkAst", () => {
  it("visits every node depth-first", () => {
    const tree = fakeNode("root", "root", 0, [
      fakeNode("a", "a", 0, [fakeNode("b", "b", 0)]),
      fakeNode("c", "c", 0),
    ]);
    const visited: string[] = [];
    walkAst(tree, (node) => {
      visited.push(node.kind());
    });
    expect(visited).toEqual(["root", "a", "b", "c"]);
  });

  it("skips a subtree when the visitor returns false", () => {
    const tree = fakeNode("root", "root", 0, [
      fakeNode("a", "a", 0, [fakeNode("b", "b", 0)]),
      fakeNode("c", "c", 0),
    ]);
    const visited: string[] = [];
    walkAst(tree, (node) => {
      visited.push(node.kind());
      return node.kind() !== "a";
    });
    expect(visited).toEqual(["root", "a", "c"]);
  });
});

describe("findFirst", () => {
  it("finds a deeply nested node", () => {
    const tree = fakeNode("root", "root", 0, [
      fakeNode("a", "a", 0, [fakeNode("target", "x", 0)]),
    ]);
    const found = findFirst(tree, (node) => node.kind() === "target");
    expect(found?.text()).toBe("x");
  });

  it("returns null when nothing matches", () => {
    const tree = fakeNode("root", "root", 0, []);
    expect(findFirst(tree, (node) => node.kind() === "missing")).toBeNull();
  });
});
