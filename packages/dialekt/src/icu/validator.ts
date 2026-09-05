import { parseIcuMessage } from "./parser.js";

export function extractIcuVariables(message: string): string[] {
  const vars = new Set<string>();
  for (const node of parseIcuMessage(message)) {
    if (typeof node === "object") {
      if ("name" in node) vars.add(node.name);
      else if ("variable" in node) vars.add(node.variable);
    }
  }
  return Array.from(vars);
}

export function validateIcuPlural(message: string): boolean {
  try {
    for (const node of parseIcuMessage(message)) {
      if (typeof node === "object" && node.type === "plural" && !("other" in node.forms))
        return false;
    }
    return true;
  } catch {
    return false;
  }
}
