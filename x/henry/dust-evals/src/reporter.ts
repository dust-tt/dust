import { writeFile, mkdir } from "fs/promises"
import { dirname } from "path"
import type { EvalReport, Result } from "./types"
import { Ok, Err } from "./types"
import type { DryRunResult } from "./evaluator"
import { generateHTMLReport } from "./html-reporter"

export type OutputFormat = "json" | "csv" | "console" | "html"

export async function printReport(
  report: EvalReport,
  format: OutputFormat,
  outputFile: string | undefined
): Promise<Result<void>> {
  let output: string

  switch (format) {
    case "json":
      output = formatJSON(report)
      break
    case "csv":
      output = formatCSV(report)
      break
    case "console":
      output = formatConsole(report)
      break
    case "html":
      output = generateHTMLReport(report)
      break
    default:
      return Err(new Error(`Unknown format: ${String(format)}`))
  }

  if (outputFile) {
    try {
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
    console.log(output)
  }

  return Ok(undefined)
}

function formatJSON(report: EvalReport): string {
  return JSON.stringify(report, null, 2)
}

function formatCSV(report: EvalReport): string {
  const lines: string[] = []

  // Header with all fields
  lines.push(
    [
      "prompt",
      "agent_id",
      "run_number",
      "response",
      "final_score",
      "judge_votes",
      "judge_agreement",
      "judge_variance",
      "agent_duration_ms",
      "agent_conversation_id",
      "agent_message_id",
      "agent_retry_count",
      "judge_conversation_ids",
      "error",
      "was_timeout",
    ].join(",")
  )

  for (const result of report.results) {
    const judgeVotes = result.judgeResult.votes.map((v) => v.score).join(";")
    const judgeConvIds = result.judgeResult.votes
      .map((v) => v.conversationId)
      .join(";")

    lines.push(
      [
        escapeCSV(result.prompt),
        result.agentId,
        result.runNumber,
        escapeCSV(result.response),
        result.judgeResult.finalScore,
        judgeVotes,
        result.judgeResult.agreement.toFixed(3),
        result.judgeResult.variance.toFixed(3),
        result.agentDurationMs,
        result.agentConversationId,
        result.agentMessageId,
        result.agentRetryCount,
        judgeConvIds,
        escapeCSV(result.error || ""),
        result.wasTimeout ? "true" : "false",
      ].join(",")
    )
  }

  return lines.join("\n")
}

function formatConsole(report: EvalReport): string {
  const lines: string[] = []
  const scale = report.metadata.scaleUsed

  lines.push("=".repeat(80))
  lines.push("EVALUATION REPORT")
  lines.push("=".repeat(80))
  lines.push("")

  // Configuration
  lines.push("Configuration:")
  lines.push(`  Agents: ${report.config.agents.join(", ")}`)
  lines.push(`  Judge: ${report.config.judgeAgent}`)
  lines.push(`  Scale: ${scale.type} (${scale.min}-${scale.max})`)
  lines.push(`  Runs per prompt: ${report.config.runs}`)
  lines.push(`  Judge runs per evaluation: ${report.metadata.judgeRunsPerEval}`)
  lines.push(`  Total Duration: ${(report.totalDuration / 1000).toFixed(2)}s`)
  lines.push("")

  // Summary
  lines.push("Summary:")
  lines.push(`  Total Prompts: ${report.summary.totalPrompts}`)
  lines.push(`  Total Evaluations: ${report.summary.totalRuns}`)
  lines.push(
    `  Success Rate: ${(report.summary.successRate * 100).toFixed(1)}%`
  )
  lines.push(
    `  Average Score: ${report.summary.averageScore.toFixed(2)}/${scale.max}`
  )
  lines.push(
    `  Normalized Score: ${(report.summary.normalizedAverageScore * 100).toFixed(1)}%`
  )
  lines.push(
    `  Average Judge Agreement: ${(report.summary.averageJudgeAgreement * 100).toFixed(1)}%`
  )
  if (report.config.minAgreement && report.summary.lowAgreementCount > 0) {
    lines.push(
      `  Low Agreement Results: ${report.summary.lowAgreementCount} (threshold: ${(report.config.minAgreement * 100).toFixed(0)}%)`
    )
  }
  lines.push("")

  // Agent statistics
  lines.push("Agent Performance:")
  lines.push("-".repeat(80))

  for (const stat of report.statistics) {
    lines.push(`\nAgent: ${stat.agentId}`)
    lines.push(`  Total Runs: ${stat.totalRuns}`)
    lines.push(`  Average Score: ${stat.averageScore.toFixed(2)}/${scale.max}`)
    lines.push(`  Normalized: ${(stat.normalizedScore * 100).toFixed(1)}%`)
    lines.push(`  Min/Max Score: ${stat.minScore}/${stat.maxScore}`)
    lines.push(`  Std Dev: ${stat.stdDev.toFixed(2)}`)
    lines.push(`  Error Rate: ${(stat.errorRate * 100).toFixed(1)}%`)
    lines.push(`  Timeout Rate: ${(stat.timeoutRate * 100).toFixed(1)}%`)
    lines.push(`  Avg Duration: ${(stat.averageDurationMs / 1000).toFixed(2)}s`)
    lines.push(`  Avg Retries: ${stat.averageRetryCount.toFixed(2)}`)
    lines.push(
      `  Avg Judge Agreement: ${(stat.averageJudgeAgreement * 100).toFixed(1)}%`
    )
  }
  lines.push("")

  // Sample results
  const sampleCount = Math.min(5, report.results.length)
  lines.push(`Sample Results (first ${sampleCount}):`)
  lines.push("-".repeat(80))

  for (const result of report.results.slice(0, sampleCount)) {
    lines.push(`\nPrompt: "${result.prompt.substring(0, 60)}..."`)
    lines.push(`  Agent: ${result.agentId}`)
    lines.push(`  Run: ${result.runNumber}`)

    if (result.error) {
      lines.push(`  ERROR: ${result.error}`)
      if (result.wasTimeout) {
        lines.push(`  (Timeout)`)
      }
    } else {
      const votes = result.judgeResult.votes.map((v) => v.score)
      lines.push(
        `  Score: ${result.judgeResult.finalScore}/${scale.max} (votes: [${votes.join(", ")}])`
      )
      lines.push(
        `  Agreement: ${(result.judgeResult.agreement * 100).toFixed(0)}%`
      )
      lines.push(`  Duration: ${(result.agentDurationMs / 1000).toFixed(2)}s`)
      lines.push(`  Conversation: ${result.agentConversationId}`)
    }
  }
  lines.push("")

  // Conversation IDs summary
  if (report.metadata.conversationIds.length > 0) {
    lines.push("Conversation IDs (for debugging):")
    lines.push("-".repeat(80))
    const uniqueIds = [...new Set(report.metadata.conversationIds)]
    lines.push(`  Total unique conversations: ${uniqueIds.length}`)
    lines.push(`  First 10: ${uniqueIds.slice(0, 10).join(", ")}`)
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

/**
 * Print dry run results.
 */
export function printDryRunResult(result: DryRunResult): void {
  console.error("=".repeat(80))
  console.error("DRY RUN - Configuration Validation")
  console.error("=".repeat(80))
  console.error("")

  // CSV info
  console.error("CSV File:")
  console.error(`  Path: ${result.config.csvPath}`)
  console.error(`  Rows: ${result.csvInfo.rowCount}`)
  console.error(`  Columns: ${result.csvInfo.columns.join(", ")}`)
  console.error("")

  // Prompts to evaluate
  console.error("Prompts to Evaluate:")
  console.error(`  Total from CSV: ${result.csvInfo.rowCount}`)
  if (result.config.sample) {
    console.error(`  After sampling: ${result.promptsToEvaluate}`)
  }
  if (result.config.promptFilter) {
    console.error(`  Filter: ${result.config.promptFilter}`)
  }
  console.error("")

  // Agents
  console.error("Agents:")
  for (const agent of result.agents) {
    const status = agent.valid ? "✓" : "✗"
    const name = agent.valid ? ` (${agent.name})` : ` - ${agent.error}`
    console.error(`  ${status} ${agent.id}${name}`)
  }
  console.error("")

  // Judge
  console.error("Judge:")
  const judgeStatus = result.judge.valid ? "✓" : "✗"
  const judgeName = result.judge.valid
    ? ` (${result.judge.name})`
    : ` - ${result.judge.error}`
  console.error(`  ${judgeStatus} ${result.judge.id}${judgeName}`)
  console.error("")

  // Estimation
  console.error("Estimated Work:")
  console.error(`  Prompts: ${result.promptsToEvaluate}`)
  console.error(`  Agents: ${result.config.agents.length}`)
  console.error(`  Runs per prompt: ${result.config.runs}`)
  console.error(`  Judge runs per eval: ${result.config.judgeRuns}`)
  console.error(`  Total API calls: ~${result.estimatedCalls}`)
  console.error("")

  // Validation result
  const allValid = result.agents.every((a) => a.valid) && result.judge.valid
  if (allValid) {
    console.error("✓ All validations passed. Ready to run evaluation.")
  } else {
    console.error("✗ Validation failed. Fix errors before running.")
  }

  console.error("=".repeat(80))
}
