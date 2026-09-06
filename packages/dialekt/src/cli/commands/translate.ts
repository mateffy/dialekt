import { Command, Options } from "@effect/cli";
import { Effect, Console, Option } from "effect";
import { loadConfig } from "../../config/load-config.js";
import { resolveEffectiveConfig } from "../config-resolution.js";
import { resolveModel } from "../../translation/model-registry.js";
import { createOneShotStrategy, type ChunkTrace } from "../../translation/one-shot-strategy.js";
import { createToolLoopStrategy } from "../../translation/tool-loop-strategy.js";
import { runTranslation, type TranslationProgressEvent } from "../../translation/orchestrator.js";
import { detectFormat, type OutputFormat } from "../format.js";
import { formatTranslate, formatError } from "../formatters.js";
import { ProgressDisplay, StatusBar } from "../progress.js";
import type { DialektConfig } from "../../config/types.js";
import type { TranslationRunConfig } from "../../translation/orchestrator.js";
import type { LanguageModel } from "ai";
import type { ModelConfig } from "../../translation/model-registry.js";

const D = "\x1b[2m";
const G = "\x1b[32m";
const C = "\x1b[36m";
const Y = "\x1b[33m";
const B = "\x1b[1m";
const W = "\x1b[0m";

export interface TranslateFlags {
  readonly config: string;
  readonly adapter: Option.Option<string>;
  readonly strategy: Option.Option<string>;
  readonly baseLanguage: Option.Option<string>;
  readonly language: Option.Option<string>;
  readonly name: Option.Option<string>;
  readonly skipNames: boolean;
  readonly skipLanguages: boolean;
  readonly fast: boolean;
  readonly quiet?: boolean;
  readonly format?: Option.Option<string>;
}

function renderTraceToStderr(trace: ChunkTrace): void {
  const { sourceLocale: sl, targetLocale: tl, resource, keys, sourceTexts, output } = trace;
  const TRUNCATE = 140;
  const out = process.stderr;
  const resLabel = resource ? D + resource + W + "  " : "";
  out.write(
    `\n${D}┌${W} ${resLabel}${B}${keys.length} keys${W}  ${Y}${sl}${W} ${D}→${W} ${C}${tl}${W}\n${D}│${W}\n`,
  );
  for (const key of keys) {
    if (!output[key] && !sourceTexts[key]) continue;
    out.write(`${D}│${W} ${C}${key}${W}\n`);
    out.write(`${D}│${W}  ${D}de${W}  ${(sourceTexts[key] ?? "").slice(0, TRUNCATE)}\n`);
    out.write(
      `${D}│${W}  ${G}${tl}${W}  ${(output[key] ?? D + "(missing)" + W).slice(0, TRUNCATE)}\n`,
    );
    out.write(`${D}│${W}\n`);
  }
  out.write(`${D}└${W}\n`);
}

function shouldShowProgress(flags: TranslateFlags): boolean {
  if (!process.stdout.isTTY) return false;
  if (!flags.quiet) return false;
  const fmt = flags.format !== undefined ? Option.getOrUndefined(flags.format) : undefined;
  if (fmt === "json") return false;
  return true;
}

function emitChunk(trace: ChunkTrace, chunkNum: number, total: number, bar: StatusBar): void {
  const { sourceLocale, targetLocale, resource, keys, sourceTexts, output } = trace;
  const counter = `${G}${chunkNum}/${total}${W}`;
  const locPair = `${Y}${sourceLocale}${W} ${D}→${W} ${C}${targetLocale}${W}`;
  const res = resource ? `${D}${resource}${W}  ` : "";
  const TRUNCATE = 140;
  const lines: string[] = [];
  lines.push(
    `\n${D}┌${W} ${res}${B}${keys.length} keys${W}  ${locPair}  ${D}[${W}${counter}${D}]${W}`,
  );
  lines.push(`${D}│${W}`);
  for (const key of keys) {
    const src = sourceTexts[key] ?? "";
    const tgt = output[key] ?? D + "(missing)" + W;
    lines.push(`${D}│${W} ${C}${key}${W}`);
    lines.push(`${D}│${W}  ${D}de${W}  ${src.slice(0, TRUNCATE)}`);
    lines.push(`${D}│${W}  ${G}${targetLocale}${W}  ${tgt.slice(0, TRUNCATE)}`);
    lines.push(`${D}│${W}`);
  }
  lines.push(`${D}└${W}`);
  bar.beforeOutput();
  process.stderr.write(lines.join("\n") + "\n\n");
  bar.afterOutput();
}

