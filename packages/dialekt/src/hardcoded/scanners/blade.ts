import type {
  HardcodedFinding,
  HardcodedScanInput,
  HardcodedScanner,
} from "../types.js";
import { findFirst, parseSource, toFinding, trimSlice, walkAst, type AstNode } from "../ast.js";
import { isIgnoredAttribute, isLikelyTranslatable } from "../filter.js";

/**
 * Blade expressions (`{{ }}`, `{!! !!}` and `@directive(...)`) are replaced
 * with spaces of the same length. Length is preserved so the trimmed text still
 * maps to the original file offsets.
 */
const BLADE_EXPRESSION_RE =
  /\{\{[\s\S]*?\}\}|\{!![\s\S]*?!!\}|(?<![\w.])@[a-zA-Z]+(?:\s*\([^)]*\))?/g;

function maskBladeExpressions(raw: string): string {
  return raw.replace(BLADE_EXPRESSION_RE, (match) => " ".repeat(match.length));
}

function scanText(node: AstNode, input: HardcodedScanInput, findings: HardcodedFinding[]): void {
  const slice = trimSlice(maskBladeExpressions(node.text()), node.range().start.index);
  if (slice === null || !isLikelyTranslatable(slice.text, input.options)) return;
  findings.push(
    toFinding({
      file: input.file,
      language: input.language,
      kind: "html-text",
      content: input.content,
      slice,
      confidence: 0.85,
    }),
  );
}

function scanAttribute(
  node: AstNode,
  input: HardcodedScanInput,
  findings: HardcodedFinding[],
): void {
  const nameNode = node.children().find((child) => child.kind() === "attribute_name");
  const valueNode = findFirst(node, (child) => child.kind() === "attribute_value");
  if (nameNode === undefined || valueNode === null) return;
  const attribute = nameNode.text();
  if (isIgnoredAttribute(attribute, input.options)) return;
  const slice = trimSlice(valueNode.text(), valueNode.range().start.index);
  if (slice === null || !isLikelyTranslatable(slice.text, input.options)) return;
  findings.push(
    toFinding({
      file: input.file,
      language: input.language,
      kind: "html-attribute",
      content: input.content,
      slice,
      confidence: 0.7,
      attribute,
    }),
  );
}

function scanBlade(input: HardcodedScanInput): readonly HardcodedFinding[] {
  const root = parseSource("html", input.content);
  const findings: HardcodedFinding[] = [];

  walkAst(root, (node) => {
    const kind = node.kind();
    if (kind === "text") {
      scanText(node, input, findings);
    } else if (kind === "attribute") {
      scanAttribute(node, input, findings);
    }
    return true;
  });

  return findings;
}

export const bladeScanner: HardcodedScanner = {
  name: "blade",
  languages: ["blade"],
  extensions: [".blade.php"],
  scan: scanBlade,
};
