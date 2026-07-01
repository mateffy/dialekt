#!/usr/bin/env node
import {
  A as resolveModel,
  C as runTranslation,
  S as computeMissingKeys,
  T as createOneShotStrategy,
  a as formatMissingKeys,
  c as formatValidate,
  d as detectFormat,
  i as formatLanguages,
  j as chunkKeys,
  n as formatBenchmark,
  o as formatTranslate,
  r as formatError,
  s as formatUnusedKeys,
  t as formatAdd,
  w as createToolLoopStrategy,
  x as loadConfig,
} from "../formatters-De4Q-X1d.mjs";
import { Console, Effect, Option } from "effect";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Command, Options } from "@effect/cli";
//#region src/cli/config-resolution.ts
function resolveEffectiveConfig(flags, loaded) {
  return {
    ...loaded,
    sourceLocale: flags.baseLanguage ?? loaded.sourceLocale,
    targetLocales:
      flags.language && flags.language.length > 0 ? flags.language : loaded.targetLocales,
    strategy: flags.strategy ?? loaded.strategy,
    adapters: flags.adapter
      ? loaded.adapters.filter((a) => a.name === flags.adapter)
      : loaded.adapters,
  };
}
//#endregion
//#region src/cli/commands/translate.ts
function runTranslate(
  flags,
  configLoader = loadConfig,
  modelResolver = resolveModel,
  translationRunner = runTranslation,
  logger = (msg) => Console.log(msg),
) {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      {
        baseLanguage: Option.getOrUndefined(flags.baseLanguage),
        language: Option.isSome(flags.language) ? [flags.language.value] : void 0,
        adapter: Option.getOrUndefined(flags.adapter),
        strategy:
          Option.getOrUndefined(flags.strategy) === "one-shot" ||
          Option.getOrUndefined(flags.strategy) === "tool-loop-agent"
            ? Option.getOrUndefined(flags.strategy)
            : void 0,
      },
      loaded,
    );
    const model = yield* modelResolver(flags.fast ? effective.fastModel : effective.model);
    const translationStrategy =
      effective.strategy === "tool-loop-agent"
        ? createToolLoopStrategy({
            model,
            retry: effective.retry,
          })
        : createOneShotStrategy({
            model,
            retry: effective.retry,
          });
    yield* translationRunner({
      adapters: effective.adapters,
      strategy: translationStrategy,
      sourceLocale: effective.sourceLocale,
      targetLocales: effective.targetLocales ?? [],
      chunking: effective.chunking,
    });
    const format = detectFormat(
      flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0,
    );
    yield* logger(
      formatTranslate(
        {
          success: true,
          message: "Translation complete.",
          stats: {
            adaptersProcessed: effective.adapters.length,
            localesTranslated: (effective.targetLocales ?? []).length,
            keysTranslated: 0,
          },
        },
        format,
      ),
    );
  });
}
const translateCommand = Command.make(
  "translate",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    adapter: Options.optional(Options.text("adapter")),
    strategy: Options.optional(Options.text("strategy")),
    baseLanguage: Options.optional(Options.text("base-language")),
    language: Options.optional(Options.text("language")),
    name: Options.optional(Options.text("name")),
    skipNames: Options.boolean("skip-names"),
    skipLanguages: Options.boolean("skip-languages"),
    fast: Options.boolean("fast"),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runTranslate(flags),
);
//#endregion
//#region src/cli/commands/validate.ts
function runValidate(
  flags,
  configLoader = loadConfig,
  missingKeysComputer = computeMissingKeys,
  logger = (msg) => Console.log(msg),
) {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      {
        baseLanguage: Option.getOrUndefined(flags.baseLanguage),
        language: Option.isSome(flags.language) ? [flags.language.value] : void 0,
        adapter: Option.getOrUndefined(flags.adapter),
      },
      loaded,
    );
    const entries = [];
    for (const a of effective.adapters) {
      const locales = yield* a.listLocales();
      const sourceLocale = effective.sourceLocale;
      const missingEntries = yield* missingKeysComputer(
        a,
        sourceLocale,
        locales.filter((l) => l !== sourceLocale),
      );
      for (const entry of missingEntries)
        entries.push({
          adapter: entry.adapter,
          locale: entry.locale,
          resource: entry.resource.label,
          count: entry.missing.length,
        });
    }
    const format = detectFormat(
      flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0,
    );
    const passing = entries.length === 0;
    yield* logger(
      formatValidate(
        {
          passing,
          entries,
        },
        format,
      ),
    );
    if (!passing)
      yield* Effect.sync(() => {
        process.exitCode = 1;
      });
  }).pipe(Effect.mapError((e) => e));
}
const validateCommand = Command.make(
  "validate",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    adapter: Options.optional(Options.text("adapter")),
    baseLanguage: Options.optional(Options.text("base-language")),
    language: Options.optional(Options.text("language")),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runValidate(flags),
);
//#endregion
//#region src/cli/commands/add.ts
function parseAddTokens(tokens, errorLogger) {
  return Effect.gen(function* () {
    const entriesByResource = {};
    for (const token of tokens) {
      const eqIdx = token.indexOf("=");
      if (eqIdx === -1) {
        yield* errorLogger(`Invalid token (missing '='): ${token}`);
        continue;
      }
      const key = token.slice(0, eqIdx);
      const value = token.slice(eqIdx + 1);
      const dotIdx = key.indexOf(".");
      if (dotIdx === -1) {
        yield* errorLogger(`Invalid key (no resource segment): ${key}`);
        continue;
      }
      const resource = key.slice(0, dotIdx);
      const subKey = key.slice(dotIdx + 1);
      if (!entriesByResource[resource]) entriesByResource[resource] = {};
      entriesByResource[resource][subKey] = value;
    }
    return entriesByResource;
  });
}
function runAdd(
  flags,
  tokens,
  configLoader = loadConfig,
  modelResolver = resolveModel,
  translationRunner = runTranslation,
  logger = (msg) => Console.log(msg),
  errorLogger = (msg) => Console.error(msg),
) {
  return Effect.gen(function* () {
    const effective = resolveEffectiveConfig({}, yield* configLoader(flags.config));
    const entriesByResource = yield* parseAddTokens(tokens, errorLogger);
    const addedResources = [];
    for (const adapter of effective.adapters)
      for (const [resourceKey, entries] of Object.entries(entriesByResource)) {
        const resourceRef = {
          key: resourceKey,
          label: resourceKey,
        };
        yield* adapter.writeResource(effective.sourceLocale, resourceRef, entries);
        addedResources.push(`${adapter.name}/${effective.sourceLocale}/${resourceKey}`);
      }
    const modelConfig = effective.model;
    const model = yield* modelResolver(modelConfig);
    const translationStrategy =
      effective.strategy === "tool-loop-agent"
        ? createToolLoopStrategy({
            model,
            retry: effective.retry,
          })
        : createOneShotStrategy({
            model,
            retry: effective.retry,
          });
    yield* translationRunner({
      adapters: effective.adapters,
      strategy: translationStrategy,
      sourceLocale: effective.sourceLocale,
      targetLocales: (effective.targetLocales ?? []).filter((l) => l !== effective.sourceLocale),
      chunking: effective.chunking,
    });
    const format = detectFormat(
      flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0,
    );
    yield* logger(
      formatAdd(
        {
          success: true,
          message: "Add + translate complete.",
          addedResources,
        },
        format,
      ),
    );
  });
}
const addCommand = Command.make(
  "add",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    create: Options.boolean("create"),
    format: Options.optional(Options.text("format")),
  },
  ({ config, create, format }) => {
    const rawTokens = process.argv
      .slice(3)
      .filter((t) => !t.startsWith("--") && !t.startsWith("-"));
    return runAdd(
      {
        config,
        create,
        format,
      },
      rawTokens,
    );
  },
);
//#endregion
//#region src/cli/commands/missing.ts
function runMissing(
  flags,
  configLoader = loadConfig,
  missingKeysComputer = computeMissingKeys,
  logger = (msg) => Console.log(msg),
) {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      {
        baseLanguage: Option.getOrUndefined(flags.baseLanguage),
        language: Option.isSome(flags.language) ? [flags.language.value] : void 0,
        adapter: Option.getOrUndefined(flags.adapter),
      },
      loaded,
    );
    const allEntries = [];
    for (const a of effective.adapters) {
      const locales = yield* a.listLocales();
      const sourceLocale = effective.sourceLocale;
      const entries = yield* missingKeysComputer(
        a,
        sourceLocale,
        locales.filter((l) => l !== sourceLocale),
      );
      for (const entry of entries)
        for (const key of entry.missing)
          allEntries.push({
            adapter: entry.adapter,
            locale: entry.locale,
            resource: entry.resource.label,
            key,
          });
    }
    yield* logger(
      formatMissingKeys(
        allEntries,
        detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0),
      ),
    );
  }).pipe(Effect.mapError((e) => e));
}
const missingCommand = Command.make(
  "missing",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    adapter: Options.optional(Options.text("adapter")),
    baseLanguage: Options.optional(Options.text("base-language")),
    language: Options.optional(Options.text("language")),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runMissing(flags),
);
//#endregion
//#region src/cli/commands/unused.ts
function runUnused(
  flags,
  configLoader = loadConfig,
  logger = (msg) => Console.log(msg),
  errorLogger = (msg) => Console.error(msg),
) {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      {
        baseLanguage: Option.getOrUndefined(flags.baseLanguage),
        adapter: Option.getOrUndefined(flags.adapter),
      },
      loaded,
    );
    const allEntries = [];
    for (const a of effective.adapters) {
      if (!a.capabilities.unusedKeyDetection) {
        yield* errorLogger(
          formatError(
            `Adapter '${a.name}' does not support unused-key detection.`,
            detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0),
          ),
        );
        continue;
      }
      yield* a.listLocales();
      const sourceLocale = effective.sourceLocale;
      const resources = yield* a.listResources(sourceLocale);
      for (const resource of resources) {
        const unused = yield* a.findUnusedKeys(sourceLocale, resource);
        for (const key of unused)
          allEntries.push({
            adapter: a.name,
            locale: sourceLocale,
            resource: resource.label,
            key,
          });
      }
    }
    yield* logger(
      formatUnusedKeys(
        allEntries,
        detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0),
      ),
    );
  }).pipe(Effect.mapError((e) => e));
}
const unusedCommand = Command.make(
  "unused",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    adapter: Options.optional(Options.text("adapter")),
    baseLanguage: Options.optional(Options.text("base-language")),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runUnused(flags),
);
//#endregion
//#region src/cli/commands/languages.ts
function runLanguages(flags, configLoader = loadConfig, logger = (msg) => Console.log(msg)) {
  return Effect.gen(function* () {
    const effective = resolveEffectiveConfig({}, yield* configLoader(flags.config));
    const entries = [];
    for (const adapter of effective.adapters) {
      const locales = yield* adapter.listLocales();
      entries.push({
        adapter: adapter.name,
        locales,
      });
    }
    yield* logger(
      formatLanguages(
        entries,
        detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0),
      ),
    );
  }).pipe(Effect.mapError((e) => e));
}
const languagesCommand = Command.make(
  "languages",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runLanguages(flags),
);
//#endregion
//#region src/benchmark/metrics.ts
function summarizeBenchmarkResults(results) {
  const totalChunks = results.length;
  const succeededChunks = results.filter((r) => r.succeeded).length;
  const failedChunks = totalChunks - succeededChunks;
  const totalDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0);
  const totalAttempts = results.reduce((sum, r) => sum + r.attemptCount, 0);
  return {
    strategyName: results[0]?.strategyName ?? "one-shot",
    totalChunks,
    succeededChunks,
    failedChunks,
    totalDurationMs,
    averageDurationMsPerChunk: totalChunks > 0 ? totalDurationMs / totalChunks : 0,
    totalAttempts,
  };
}
function runBenchmarkedChunk(strategy, ctx) {
  return Effect.gen(function* () {
    const start = Date.now();
    const result = yield* Effect.either(strategy.translateChunk(ctx));
    const durationMs = Date.now() - start;
    if (result._tag === "Right")
      return {
        strategyName: strategy.name,
        chunkKeyCount: ctx.keys.length,
        durationMs,
        attemptCount: 1,
        succeeded: true,
        errorMessage: void 0,
      };
    return {
      strategyName: strategy.name,
      chunkKeyCount: ctx.keys.length,
      durationMs,
      attemptCount: 1,
      succeeded: false,
      errorMessage: String(result.left.cause),
    };
  });
}
//#endregion
//#region src/benchmark/runner.ts
function runBenchmark(config) {
  return Effect.gen(function* () {
    const summaries = [];
    for (const strategy of config.strategies) {
      const results = yield* Effect.forEach(
        config.chunks,
        (chunk) => runBenchmarkedChunk(strategy, chunk),
        { concurrency: config.concurrency },
      );
      summaries.push(summarizeBenchmarkResults(results));
    }
    return summaries;
  });
}
//#endregion
//#region src/cli/commands/benchmark.ts
function runBenchmarkCommand(flags, deps) {
  return Effect.gen(function* () {
    yield* deps.errorLogger(
      formatError(
        "Warning: This will make real API calls to the configured model provider(s) and may incur cost.",
        detectFormat(flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0),
      ),
    );
    const loaded = yield* deps.configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      { adapter: Option.getOrUndefined(flags.adapter) },
      loaded,
    );
    const strategyNames = Option.getOrElse(flags.strategies, () => "one-shot,tool-loop-agent")
      .split(",")
      .map((s) => s.trim());
    const model = yield* deps.modelResolver(effective.model);
    const strategyList = strategyNames.map((name) =>
      name === "tool-loop-agent"
        ? createToolLoopStrategy({
            model,
            retry: effective.retry,
          })
        : createOneShotStrategy({
            model,
            retry: effective.retry,
          }),
    );
    const allChunks = [];
    for (const a of effective.adapters) {
      const locales = yield* a.listLocales();
      const sourceLocale = effective.sourceLocale;
      const targets = locales.filter((l) => l !== sourceLocale);
      const missingEntries = yield* deps.missingKeysComputer(a, sourceLocale, targets);
      for (const entry of missingEntries) {
        const sourceMap = yield* a.readResource(sourceLocale, entry.resource);
        const targetMap = yield* a.readResource(entry.locale, entry.resource);
        const chunks = chunkKeys(entry.missing, sourceMap, targetMap, {
          maxTokens: effective.chunking.maxTokens,
          charsPerToken: effective.chunking.charsPerToken,
        });
        for (const keys of chunks)
          allChunks.push({
            sourceLocale,
            targetLocale: entry.locale,
            sourceMap,
            targetMap,
            keys,
          });
      }
    }
    const sampled = allChunks.slice(
      0,
      Option.getOrElse(flags.sampleSize, () => 20),
    );
    const summaries = yield* deps.benchmarkRunner({
      strategies: strategyList,
      chunks: sampled,
      concurrency: effective.chunking.concurrency,
    });
    const format = detectFormat(
      flags.format !== void 0 ? Option.getOrUndefined(flags.format) : void 0,
    );
    const entries = summaries.map((s) => ({
      strategyName: s.strategyName,
      totalChunks: s.totalChunks,
      succeededChunks: s.succeededChunks,
      failedChunks: s.failedChunks,
      totalDurationMs: s.totalDurationMs,
      averageDurationMsPerChunk: s.averageDurationMsPerChunk,
      totalAttempts: s.totalAttempts,
    }));
    yield* deps.logger(formatBenchmark(entries, format));
  });
}
const benchmarkCommand = Command.make(
  "benchmark",
  {
    config: Options.text("config").pipe(Options.withDefault("./dialekt.config.ts")),
    adapter: Options.optional(Options.text("adapter")),
    strategies: Options.optional(Options.text("strategies")),
    sampleSize: Options.optional(Options.integer("sample-size")),
    format: Options.optional(Options.text("format")),
  },
  (flags) =>
    runBenchmarkCommand(flags, {
      configLoader: loadConfig,
      modelResolver: resolveModel,
      missingKeysComputer: computeMissingKeys,
      benchmarkRunner: runBenchmark,
      logger: (msg) => Console.log(msg),
      errorLogger: (msg) => Console.error(msg),
    }),
);
//#endregion
//#region src/cli/main.ts
const rootCommand = Command.make("dialekt").pipe(
  Command.withSubcommands([
    translateCommand,
    validateCommand,
    addCommand,
    missingCommand,
    unusedCommand,
    languagesCommand,
    benchmarkCommand,
  ]),
);
const cli = Command.run(rootCommand, {
  name: "dialekt",
  version: "0.1.0",
});
const program = Effect.provide(cli(process.argv), NodeContext.layer);
NodeRuntime.runMain(program);
//#endregion
export {};
