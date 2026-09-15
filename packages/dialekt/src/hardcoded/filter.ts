import type { HardcodedConfig, ResolvedHardcodedOptions } from "./types.js";

/**
 * Attributes whose values are almost always technical (class names, identifiers,
 * routes, handlers). Translatable attributes such as `alt`, `title`,
 * `placeholder`, `label` and `aria-label` are deliberately absent so they get
 * reported.
 */
export const DEFAULT_IGNORED_ATTRIBUTES: readonly string[] = [
  "accept",
  "acceptCharset",
  "action",
  "align",
  "allow",
  "allowFullScreen",
  "as",
  "async",
  "autoComplete",
  "autoFocus",
  "autoPlay",
  "capture",
  "cellPadding",
  "cellSpacing",
  "charSet",
  "checked",
  "cite",
  "class",
  "className",
  "colSpan",
  "cols",
  "content",
  "contentEditable",
  "controls",
  "coords",
  "crossOrigin",
  "data",
  "dateTime",
  "decoding",
  "default",
  "defaultChecked",
  "defaultValue",
  "defer",
  "dir",
  "disabled",
  "download",
  "draggable",
  "encType",
  "enterKeyHint",
  "fetchPriority",
  "fill",
  "form",
  "formAction",
  "headers",
  "height",
  "hidden",
  "high",
  "href",
  "hrefLang",
  "htmlFor",
  "httpEquiv",
  "id",
  "inputMode",
  "integrity",
  "kind",
  "lang",
  "list",
  "loading",
  "loop",
  "low",
  "max",
  "maxLength",
  "media",
  "method",
  "min",
  "minLength",
  "multiple",
  "muted",
  "name",
  "noValidate",
  "open",
  "optimum",
  "pattern",
  "ping",
  "playsInline",
  "poster",
  "preload",
  "readOnly",
  "referrerPolicy",
  "rel",
  "required",
  "reversed",
  "role",
  "rowSpan",
  "rows",
  "sandbox",
  "scope",
  "selected",
  "shape",
  "size",
  "slot",
  "span",
  "spellCheck",
  "src",
  "srcDoc",
  "srcLang",
  "srcSet",
  "start",
  "step",
  "stroke",
  "strokeWidth",
  "style",
  "tabIndex",
  "target",
  "translate",
  "type",
  "useMap",
  "value",
  "viewBox",
  "width",
  "wrap",
  "xmlns",
];

const TRANSLATABLE_ARIA_ATTRIBUTES = new Set([
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
]);

const FRAMEWORK_ATTRIBUTE_PREFIXES = [
  "wire:",
  "x-",
  "@",
  ":",
  "v-",
  "bind:",
  "on:",
  "use:",
  "transition:",
  "in:",
  "out:",
  "animate:",
  "class:",
  "style:",
  "let:",
];

const EVENT_HANDLER_RE = /^on[A-Z]/;
const URL_RE = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
const TECHNICAL_CHARS_RE = /[{}<>;=|\\`[\]()]/;
const LETTER_RE = /\p{L}/u;
const WHITESPACE_RE = /\s/;
const NUMERIC_RE = /^[\d\s.,:%+-]+$/;
const CONSTANT_RE = /^[A-Z][A-Z0-9_]*$/;
const CSS_CLASS_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/i;
const IDENTIFIER_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)+$/i;
const BLADE_DIRECTIVE_RE = /^(?:@|#)/;

export const DEFAULT_HARDCODED_MIN_LENGTH = 2;

/** Merge global config, per-language overrides and defaults for one language. */
export function resolveHardcodedOptions(
  config: HardcodedConfig | undefined,
  language: string,
): ResolvedHardcodedOptions {
  const languageConfig = config?.languages?.[language];
  const ignoredAttributes = new Set(config?.ignoredAttributes ?? DEFAULT_IGNORED_ATTRIBUTES);
  for (const attribute of languageConfig?.ignoredAttributes ?? []) {
    ignoredAttributes.add(attribute);
  }
  const ignoredValues = new Set<string>();
  for (const value of config?.ignoredValues ?? []) ignoredValues.add(value.toLowerCase());
  for (const value of languageConfig?.ignoredValues ?? []) ignoredValues.add(value.toLowerCase());
  return {
    minLength: languageConfig?.minLength ?? config?.minLength ?? DEFAULT_HARDCODED_MIN_LENGTH,
    ignoredAttributes,
    ignoredValues,
  };
}

export function isIgnoredAttribute(
  name: string,
  options: ResolvedHardcodedOptions,
): boolean {
  if (options.ignoredAttributes.has(name)) return true;
  if (name.startsWith("data-")) return true;
  if (name.startsWith("aria-")) return !TRANSLATABLE_ARIA_ATTRIBUTES.has(name);
  if (EVENT_HANDLER_RE.test(name)) return true;
  return FRAMEWORK_ATTRIBUTE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

/**
 * Heuristic gate for "is this string worth translating?". It intentionally
 * errs on the side of reporting and lets config prune the rest.
 */
export function isLikelyTranslatable(
  text: string,
  options: ResolvedHardcodedOptions,
): boolean {
  const value = text.trim();
  if (value.length < options.minLength) return false;
  if (options.ignoredValues.has(value.toLowerCase())) return false;
  if (!LETTER_RE.test(value)) return false;
  if (TECHNICAL_CHARS_RE.test(value)) return false;
  if (URL_RE.test(value)) return false;
  if (NUMERIC_RE.test(value)) return false;
  if (CONSTANT_RE.test(value)) return false;
  if (BLADE_DIRECTIVE_RE.test(value)) return false;
  if (value.startsWith("/") || value.startsWith(".") || value.includes("://")) return false;
  if (WHITESPACE_RE.test(value)) return true;
  if (value.includes("@") || value.includes(":") || value.includes("\\")) return false;
  if (value.includes(".")) return false;
  if (CSS_CLASS_RE.test(value)) return false;
  return !IDENTIFIER_RE.test(value);
}
