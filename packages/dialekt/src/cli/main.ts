#!/usr/bin/env node
import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { translateCommand } from "./commands/translate.js";
import { validateCommand } from "./commands/validate.js";
import { addCommand } from "./commands/add.js";
import { missingCommand } from "./commands/missing.js";
import { unusedCommand } from "./commands/unused.js";
import { languagesCommand } from "./commands/languages.js";
import { benchmarkCommand } from "./commands/benchmark.js";

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
