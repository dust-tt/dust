import type { EvalConfig, EvalRow, Result, VersusEvalResult } from "./types"
import { Ok, Err } from "./types"
import { DustClient } from "./dust-client"
import { formatVersusJudgePrompt, extractVersusWinner } from "./grading"
import { parse } from "csv-parse/sync"
import { readFile as fsReadFile } from "fs/promises"
import { existsSync } from "fs"
import { readFile, writeFile } from "fs/promises"

interface VersusCheckpoint {
  config: EvalConfig
  startTime: string
  results: VersusEvalResult[]
  completedTasks: Set<string> // Set of "run-promptIndex" strings
}

export class VersusEvaluator {
  private client: DustClient
  private checkpointPath = ".eval-versus-checkpoint.json"

  constructor(apiKey: string, workspaceId: string) {
    this.client = new DustClient(apiKey, workspaceId)
  }

  async runEvaluation(config: EvalConfig): Promise<Result<VersusEvalResult[]>> {
    const startTime = new Date()

    // Parse CSV file
    let rows: EvalRow[]
    try {
      const csvContent = await fsReadFile(config.csvPath, "utf-8")
      const parsedRows = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Array<Record<string, string>>

      // Validate CSV structure
      rows = parsedRows.map((row, index) => {
        if (!row["prompt"] || !row["judge_prompt"]) {
          throw new Error(
            `Row ${index + 1}: Missing required columns (prompt, judge_prompt)`
          )
        }
        if (!row["prompt"].trim() || !row["judge_prompt"].trim()) {
          throw new Error(
            `Row ${index + 1}: Empty values not allowed in prompt or judge_prompt`
          )
        }
        return {
          prompt: row["prompt"],
          judge_prompt: row["judge_prompt"],
        }
      })
    } catch (error) {
      return Err(
        error instanceof Error
          ? error
          : new Error(`Failed to parse CSV: ${String(error)}`)
      )
    }

    // Check for existing checkpoint
    let checkpoint: VersusCheckpoint | null = null
    if (existsSync(this.checkpointPath)) {
      try {
        const checkpointData = await readFile(this.checkpointPath, "utf-8")
        checkpoint = JSON.parse(checkpointData)

        // Verify checkpoint matches current config
        if (JSON.stringify(checkpoint!.config) === JSON.stringify(config)) {
          console.error(
            `\nResuming from checkpoint: ${checkpoint!.results.length} results already completed`
          )
          checkpoint!.completedTasks = new Set(checkpoint!.completedTasks)
        } else {
          console.error("\nCheckpoint config mismatch, starting fresh")
          checkpoint = null
        }
      } catch (error) {
        console.error("Failed to load checkpoint, starting fresh")
        checkpoint = null
      }
    }

    const results: VersusEvalResult[] = checkpoint?.results || []
    const completedTasks = checkpoint?.completedTasks || new Set<string>()

    console.error(`\n📊 Running versus evaluation`)
    console.error(`   Agents: ${config.agents.join(", ")}`)
    console.error(`   Judge: ${config.judgeAgent}`)
    console.error(`   Prompts: ${rows.length}`)
    console.error(`   Runs: ${config.runs}`)
    console.error(`   Mode: versus\n`)

    // Process each run
    for (let run = 1; run <= config.runs; run++) {
      console.error(`\n=== Run ${run}/${config.runs} ===`)

      // Process prompts with parallelization
      const promptTasks: Array<{
        taskId: string
        promptIndex: number
        row: EvalRow
        promise: Promise<void>
      }> = []

      for (let promptIndex = 0; promptIndex < rows.length; promptIndex++) {
        const row = rows[promptIndex]
        if (!row) continue

        const taskId = `${run}-${promptIndex}`

        // Skip if already completed
        if (completedTasks.has(taskId)) {
          console.error(
            `  Prompt ${promptIndex + 1}/${rows.length}: ✅ Already completed`
          )
          continue
        }

        const promise = this.evaluatePromptVersus(
          row,
          config,
          run,
          promptIndex,
          rows.length
        ).then((result) => {
          if (result.isOk) {
            results.push(result.value)
            completedTasks.add(taskId)

            // Save checkpoint after each completion
            this.saveCheckpoint({
              config,
              startTime: startTime.toISOString(),
              results,
              completedTasks,
            }).catch((err) => {
              console.error("Failed to save checkpoint:", err)
            })
          } else {
            console.error(`  ❌ Error: ${result.error.message}`)
          }
        })

        promptTasks.push({
          taskId,
          promptIndex,
          row,
          promise,
        })
      }

      // Execute tasks in parallel batches
      for (let i = 0; i < promptTasks.length; i += config.parallel) {
        const batch = promptTasks.slice(i, i + config.parallel)
        await Promise.all(batch.map((t) => t.promise))
      }
    }

    // Clean up checkpoint on successful completion
    try {
      if (existsSync(this.checkpointPath)) {
        const { unlink } = await import("fs/promises")
        await unlink(this.checkpointPath)
        console.error("\n✅ Evaluation completed, checkpoint removed")
      }
    } catch (error) {
      console.error("Failed to remove checkpoint file:", error)
    }

    return Ok(results)
  }

