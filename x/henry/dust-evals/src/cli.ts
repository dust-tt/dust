#!/usr/bin/env bun

import { Command } from "commander"
import { readFile } from "fs/promises"
import { existsSync } from "fs"
import { z } from "zod"
import type { EvalConfig, ScaleType } from "./types"
import { SCALES } from "./types"
import { runEvaluation, dryRun, requestShutdown } from "./evaluator"
import { printReport, printDryRunResult } from "./reporter"

// Set up graceful shutdown handlers
let shutdownInProgress = false

function setupShutdownHandlers(): void {
  const handleShutdown = (signal: string): void => {
    if (shutdownInProgress) {
      console.error(`\n[${signal}] Force exit - progress may be lost`)
      process.exit(1)
    }
    shutdownInProgress = true
    console.error(`\n[${signal}] Graceful shutdown initiated...`)
    console.error("Press Ctrl+C again to force exit")
    requestShutdown()
  }

  process.on("SIGINT", () => handleShutdown("SIGINT"))
  process.on("SIGTERM", () => handleShutdown("SIGTERM"))
}

/**
 * Parse duration string (e.g., "30s", "2m", "1h") to milliseconds.
 */
function parseDuration(value: string): number {
  const match = value.match(/^(\d+)(ms|s|m|h)?$/)
  if (!match || !match[1]) {
    throw new Error(
      `Invalid duration: ${value}. Use format: 30s, 2m, 1h, or 60000`
    )
  }

  const num = parseInt(match[1], 10)
  const unit = match[2] || "ms"

  switch (unit) {
    case "ms":
      return num
    case "s":
      return num * 1000
    case "m":
      return num * 60 * 1000
    case "h":
      return num * 60 * 60 * 1000
    default:
      return num
  }
}

const ConfigSchema = z.object({
  agents: z.string().transform((val) => val.split(",")),
  csv: z.string(),
  judge: z.string(),
  judgePromptFile: z.string().optional(),
  runs: z.number().int().positive().default(1),
  judgeRuns: z.number().int().positive().default(3),
  parallel: z.number().int().positive().default(5),
  timeout: z.number().int().positive().default(120000),
  scale: z
    .enum(["binary", "0-3", "1-5", "0-100"])
    .default("0-3") as z.ZodType<ScaleType>,
  output: z.enum(["json", "csv", "console", "html"]).default("console"),
  outputFile: z.string().optional(),
  resume: z.boolean().default(false),
  verbose: z.boolean().default(false),
  maxRetries: z.number().int().positive().default(3),
  retryBackoff: z.number().int().positive().default(1000),
  minAgreement: z.number().min(0).max(1).optional(),
  seed: z.number().int().optional(),
  sample: z.number().int().positive().optional(),
  promptFilter: z.string().optional(),
  dryRun: z.boolean().default(false),
})

interface ConfigFile {
  agents?: string[]
  csv?: string
  judge?: string
  judgePromptFile?: string
  runs?: number
  judgeRuns?: number
  parallel?: number
  timeout?: number | string
  scale?: ScaleType
  output?: "json" | "csv" | "console" | "html"
  outputFile?: string
  verbose?: boolean
  maxRetries?: number
  retryBackoff?: number | string
  minAgreement?: number
  seed?: number
  sample?: number
  promptFilter?: string
}

async function loadConfigFile(path: string): Promise<ConfigFile> {
  const content = await readFile(path, "utf-8")
  return JSON.parse(content) as ConfigFile
}

