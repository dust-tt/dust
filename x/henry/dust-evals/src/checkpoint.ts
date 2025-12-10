import { writeFile, readFile, unlink } from "fs/promises"
import { existsSync } from "fs"
import type { EvalConfig, EvalResult } from "./types"

export interface Checkpoint {
  config: EvalConfig
  startTime: string
  results: EvalResult[]
  completedTasks: Set<string>
}

export function getCheckpointPath(config: EvalConfig): string {
  // Create a unique checkpoint filename based on config
  const configHash = Buffer.from(
    JSON.stringify({
      agents: config.agents.sort(),
      csvPath: config.csvPath,
      judgeAgent: config.judgeAgent,
      runs: config.runs,
      judgeRuns: config.judgeRuns,
      scale: config.scale,
    })
  )
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 16)

  return `.checkpoint_${configHash}.json`
}

export async function saveCheckpoint(
  config: EvalConfig,
  results: EvalResult[],
  completedTasks: Set<string>,
  startTime: string
): Promise<void> {
  const checkpoint = {
    config,
    startTime,
    results,
    completedTasks: Array.from(completedTasks),
  }

  const path = getCheckpointPath(config)
  await writeFile(path, JSON.stringify(checkpoint, null, 2), "utf-8")
}

export async function loadCheckpoint(
  config: EvalConfig
): Promise<Checkpoint | null> {
  const path = getCheckpointPath(config)

  if (!existsSync(path)) {
    return null
  }

  try {
    const content = await readFile(path, "utf-8")
    const data = JSON.parse(content)

    // Verify the checkpoint matches current config
    if (
      JSON.stringify(data.config.agents.sort()) !==
        JSON.stringify(config.agents.sort()) ||
      data.config.csvPath !== config.csvPath ||
      data.config.judgeAgent !== config.judgeAgent ||
      data.config.runs !== config.runs ||
      data.config.judgeRuns !== config.judgeRuns ||
      data.config.scale !== config.scale
    ) {
      console.error(
        "Warning: Checkpoint config doesn't match current config. Starting fresh."
      )
      return null
    }

    return {
      config: data.config,
      startTime: data.startTime,
      results: data.results,
      completedTasks: new Set(data.completedTasks || []),
    }
  } catch (error) {
    console.error("Error loading checkpoint:", error)
    return null
  }
}

export async function deleteCheckpoint(config: EvalConfig): Promise<void> {
  const path = getCheckpointPath(config)

  if (existsSync(path)) {
    await unlink(path)
  }
}
