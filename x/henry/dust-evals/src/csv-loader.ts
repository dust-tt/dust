import { parse } from "csv-parse/sync"
import { readFile } from "fs/promises"
import type { EvalRow, Result } from "./types"
import { Ok, Err } from "./types"

export interface LoadCSVOptions {
  sample: number | undefined
  seed: number | undefined
  promptFilter: string | undefined
}

/**
 * Seeded random number generator for reproducible sampling.
 * Uses a simple linear congruential generator.
 */
function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32
    return state / 2 ** 32
  }
}

/**
 * Fisher-Yates shuffle with optional seed for reproducibility.
 */
function shuffle<T>(array: T[], seed?: number): T[] {
  const result = [...array]
  const random = seed !== undefined ? seededRandom(seed) : Math.random
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const temp = result[i]
    result[i] = result[j]!
    result[j] = temp!
  }
  return result
}

/**
 * Parse prompt filter string into indices or pattern.
 * Supports: "1,3,5" (indices), "1-5" (range), or "pattern*" (glob pattern)
 */
function parsePromptFilter(
  filter: string,
  totalRows: number
): Set<number> | RegExp {
  // Check for range pattern (e.g., "1-5")
  const rangeMatch = filter.match(/^(\d+)-(\d+)$/)
  if (rangeMatch && rangeMatch[1] && rangeMatch[2]) {
    const start = parseInt(rangeMatch[1], 10) - 1 // Convert to 0-indexed
    const end = parseInt(rangeMatch[2], 10) - 1
    const indices = new Set<number>()
    for (let i = Math.max(0, start); i <= Math.min(end, totalRows - 1); i++) {
      indices.add(i)
    }
    return indices
  }

  // Check for comma-separated indices (e.g., "1,3,5")
  if (/^[\d,]+$/.test(filter)) {
    const indices = new Set<number>()
    for (const part of filter.split(",")) {
      const index = parseInt(part.trim(), 10) - 1 // Convert to 0-indexed
      if (index >= 0 && index < totalRows) {
        indices.add(index)
      }
    }
    return indices
  }

  // Treat as glob pattern - convert to regex
  const regexPattern = filter
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape regex special chars
    .replace(/\*/g, ".*") // Convert * to .*
    .replace(/\?/g, ".") // Convert ? to .
  return new RegExp(regexPattern, "i")
}

const DEFAULT_OPTIONS: LoadCSVOptions = {
  sample: undefined,
  seed: undefined,
  promptFilter: undefined,
}

/**
 * Load and parse CSV file with prompts.
 */
export async function loadCSV(
  path: string,
  options: LoadCSVOptions = DEFAULT_OPTIONS
): Promise<Result<EvalRow[]>> {
  try {
    const content = await readFile(path, "utf-8")
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_quotes: true,
    }) as Record<string, string>[]

    if (records.length === 0) {
      return Err(new Error("CSV file is empty"))
    }

    // Validate columns exist
    const firstRecord = records[0]
    if (!firstRecord) {
      return Err(new Error("CSV file is empty"))
    }

    const columns = Object.keys(firstRecord)
    if (!columns.includes("prompt")) {
      return Err(
        new Error(
          `CSV missing required column 'prompt'. Found columns: ${columns.join(", ")}`
        )
      )
    }
    if (!columns.includes("judge_prompt")) {
      return Err(
        new Error(
          `CSV missing required column 'judge_prompt'. Found columns: ${columns.join(", ")}`
        )
      )
    }

    // Parse rows with validation
    const rows: EvalRow[] = []
    const errors: string[] = []

    for (let i = 0; i < records.length; i++) {
      const record = records[i]
      if (!record) continue

      const prompt = record["prompt"]?.trim()
      const judgePrompt = record["judge_prompt"]?.trim()

      if (!prompt) {
        errors.push(`Row ${i + 1}: 'prompt' column is empty`)
        continue
      }
      if (!judgePrompt) {
        errors.push(`Row ${i + 1}: 'judge_prompt' column is empty`)
        continue
      }

      rows.push({ prompt, judge_prompt: judgePrompt })
    }

    if (errors.length > 0 && rows.length === 0) {
      return Err(new Error(`CSV validation failed:\n${errors.join("\n")}`))
    }

    if (errors.length > 0) {
      console.error(`Warning: ${errors.length} rows skipped due to errors`)
      for (const error of errors.slice(0, 5)) {
        console.error(`  ${error}`)
      }
      if (errors.length > 5) {
        console.error(`  ... and ${errors.length - 5} more`)
      }
    }

    // Apply prompt filter if specified
    let filteredRows = rows
    if (options.promptFilter) {
      const filter = parsePromptFilter(options.promptFilter, rows.length)
      if (filter instanceof Set) {
        filteredRows = rows.filter((_, index) => filter.has(index))
      } else {
        filteredRows = rows.filter((row) => filter.test(row.prompt))
      }

      if (filteredRows.length === 0) {
        return Err(
          new Error(
            `No rows match filter '${options.promptFilter}'. Total rows: ${rows.length}`
          )
        )
      }
    }

    // Apply sampling if specified
    if (options.sample !== undefined && options.sample < filteredRows.length) {
      const shuffled = shuffle(filteredRows, options.seed)
      filteredRows = shuffled.slice(0, options.sample)
    }

    return Ok(filteredRows)
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return Err(new Error(`CSV file not found: ${path}`))
    }
    return Err(
      error instanceof Error
        ? error
        : new Error(`Failed to load CSV: ${String(error)}`)
    )
  }
}

/**
 * Validate CSV file without loading all data (for dry-run).
 */
export async function validateCSV(
  path: string
): Promise<Result<{ rowCount: number; columns: string[] }>> {
  try {
    const content = await readFile(path, "utf-8")
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[]

    if (records.length === 0) {
      return Err(new Error("CSV file is empty"))
    }

    const firstRecord = records[0]
    if (!firstRecord) {
      return Err(new Error("CSV file is empty"))
    }

    const columns = Object.keys(firstRecord)

    if (!columns.includes("prompt")) {
      return Err(
        new Error(
          `CSV missing required column 'prompt'. Found: ${columns.join(", ")}`
        )
      )
    }
    if (!columns.includes("judge_prompt")) {
      return Err(
        new Error(
          `CSV missing required column 'judge_prompt'. Found: ${columns.join(", ")}`
        )
      )
    }

    return Ok({ rowCount: records.length, columns })
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return Err(new Error(`CSV file not found: ${path}`))
    }
    return Err(
      error instanceof Error
        ? error
        : new Error(`Failed to validate CSV: ${String(error)}`)
    )
  }
}
