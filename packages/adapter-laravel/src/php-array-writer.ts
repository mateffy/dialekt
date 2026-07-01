function phpVarExport(value: string): string {
  // Wrap in single quotes; escape backslashes and single quotes only.
  // This matches PHP var_export() semantics for plain strings.
  const escaped = value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `'${escaped}'`;
}

export function renderPhpArray(value: Record<string, unknown>, indent = 0): string {
  const entries = Object.entries(value);
  if (entries.length === 0) {
    return "[]";
  }

  const pad = "    ".repeat(indent);
  const innerPad = "    ".repeat(indent + 1);
  const lines: string[] = ["["];

  for (const [key, val] of entries) {
    const renderedKey = /^\d+$/.test(key) ? key : phpVarExport(key);
    const renderedValue =
      typeof val === "object" && val !== null && !Array.isArray(val)
        ? renderPhpArray(val as Record<string, unknown>, indent + 1)
        : typeof val === "string"
          ? phpVarExport(val)
          : String(val);
    lines.push(`${innerPad}${renderedKey} => ${renderedValue},`);
  }

  lines.push(`${pad}]`);
  return lines.join("\n");
}

export function renderPhpFile(value: Record<string, unknown>): string {
  return `<?php\n\nreturn ${renderPhpArray(value, 0)};\n`;
}
