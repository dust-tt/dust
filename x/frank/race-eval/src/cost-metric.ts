import type { AggregateSummary, CostBreakdown, TaskScoreEntry, ToolType } from "./types";

const INPUT_COST_PER_TOKEN_USD = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN_USD = 15 / 1_000_000;

const SEARCH_PRICE_USD: Record<ToolType, number> = {
  parallel: 0.005,
  parallel_task: 0.005,
  firecrawl: 0.001,
};

const FETCH_PRICE_USD: Record<ToolType, number> = {
  parallel: 0.001,
  parallel_task: 0.001,
  firecrawl: 0,
};

export class CostTracker {
  private readonly tool: ToolType;
  private llmInputTokens = 0;
  private llmOutputTokens = 0;
  private searchCalls = 0;
  private fetchCalls = 0;
  private summaryCalls = 0;

  constructor(tool: ToolType) {
    this.tool = tool;
  }

  recordLLM(inputTokens: number, outputTokens: number) {
    this.llmInputTokens += Math.max(0, inputTokens);
    this.llmOutputTokens += Math.max(0, outputTokens);
  }

  recordSearch(n = 1) {
    this.searchCalls += Math.max(0, n);
  }

  recordFetch(n = 1) {
    this.fetchCalls += Math.max(0, n);
  }

  recordSummary(n = 1) {
    this.summaryCalls += Math.max(0, n);
  }

  compute(): CostBreakdown {
    const llmCostUsd =
      this.llmInputTokens * INPUT_COST_PER_TOKEN_USD +
      this.llmOutputTokens * OUTPUT_COST_PER_TOKEN_USD;
    const searchCostUsd = this.searchCalls * SEARCH_PRICE_USD[this.tool];
    const fetchCostUsd = this.fetchCalls * FETCH_PRICE_USD[this.tool];
    const toolCostUsd = searchCostUsd + fetchCostUsd;
    const totalUsd = llmCostUsd + toolCostUsd;
    const llmPct = totalUsd > 0 ? (llmCostUsd / totalUsd) * 100 : 0;
    const toolPct = totalUsd > 0 ? (toolCostUsd / totalUsd) * 100 : 0;

    return {
      tool: this.tool,
      llm_input_tokens: this.llmInputTokens,
      llm_output_tokens: this.llmOutputTokens,
      search_calls: this.searchCalls,
      fetch_calls: this.fetchCalls,
      summary_calls: this.summaryCalls,
      llm_cost_usd: round4(llmCostUsd),
      search_cost_usd: round4(searchCostUsd),
      fetch_cost_usd: round4(fetchCostUsd),
      tool_cost_usd: round4(toolCostUsd),
      total_usd: round4(totalUsd),
      llm_pct: round1(llmPct),
      tool_pct: round1(toolPct),
    };
  }
}

export function costEfficiency(raceScore: number, totalUsd: number): number {
  if (totalUsd <= 0) {
    return 0;
  }
  return raceScore / totalUsd;
}

export function qualityAboveReference(raceScore: number, totalUsd: number): number {
  if (totalUsd <= 0) {
    return 0;
  }
  return (raceScore - 0.5) / totalUsd;
}

export function aggregateResults(taskResults: TaskScoreEntry[]): AggregateSummary {
  if (taskResults.length === 0) {
    return {
      avg_race_score: 0,
      avg_latency_ms: 0,
      p95_latency_ms: 0,
      total_spend_usd: 0,
      avg_cost_per_task: 0,
      avg_cost_efficiency: 0,
      avg_quality_above_ref_per_usd: 0,
    };
  }

  const totalSpendUsd = taskResults.reduce((sum, task) => sum + task.cost.total_usd, 0);
  const avgRaceScore = mean(taskResults.map((t) => t.race_score));
  const avgLatencyMs = mean(taskResults.map((t) => t.latency_ms));
  const p95LatencyMs = percentile(taskResults.map((t) => t.latency_ms), 0.95);
  const avgCostPerTask = totalSpendUsd / taskResults.length;
  const avgCostEfficiency = mean(taskResults.map((t) => t.cost_efficiency));
  const avgQualityAboveRefPerUsd = mean(
    taskResults.map((t) => t.quality_above_reference_per_usd)
  );

  return {
    avg_race_score: round4(avgRaceScore),
    avg_latency_ms: Math.round(avgLatencyMs),
    p95_latency_ms: Math.round(p95LatencyMs),
    total_spend_usd: round4(totalSpendUsd),
    avg_cost_per_task: round4(avgCostPerTask),
    avg_cost_efficiency: round4(avgCostEfficiency),
    avg_quality_above_ref_per_usd: round4(avgQualityAboveRefPerUsd),
  };
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * p) - 1)
  );
  return sorted[index];
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
