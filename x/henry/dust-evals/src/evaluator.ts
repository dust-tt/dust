import { readFile } from "fs/promises"
import { existsSync } from "fs"
import type {
  EvalConfig,
  EvalReport,
  EvalResult,
  EvalStatistics,
  Result,
  EvalRow,
  JudgeVote,
  ScaleConfig,
} from "./types"
import { Ok, Err, SCALES } from "./types"
import { DustClient } from "./dust-client"
import {
  extractScore,
  formatJudgePrompt,
  calculateMajorityVote,
  normalizeScore,
} from "./grading"
import { loadCSV, validateCSV } from "./csv-loader"
import { loadCheckpoint, saveCheckpoint, deleteCheckpoint } from "./checkpoint"

// Default judge prompt file path (relative to package root)
const DEFAULT_JUDGE_PROMPT_FILE = "judge-prompts/default.md"

// Constants
const CHECKPOINT_INTERVAL = 5
const PROMPT_DISPLAY_LENGTH = 40

/**
 * Load global judge prompt from a markdown file.
 * Falls back to default if not specified or file doesn't exist.
 */
async function loadGlobalJudgePrompt(
  judgePromptFile: string | undefined
): Promise<Result<string | undefined>> {
  // Determine which file to load
  const filePath = judgePromptFile || DEFAULT_JUDGE_PROMPT_FILE

  // Check if file exists
  if (!existsSync(filePath)) {
    if (judgePromptFile) {
      // User specified a file that doesn't exist - error
      return Err(new Error(`Judge prompt file not found: ${filePath}`))
    }
    // Default file doesn't exist - that's okay, return undefined
    return Ok(undefined)
  }

  try {
    const content = await readFile(filePath, "utf-8")
    return Ok(content.trim())
  } catch (error) {
    return Err(
      error instanceof Error
        ? error
        : new Error(`Failed to load judge prompt: ${String(error)}`)
    )
  }
}

// Shutdown state for graceful termination
let shutdownRequested = false

/**
 * Request graceful shutdown - saves checkpoint and exits cleanly.
 */
export function requestShutdown(): void {
  shutdownRequested = true
}

/**
 * Check if shutdown has been requested.
 */
export function isShutdownRequested(): boolean {
  return shutdownRequested
}

/**
 * Reset shutdown state (useful for testing).
 */
export function resetShutdownState(): void {
  shutdownRequested = false
}

export interface DryRunResult {
  config: EvalConfig
  csvInfo: { rowCount: number; columns: string[] }
  agents: Array<{ id: string; name: string; valid: boolean; error?: string }>
  judge: { id: string; name: string; valid: boolean; error?: string }
  estimatedCalls: number
  promptsToEvaluate: number
}

/**
 * Perform a dry run to validate configuration without executing.
 */
export async function dryRun(
  config: EvalConfig,
  apiKey: string,
  workspaceId: string
): Promise<Result<DryRunResult>> {
  const client = new DustClient({
    apiKey,
    workspaceId,
    verbose: config.verbose,
    maxRetries: 1,
    retryBackoffMs: 1000,
  })

  // Validate CSV
  const csvResult = await validateCSV(config.csvPath)
  if (!csvResult.isOk) {
    return Err(csvResult.error)
  }

  // Calculate prompts after filtering/sampling
  let promptsToEvaluate = csvResult.value.rowCount
  if (config.sample && config.sample < promptsToEvaluate) {
    promptsToEvaluate = config.sample
  }

  // Validate agents
  const agentResults: DryRunResult["agents"] = []
  for (const agentId of config.agents) {
    const result = await client.validateAgent(agentId)
    if (result.isOk) {
      agentResults.push({ id: agentId, name: result.value.name, valid: true })
    } else {
      agentResults.push({
        id: agentId,
        name: "",
        valid: false,
        error: result.error.message,
      })
    }
  }

  // Validate judge
  const judgeResult = await client.validateAgent(config.judgeAgent)
  const judge = judgeResult.isOk
    ? { id: config.judgeAgent, name: judgeResult.value.name, valid: true }
    : {
        id: config.judgeAgent,
        name: "",
        valid: false,
        error: judgeResult.error.message,
      }

  // Calculate estimated API calls
  // Per prompt: (agents * runs) agent calls + (agents * runs * judgeRuns) judge calls
  const agentCalls = promptsToEvaluate * config.agents.length * config.runs
  const judgeCalls = agentCalls * config.judgeRuns
  const estimatedCalls = agentCalls + judgeCalls

  return Ok({
    config,
    csvInfo: csvResult.value,
    agents: agentResults,
    judge,
    estimatedCalls,
    promptsToEvaluate,
  })
}