const ROUND_TO_4_DP = 10_000;

const roundCost = (costUsd: number): number => Math.round(costUsd * ROUND_TO_4_DP) / ROUND_TO_4_DP;

/** Per-chunk aggregates collected during translation. */
interface ChunkStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalDurationMs: number;
  chunkCount: number;
  minDurationMs: number;
  maxDurationMs: number;
}

const DEEPSEEK_INPUT_PER_1M = 0.4;
const DEEPSEEK_OUTPUT_PER_1M = 0.6;

export function runTranslate(
  flags: TranslateFlags,
  configLoader: (path: string) => Effect.Effect<DialektConfig, unknown> = loadConfig,
  modelResolver: (config: ModelConfig) => Effect.Effect<unknown, unknown> = resolveModel as (
    config: ModelConfig,
  ) => Effect.Effect<unknown, unknown>,
  translationRunner: (
    opts: TranslationRunConfig,
    onProgress?: (event: TranslationProgressEvent) => void,
  ) => Effect.Effect<void, unknown> = runTranslation as (
    opts: TranslationRunConfig,
    onProgress?: (event: TranslationProgressEvent) => void,
  ) => Effect.Effect<void, unknown>,
  logger: (msg: string) => Effect.Effect<void> = (msg: string) => Console.log(msg),
): Effect.Effect<void, unknown> {
  return Effect.gen(function* () {
    const loaded = yield* configLoader(flags.config);
    const effective = resolveEffectiveConfig(
      {
        baseLanguage: Option.getOrUndefined(flags.baseLanguage),
        language: Option.isSome(flags.language) ? [flags.language.value] : undefined,
        adapter: Option.getOrUndefined(flags.adapter),
        strategy:
          Option.getOrUndefined(flags.strategy) === "one-shot" ||
          Option.getOrUndefined(flags.strategy) === "tool-loop-agent"
            ? (Option.getOrUndefined(flags.strategy) as "one-shot" | "tool-loop-agent")
            : undefined,
      },
      loaded,
    );

    const modelConfig = flags.fast ? effective.fastModel : effective.model;
    const model = yield* modelResolver(modelConfig) as Effect.Effect<LanguageModel, unknown>;

    // ── Status bar (default) or progress table (--quiet) ──
    const showProgress = shouldShowProgress(flags);
    const showStatus = !flags.quiet && process.stdout.isTTY;
    let bar: StatusBar | null = null;
    let display: ProgressDisplay | null = null;

    if (showStatus) {
      bar = new StatusBar();
      bar.start();
    } else if (showProgress) {
      const rows: Array<{ locale: string; resources: number }> = [];
      for (const a of effective.adapters) {
        const allLocales: readonly string[] = yield* a.listLocales();
        const sourceLocale = effective.sourceLocale;
        const targets =
          effective.targetLocales && effective.targetLocales.length > 0
            ? effective.targetLocales.filter((l: string) => l !== sourceLocale)
            : allLocales.filter((l: string) => l !== sourceLocale);
        for (const loc of targets) {
          const resources = yield* a.listResources(sourceLocale);
          rows.push({ locale: loc, resources: resources.length });
        }
      }
      if (rows.length > 0) {
        display = new ProgressDisplay(rows);
        display.start();
      }
    }

    // ── Shared trace / progress tracking ──
    const chunkIdx = new Map<string, number>();
    const chunkTot = new Map<string, number>();
    const perLocaleTotal = new Map<string, number>();
    const perLocaleDone = new Map<string, number>();
    const cstats: ChunkStats = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalDurationMs: 0,
      chunkCount: 0,
      minDurationMs: Infinity,
      maxDurationMs: 0,
    };

    let translatedKeys = 0;

    const onTrace = !flags.quiet
      ? (trace: ChunkTrace) => {
          const locale = trace.targetLocale;
          perLocaleDone.set(locale, (perLocaleDone.get(locale) ?? 0) + trace.keys.length);
          const idx = (chunkIdx.get(locale) ?? 0) + 1;
          chunkIdx.set(locale, idx);
          const tot = chunkTot.get(locale) ?? 0;

          cstats.totalPromptTokens += trace.promptTokens;
          cstats.totalCompletionTokens += trace.completionTokens;
          cstats.totalDurationMs += trace.durationMs;
          cstats.chunkCount++;
          cstats.minDurationMs = Math.min(cstats.minDurationMs, trace.durationMs);
          cstats.maxDurationMs = Math.max(cstats.maxDurationMs, trace.durationMs);

          if (bar) {
            emitChunk(trace, idx, tot, bar);
          } else {
            renderTraceToStderr(trace);
          }
        }
      : undefined;

    const strategy =
      effective.strategy === "tool-loop-agent"
        ? createToolLoopStrategy({ model, retry: effective.retry, ...(onTrace ? { onTrace } : {}) })
        : createOneShotStrategy({ model, retry: effective.retry, ...(onTrace ? { onTrace } : {}) });

    yield* translationRunner(
      {
        adapters: effective.adapters,
        strategy,
        sourceLocale: effective.sourceLocale,
        targetLocales: effective.targetLocales ?? [],
        chunking: effective.chunking,
        resourceFilter: Option.getOrUndefined(flags.name),
      },
      (event) => {
        switch (event.type) {
          case "locale-start":
            display?.localeStarted(event.locale);
            break;
          case "locale-scanned":
            display?.localeScanned(event.locale, event.missingKeys ?? 0, event.chunksTotal ?? 0);
            translatedKeys += event.missingKeys ?? 0;
            chunkTot.set(event.locale, event.chunksTotal ?? 0);
            perLocaleTotal.set(
              event.locale,
              (perLocaleTotal.get(event.locale) ?? 0) + (event.missingKeys ?? 0),
            );
            break;
          case "chunk-start":
            if (bar && event.resource) bar.setSlot(event.locale, event.resource, "⏳");
            break;
          case "chunk-complete":
            display?.chunkComplete(event.locale);
            if (bar && event.resource) bar.clearSlot(event.locale);
            break;
          case "chunk-fail":
            display?.chunkFailed(event.locale);
            if (bar && event.resource) bar.clearSlot(event.locale);
            break;
          case "locale-done":
            display?.localeDone(event.locale);
            bar?.clearSlot(event.locale);
            break;
          case "locale-error":
            display?.localeError(event.locale);
            bar?.clearSlot(event.locale);
            break;
        }
      },
    );

    if (bar) bar.finish();
    if (display) display.finish();

    const format = detectFormat(
      flags.format !== undefined
        ? (Option.getOrUndefined(flags.format) as OutputFormat | undefined)
        : undefined,
    );

    const targetCount =
      effective.targetLocales && effective.targetLocales.length > 0
        ? effective.targetLocales.filter((l: string) => l !== effective.sourceLocale).length
        : 0;

    const msg =
      translatedKeys === 0
        ? "All translations are already complete — nothing to translate."
        : "Translation complete.";

    // Per-locale
    const perLocale: Record<string, { translated: number; remaining: number }> = {};
    let totalSource = 0;
    for (const [loc, tot] of perLocaleTotal) {
      totalSource += tot;
      perLocale[loc] = {
        translated: perLocaleDone.get(loc) ?? 0,
        remaining: Math.max(0, tot - (perLocaleDone.get(loc) ?? 0)),
      };
    }

    // Chunk-level cost stats
    const avgDuration = cstats.chunkCount > 0 ? cstats.totalDurationMs / cstats.chunkCount : 0;
    const costUsd =
      (cstats.totalPromptTokens / 1_000_000) * DEEPSEEK_INPUT_PER_1M +
      (cstats.totalCompletionTokens / 1_000_000) * DEEPSEEK_OUTPUT_PER_1M;

    const chunkStats =
      cstats.chunkCount > 0
        ? {
            chunkCount: cstats.chunkCount,
            avgDurationMs: Math.round(avgDuration),
            minDurationMs: cstats.minDurationMs === Infinity ? 0 : cstats.minDurationMs,
            maxDurationMs: cstats.maxDurationMs,
            totalPromptTokens: cstats.totalPromptTokens,
            totalCompletionTokens: cstats.totalCompletionTokens,
            estimatedCostUsd: roundCost(costUsd),
          }
        : undefined;

    yield* logger(
      formatTranslate(
        {
          success: true,
          message: msg,
          stats: {
            adaptersProcessed: effective.adapters.length,
            localesTranslated: targetCount,
            keysTranslated: translatedKeys,
            ...(totalSource > 0 ? { totalSourceKeys: totalSource } : {}),
            ...(Object.keys(perLocale).length > 0 ? { perLocale } : {}),
            ...(chunkStats ? { chunkStats } : {}),
          },
        },
        format,
      ),
    );
  });
}

export const translateCommand = Command.make(
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
    quiet: Options.boolean("quiet"),
    format: Options.optional(Options.text("format")),
  },
  (flags) => runTranslate(flags),
);
