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

/**
 * Unflatten dot-separated keys into a nested object.
 *
 * Special handling: when the input has BOTH a plain scalar key (e.g. `password`)
 * AND dotted keys that would nest under it (e.g. `password.letters`), the dotted
 * keys are kept as literal dot-containing keys at the top level — they are NOT
 * nested. This preserves round-trip fidelity for PHP files that use dot-notation
 * keys alongside plain scalar keys.
 */
export function unflattenObject(input: Readonly<Record<string, string>>): Record<string, unknown> {
  // Detect conflicts: a dotted key whose parent segment is a plain scalar in the input.
  const conflictParent = new Set<string>();
  for (const key of Object.keys(input)) {
    const dot = key.indexOf(".");
    if (dot < 0) continue;
    const parent = key.slice(0, dot);
    if (input[parent] !== undefined) {
      conflictParent.add(parent);
    }
  }

  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    // If this key (or its parent) is a conflict, keep it as a literal dot-key.
    if (conflictParent.size > 0) {
      const dot = key.indexOf(".");
      if (dot > 0 && conflictParent.has(key.slice(0, dot))) {
        output[key] = value;
        continue;
      }
      // Also check: is this key a conflicting parent itself?
      if (conflictParent.has(key)) {
        // It's a scalar parent — put it directly, children will be dotted keys.
        output[key] = value;
        continue;
      }
    }

    // Normal nesting.
    const segments = key.split(".");
    let cursor = output;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i]!;
      const existing = cursor[segment];
      if (typeof existing !== "object" || existing === null || Array.isArray(existing)) {
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