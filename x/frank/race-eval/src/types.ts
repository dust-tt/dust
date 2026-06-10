export type ToolType = "parallel" | "parallel_task" | "firecrawl";

export interface EvalRow {
  id: string;
  category: string;
  task: string;
  reference_report: string;
}

export interface CostBreakdown {
  tool: ToolType;
  llm_input_tokens: number;
  llm_output_tokens: number;
  search_calls: number;
  fetch_calls: number;
  summary_calls: number;
  llm_cost_usd: number;
  search_cost_usd: number;
  fetch_cost_usd: number;
  tool_cost_usd: number;
  total_usd: number;
  llm_pct: number;
  tool_pct: number;
}

export interface ActionSummary {
  total: number;
  success: number;
  error: number;
  blocked: number;
  topTools: string;
}

export interface RunResultEntry {
  report: string;
  cost: CostBreakdown;
  conversation_id: string;
  latency_ms: number;
  // Optional: absent in run-result files written before action tracking.
  action_summary?: ActionSummary;
  usage_source: "dust_usage" | "estimated";
}

export type RunResults = Record<string, RunResultEntry>;

export interface Criterion {
  name: string;
  description: string;
  weight: number;
}

export type DimensionName =
  | "comprehensiveness"
  | "insight"
  | "instruction_following"
  | "readability"
  | "source_quality";

export interface TaskCriteria {
  dimension_weights: Record<DimensionName, number>;
  criteria: Record<DimensionName, Criterion[]>;
}

export type CriteriaByTask = Record<string, TaskCriteria>;

export type RawJudgeScores = Record<
  string,
  Record<string, { article_1: number; article_2: number }>
>;

export interface RawScoreByTask {
  scores: RawJudgeScores;
  target_total: number;
  reference_total: number;
  race_score: number;
}

export type RawScoresFile = Record<string, RawScoreByTask>;

export interface TaskScoreEntry {
  task_id: string;
  category: string;
  race_score: number;
  target_total: number;
  reference_total: number;
  latency_ms: number;
  cost: CostBreakdown;
  cost_efficiency: number;
  quality_above_reference_per_usd: number;
}

export interface AggregateSummary {
  avg_race_score: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  total_spend_usd: number;
  avg_cost_per_task: number;
  avg_cost_efficiency: number;
  avg_quality_above_ref_per_usd: number;
}