/**
 * Run the evaluation.
 */
export async function runEvaluation(
  config: EvalConfig,
  apiKey: string,
  workspaceId: string,
  resume: boolean = false
): Promise<Result<EvalReport>> {
  const startTime = new Date()
  const scale = SCALES[config.scale]

  const client = new DustClient({
    apiKey,
    workspaceId,
    verbose: config.verbose,
    maxRetries: config.maxRetries,
    retryBackoffMs: config.retryBackoffMs,
  })

  // Load global judge prompt
  const globalJudgePromptResult = await loadGlobalJudgePrompt(
    config.judgePromptFile
  )
  if (!globalJudgePromptResult.isOk) {
    return Err(globalJudgePromptResult.error)
  }
  const globalJudgePrompt = globalJudgePromptResult.value

  // Load CSV with filtering/sampling
  const csvResult = await loadCSV(config.csvPath, {
    sample: config.sample,
    seed: config.seed,
    promptFilter: config.promptFilter,
  })
  if (!csvResult.isOk) {
    return Err(csvResult.error)
  }
  const rows = csvResult.value

  // Check for existing checkpoint
  let existingResults: EvalResult[] = []
  let completedTasks = new Set<string>()
  let checkpointStartTime = startTime.toISOString()

  if (resume) {
    const checkpoint = await loadCheckpoint(config)
    if (checkpoint) {
      console.error("\nResuming from checkpoint...")
      console.error(`  Previous results: ${checkpoint.results.length}`)
      console.error(`  Completed tasks: ${checkpoint.completedTasks.size}`)

      existingResults = checkpoint.results
      completedTasks = checkpoint.completedTasks
      checkpointStartTime = checkpoint.startTime
    } else {
      console.error("No checkpoint found. Starting fresh...")
    }
  }

  // Run evaluation
  const evalResult = await runStandardEvaluation(
    rows,
    config,
    client,
    scale,
    globalJudgePrompt,
    existingResults,
    completedTasks,
    checkpointStartTime
  )

  if (!evalResult.isOk) {
    return Err(evalResult.error)
  }

  const endTime = new Date()
  const { results, statistics, conversationIds } = evalResult.value

  // Calculate summary
  const successfulResults = results.filter((r) => !r.error)
  const scores = successfulResults.map((r) => r.judgeResult.finalScore)
  const avgScore =
    scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0
  const normalizedAvg =
    scores.length > 0
      ? successfulResults
          .map((r) => normalizeScore(r.judgeResult.finalScore, scale))
          .reduce((a, b) => a + b, 0) / scores.length
      : 0

  const agreements = successfulResults.map((r) => r.judgeResult.agreement)
  const avgAgreement =
    agreements.length > 0
      ? agreements.reduce((a, b) => a + b, 0) / agreements.length
      : 0

  const lowAgreementCount = config.minAgreement
    ? successfulResults.filter(
        (r) => r.judgeResult.agreement < config.minAgreement!
      ).length
    : 0

  return Ok({
    config,
    startTime: checkpointStartTime,
    endTime: endTime.toISOString(),
    totalDuration: endTime.getTime() - new Date(checkpointStartTime).getTime(),
    results,
    statistics,
    summary: {
      totalPrompts: rows.length,
      totalRuns: rows.length * config.runs * config.agents.length,
      successRate:
        results.length > 0 ? successfulResults.length / results.length : 0,
      averageScore: avgScore,
      normalizedAverageScore: normalizedAvg,
      averageJudgeAgreement: avgAgreement,
      lowAgreementCount,
    },
    metadata: {
      scaleUsed: scale,
      judgeRunsPerEval: config.judgeRuns,
      conversationIds,
      workspaceId,
    },
  })
}

