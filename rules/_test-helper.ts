import { Effect, Layer } from "effect";
import {
  FileFilterLive,
  MemoryFileSystem,
  ProjectRootLive,
  SyntaxTreeLive,
  ImportResolverDefault,
  type Rule,
  type Violation,
} from "gesetz";
import { typescriptSyntaxBackend } from "@gesetz/typescript";

export async function runRule(rule: Rule, files: Record<string, string>): Promise<Violation[]> {
  const root = "/project";
  const absoluteFiles: Record<string, string> = {};
  for (const [rel, content] of Object.entries(files)) {
    absoluteFiles[root + "/" + rel] = content;
  }

  const layers = Layer.mergeAll(
    MemoryFileSystem(absoluteFiles),
    SyntaxTreeLive([typescriptSyntaxBackend]),
    ImportResolverDefault,
    ProjectRootLive(root),
    FileFilterLive(null)
  );

  return Effect.runPromise(rule.run.pipe(Effect.provide(layers)));
}
