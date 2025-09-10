#!/usr/bin/env bun

import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join } from "path"
import { stringify } from "csv-stringify/sync"

interface EvalResult {
  prompt: string
  judgePrompt: string
  agentId: string
  response: string
  score: number
  judgeReasoning: string
  timestamp: number
  runNumber: number
  durationMs: number
}

interface EvalData {
  config: {
    agents: string[]
    csvPath: string
    judgeAgent: string
    runs: number
    parallel: number
    timeout: number
    outputFormat: string
    outputFile: string
  }
  startTime: string
  endTime: string
  totalDuration: number
  results: EvalResult[]
}

async function generateCSVReports(jsonPath: string): Promise<void> {
  // Read and parse JSON data
  const jsonContent = await readFile(jsonPath, "utf-8")
  const data: EvalData = JSON.parse(jsonContent)

  const outputDir = join(dirname(jsonPath), "csv_reports")
  await mkdir(outputDir, { recursive: true })

  console.log(`Processing ${data.results.length} results...`)
  console.log(`Output directory: ${outputDir}`)

  // 1. Full Results CSV - All individual evaluations
  const fullResults = data.results.map((r) => ({
    prompt: r.prompt,
    agent_id: r.agentId,
    run_number: r.runNumber,
    score: r.score,
    duration_ms: r.durationMs,
    timestamp: new Date(r.timestamp).toISOString(),
    judge_prompt: r.judgePrompt,
    response_length: r.response.length,
    judge_reasoning_length: r.judgeReasoning.length,
  }))

  await writeFile(
    join(outputDir, "full_results.csv"),
    stringify(fullResults, { header: true })
  )

  // 2. Aggregated by Agent and Prompt - Average scores per agent per prompt
  const aggregatedByAgentPrompt = new Map<
    string,
    { scores: number[]; durations: number[] }
  >()

  for (const result of data.results) {
    const key = `${result.agentId}|${result.prompt}`
    if (!aggregatedByAgentPrompt.has(key)) {
      aggregatedByAgentPrompt.set(key, { scores: [], durations: [] })
    }
    const entry = aggregatedByAgentPrompt.get(key)!
    entry.scores.push(result.score)
    entry.durations.push(result.durationMs)
  }

  const agentPromptRows = Array.from(aggregatedByAgentPrompt.entries()).map(
    ([key, value]) => {
      const parts = key.split("|")
      const agentId = parts[0] || ""
      const prompt = parts.slice(1).join("|") // Handle prompts with | in them
      const avgScore =
        value.scores.reduce((a, b) => a + b, 0) / value.scores.length
      const avgDuration =
        value.durations.reduce((a, b) => a + b, 0) / value.durations.length
      const minScore = Math.min(...value.scores)
      const maxScore = Math.max(...value.scores)
      const stdDev = Math.sqrt(
        value.scores
          .map((s) => Math.pow(s - avgScore, 2))
          .reduce((a, b) => a + b, 0) / value.scores.length
      )

      return {
        agent_id: agentId,
        prompt: prompt.substring(0, 100), // Truncate long prompts
        avg_score: avgScore.toFixed(2),
        min_score: minScore,
        max_score: maxScore,
        std_dev: stdDev.toFixed(3),
        num_runs: value.scores.length,
        avg_duration_ms: Math.round(avgDuration),
      }
    }
  )

  await writeFile(
    join(outputDir, "agent_prompt_aggregated.csv"),
    stringify(agentPromptRows, { header: true })
  )

  // 3. Agent Summary - Overall performance per agent
  const agentSummary = new Map<
    string,
    { scores: number[]; durations: number[] }
  >()

  for (const result of data.results) {
    if (!agentSummary.has(result.agentId)) {
      agentSummary.set(result.agentId, { scores: [], durations: [] })
    }
    const entry = agentSummary.get(result.agentId)!
    entry.scores.push(result.score)
    entry.durations.push(result.durationMs)
  }

  const agentSummaryRows = Array.from(agentSummary.entries()).map(
    ([agentId, value]) => {
      const avgScore =
        value.scores.reduce((a, b) => a + b, 0) / value.scores.length
      const avgDuration =
        value.durations.reduce((a, b) => a + b, 0) / value.durations.length
      const scoreDistribution = [0, 1, 2, 3].map(
        (s) => value.scores.filter((score) => score === s).length
      )

      return {
        agent_id: agentId,
        avg_score: avgScore.toFixed(3),
        total_evaluations: value.scores.length,
        score_0_count: scoreDistribution[0],
        score_1_count: scoreDistribution[1],
        score_2_count: scoreDistribution[2],
        score_3_count: scoreDistribution[3],
        min_score: Math.min(...value.scores),
        max_score: Math.max(...value.scores),
        std_dev: Math.sqrt(
          value.scores
            .map((s) => Math.pow(s - avgScore, 2))
            .reduce((a, b) => a + b, 0) / value.scores.length
        ).toFixed(3),
        avg_duration_ms: Math.round(avgDuration),
        total_duration_ms: value.durations.reduce((a, b) => a + b, 0),
      }
    }
  )

  await writeFile(
    join(outputDir, "agent_summary.csv"),
    stringify(agentSummaryRows, { header: true })
  )

  // 4. Prompt Performance - How difficult each prompt is across all agents
  const promptPerformance = new Map<
    string,
    { scores: number[]; agents: Set<string> }
  >()

  for (const result of data.results) {
    if (!promptPerformance.has(result.prompt)) {
      promptPerformance.set(result.prompt, {
        scores: [],
        agents: new Set(),
      })
    }
    const entry = promptPerformance.get(result.prompt)!
    entry.scores.push(result.score)
    entry.agents.add(result.agentId)
  }

  const promptRows = Array.from(promptPerformance.entries()).map(
    ([prompt, value]) => {
      const avgScore =
        value.scores.reduce((a, b) => a + b, 0) / value.scores.length
      const variance =
        value.scores
          .map((s) => Math.pow(s - avgScore, 2))
          .reduce((a, b) => a + b, 0) / value.scores.length

      return {
        prompt: prompt.substring(0, 100), // Truncate long prompts
        avg_score: avgScore.toFixed(3),
        min_score: Math.min(...value.scores),
        max_score: Math.max(...value.scores),
        variance: variance.toFixed(3),
        num_agents: value.agents.size,
        total_evaluations: value.scores.length,
        difficulty_indicator: (3 - avgScore).toFixed(3), // Higher = more difficult
      }
    }
  )

  await writeFile(
    join(outputDir, "prompt_performance.csv"),
    stringify(promptRows, { header: true })
  )

  // 5. Run-by-Run Comparison - Track performance across runs
  const runComparison: any[] = []

  for (let run = 1; run <= data.config.runs; run++) {
    const runResults = data.results.filter((r) => r.runNumber === run)

    for (const agentId of data.config.agents) {
      const agentRunResults = runResults.filter((r) => r.agentId === agentId)
      const scores = agentRunResults.map((r) => r.score)

      if (scores.length > 0) {
        runComparison.push({
          run_number: run,
          agent_id: agentId,
          avg_score: (
            scores.reduce((a, b) => a + b, 0) / scores.length
          ).toFixed(3),
          num_evaluations: scores.length,
          score_0_count: scores.filter((s) => s === 0).length,
          score_1_count: scores.filter((s) => s === 1).length,
          score_2_count: scores.filter((s) => s === 2).length,
          score_3_count: scores.filter((s) => s === 3).length,
        })
      }
    }
  }

  await writeFile(
    join(outputDir, "run_comparison.csv"),
    stringify(runComparison, { header: true })
  )

  // 6. Time Series - Results over time
  const timeSeries = data.results
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((r, index) => ({
      index: index + 1,
      timestamp: new Date(r.timestamp).toISOString(),
      agent_id: r.agentId,
      score: r.score,
      duration_ms: r.durationMs,
      run_number: r.runNumber,
      prompt_snippet: r.prompt.substring(0, 50),
    }))

  await writeFile(
    join(outputDir, "time_series.csv"),
    stringify(timeSeries, { header: true })
  )

  // 7. Metadata CSV - Configuration and summary
  const metadata = [
    {
      property: "start_time",
      value: data.startTime,
    },
    {
      property: "end_time",
      value: data.endTime,
    },
    {
      property: "total_duration_ms",
      value: data.totalDuration.toString(),
    },
    {
      property: "num_agents",
      value: data.config.agents.length.toString(),
    },
    {
      property: "agents",
      value: data.config.agents.join(", "),
    },
    {
      property: "judge_agent",
      value: data.config.judgeAgent,
    },
    {
      property: "num_runs",
      value: data.config.runs.toString(),
    },
    {
      property: "parallel_executions",
      value: data.config.parallel.toString(),
    },
    {
      property: "timeout_ms",
      value: data.config.timeout.toString(),
    },
    {
      property: "total_evaluations",
      value: data.results.length.toString(),
    },
    {
      property: "csv_source",
      value: data.config.csvPath,
    },
  ]

  await writeFile(
    join(outputDir, "metadata.csv"),
    stringify(metadata, { header: true })
  )

  console.log("\n✅ Generated CSV reports:")
  console.log("  1. full_results.csv - All individual evaluation results")
  console.log(
    "  2. agent_prompt_aggregated.csv - Scores aggregated by agent and prompt"
  )
  console.log("  3. agent_summary.csv - Overall performance summary per agent")
  console.log("  4. prompt_performance.csv - Difficulty analysis per prompt")
  console.log("  5. run_comparison.csv - Performance comparison across runs")
  console.log("  6. time_series.csv - Results ordered by execution time")
  console.log("  7. metadata.csv - Evaluation configuration and metadata")
  console.log(`\nAll files saved to: ${outputDir}`)
}

// Main execution
const args = process.argv.slice(2)
if (args.length === 0) {
  console.error("Usage: bun run generate-csv-reports.ts <path-to-json-results>")
  process.exit(1)
}

const inputPath = args[0]
if (!inputPath) {
  console.error("Error: No input path provided")
  process.exit(1)
}

generateCSVReports(inputPath).catch((error) => {
  console.error("Error generating CSV reports:", error)
  process.exit(1)
})
