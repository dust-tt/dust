import { parse } from "csv-parse/sync"
import { readFile } from "fs/promises"
import type {
  EvalConfig,
  EvalReport,
  EvalResult,
  Result,
  EvalRow,
  EvalStatistics,
} from "./types"
import { Ok, Err } from "./types"
import { DustClient } from "./dust-client"
import { extractScore, formatJudgePrompt } from "./grading"
import { loadCheckpoint, saveCheckpoint, deleteCheckpoint } from "./checkpoint"

export async function runEvaluation(
  config: EvalConfig,
  apiKey: string,
  workspaceId: string,
  resume: boolean = false
): Promise<Result<EvalReport>> {
  // Handle versus mode separately
  if (config.mode === "versus") {
    const { VersusEvaluator } = await import("./evaluator-versus")
    const versusEvaluator = new VersusEvaluator(apiKey, workspaceId)
    const versusResults = await versusEvaluator.runEvaluation(config)

    if (!versusResults.isOk) {
      return Err(versusResults.error)
    }

    // Convert versus results to standard report format for compatibility
    const endTime = new Date()
    const report: EvalReport = {
      config,
      startTime: new Date().toISOString(),
      endTime: endTime.toISOString(),
      totalDuration: 0, // Will be calculated from results
      results: [], // Versus mode uses different result structure
      statistics: [], // Will need different calculation for versus mode
      summary: {
        totalPrompts: versusResults.value.length / config.runs,
        totalRuns: config.runs,
        successRate: 1.0, // All completed
        averageScore: 0, // N/A for versus mode
      },
    }

    // Store versus results separately for proper reporting
    ;(report as any).versusResults = versusResults.value
    ;(report as any).isVersusMode = true

    return Ok(report)
  }

  // Original score mode implementation continues below
  let startTime = new Date()
  const client = new DustClient(apiKey, workspaceId)

  // Check for existing checkpoint if resume is requested
  let existingResults: EvalResult[] = []
  let completedTasks = new Set<string>()

  if (resume) {
    const checkpoint = await loadCheckpoint(config)
    if (checkpoint) {
      console.error("\nResuming from checkpoint...")
      console.error(`  Previous results: ${checkpoint.results.length}`)
      console.error(`  Completed tasks: ${checkpoint.completedTasks.size}`)

      existingResults = checkpoint.results
      completedTasks = checkpoint.completedTasks
      startTime = new Date(checkpoint.startTime)
    } else {
      console.error("No checkpoint found. Starting fresh...")
    }
  }

  // Load and parse CSV.
  const csvResult = await loadCSV(config.csvPath)
  if (!csvResult.isOk) {
    return csvResult
  }
  const rows = csvResult.value

  // Run standard evaluation with resume support.
  const result = await runStandardEvaluation(
    rows,
    config,
    client,
    existingResults,
    completedTasks,
    startTime.toISOString()
  )
  if (!result.isOk) {
    return result
  }

  const endTime = new Date()
  const allScores = result.value.results
    .filter((r): r is EvalResult => !r.error)
    .map((r) => r.score)
  const avgScore =
    allScores.length > 0
      ? allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length
      : 0

  return Ok({
    config,
    startTime: startTime.toISOString(),
    endTime: endTime.toISOString(),
    totalDuration: endTime.getTime() - startTime.getTime(),
    results: result.value.results,
    statistics: result.value.statistics,
    summary: {
      totalPrompts: rows.length,
      totalRuns: rows.length * config.runs * config.agents.length,
      successRate:
        result.value.results.filter((r) => !r.error).length /
        result.value.results.length,
      averageScore: avgScore,
    },
  })
}

async function loadCSV(path: string): Promise<Result<EvalRow[]>> {
  try {
    const content = await readFile(path, "utf-8")
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[]

    const rows: EvalRow[] = []
    for (const record of records) {
      // Debug logging
      if (rows.length === 0) {
        console.error("CSV columns found:", Object.keys(record))
      }
      if (!record["prompt"] || !record["judge_prompt"]) {
        console.error(
          "Missing required columns or empty values. Record:",
          record
        )
        return Err(
          new Error(
            "CSV must have 'prompt' and 'judge_prompt' columns with non-empty values"
          )
        )
      }
      rows.push({
        prompt: record["prompt"],
        judge_prompt: record["judge_prompt"],
      })
    }

    return Ok(rows)
  } catch (error) {
    return Err(
      error instanceof Error
        ? error
        : new Error(`Failed to load CSV: ${String(error)}`)
    )
  }
}

