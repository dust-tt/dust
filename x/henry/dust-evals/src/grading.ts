import type { Result, Score, VersusJudgeResult } from "./types"
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

/**
 * Extract winner from versus judge response.
 * Expects the judge to return a winner in the format:
 * WINNER: <ID> or WINNER: DRAW
 */
export function extractVersusWinner(
  response: string,
  agentMapping: Map<number, string>
): Result<VersusJudgeResult> {
  // More precise regex: match WINNER: followed by either a number or DRAW
  // Use word boundary (\b) to avoid capturing extra text
  const match = response.match(/(?:WINNER|Winner):\s*(DRAW\b|\d+)/i)
  if (!match || !match[1]) {
    return Err(
      new Error(
        `Could not extract winner from response. Expected format: "WINNER: 1" or "WINNER: DRAW"`
      )
    )
  }

  const winner = match[1].toUpperCase()

  if (winner === "DRAW") {
    return Ok({
      winner: "DRAW",
      reasoning: response,
    })
  }

  // Try to parse as number (agent ID)
  const agentNum = parseInt(winner)
  if (!isNaN(agentNum) && agentMapping.has(agentNum)) {
    return Ok({
      winner: agentMapping.get(agentNum)!,
      reasoning: response,
    })
  }

  return Err(
    new Error(
      `Invalid winner: ${winner}. Must be a number (1-${agentMapping.size}) or "DRAW"`
    )
  )
}

/**
 * Format judge prompt for versus mode grading.
 */
export function formatVersusJudgePrompt(
  originalPrompt: string,
  responses: Array<{ agentId: string; response: string }>,
  judgePrompt: string
): { prompt: string; agentMapping: Map<number, string> } {
  // Create anonymous mapping
  const agentMapping = new Map<number, string>()
  const shuffledResponses = [...responses].sort(() => Math.random() - 0.5)

  shuffledResponses.forEach((resp, index) => {
    agentMapping.set(index + 1, resp.agentId)
  })

  const formattedResponses = shuffledResponses
    .map((resp, index) => {
      return `Response ${index + 1}:\n"${resp.response}"`
    })
    .join("\n\n")

  const prompt = `You are evaluating multiple agent responses to pick the best one.

IMPORTANT: Focus ONLY on the evaluation criteria provided. Additional information beyond the criteria should neither be rewarded nor penalized.

The best answer is the one that contains the most elements from the evaluation criteria.

If no responses satisfy the criteria, are all too incomplete or incorrect, or all equally correct, output: WINNER: DRAW

You MUST include your decision in the format:
WINNER: <number> (where number is 1, 2, 3, etc.)
OR
WINNER: DRAW

Original prompt:
"${originalPrompt}"

${formattedResponses}

Evaluation criteria:
${judgePrompt}

Evaluate which response best satisfies the criteria. Remember: only judge based on the criteria provided, not on additional information.`

  return { prompt, agentMapping }
}
