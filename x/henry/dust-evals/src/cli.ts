#!/usr/bin/env bun

import { Command } from "commander"
import { z } from "zod"
import type { EvalConfig } from "./types"
import { runEvaluation } from "./evaluator"
import { printReport } from "./reporter"

const ConfigSchema = z.object({
  agents: z.string().transform((val) => val.split(",")),
  csv: z.string(),
  judge: z.string(),
  runs: z.number().int().positive().default(1),
  parallel: z.number().int().positive().default(5),
  timeout: z.number().int().positive().default(60000),
  output: z.enum(["json", "csv", "console"]).default("console"),
  outputFile: z.string().optional(),
  resume: z.boolean().default(false),
  mode: z.enum(["score", "versus"]).default("score"),
})

async function main(): Promise<void> {
  const program = new Command()
    .name("dust-eval")
    .description("Evaluate Dust agents using prompts from CSV files")
    .version("1.0.0")
    .requiredOption(
      "--agents <agents>",
      "Comma-separated list of agent SIDs to evaluate"
    )
    .requiredOption("--csv <path>", "Path to CSV file with prompts")
    .requiredOption("--judge <agent>", "SID of the judge agent")
    .option("--runs <number>", "Number of times to run each prompt", "1")
    .option("--parallel <number>", "Number of parallel executions", "5")
    .option("--timeout <ms>", "Timeout per agent call in milliseconds", "60000")
    .option("--output <format>", "Output format: json, csv, console", "console")
    .option("--output-file <path>", "Path to save results")
    .option("--resume", "Resume from last checkpoint if available", false)
    .option(
      "--mode <mode>",
      "Evaluation mode: score (0-3 rating) or versus (pick best)",
      "score"
    )

  program.parse(process.argv)
  const options = program.opts()

  // Validate environment variables.
  const apiKey = process.env["DUST_API_KEY"]
  const workspaceId = process.env["DUST_WORKSPACE_ID"]

  if (!apiKey) {
    console.error("Error: DUST_API_KEY environment variable is not set")
    process.exit(1)
  }

  if (!workspaceId) {
    console.error("Error: DUST_WORKSPACE_ID environment variable is not set")
    process.exit(1)
  }

  // Parse and validate configuration.
  const parseResult = ConfigSchema.safeParse({
    agents: options["agents"],
    csv: options["csv"],
    judge: options["judge"],
    runs: parseInt(options["runs"]),
    parallel: parseInt(options["parallel"]),
    timeout: parseInt(options["timeout"]),
    output: options["output"],
    outputFile: options["outputFile"],
    resume: options["resume"],
    mode: options["mode"],
  })

  if (!parseResult.success) {
    console.error("Error: Invalid configuration")
    console.error(parseResult.error.format())
    process.exit(1)
  }

  const config: EvalConfig = {
    agents: parseResult.data.agents,
    csvPath: parseResult.data.csv,
    judgeAgent: parseResult.data.judge,
    runs: parseResult.data.runs,
    parallel: parseResult.data.parallel,
    timeout: parseResult.data.timeout,
    outputFormat: parseResult.data.output,
    mode: parseResult.data.mode,
    ...(parseResult.data.outputFile && {
      outputFile: parseResult.data.outputFile,
    }),
  }

  console.error(`Starting evaluation with config:`)
  console.error(`  Agents: ${config.agents.join(", ")}`)
  console.error(`  CSV: ${config.csvPath}`)
  console.error(`  Judge: ${config.judgeAgent}`)
  console.error(`  Runs: ${config.runs}`)
  console.error(`  Parallel: ${config.parallel}`)
  console.error(`  Timeout: ${config.timeout}ms`)
  console.error(`  Mode: ${config.mode}`)
  if (parseResult.data.resume) {
    console.error(`  Resume: Enabled`)
  }

  // Run evaluation.
  const result = await runEvaluation(
    config,
    apiKey,
    workspaceId,
    parseResult.data.resume
  )

  if (!result.isOk) {
    console.error(`Evaluation failed: ${result.error.message}`)
    process.exit(1)
  }

  // Output results.
  const reportResult = await printReport(
    result.value,
    config.outputFormat,
    config.outputFile
  )

  if (!reportResult.isOk) {
    console.error(`Failed to generate report: ${reportResult.error.message}`)
    process.exit(1)
  }

  console.error("Evaluation completed successfully")
}

main().catch((error) => {
  console.error("Unexpected error:", error)
  process.exit(1)
})