async function runStandardEvaluation(
  rows: EvalRow[],
  config: EvalConfig,
  client: DustClient,
  existingResults: EvalResult[] = [],
  completedTasks: Set<string> = new Set(),
  startTimeStr: string = new Date().toISOString()
): Promise<Result<{ results: EvalResult[]; statistics: EvalStatistics[] }>> {
  const results: EvalResult[] = [...existingResults]
  let checkpointCounter = 0

  // Process in batches.
  for (let run = 1; run <= config.runs; run++) {
    console.error(`\nRun ${run}/${config.runs}`)

    // Collect all tasks for this run
    const allTasks: Array<{
      taskId: string
      promptIndex: number
      agentId: string
      row: EvalRow
      promise: Promise<void>
    }> = []

    for (let promptIndex = 0; promptIndex < rows.length; promptIndex++) {
      const row = rows[promptIndex]
      if (!row) continue

      // Store row in a const to ensure TypeScript knows it's defined
      const currentRow = row

      // Create tasks for each agent
      config.agents.forEach((agentId) => {
        // Create unique task ID
        const taskId = `${run}-${promptIndex}-${agentId}`

        // Skip if already completed
        if (completedTasks.has(taskId)) {
          return
        }

        const task = async (): Promise<void> => {
          console.error(
            `  Processing: "${currentRow.prompt.substring(0, 50)}..." with ${agentId}`
          )

          const agentResult = await client.callAgent(
            agentId,
            currentRow.prompt,
            config.timeout
          )

          if (!agentResult.isOk) {
            results.push({
              prompt: currentRow.prompt,
              judgePrompt: currentRow.judge_prompt,
              agentId,
              response: "",
              score: 0,
              judgeReasoning: "",
              timestamp: Date.now(),
              runNumber: run,
              durationMs: 0,
              error: agentResult.error.message,
            })
            completedTasks.add(taskId)
            return
          }

          const response = agentResult.value

          // Get judge evaluation.
          const judgePrompt = formatJudgePrompt(
            currentRow.prompt,
            response.response,
            currentRow.judge_prompt
          )

          const judgeResult = await client.callJudge(
            config.judgeAgent,
            judgePrompt,
            config.timeout
          )

          if (!judgeResult.isOk) {
            results.push({
              prompt: currentRow.prompt,
              judgePrompt: currentRow.judge_prompt,
              agentId,
              response: response.response,
              score: 0,
              judgeReasoning: "",
              timestamp: response.timestamp,
              runNumber: run,
              durationMs: response.durationMs,
              error: `Judge error: ${judgeResult.error.message}`,
            })
            completedTasks.add(taskId)
            return
          }

          // Parse score.
          const scoreResult = extractScore(judgeResult.value)

          if (!scoreResult.isOk) {
            results.push({
              prompt: currentRow.prompt,
              judgePrompt: currentRow.judge_prompt,
              agentId,
              response: response.response,
              score: 0,
              judgeReasoning: judgeResult.value,
              timestamp: response.timestamp,
              runNumber: run,
              durationMs: response.durationMs,
              error: `Score parsing error: ${scoreResult.error.message}`,
            })
            completedTasks.add(taskId)
            return
          }

          results.push({
            prompt: currentRow.prompt,
            judgePrompt: currentRow.judge_prompt,
            agentId,
            response: response.response,
            score: scoreResult.value,
            judgeReasoning: judgeResult.value,
            timestamp: response.timestamp,
            runNumber: run,
            durationMs: response.durationMs,
          })

          // Mark task as completed
          completedTasks.add(taskId)

          // Save checkpoint after each agent completes
          checkpointCounter++
          if (checkpointCounter % 5 === 0) {
            // Save every 5 agent completions
            await saveCheckpoint(config, results, completedTasks, startTimeStr)
            console.error(`    [Checkpoint saved: ${results.length} results]`)
          }
        }

        allTasks.push({
          taskId,
          promptIndex,
          agentId,
          row: currentRow,
          promise: task(),
        })
      })
    }

    // Process all tasks with parallelism limit
    console.error(`  Total tasks for this run: ${allTasks.length}`)
    console.error(`  Processing with parallelism: ${config.parallel}`)

    // Execute tasks in parallel batches
    for (let i = 0; i < allTasks.length; i += config.parallel) {
      const batch = allTasks.slice(i, i + config.parallel)
      await Promise.all(batch.map((t) => t.promise))
    }
  }

  // Calculate statistics.
  const statistics = calculateStatistics(results, config.agents)

  // Delete checkpoint since evaluation completed successfully
  await deleteCheckpoint(config)
  console.error("\n[Evaluation completed - checkpoint deleted]")

  return Ok({ results, statistics })
}

function calculateStatistics(
  results: EvalResult[],
  agents: string[]
): EvalStatistics[] {
  const stats: EvalStatistics[] = []

  for (const agent of agents) {
    const agentResults = results.filter((r) => r.agentId === agent)
    const successfulResults = agentResults.filter((r) => !r.error)
    const scores = successfulResults.map((r) => r.score)

    if (scores.length === 0) {
      stats.push({
        agentId: agent,
        totalRuns: agentResults.length,
        averageScore: 0,
        minScore: 0,
        maxScore: 0,
        stdDev: 0,
        scores: [],
        errorRate: agentResults.length > 0 ? 1 : 0,
        averageDurationMs: 0,
      })
      continue
    }

    const avg =
      scores.reduce((a: number, b: number) => a + b, 0) / scores.length
    const variance =
      scores.reduce(
        (sum: number, score: number) => sum + Math.pow(score - avg, 2),
        0
      ) / scores.length
    const stdDev = Math.sqrt(variance)

    stats.push({
      agentId: agent,
      totalRuns: agentResults.length,
      averageScore: avg,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      stdDev,
      scores,
      errorRate:
        (agentResults.length - successfulResults.length) / agentResults.length,
      averageDurationMs:
        successfulResults.reduce((sum, r) => sum + r.durationMs, 0) /
        successfulResults.length,
    })
  }

  return stats
}
