import type { Result, ScaleConfig, JudgeVote, JudgeResult } from "./types"
import { Ok, Err } from "./types"

// Maximum standard deviation as fraction of scale range for 0-100 agreement calculation
// Agreement = 1 - (stdDev / maxStdDev), where maxStdDev = 25% of range
const CONTINUOUS_SCALE_MAX_STDDEV_RATIO = 0.25

/**
 * Extract score from judge response based on the scale.
 * Expects format: SCORE: <number>
 */
export function extractScore(
  response: string,
  scale: ScaleConfig
): Result<number> {
  // Look for SCORE: pattern (case insensitive)
  const match = response.match(/(?:SCORE|Score):\s*(\d+(?:\.\d+)?)/i)

  if (!match || match[1] === undefined) {
    return Err(
      new Error(
        `Could not extract score from response. Expected format: "SCORE: <number>"\n` +
          `Response excerpt: "${response.slice(-200)}"`
      )
    )
  }

  const score = parseFloat(match[1])

  if (isNaN(score)) {
    return Err(new Error(`Invalid score value: ${match[1]}`))
  }

  if (score < scale.min || score > scale.max) {
    return Err(
      new Error(
        `Score ${score} is out of range. Expected ${scale.min}-${scale.max} for ${scale.type} scale`
      )
    )
  }

  // For non-continuous scales, validate it's an integer
  if (scale.type !== "0-100" && !Number.isInteger(score)) {
    return Err(
      new Error(
        `Score must be an integer for ${scale.type} scale. Got: ${score}`
      )
    )
  }

  return Ok(score)
}

/**
 * Format the scoring rubric based on the scale.
 */
function formatScoringRubric(scale: ScaleConfig): string {
  const lines: string[] = [`Scoring system (${scale.type} scale):`]

  // Sort labels by score
  const sortedLabels = Object.entries(scale.labels)
    .map(([score, label]) => ({ score: parseInt(score), label }))
    .sort((a, b) => a.score - b.score)

  for (const { score, label } of sortedLabels) {
    lines.push(`- ${score}: ${label}`)
  }

  return lines.join("\n")
}

/**
 * Format judge prompt for grading with configurable scale.
 */
export function formatJudgePrompt(
  prompt: string,
  response: string,
  judgePrompt: string,
  scale: ScaleConfig,
  globalJudgePrompt: string | undefined
): string {
  const rubric = formatScoringRubric(scale)

  const globalSection = globalJudgePrompt
    ? `${globalJudgePrompt}

---

`
    : ""

  return `${globalSection}You are evaluating an agent's response.

${rubric}

You MUST include your score in the format:
SCORE: <number>

Where <number> is between ${scale.min} and ${scale.max}.

IMPORTANT: First provide your reasoning, then give your score. The score MUST appear at the end of your response.

---

Original prompt:
"${prompt}"

Agent's response:
"${response}"

Evaluation criteria:
${judgePrompt}

---

Provide your evaluation with clear reasoning, then end with the score (${scale.min}-${scale.max}).`
}

/**
 * Calculate majority vote result from multiple judge votes.
 * For discrete scales: uses mode (most common value)
 * For continuous scale (0-100): uses median
 */
export function calculateMajorityVote(
  votes: JudgeVote[],
  scale: ScaleConfig
): JudgeResult {
  if (votes.length === 0) {
    return {
      finalScore: scale.min,
      votes: [],
      variance: 0,
      agreement: 0,
      majorityScore: scale.min,
    }
  }

  const scores = votes.map((v) => v.score)

  // Calculate statistics
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length
  const variance =
    scores.reduce((sum, s) => sum + Math.pow(s - mean, 2), 0) / scores.length
  const stdDev = Math.sqrt(variance)

  // Calculate majority score
  let majorityScore: number

  if (scale.type === "0-100") {
    // For continuous scale, use median
    const sorted = [...scores].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    majorityScore =
      sorted.length % 2 !== 0
        ? sorted[mid]!
        : (sorted[mid - 1]! + sorted[mid]!) / 2
  } else {
    // For discrete scales, use mode (most common value)
    const counts = new Map<number, number>()
    for (const score of scores) {
      counts.set(score, (counts.get(score) || 0) + 1)
    }

    let maxCount = 0
    let modes: number[] = []
    for (const [score, count] of counts) {
      if (count > maxCount) {
        maxCount = count
        modes = [score]
      } else if (count === maxCount) {
        modes.push(score)
      }
    }

    // If tie, use median of modes
    modes.sort((a, b) => a - b)
    majorityScore = modes[Math.floor(modes.length / 2)]!
  }

  // Calculate agreement (0-1)
  // For discrete: % of votes that match majority
  // For continuous: based on standard deviation relative to scale range
  let agreement: number

  if (scale.type === "0-100") {
    // Normalize stdDev to 0-1 range
    const maxStdDev = (scale.max - scale.min) * CONTINUOUS_SCALE_MAX_STDDEV_RATIO
    agreement = Math.max(0, 1 - stdDev / maxStdDev)
  } else {
    // Count votes matching majority
    const matchingVotes = scores.filter((s) => s === majorityScore).length
    agreement = matchingVotes / scores.length
  }

  return {
    finalScore: majorityScore,
    votes,
    variance,
    agreement,
    majorityScore,
  }
}

/**
 * Check if a result has low agreement (judges disagreed significantly).
 */
export function hasLowAgreement(
  result: JudgeResult,
  threshold: number
): boolean {
  return result.agreement < threshold
}

/**
 * Normalize a score to 0-1 range based on the scale.
 */
export function normalizeScore(score: number, scale: ScaleConfig): number {
  return (score - scale.min) / (scale.max - scale.min)
}

