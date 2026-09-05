import type { IcuMessage, IcuNode, IcuVariable, IcuPlural, IcuSelect } from "./types.js";
import { IcuParseError } from "./types.js";

export function parseIcuMessage(input: string): IcuMessage {
  const nodes: IcuNode[] = [];
  let pos = 0;
  while (pos < input.length) {
    const braceOpen = input.indexOf("{", pos);
    if (braceOpen === -1) {
      nodes.push(input.slice(pos));
      break;
    }
    if (braceOpen > pos) nodes.push(input.slice(pos, braceOpen));
    const braceClose = findMatchingBrace(input, braceOpen);
    if (braceClose === -1) throw new IcuParseError(`Unmatched brace at ${String(braceOpen)}`);
    nodes.push(parseIcuBlock(input.slice(braceOpen + 1, braceClose)));
    pos = braceClose + 1;
  }
  return nodes;
}

function findMatchingBrace(s: string, openIdx: number): number {
  let depth = 1;
  for (let i = openIdx + 1; i < s.length; i++) {
    if (s[i] === "{") depth++;
    else if (s[i] === "}") {
      depth--;
      if (depth === 0) return i;
    } else if (s[i] === "'" && s[i - 1] !== "\\") {
      i = skipQuotedString(s, i);
    }
  }
  return -1;
}

function skipQuotedString(s: string, start: number): number {
  let i = start + 1;
  while (i < s.length && s[i] !== "'") i++;
  return i < s.length ? i : start;
}

function parseIcuBlock(inner: string): IcuNode {
  const trimmed = inner.trim();
  const commaIdx = trimmed.indexOf(",");
  if (commaIdx === -1) return { type: "variable", name: trimmed } as IcuVariable;
  const variable = trimmed.slice(0, commaIdx).trim();
  const rest = trimmed.slice(commaIdx + 1).trim();
  const keywordMatch = /^(\w+)\s*,\s*/.exec(rest);
  if (!keywordMatch) return { type: "variable", name: variable } as IcuVariable;
  const keyword = keywordMatch[1]!;
  const afterKeyword = rest.slice(keywordMatch[0].length).trim();
  if (keyword === "plural" || keyword === "selectordinal")
    return parsePluralBlock(variable, afterKeyword);
  if (keyword === "select") return parseSelectBlock(variable, afterKeyword);
  return { type: "variable", name: variable } as IcuVariable;
}

function parsePluralBlock(variable: string, body: string): IcuPlural {
  let offset: number | undefined;
  let rest = body;
  const offsetMatch = /^offset\s*:\s*(\d+)/i.exec(rest);
  if (offsetMatch) {
    offset = Number(offsetMatch[1]);
    rest = rest.slice(offsetMatch[0].length).trim();
  }
  const forms: Record<string, string> = {};
  while (rest.length > 0) {
    const formMatch = /^(\w+)\s*\{/.exec(rest);
    if (!formMatch) break;
    const formName = formMatch[1]!;
    const braceOpen = rest.indexOf("{");
    const braceClose = findMatchingBrace(rest, braceOpen);
    if (braceClose === -1) throw new IcuParseError(`Unmatched brace in plural form ${formName}`);
    forms[formName] = rest.slice(braceOpen + 1, braceClose);
    rest = rest.slice(braceClose + 1).trim();
  }
  return {
    type: "plural",
    variable,
    ...(offset !== undefined ? { offset } : {}),
    forms,
  } as IcuPlural;
}

function parseSelectBlock(variable: string, body: string): IcuSelect {
  const cases: Record<string, string> = {};
  let rest = body;
  while (rest.length > 0) {
    const caseMatch = /^(\w+)\s*\{/.exec(rest);
    if (!caseMatch) break;
    const caseName = caseMatch[1]!;
    const braceOpen = rest.indexOf("{");
    const braceClose = findMatchingBrace(rest, braceOpen);
    if (braceClose === -1) throw new IcuParseError(`Unmatched brace in select case ${caseName}`);
    cases[caseName] = rest.slice(braceOpen + 1, braceClose);
    rest = rest.slice(braceClose + 1).trim();
  }
  return { type: "select", variable, cases };
}