interface EvalTask {
  taskId: string
  promptIndex: number
  agentId: string
  row: EvalRow
  runNumber: number
}

async function runStandardEvaluation(
  rows: EvalRow[],
  config: EvalConfig,
  client: DustClient,
  scale: ScaleConfig,
  globalJudgePrompt: string | undefined,
  existingResults: EvalResult[],
  completedTasks: Set<string>,
  startTimeStr: string
): Promise<
  Result<{
    results: EvalResult[]
    statistics: EvalStatistics[]
    conversationIds: string[]
  }>
> {
  const results: EvalResult[] = [...existingResults]
  const conversationIds: string[] = []
  let checkpointCounter = 0

  // Collect all tasks
  const allTasks: EvalTask[] = []

  for (let run = 1; run <= config.runs; run++) {
    for (let promptIndex = 0; promptIndex < rows.length; promptIndex++) {
      const row = rows[promptIndex]
      if (!row) continue

      for (const agentId of config.agents) {
        const taskId = `${run}-${promptIndex}-${agentId}`

        if (completedTasks.has(taskId)) {
          continue
        }

        allTasks.push({
          taskId,
          promptIndex,
          agentId,
          row,
          runNumber: run,
        })
      }
    }
  }

  console.error(`\nTotal tasks to process: ${allTasks.length}`)
  console.error(`Parallelism: ${config.parallel}`)
  console.error(`Judge runs per evaluation: ${config.judgeRuns}`)

  // Track timing for ETA calculation
  const evaluationStartTime = Date.now()
  let completedCount = 0

  // Process tasks in parallel batches
  for (let i = 0; i < allTasks.length; i += config.parallel) {
    // Check for graceful shutdown request
    if (shutdownRequested) {
      console.error("\n[Shutdown requested - saving checkpoint...]")
      await saveCheckpoint(config, results, completedTasks, startTimeStr)
      console.error(`[Checkpoint saved: ${results.length} results]`)
      return Err(new Error("Evaluation interrupted by shutdown request"))
    }

    const batch = allTasks.slice(i, i + config.parallel)
    const batchNumber = Math.floor(i / config.parallel) + 1
    const totalBatches = Math.ceil(allTasks.length / config.parallel)

    // Calculate ETA
    let etaStr = ""
    if (completedCount > 0) {
      const elapsedMs = Date.now() - evaluationStartTime
      const msPerTask = elapsedMs / completedCount
      const remainingTasks = allTasks.length - completedCount
      const etaMs = msPerTask * remainingTasks
      const etaMin = Math.ceil(etaMs / 60000)
      etaStr = etaMin > 1 ? ` (ETA: ${etaMin}m)` : ` (ETA: <1m)`
    }

    console.error(
      `\nProcessing batch ${batchNumber}/${totalBatches} (${batch.length} tasks)${etaStr}`
    )

    // Execute batch in parallel - create promises at execution time, not before
    const batchPromises = batch.map((task) =>
      executeTask(task, config, client, scale, globalJudgePrompt)
    )

    const batchResults = await Promise.all(batchPromises)

    // Process results
    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j]
      const task = batch[j]
      if (!result || !task) continue

      results.push(result)
      completedTasks.add(task.taskId)
      completedCount++

      // Collect conversation IDs
      if (result.agentConversationId) {
        conversationIds.push(result.agentConversationId)
      }
      for (const vote of result.judgeResult.votes) {
        if (vote.conversationId) {
          conversationIds.push(vote.conversationId)
        }
      }

      // Save checkpoint periodically
      checkpointCounter++
      if (checkpointCounter % CHECKPOINT_INTERVAL === 0) {
        await saveCheckpoint(config, results, completedTasks, startTimeStr)
        console.error(`  [Checkpoint saved: ${results.length} results]`)
      }
    }
  }

  // Calculate statistics
  const statistics = calculateStatistics(results, config.agents, scale)

  // Delete checkpoint on success
  await deleteCheckpoint(config)
  console.error("\n[Evaluation completed - checkpoint deleted]")

  return Ok({ results, statistics, conversationIds })
}

