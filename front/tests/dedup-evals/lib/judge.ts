import { getLLM } from "@app/lib/api/llm";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import {
  type DedupTestCase,
  formatMatchMap,
  getTestCaseInputForDisplay,
  type JudgeResult,
} from "@app/tests/dedup-evals/lib/types";

const JUDGE_PROMPT = `You are evaluating the quality of a TODO deduplication system's decisions.

The system receives a list of existing TODOs and new candidate TODOs, and decides which candidates
are semantic duplicates of existing ones. Two items are duplicates when they describe the same task
or decision, regardless of wording differences.

## Scoring Rubric

- 0: Major errors — matched unrelated items, or missed obvious duplicates
- 1: Partially correct — some matches right but missed important duplicates or made false matches
- 2: Good with minor issues — mostly correct, perhaps debatable on one borderline case
- 3: Excellent — all match/no-match decisions are correct and well-reasoned

You MUST provide your response in this exact format:

REASONING: <your detailed analysis>
SCORE: <number>

Where <number> is between 0 and 3.

IMPORTANT: You must include both REASONING: and SCORE: labels. The score MUST appear at the end of your response.

---

## Test Input

{{TEST_INPUT}}

## Deduplication Decisions

{{MATCH_MAP}}

## Scenario-Specific Criteria

{{JUDGE_CRITERIA}}

---

## General Evaluation Checklist

1. **Correct matches**: Were genuine semantic duplicates correctly identified?
   - Same task/decision described with different words → should match
   - Identical or near-identical text → should match
2. **Correct non-matches**: Were genuinely distinct items left unmatched?
   - Related but different tasks → should NOT match (e.g., "Set up CI" vs "Set up CD")
   - Different scope or intent → should NOT match
3. **Correct sId mapping**: When a match is reported, does it point to the right existing TODO?
4. **No false positives**: Were unrelated items incorrectly matched?
5. **No false negatives**: Were obvious duplicates missed?

Provide your evaluation using the REASONING: and SCORE: format described above.`;

export async function evaluateWithJudge(
  auth: Authenticator,
  testCase: DedupTestCase,
  matchMap: Map<number, string>,
  numRuns: number = 1
): Promise<JudgeResult> {
  const prompt = JUDGE_PROMPT.replace(
    "{{TEST_INPUT}}",
    getTestCaseInputForDisplay(testCase)
  )
    .replace("{{MATCH_MAP}}", formatMatchMap(matchMap))
    .replace("{{JUDGE_CRITERIA}}", testCase.judgeCriteria);

  const scores: number[] = [];
  let lastReasoning = "";

  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const llm = await getLLM(auth, {
    credentials,
    modelId: "gpt-5-mini",
    temperature: 0.2,
    bypassFeatureFlag: true,
  });
  if (!llm) {
    throw new Error("Failed to initialize LLM for judge evaluation");
  }

  for (let i = 0; i < numRuns; i++) {
    const events = llm.stream({
      conversation: {
        messages: [
          {
            role: "user",
            name: "User",
            content: [{ type: "text", text: prompt }],
          },
        ],
      },
      prompt:
        "You are a careful evaluator. Analyze the deduplication decisions and provide a fair assessment.",
      specifications: [],
    });

    let response = "";
    for await (const event of events) {
      if (event.type === "text_delta") {
        response += event.content.delta;
      }
      if (event.type === "error") {
        throw new Error(`Judge evaluation error: ${event.content.message}`);
      }
    }

    const scoreMatch = response.match(/SCORE:\s*(\d)/i);
    if (scoreMatch) {
      const score = parseInt(scoreMatch[1], 10);
      if (score >= 0 && score <= 3) {
        scores.push(score);
      }
    }

    const reasoningMatch = response.match(
      /REASONING:\s*([\s\S]+?)(?=SCORE:|$)/i
    );
    if (reasoningMatch) {
      lastReasoning = reasoningMatch[1].trim();
    }
  }

  const finalScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  return { finalScore, scores, reasoning: lastReasoning };
}
