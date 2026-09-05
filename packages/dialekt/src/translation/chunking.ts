export interface ChunkingConfig {
  readonly maxTokens: number;
  readonly charsPerToken: number;
  readonly keysPerChunk?: number;
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
  // If user requested fixed chunk size, use it directly.
  if (config.keysPerChunk !== undefined && config.keysPerChunk > 0) {
    const size = config.keysPerChunk;
    const out: string[][] = [];
    for (let i = 0; i < keys.length; i += size) {
      out.push(keys.slice(i, i + size));
    }
    return out;
  }

  const maxChars = config.maxTokens * config.charsPerToken;
  const effectiveMaxChars = Math.max(MIN_EFFECTIVE_MAX_CHARS, maxChars - PROMPT_OVERHEAD);

  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentChars = 0;

  for (const key of keys) {
    const value = sourceMap[key] ?? "";
    const itemChars = key.length + value.length + ITEM_JSON_OVERHEAD;

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

  if (chunks.length === 0 && keys.length > 0) {
    return keys.map((key) => [key]);
  }

  return chunks;
}
