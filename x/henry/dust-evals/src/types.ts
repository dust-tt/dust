import type { JudgeResult, ScaleConfig, ScaleType } from "../../../../front/lib/evals/grading_types"
export { SCALES, Ok, Err } from "../../../../front/lib/evals/grading_types"
export type { ScaleType, ScaleConfig, JudgeVote, JudgeResult, Result } from "../../../../front/lib/evals/grading_types"

export interface EvalRow {
  prompt: string
  judge_prompt: string
  files: string[]
}

export interface AgentResponse {
  agentId: string
  prompt: string
  response: string
  timestamp: number
  durationMs: number
  conversationId: string
  messageId: string
  retryCount: number
  costCredits: number | null
  error?: string
  wasTimeout?: boolean
}

export interface EvalResult {
  prompt: string
  judgePrompt: string
  agentId: string
  response: string
  judgeResult: JudgeResult
  timestamp: number
  runNumber: number
  agentDurationMs: number
  agentConversationId: string
  agentMessageId: string
  agentRetryCount: number
  agentCostCredits: number | null
  error: string | undefined
  wasTimeout: boolean | undefined
}

export interface EvalStatistics {
  agentId: string
  totalRuns: number
  averageScore: number
  normalizedScore: number // Score normalized to 0-1 range
  minScore: number
  maxScore: number
  stdDev: number
  scores: number[]
  errorRate: number
  timeoutRate: number
  averageDurationMs: number
  averageRetryCount: number
  averageJudgeAgreement: number
  averageCostCredits: number | null 
  totalCostCredits: number
}

export interface EvalConfig {
  agents: string[]
  csvPath: string
  judgeAgent: string
  judgePromptFile: string | undefined // Path to markdown file with global judge instructions
  runs: number
  judgeRuns: number // Number of judge votes per evaluation (majority voting)
  parallel: number
  timeout: number
  scale: ScaleType
  outputFormat: "json" | "csv" | "console" | "html"
  outputFile: string | undefined
  verbose: boolean
  maxRetries: number
  retryBackoffMs: number
  minAgreement: number | undefined // Flag results where agreement is below this threshold
  seed: number | undefined // For reproducible sampling
  sample: number | undefined // Number of prompts to sample
  promptFilter: string | undefined // Filter prompts by index or pattern
  dryRun: boolean
  configFile: string | undefined
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
    normalizedAverageScore: number
    averageJudgeAgreement: number
    lowAgreementCount: number // Results where agreement < minAgreement
    totalCostCredits: number
    averageCostCredits: number | null
  }
  metadata: {
    scaleUsed: ScaleConfig
    judgeRunsPerEval: number
    conversationIds: string[] // All conversation IDs for debugging
    workspaceId: string // Workspace ID for generating Dust URLs
  }
}
