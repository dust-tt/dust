// Configurable scoring scales
export type ScaleType = "binary" | "0-3" | "1-5" | "0-100"

export interface ScaleConfig {
  type: ScaleType
  min: number
  max: number
  labels: Record<number, string>
}

export const SCALES: Record<ScaleType, ScaleConfig> = {
  binary: {
    type: "binary",
    min: 0,
    max: 1,
    labels: {
      0: "Fail - Does not meet criteria",
      1: "Pass - Meets criteria",
    },
  },
  "0-3": {
    type: "0-3",
    min: 0,
    max: 3,
    labels: {
      0: "Completely wrong or unhelpful",
      1: "Partially correct but missing key elements",
      2: "Mostly correct with minor issues",
      3: "Excellent, complete, and accurate",
    },
  },
  "1-5": {
    type: "1-5",
    min: 1,
    max: 5,
    labels: {
      1: "Very poor - Completely wrong or unhelpful",
      2: "Poor - Major issues, missing key elements",
      3: "Average - Partially correct with notable gaps",
      4: "Good - Mostly correct with minor issues",
      5: "Excellent - Complete and accurate",
    },
  },
  "0-100": {
    type: "0-100",
    min: 0,
    max: 100,
    labels: {
      0: "Completely wrong",
      25: "Poor - Major issues",
      50: "Average - Partially correct",
      75: "Good - Mostly correct",
      100: "Perfect - Complete and accurate",
    },
  },
}

export interface JudgeVote {
  score: number
  reasoning: string
  conversationId: string
  durationMs: number
}

export interface JudgeResult {
  finalScore: number
  votes: JudgeVote[]
  variance: number
  agreement: number // 0-1, how much judges agreed
  majorityScore: number
}

// Result type for error handling
export type Result<T, E = Error> =
  | { isOk: true; value: T }
  | { isOk: false; error: E }

export function Ok<T>(value: T): Result<T, never> {
  return { isOk: true, value }
}

export function Err<E>(error: E): Result<never, E> {
  return { isOk: false, error }
}
