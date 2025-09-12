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

export async function runEvaluation(
  config: EvalConfig,
  apiKey: string,
  workspaceId: string
): Promise<Result<EvalReport>> {
  const startTime = new Date()
  const client = new DustClient(apiKey, workspaceId)

  // Load and parse CSV.
  const csvResult = await loadCSV(config.csvPath)
  if (!csvResult.isOk) {
    return csvResult
  }
  const rows = csvResult.value

  // Run standard evaluation.
  const result = await runStandardEvaluation(rows, config, client)
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
      if (!record["prompt"] || !record["judge_prompt"]) {
        return Err(
          new Error("CSV must have 'prompt' and 'judge_prompt' columns")
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
  client: DustClient
): Promise<Result<{ results: EvalResult[]; statistics: EvalStatistics[] }>> {
  const results: EvalResult[] = []

  // Process in batches.
  for (let run = 1; run <= config.runs; run++) {
    console.error(`\nRun ${run}/${config.runs}`)

    for (const row of rows) {
      console.error(`  Processing: "${row.prompt.substring(0, 50)}..."`)

      // Run agents in parallel.
      const agentPromises = config.agents.map(async (agentId) => {
        const agentResult = await client.callAgent(
          agentId,
          row.prompt,
          config.timeout
        )

        if (!agentResult.isOk) {
          results.push({
            prompt: row.prompt,
            judgePrompt: row.judge_prompt,
            agentId,
            response: "",
            score: 0,
            judgeReasoning: "",
            timestamp: Date.now(),
            runNumber: run,
            durationMs: 0,
            error: agentResult.error.message,
          })
          return
        }

        const response = agentResult.value

        // Get judge evaluation.
        const judgePrompt = formatJudgePrompt(
          row.prompt,
          response.response,
          row.judge_prompt
        )

        const judgeResult = await client.callJudge(
          config.judgeAgent,
          judgePrompt,
          config.timeout
        )

        if (!judgeResult.isOk) {
          results.push({
            prompt: row.prompt,
            judgePrompt: row.judge_prompt,
            agentId,
            response: response.response,
            score: 0,
            judgeReasoning: "",
            timestamp: response.timestamp,
            runNumber: run,
            durationMs: response.durationMs,
            error: `Judge error: ${judgeResult.error.message}`,
          })
          return
        }

        // Parse score.
        const scoreResult = extractScore(judgeResult.value)

        if (!scoreResult.isOk) {
          results.push({
            prompt: row.prompt,
            judgePrompt: row.judge_prompt,
            agentId,
            response: response.response,
            score: 0,
            judgeReasoning: judgeResult.value,
            timestamp: response.timestamp,
            runNumber: run,
            durationMs: response.durationMs,
            error: `Score parsing error: ${scoreResult.error.message}`,
          })
          return
        }

        results.push({
          prompt: row.prompt,
          judgePrompt: row.judge_prompt,
          agentId,
          response: response.response,
          score: scoreResult.value,
          judgeReasoning: judgeResult.value,
          timestamp: response.timestamp,
          runNumber: run,
          durationMs: response.durationMs,
        })
      })

      // Limit parallelism.
      const chunks = []
      for (let i = 0; i < agentPromises.length; i += config.parallel) {
        chunks.push(agentPromises.slice(i, i + config.parallel))
      }

      for (const chunk of chunks) {
        await Promise.all(chunk)
      }
    }
  }

  // Calculate statistics.
  const statistics = calculateStatistics(results, config.agents)

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