async function executeTask(
  task: EvalTask,
  config: EvalConfig,
  client: DustClient,
  scale: ScaleConfig,
  globalJudgePrompt: string | undefined
): Promise<EvalResult> {
  const { row, agentId, runNumber } = task

  console.error(
    `  [${agentId}] "${row.prompt.substring(0, PROMPT_DISPLAY_LENGTH)}..." (run ${runNumber})`
  )

  // Call agent
  const agentResult = await client.callAgent(
    agentId,
    row.prompt,
    config.timeout
  )

  if (!agentResult.isOk) {
    return createErrorResult(task, agentResult.error.message, scale)
  }

  const agentResponse = agentResult.value

  // Check for agent error
  if (agentResponse.error) {
    return {
      prompt: row.prompt,
      judgePrompt: row.judge_prompt,
      agentId,
      response: agentResponse.response,
      judgeResult: {
        finalScore: scale.min,
        votes: [],
        variance: 0,
        agreement: 0,
        majorityScore: scale.min,
      },
      timestamp: agentResponse.timestamp,
      runNumber,
      agentDurationMs: agentResponse.durationMs,
      agentConversationId: agentResponse.conversationId,
      agentMessageId: agentResponse.messageId,
      agentRetryCount: agentResponse.retryCount,
      error: agentResponse.error,
      wasTimeout: agentResponse.wasTimeout,
    }
  }

  // Run multiple judge evaluations in parallel for majority voting
  const judgePrompt = formatJudgePrompt(
    row.prompt,
    agentResponse.response,
    row.judge_prompt,
    scale,
    globalJudgePrompt
  )

  // Execute all judge calls concurrently
  const judgePromises = Array.from({ length: config.judgeRuns }, (_, i) =>
    client
      .callJudge(config.judgeAgent, judgePrompt, config.timeout)
      .then((result) => ({ index: i, result }))
  )

  const judgeResults = await Promise.all(judgePromises)

  // Process results and collect votes
  const judgeVotes: JudgeVote[] = []
  let judgeFailures = 0

  for (const { index, result: judgeResultItem } of judgeResults) {
    if (!judgeResultItem.isOk) {
      judgeFailures++
      console.error(
        `    [Judge ${index + 1}/${config.judgeRuns}] Error: ${judgeResultItem.error.message}`
      )
      continue
    }

    const scoreResult = extractScore(judgeResultItem.value.response, scale)

    if (!scoreResult.isOk) {
      judgeFailures++
      console.error(
        `    [Judge ${index + 1}/${config.judgeRuns}] Score extraction failed: ${scoreResult.error.message}`
      )
      continue
    }

    judgeVotes.push({
      score: scoreResult.value,
      reasoning: judgeResultItem.value.response,
      conversationId: judgeResultItem.value.conversationId,
      durationMs: judgeResultItem.value.durationMs,
    })
  }

  // Calculate majority vote
  const judgeResult = calculateMajorityVote(judgeVotes, scale)

  // Check if majority of judge runs failed - mark result as unreliable
  const judgeFailureRate = judgeFailures / config.judgeRuns
  if (judgeFailureRate > 0.5) {
    return {
      prompt: row.prompt,
      judgePrompt: row.judge_prompt,
      agentId,
      response: agentResponse.response,
      judgeResult,
      timestamp: agentResponse.timestamp,
      runNumber,
      agentDurationMs: agentResponse.durationMs,
      agentConversationId: agentResponse.conversationId,
      agentMessageId: agentResponse.messageId,
      agentRetryCount: agentResponse.retryCount,
      error: `Unreliable: ${judgeFailures}/${config.judgeRuns} judge evaluations failed`,
      wasTimeout: undefined,
    }
  }

  // Check if all judge votes failed
  if (judgeVotes.length === 0) {
    return {
      prompt: row.prompt,
      judgePrompt: row.judge_prompt,
      agentId,
      response: agentResponse.response,
      judgeResult,
      timestamp: agentResponse.timestamp,
      runNumber,
      agentDurationMs: agentResponse.durationMs,
      agentConversationId: agentResponse.conversationId,
      agentMessageId: agentResponse.messageId,
      agentRetryCount: agentResponse.retryCount,
      error: "All judge evaluations failed",
      wasTimeout: undefined,
    }
  }

  const scores = judgeVotes.map((v) => v.score)
  console.error(
    `    Score: ${judgeResult.finalScore} (votes: [${scores.join(", ")}], agreement: ${(judgeResult.agreement * 100).toFixed(0)}%)`
  )

  return {
    prompt: row.prompt,
    judgePrompt: row.judge_prompt,
    agentId,
    response: agentResponse.response,
    judgeResult,
    timestamp: agentResponse.timestamp,
    runNumber,
    agentDurationMs: agentResponse.durationMs,
    agentConversationId: agentResponse.conversationId,
    agentMessageId: agentResponse.messageId,
    agentRetryCount: agentResponse.retryCount,
    error: undefined,
    wasTimeout: undefined,
  }
}

