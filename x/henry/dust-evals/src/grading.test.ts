import { describe, expect, test } from "bun:test"
import {
  extractScore,
  calculateMajorityVote,
  formatJudgePrompt,
  normalizeScore,
  hasLowAgreement,
} from "./grading"
import { SCALES } from "./types"
import type { JudgeVote } from "./types"

describe("extractScore", () => {
  const scale03 = SCALES["0-3"]
  const scale15 = SCALES["1-5"]
  const scale0100 = SCALES["0-100"]
  const scaleBinary = SCALES["binary"]

  test("extracts valid score from response (0-3 scale)", () => {
    const result = extractScore("Good response. SCORE: 3", scale03)
    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toBe(3)
    }
  })

  test("extracts score from middle of response", () => {
    const result = extractScore(
      "The answer is partially correct. SCORE: 2\nSome additional text.",
      scale03
    )
    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toBe(2)
    }
  })

  test("handles case-insensitive score", () => {
    const result = extractScore("score: 1", scale03)
    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toBe(1)
    }
  })

  test("handles Score: with capital S", () => {
    const result = extractScore("Score: 0", scale03)
    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toBe(0)
    }
  })

  test("rejects score out of range", () => {
    const result = extractScore("SCORE: 5", scale03)
    expect(result.isOk).toBe(false)
    if (!result.isOk) {
      expect(result.error.message).toContain("out of range")
    }
  })

  test("rejects non-integer for discrete scale", () => {
    const result = extractScore("SCORE: 2.5", scale03)
    expect(result.isOk).toBe(false)
    if (!result.isOk) {
      expect(result.error.message).toContain("integer")
    }
  })

  test("accepts decimal for 0-100 scale", () => {
    const result = extractScore("SCORE: 75.5", scale0100)
    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toBe(75.5)
    }
  })

  test("fails when no score found", () => {
    const result = extractScore("This response has no score marker", scale03)
    expect(result.isOk).toBe(false)
    if (!result.isOk) {
      expect(result.error.message).toContain("Could not extract score")
    }
  })

  test("works with 1-5 scale", () => {
    const result = extractScore("SCORE: 5", scale15)
    expect(result.isOk).toBe(true)
    if (result.isOk) {
      expect(result.value).toBe(5)
    }
  })

  test("rejects 0 for 1-5 scale", () => {
    const result = extractScore("SCORE: 0", scale15)
    expect(result.isOk).toBe(false)
    if (!result.isOk) {
      expect(result.error.message).toContain("out of range")
    }
  })

  test("works with binary scale", () => {
    const result0 = extractScore("SCORE: 0", scaleBinary)
    const result1 = extractScore("SCORE: 1", scaleBinary)

    expect(result0.isOk).toBe(true)
    expect(result1.isOk).toBe(true)
    if (result0.isOk && result1.isOk) {
      expect(result0.value).toBe(0)
      expect(result1.value).toBe(1)
    }
  })

  test("rejects 2 for binary scale", () => {
    const result = extractScore("SCORE: 2", scaleBinary)
    expect(result.isOk).toBe(false)
  })
})

