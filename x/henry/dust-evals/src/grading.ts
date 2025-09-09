import type { Result, Score } from "./types"
import { Ok, Err } from "./types"

/**
 * Extract score from judge response.
 * Expects the judge to return a score in the format:
 * SCORE: <number>
 * where the number must be 0, 1, 2, or 3
 */
export function extractScore(response: string): Result<Score> {
  const match = response.match(/(?:SCORE|Score):\s*(\d)/i)
  if (match && match[1]) {
    const score = parseInt(match[1])
    if (score >= 0 && score <= 3) {
      return Ok(score as Score)
    }
    return Err(new Error(`Score must be 0, 1, 2, or 3. Got: ${score}`))
  }
  return Err(new Error(`Could not extract score from response: ${response}`))
}

/**
 * Format judge prompt for grading.
 */
export function formatJudgePrompt(
  prompt: string,
  response: string,
  judgePrompt: string
): string {
  return `You are evaluating an agent's response.

Scoring system:
- 0: Completely wrong or unhelpful
- 1: Partially correct but missing key elements
- 2: Mostly correct with minor issues
- 3: Excellent, complete, and accurate

You MUST include your score in the format:
SCORE: <number>

Original prompt:
"${prompt}"

Agent's response:
"${response}"

Evaluation criteria:
${judgePrompt}

Provide your evaluation with the score (0-3) clearly marked.`
}
