export type Score = 0 | 1 | 2 | 3

export interface EvalRow {
  prompt: string
  judge_prompt: string
}

export interface AgentResponse {
  agentId: string
  prompt: string
  response: string
  timestamp: number
  durationMs: number
  error?: string
}

export interface JudgeResult {
  score: Score
  reasoning: string
}

export interface EvalResult {
  prompt: string
  judgePrompt: string
  agentId: string
  response: string
  score: Score
  judgeReasoning: string
  timestamp: number
  runNumber: number
  durationMs: number
  error?: string
}

export interface EvalStatistics {
  agentId: string
  totalRuns: number
  averageScore: number
  minScore: number
  maxScore: number
  stdDev: number
  scores: Score[]
  errorRate: number
  averageDurationMs: number
}

export interface EvalConfig {
  agents: string[]
  csvPath: string
  judgeAgent: string
  runs: number
  parallel: number
  timeout: number
  outputFormat: "json" | "csv" | "console"
  outputFile?: string
}

export interface EvalReport {
  config: EvalConfig
  startTime: string
  endTime: string
  totalDuration: number
  results: EvalResult[]
  statistics: EvalStatistics[]
  summary: {
    totalPrompts: number
    totalRuns: number
    successRate: number
    averageScore: number
  }
}

export type Result<T, E = Error> =
  | { isOk: true; value: T }
  | { isOk: false; error: E }

export function Ok<T>(value: T): Result<T, never> {
  return { isOk: true, value }
}

export function Err<E>(error: E): Result<never, E> {
  return { isOk: false, error }
}
