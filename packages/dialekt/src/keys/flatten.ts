export function flattenObject(
  input: Readonly<Record<string, unknown>>,
  prefix = "",
): Record<string, string> {
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const fullKey = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      Object.assign(output, flattenObject(value as Record<string, unknown>, fullKey));
    } else if (typeof value === "string") {
      output[fullKey] = value;
    }
  }
  return output;
}

export function unflattenObject(input: Readonly<Record<string, string>>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [dottedKey, value] of Object.entries(input)) {
    const segments = dottedKey.split(".");
    let cursor = output;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      if (typeof cursor[segment] !== "object" || cursor[segment] === null) {
        cursor[segment] = {};
      }
      cursor = cursor[segment] as Record<string, unknown>;
    }
    cursor[segments[segments.length - 1]!] = value;
  }
  return output;
}

export function diffKeys(
  source: Readonly<Record<string, string>>,
  target: Readonly<Record<string, string>>,
): string[] {
  return Object.keys(source).filter((key) => !(key in target));
}
