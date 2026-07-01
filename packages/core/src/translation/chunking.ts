export interface ChunkingConfig {
  readonly maxTokens: number;
  readonly charsPerToken: number;
}

const PROMPT_OVERHEAD = 600;
const ITEM_JSON_OVERHEAD = 20;
const MIN_EFFECTIVE_MAX_CHARS = 200;

export function chunkKeys(
  keys: readonly string[],
  sourceMap: Readonly<Record<string, string>>,
  targetMap: Readonly<Record<string, string>>,
  config: ChunkingConfig,
): string[][] {
  const maxChars = config.maxTokens * config.charsPerToken;
  const sourceJson = JSON.stringify(sourceMap);
  const targetJson = JSON.stringify(targetMap);
  const contextOverhead = (sourceJson?.length ?? 0) + (targetJson?.length ?? 0) + PROMPT_OVERHEAD;
  const effectiveMaxChars = Math.max(MIN_EFFECTIVE_MAX_CHARS, maxChars - contextOverhead);

  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentChars = 0;

  for (const key of keys) {
    const value = sourceMap[key] ?? '';
    const itemChars = key.length + value.length + ITEM_JSON_OVERHEAD;

    // If a single key is larger than the entire chunk, force it through alone.
    if (itemChars > effectiveMaxChars && currentChunk.length === 0) {
      chunks.push([key]);
      continue;
    }

    if (currentChunk.length > 0 && currentChars + itemChars > effectiveMaxChars) {
      chunks.push(currentChunk);
      currentChunk = [];
      currentChars = 0;
    }

    currentChunk.push(key);
    currentChars += itemChars;
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  // Safety valve: if the file context is so large that no keys fit,
  // process keys one-by-one so translation still proceeds.
  if (chunks.length === 0 && keys.length > 0) {
    return keys.map((key) => [key]);
  }

  return chunks;
}
