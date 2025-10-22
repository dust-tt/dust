import { writeFile, mkdir } from "fs/promises"
import { dirname } from "path"
import type { EvalReport, Result, VersusEvalResult } from "./types"
import { Ok, Err } from "./types"

export async function printReport(
  report: EvalReport,
  format: "json" | "csv" | "console",
  outputFile?: string
): Promise<Result<void>> {
  let output: string

  // Check if this is a versus mode report
  const isVersusMode = (report as any).isVersusMode === true

  switch (format) {
    case "json":
      output = isVersusMode ? formatVersusJSON(report) : formatJSON(report)
      break
    case "csv":
      output = isVersusMode ? formatVersusCSV(report) : formatCSV(report)
      break
    case "console":
      output = isVersusMode
        ? formatVersusConsole(report)
        : formatConsole(report)
      break
    default:
      return Err(new Error(`Unknown format: ${String(format)}`))
  }

  if (outputFile) {
    try {
      // Create directory if it doesn't exist
      const dir = dirname(outputFile)
      await mkdir(dir, { recursive: true })

      await writeFile(outputFile, output, "utf-8")
      console.error(`\nReport saved to: ${outputFile}`)
    } catch (error) {
      return Err(
        error instanceof Error
          ? error
          : new Error(`Failed to write file: ${String(error)}`)
      )
    }
  } else {
    // Output to stdout (not stderr) for piping.
    console.log(output)
  }

  return Ok(undefined)
}

function formatJSON(report: EvalReport): string {
  return JSON.stringify(report, null, 2)
}

function formatCSV(report: EvalReport): string {
  const lines: string[] = []

  // CSV header.
  lines.push(
    "prompt,agent_id,run_number,response,score,judge_reasoning,duration_ms,error"
  )

  const evalResults = report.results
  for (const result of evalResults) {
    lines.push(
      [
        escapeCSV(result.prompt),
        result.agentId,
        result.runNumber,
        escapeCSV(result.response),
        result.score,
        escapeCSV(result.judgeReasoning),
        result.durationMs,
        escapeCSV(result.error || ""),
      ].join(",")
    )
  }

  return lines.join("\n")
}

function formatConsole(report: EvalReport): string {
  const lines: string[] = []

  lines.push("=".repeat(80))
  lines.push("EVALUATION REPORT")
  lines.push("=".repeat(80))
  lines.push("")

  // Configuration.
  lines.push("Configuration:")
  lines.push(`  Agents: ${report.config.agents.join(", ")}`)
  lines.push(`  Judge: ${report.config.judgeAgent}`)
  lines.push(`  Runs: ${report.config.runs}`)
  lines.push(`  Total Duration: ${(report.totalDuration / 1000).toFixed(2)}s`)
  lines.push("")

  // Summary.
  lines.push("Summary:")
  lines.push(`  Total Prompts: ${report.summary.totalPrompts}`)
  lines.push(`  Total Runs: ${report.summary.totalRuns}`)
  lines.push(
    `  Success Rate: ${(report.summary.successRate * 100).toFixed(1)}%`
  )
  lines.push(`  Average Score: ${report.summary.averageScore.toFixed(2)}/3`)
  lines.push("")

  // Statistics.
  lines.push("Agent Performance:")
  lines.push("-".repeat(80))

  const evalStats = report.statistics
  for (const stat of evalStats) {
    lines.push(`Agent: ${stat.agentId}`)
    lines.push(`  Total Runs: ${stat.totalRuns}`)
    lines.push(`  Average Score: ${stat.averageScore.toFixed(2)}/3`)
    lines.push(`  Min/Max Score: ${stat.minScore}/${stat.maxScore}`)
    lines.push(`  Std Dev: ${stat.stdDev.toFixed(2)}`)
    lines.push(`  Error Rate: ${(stat.errorRate * 100).toFixed(1)}%`)
    lines.push(`  Avg Duration: ${(stat.averageDurationMs / 1000).toFixed(2)}s`)
    lines.push("")
  }

  // Sample results.
  lines.push("Sample Results (first 5):")
  lines.push("-".repeat(80))

  const evalResults = report.results.slice(0, 5)
  for (const result of evalResults) {
    lines.push(`Prompt: "${result.prompt.substring(0, 50)}..."`)
    lines.push(`  Agent: ${result.agentId}`)
    lines.push(`  Score: ${result.score}/3`)
    if (result.error) {
      lines.push(`  Error: ${result.error}`)
    }
    lines.push("")
  }

  lines.push("=".repeat(80))

  return lines.join("\n")
}

function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

// Versus mode formatting functions

function formatVersusJSON(report: EvalReport): string {
  const versusResults = (report as any).versusResults as VersusEvalResult[]

  return JSON.stringify(
    {
      config: report.config,
      startTime: report.startTime,
      endTime: report.endTime,
      totalDuration: report.totalDuration,
      versusResults,
    },
    null,
    2
  )
}

function formatVersusCSV(report: EvalReport): string {
  const versusResults = (report as any).versusResults as VersusEvalResult[]
  const lines: string[] = []

  // Header
  lines.push("prompt,run_number,winner,num_agents,timestamp")

  // Data rows
  for (const result of versusResults) {
    lines.push(
      [
        escapeCSV(result.prompt),
        result.runNumber.toString(),
        result.winner,
        result.responses.length.toString(),
        new Date(result.timestamp).toISOString(),
      ].join(",")
    )
  }

  return lines.join("\n")
}

function formatVersusConsole(report: EvalReport): string {
  const versusResults = (report as any).versusResults as VersusEvalResult[]
  const lines: string[] = []

  lines.push("=".repeat(80))
  lines.push("VERSUS MODE EVALUATION REPORT")
  lines.push("=".repeat(80))
  lines.push("")

  // Summary
  lines.push("Summary:")
  lines.push(`  Total Prompts: ${report.summary.totalPrompts}`)
  lines.push(`  Total Runs: ${report.summary.totalRuns}`)
  lines.push(`  Agents: ${report.config.agents.join(", ")}`)
  lines.push("")

  // Win statistics
  const winCounts = new Map<string, number>()
  let drawCount = 0

  for (const result of versusResults) {
    if (result.winner === "DRAW") {
      drawCount++
    } else {
      winCounts.set(result.winner, (winCounts.get(result.winner) || 0) + 1)
    }
  }

  lines.push("Win Statistics:")
  lines.push("-".repeat(80))

  for (const [agent, wins] of winCounts) {
    const percentage = ((wins / versusResults.length) * 100).toFixed(1)
    lines.push(`  ${agent}: ${wins} wins (${percentage}%)`)
  }

  if (drawCount > 0) {
    const drawPercentage = ((drawCount / versusResults.length) * 100).toFixed(1)
    lines.push(`  DRAW: ${drawCount} (${drawPercentage}%)`)
  }

  lines.push("")

  // Sample results
  lines.push("Sample Results (first 5):")
  lines.push("-".repeat(80))

  const sampleResults = versusResults.slice(0, 5)
  for (const result of sampleResults) {
    lines.push(`Prompt: "${result.prompt.substring(0, 50)}..."`)
    lines.push(`  Run: ${result.runNumber}`)
    lines.push(`  Winner: ${result.winner}`)
    lines.push(`  Competing Agents: ${result.responses.length}`)
    lines.push("")
  }

  lines.push("=".repeat(80))

  return lines.join("\n")
}