async function main(): Promise<void> {
  const program = new Command()
    .name("dust-eval")
    .description("Evaluate Dust agents using prompts from CSV files")
    .version("2.0.0")

    // Required options
    .option(
      "--agents <agents>",
      "Comma-separated list of agent SIDs to evaluate"
    )
    .option("--csv <path>", "Path to CSV file with prompts")
    .option("--judge <agent>", "SID of the judge agent")
    .option(
      "--judge-prompt <path>",
      "Path to markdown file with global judge instructions (default: judge-prompts/default.md)"
    )

    // Run configuration
    .option("--runs <number>", "Number of times to run each prompt", "1")
    .option(
      "--judge-runs <number>",
      "Number of judge evaluations per response (for majority voting)",
      "3"
    )
    .option("--parallel <number>", "Number of parallel executions", "5")
    .option(
      "--timeout <duration>",
      "Timeout per agent call (e.g., 30s, 2m, 120000)",
      "2m"
    )

    // Scale configuration
    .option(
      "--scale <type>",
      `Scoring scale: ${Object.keys(SCALES).join(", ")}`,
      "0-3"
    )

    // Output configuration
    .option(
      "--output <format>",
      "Output format: json, csv, console, html",
      "console"
    )
    .option("--output-file <path>", "Path to save results (required for html)")

    // Retry configuration
    .option("--max-retries <number>", "Maximum retry attempts per call", "3")
    .option(
      "--retry-backoff <duration>",
      "Base backoff duration between retries (e.g., 1s, 1000)",
      "1s"
    )

    // Filtering and sampling
    .option("--sample <number>", "Randomly sample N prompts from CSV")
    .option("--seed <number>", "Random seed for reproducible sampling")
    .option(
      "--prompt-filter <filter>",
      "Filter prompts by index (1,3,5), range (1-5), or pattern (*climate*)"
    )

    // Agreement threshold
    .option(
      "--min-agreement <number>",
      "Flag results where judge agreement is below threshold (0-1)"
    )

    // Flags
    .option("--resume", "Resume from last checkpoint if available", false)
    .option("--verbose", "Enable verbose logging", false)
    .option(
      "--dry-run",
      "Validate configuration without running evaluation",
      false
    )

    // Config file
    .option("--config <path>", "Path to JSON config file")

  program.parse(process.argv)
  const cliOptions = program.opts()

  // Load config file if specified
  let fileConfig: ConfigFile = {}
  if (cliOptions["config"]) {
    const configPath = cliOptions["config"] as string
    if (!existsSync(configPath)) {
      console.error(`Error: Config file not found: ${configPath}`)
      process.exit(1)
    }
    try {
      fileConfig = await loadConfigFile(configPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`Error: Failed to parse config file: ${message}`)
      process.exit(1)
    }
  }

  // Merge config file with CLI options (CLI takes precedence)
  const mergedAgents =
    cliOptions["agents"] ||
    (fileConfig.agents ? fileConfig.agents.join(",") : undefined)
  const mergedCsv = cliOptions["csv"] || fileConfig.csv
  const mergedJudge = cliOptions["judge"] || fileConfig.judge

  // Validate required options
  if (!mergedAgents) {
    console.error("Error: --agents is required (or specify in config file)")
    process.exit(1)
  }
  if (!mergedCsv) {
    console.error("Error: --csv is required (or specify in config file)")
    process.exit(1)
  }
  if (!mergedJudge) {
    console.error("Error: --judge is required (or specify in config file)")
    process.exit(1)
  }

  // Validate environment variables
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

  // Parse timeout and retry backoff (support duration strings)
  let timeout: number
  try {
    const timeoutValue =
      cliOptions["timeout"] || fileConfig.timeout?.toString() || "2m"
    timeout = parseDuration(timeoutValue)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error: ${message}`)
    process.exit(1)
  }

  let retryBackoff: number
  try {
    const backoffValue =
      cliOptions["retryBackoff"] || fileConfig.retryBackoff?.toString() || "1s"
    retryBackoff = parseDuration(backoffValue)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Error: ${message}`)
    process.exit(1)
  }

  // Parse and validate configuration
  const parseResult = ConfigSchema.safeParse({
    agents: mergedAgents,
    csv: mergedCsv,
    judge: mergedJudge,
    judgePromptFile:
      cliOptions["judgePrompt"] || fileConfig.judgePromptFile || undefined,
    runs: parseInt(cliOptions["runs"]) || fileConfig.runs || 1,
    judgeRuns: parseInt(cliOptions["judgeRuns"]) || fileConfig.judgeRuns || 3,
    parallel: parseInt(cliOptions["parallel"]) || fileConfig.parallel || 5,
    timeout,
    scale: cliOptions["scale"] || fileConfig.scale || "0-3",
    output: cliOptions["output"] || fileConfig.output || "console",
    outputFile: cliOptions["outputFile"] || fileConfig.outputFile,
    resume: cliOptions["resume"] || false,
    verbose: cliOptions["verbose"] || fileConfig.verbose || false,
    maxRetries:
      parseInt(cliOptions["maxRetries"]) || fileConfig.maxRetries || 3,
    retryBackoff,
    minAgreement:
      cliOptions["minAgreement"] !== undefined
        ? parseFloat(cliOptions["minAgreement"])
        : fileConfig.minAgreement,
    seed:
      cliOptions["seed"] !== undefined
        ? parseInt(cliOptions["seed"])
        : fileConfig.seed,
    sample:
      cliOptions["sample"] !== undefined
        ? parseInt(cliOptions["sample"])
        : fileConfig.sample,
    promptFilter: cliOptions["promptFilter"] || fileConfig.promptFilter,
    dryRun: cliOptions["dryRun"] || false,
  })

  if (!parseResult.success) {
    console.error("Error: Invalid configuration")
    console.error(parseResult.error.format())
    process.exit(1)
  }

  // Validate html format requires output file
  if (parseResult.data.output === "html" && !parseResult.data.outputFile) {
    console.error(
      "Error: --output-file is required when using --output html format"
    )
    process.exit(1)
  }

  const config: EvalConfig = {
    agents: parseResult.data.agents,
    csvPath: parseResult.data.csv,
    judgeAgent: parseResult.data.judge,
    judgePromptFile: parseResult.data.judgePromptFile,
    runs: parseResult.data.runs,
    judgeRuns: parseResult.data.judgeRuns,
    parallel: parseResult.data.parallel,
    timeout: parseResult.data.timeout,
    scale: parseResult.data.scale,
    outputFormat: parseResult.data.output,
    outputFile: parseResult.data.outputFile,
    verbose: parseResult.data.verbose,
    maxRetries: parseResult.data.maxRetries,
    retryBackoffMs: parseResult.data.retryBackoff,
    minAgreement: parseResult.data.minAgreement,
    seed: parseResult.data.seed,
    sample: parseResult.data.sample,
    promptFilter: parseResult.data.promptFilter,
    dryRun: parseResult.data.dryRun,
    configFile: cliOptions["config"] as string | undefined,
  }

  // Print configuration
  console.error(`Dust Eval v2.0.0`)
  console.error(``)
  console.error(`Configuration:`)
  console.error(`  Agents: ${config.agents.join(", ")}`)
  console.error(`  CSV: ${config.csvPath}`)
  console.error(`  Judge: ${config.judgeAgent}`)
  console.error(`  Judge prompt: ${config.judgePromptFile || "judge-prompts/default.md"}`)
  console.error(`  Scale: ${config.scale}`)
  console.error(`  Runs: ${config.runs}`)
  console.error(`  Judge runs: ${config.judgeRuns}`)
  console.error(`  Parallel: ${config.parallel}`)
  console.error(`  Timeout: ${config.timeout}ms`)
  console.error(`  Max retries: ${config.maxRetries}`)
  console.error(`  Retry backoff: ${config.retryBackoffMs}ms`)
  if (config.sample) {
    console.error(`  Sample: ${config.sample} prompts`)
  }
  if (config.seed !== undefined) {
    console.error(`  Seed: ${config.seed}`)
  }
  if (config.promptFilter) {
    console.error(`  Filter: ${config.promptFilter}`)
  }
  if (config.minAgreement !== undefined) {
    console.error(`  Min agreement: ${(config.minAgreement * 100).toFixed(0)}%`)
  }
  if (config.verbose) {
    console.error(`  Verbose: enabled`)
  }
  if (parseResult.data.resume) {
    console.error(`  Resume: enabled`)
  }

  // Handle dry run
  if (config.dryRun) {
    console.error(`\nRunning dry run...`)
    const dryRunResult = await dryRun(config, apiKey, workspaceId)

    if (!dryRunResult.isOk) {
      console.error(`\nDry run failed: ${dryRunResult.error.message}`)
      process.exit(1)
    }

    printDryRunResult(dryRunResult.value)
    process.exit(0)
  }

  // Set up graceful shutdown handlers
  setupShutdownHandlers()

  // Run evaluation
  console.error(`\nStarting evaluation...`)
  const result = await runEvaluation(
    config,
    apiKey,
    workspaceId,
    parseResult.data.resume
  )

  if (!result.isOk) {
    console.error(`\nEvaluation failed: ${result.error.message}`)
    process.exit(1)
  }

  // Output results
  const reportResult = await printReport(
    result.value,
    config.outputFormat,
    config.outputFile
  )

  if (!reportResult.isOk) {
    console.error(`\nFailed to generate report: ${reportResult.error.message}`)
    process.exit(1)
  }

  console.error("\nEvaluation completed successfully")
}

main().catch((error) => {
  console.error("Unexpected error:", error)
  process.exit(1)
})
