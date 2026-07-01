import { NodeContext } from "@effect/platform-node";
import { Layer } from "effect";

/**
 * The only file in this package (besides cli/main.ts) permitted to know
 * this is running on Node.js. Provides FileSystem, Path, and
 * CommandExecutor. Swapping to Bun/Deno later means swapping this one
 * import for @effect/platform-bun's equivalent — nothing else changes.
 */
export const NodePlatformLayer = NodeContext.layer;