  private async evaluatePromptVersus(
    row: EvalRow,
    config: EvalConfig,
    run: number,
    promptIndex: number,
    totalPrompts: number
  ): Promise<Result<VersusEvalResult>> {
    const promptNum = promptIndex + 1
    console.error(
      `  Prompt ${promptNum}/${totalPrompts}: "${row.prompt.substring(0, 50)}..."`
    )

    // Get responses from all agents in parallel
    const agentPromises = config.agents.map((agentId) =>
      this.client.callAgent(agentId, row.prompt, config.timeout)
    )

    const agentResults = await Promise.all(agentPromises)

    // Collect successful responses
    const responses: Array<{
      agentId: string
      response: string
      durationMs: number
    }> = []

    for (let i = 0; i < agentResults.length; i++) {
      const result = agentResults[i]
      const agentId = config.agents[i]

      if (!result || !agentId) continue

      if (result.isOk) {
        responses.push({
          agentId: agentId,
          response: result.value.response,
          durationMs: result.value.durationMs,
        })
      } else {
        console.error(
          `    ⚠️  Agent ${agentId} failed: ${result.error.message}`
        )
      }
    }

    if (responses.length < 2) {
      return Err(
        new Error(
          `Need at least 2 successful responses for versus mode, got ${responses.length}`
        )
      )
    }

    // Format judge prompt with anonymous agent IDs
    const { prompt: judgePrompt, agentMapping } = formatVersusJudgePrompt(
      row.prompt,
      responses,
      row.judge_prompt
    )

    // Get judge evaluation
    console.error(`    Calling judge: ${config.judgeAgent}`)
    const judgeResult = await this.client.callJudge(
      config.judgeAgent,
      judgePrompt,
      config.timeout
    )

    if (!judgeResult.isOk) {
      return Err(new Error(`Judge failed: ${judgeResult.error.message}`))
    }

    // Extract winner from judge response
    const winnerResult = extractVersusWinner(judgeResult.value, agentMapping)

    if (!winnerResult.isOk) {
      return Err(
        new Error(`Failed to extract winner: ${winnerResult.error.message}`)
      )
    }

    const result: VersusEvalResult = {
      prompt: row.prompt,
      judgePrompt: row.judge_prompt,
      responses,
      winner: winnerResult.value.winner,
      judgeReasoning: winnerResult.value.reasoning,
      timestamp: Date.now(),
      runNumber: run,
    }

    console.error(
      `    ✓ Winner: ${result.winner === "DRAW" ? "DRAW" : result.winner}`
    )

    return Ok(result)
  }

  private async saveCheckpoint(checkpoint: VersusCheckpoint): Promise<void> {
    // Convert Set to Array for JSON serialization
    const serializable = {
      ...checkpoint,
      completedTasks: Array.from(checkpoint.completedTasks),
    }
    await writeFile(this.checkpointPath, JSON.stringify(serializable, null, 2))
  }
}
