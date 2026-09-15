import type {
  HardcodedFinding,
  HardcodedLanguage,
  HardcodedScanInput,
  HardcodedScanner,
} from "../types.js";
import { parseSource, toFinding, trimSlice, walkAst, type AstNode } from "../ast.js";
import { isIgnoredAttribute, isLikelyTranslatable } from "../filter.js";

/** Components that already route their children through a translator. */
const TRANSLATION_COMPONENTS = new Set([
  "Trans",
  "Translate",
  "FormattedMessage",
  "FormattedHTMLMessage",
]);

/** Elements whose text content is code or markup, never UI copy. */
const NON_TRANSLATABLE_ELEMENTS = new Set(["code", "pre", "script", "style", "kbd", "samp"]);

const JSX_LANGUAGES: readonly HardcodedLanguage[] = [
  "javascript",
  "javascriptreact",
  "typescript",
  "typescriptreact",
];

const GRAMMAR_BY_LANGUAGE: Readonly<Record<string, string>> = {
  javascript: "js",
  javascriptreact: "jsx",
  typescript: "ts",
  typescriptreact: "tsx",
};

const NAME_KINDS = new Set([
  "identifier",
  "member_expression",
  "jsx_namespaced_name",
  "nested_identifier",
  "property_identifier",
]);

const STRING_CONTENT_KINDS = new Set(["string_fragment", "string_content"]);

function nameFromElement(node: AstNode): string | null {
  const nameNode = node.children().find((child) => NAME_KINDS.has(child.kind()));
  return nameNode === undefined ? null : nameNode.text();
}

function elementName(node: AstNode): string | null {
  if (node.kind() === "jsx_element") {
    const opening = node
      .children()
      .find((child) => child.kind() === "jsx_opening_element");
    return opening === undefined ? null : nameFromElement(opening);
  }
  return nameFromElement(node);
}

function stringContent(node: AstNode): AstNode | null {
  const fragment = node.children().find((child) => STRING_CONTENT_KINDS.has(child.kind()));
  return fragment ?? null;
}

function scanText(node: AstNode, input: HardcodedScanInput, findings: HardcodedFinding[]): void {
  const slice = trimSlice(node.text(), node.range().start.index);
  if (slice === null || !isLikelyTranslatable(slice.text, input.options)) return;
  findings.push(
    toFinding({
      file: input.file,
      language: input.language,
      kind: "jsx-text",
      content: input.content,
      slice,
      confidence: 0.9,
    }),
  );
}

function scanAttribute(
  node: AstNode,
  input: HardcodedScanInput,
  findings: HardcodedFinding[],
): void {
  const nameNode = node.children().find((child) => child.kind() === "property_identifier");
  const valueNode = node
    .children()
    .find((child) => child.kind() === "string" || child.kind() === "template_string");
  if (nameNode === undefined || valueNode === undefined) return;
  const attribute = nameNode.text();
  if (isIgnoredAttribute(attribute, input.options)) return;
  const content = stringContent(valueNode);
  if (content === null) return;
  const slice = trimSlice(content.text(), content.range().start.index);
  if (slice === null || !isLikelyTranslatable(slice.text, input.options)) return;
  findings.push(
    toFinding({
      file: input.file,
      language: input.language,
      kind: "jsx-attribute",
      content: input.content,
      slice,
      confidence: 0.7,
      attribute,
    }),
  );
}

function scanJsx(input: HardcodedScanInput): readonly HardcodedFinding[] {
  const grammar = GRAMMAR_BY_LANGUAGE[input.language] ?? "tsx";
  const root = parseSource(grammar, input.content);
  const findings: HardcodedFinding[] = [];

  walkAst(root, (node) => {
    const kind = node.kind();
    if (kind === "jsx_element" || kind === "jsx_self_closing_element") {
      const name = elementName(node);
      if (
        name !== null &&
        (TRANSLATION_COMPONENTS.has(name) || NON_TRANSLATABLE_ELEMENTS.has(name))
      ) {
        return false;
      }
    }
    if (kind === "jsx_text") {
      scanText(node, input, findings);
    } else if (kind === "jsx_attribute") {
      scanAttribute(node, input, findings);
    }
    return true;
  });

  return findings;
}

export const jsxScanner: HardcodedScanner = {
  name: "jsx",
  languages: JSX_LANGUAGES,
  extensions: [".js", ".jsx", ".ts", ".tsx"],
  scan: scanJsx,
};