describe("calculateMajorityVote", () => {
  const scale03 = SCALES["0-3"]
  const scale0100 = SCALES["0-100"]

  function createVote(score: number): JudgeVote {
    return {
      score,
      reasoning: "Test reasoning",
      conversationId: "conv-123",
      durationMs: 1000,
    }
  }

  test("returns correct mode for unanimous votes", () => {
    const votes = [createVote(3), createVote(3), createVote(3)]
    const result = calculateMajorityVote(votes, scale03)

    expect(result.finalScore).toBe(3)
    expect(result.majorityScore).toBe(3)
    expect(result.agreement).toBe(1) // 100% agreement
    expect(result.variance).toBe(0)
  })

  test("returns mode for majority votes", () => {
    const votes = [createVote(2), createVote(2), createVote(3)]
    const result = calculateMajorityVote(votes, scale03)

    expect(result.finalScore).toBe(2)
    expect(result.majorityScore).toBe(2)
    expect(result.agreement).toBeCloseTo(0.667, 2) // 2/3 agreement
  })

  test("handles tie by using median of modes", () => {
    // With votes 1, 2, 3, each appears once, median is 2
    const votes = [createVote(1), createVote(2), createVote(3)]
    const result = calculateMajorityVote(votes, scale03)

    expect(result.finalScore).toBe(2)
    expect(result.agreement).toBeCloseTo(0.333, 2)
  })

  test("returns median for 0-100 scale", () => {
    const votes = [createVote(60), createVote(70), createVote(80)]
    const result = calculateMajorityVote(votes, scale0100)

    expect(result.finalScore).toBe(70) // Median
    expect(result.majorityScore).toBe(70)
  })

  test("handles empty votes", () => {
    const result = calculateMajorityVote([], scale03)

    expect(result.finalScore).toBe(0) // scale.min
    expect(result.votes).toHaveLength(0)
    expect(result.agreement).toBe(0)
  })

  test("calculates variance correctly", () => {
    const votes = [createVote(0), createVote(2), createVote(3)]
    const result = calculateMajorityVote(votes, scale03)

    // Mean = (0+2+3)/3 = 1.67
    // Variance = ((0-1.67)^2 + (2-1.67)^2 + (3-1.67)^2)/3
    expect(result.variance).toBeGreaterThan(0)
  })
})

describe("formatJudgePrompt", () => {
  const scale03 = SCALES["0-3"]

  test("includes all required elements", () => {
    const prompt = formatJudgePrompt(
      "What is 2+2?",
      "The answer is 4.",
      "Should be 4",
      scale03,
      undefined
    )

    expect(prompt).toContain("What is 2+2?")
    expect(prompt).toContain("The answer is 4.")
    expect(prompt).toContain("Should be 4")
    expect(prompt).toContain("SCORE:")
    expect(prompt).toContain("0-3")
  })

  test("includes scale rubric", () => {
    const prompt = formatJudgePrompt("Q", "A", "Criteria", scale03, undefined)

    expect(prompt).toContain("0: Completely wrong")
    expect(prompt).toContain("1: Partially correct")
    expect(prompt).toContain("2: Mostly correct")
    expect(prompt).toContain("3: Excellent")
  })

  test("includes global judge prompt when provided", () => {
    const globalPrompt = "# Custom Instructions\n\nBe very strict."
    const prompt = formatJudgePrompt("Q", "A", "Criteria", scale03, globalPrompt)

    expect(prompt).toContain("# Custom Instructions")
    expect(prompt).toContain("Be very strict.")
    expect(prompt).toContain("---") // Separator after global prompt
  })

  test("works without global judge prompt", () => {
    const prompt = formatJudgePrompt("Q", "A", "Criteria", scale03, undefined)

    expect(prompt).not.toMatch(/^---/) // Should not start with separator
    expect(prompt).toContain("You are evaluating")
  })
})

describe("normalizeScore", () => {
  const scale03 = SCALES["0-3"]
  const scale15 = SCALES["1-5"]
  const scale0100 = SCALES["0-100"]

  test("normalizes 0-3 scale correctly", () => {
    expect(normalizeScore(0, scale03)).toBe(0)
    expect(normalizeScore(1.5, scale03)).toBe(0.5)
    expect(normalizeScore(3, scale03)).toBe(1)
  })

  test("normalizes 1-5 scale correctly", () => {
    expect(normalizeScore(1, scale15)).toBe(0)
    expect(normalizeScore(3, scale15)).toBe(0.5)
    expect(normalizeScore(5, scale15)).toBe(1)
  })

  test("normalizes 0-100 scale correctly", () => {
    expect(normalizeScore(0, scale0100)).toBe(0)
    expect(normalizeScore(50, scale0100)).toBe(0.5)
    expect(normalizeScore(100, scale0100)).toBe(1)
  })
})

describe("hasLowAgreement", () => {
  test("returns true when below threshold", () => {
    const result = {
      finalScore: 2,
      votes: [],
      variance: 1,
      agreement: 0.5,
      majorityScore: 2,
    }

    expect(hasLowAgreement(result, 0.7)).toBe(true)
    expect(hasLowAgreement(result, 0.5)).toBe(false)
    expect(hasLowAgreement(result, 0.3)).toBe(false)
  })
})