function createErrorResult(
  task: EvalTask,
  errorMessage: string,
  scale: ScaleConfig
): EvalResult {
  return {
    prompt: task.row.prompt,
    judgePrompt: task.row.judge_prompt,
    agentId: task.agentId,
    response: "",
    judgeResult: {
      finalScore: scale.min,
      votes: [],
      variance: 0,
      agreement: 0,
      majorityScore: scale.min,
    },
    timestamp: Date.now(),
    runNumber: task.runNumber,
    agentDurationMs: 0,
    agentConversationId: "",
    agentMessageId: "",
    agentRetryCount: 0,
    error: errorMessage,
    wasTimeout: undefined,
  }
}

function calculateStatistics(
  results: EvalResult[],
  agents: string[],
  scale: ScaleConfig
): EvalStatistics[] {
  const stats: EvalStatistics[] = []

  for (const agent of agents) {
    const agentResults = results.filter((r) => r.agentId === agent)
    const successfulResults = agentResults.filter((r) => !r.error)
    const timeoutResults = agentResults.filter((r) => r.wasTimeout)
    const scores = successfulResults.map((r) => r.judgeResult.finalScore)

    if (scores.length === 0) {
      stats.push({
        agentId: agent,
        totalRuns: agentResults.length,
        averageScore: 0,
        normalizedScore: 0,
        minScore: 0,
        maxScore: 0,
        stdDev: 0,
        scores: [],
        errorRate: agentResults.length > 0 ? 1 : 0,
        timeoutRate:
          agentResults.length > 0
            ? timeoutResults.length / agentResults.length
            : 0,
        averageDurationMs: 0,
        averageRetryCount: 0,
        averageJudgeAgreement: 0,
      })
      continue
    }

    const avg = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance =
      scores.reduce((sum, score) => sum + Math.pow(score - avg, 2), 0) /
      scores.length
    const stdDev = Math.sqrt(variance)

    const normalizedScores = scores.map((s) => normalizeScore(s, scale))
    const normalizedAvg =
      normalizedScores.reduce((a, b) => a + b, 0) / normalizedScores.length

    const agreements = successfulResults.map((r) => r.judgeResult.agreement)
    const avgAgreement =
      agreements.reduce((a, b) => a + b, 0) / agreements.length

    const durations = successfulResults.map((r) => r.agentDurationMs)
    const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length

    const retryCounts = agentResults.map((r) => r.agentRetryCount)
    const avgRetries =
      retryCounts.reduce((a, b) => a + b, 0) / retryCounts.length

    stats.push({
      agentId: agent,
      totalRuns: agentResults.length,
      averageScore: avg,
      normalizedScore: normalizedAvg,
      minScore: Math.min(...scores),
      maxScore: Math.max(...scores),
      stdDev,
      scores,
      errorRate:
        (agentResults.length - successfulResults.length) / agentResults.length,
      timeoutRate: timeoutResults.length / agentResults.length,
      averageDurationMs: avgDuration,
      averageRetryCount: avgRetries,
      averageJudgeAgreement: avgAgreement,
    })
  }

  return stats
}
