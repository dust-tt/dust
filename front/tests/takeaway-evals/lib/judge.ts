import { getLLM } from "@app/lib/api/llm";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import {
  formatExtractionResult,
  getTestCaseInputForDisplay,
  type JudgeResult,
  type TakeawayExecutionResult,
  type TakeawayTestCase,
} from "@app/tests/takeaway-evals/lib/types";

const JUDGE_PROMPT = `You are evaluating the quality of a document takeaway extraction system's output.

The system receives a document and a list of project members, and extracts three categories of
takeaways: action items (concrete tasks someone committed to), notable facts (significant
information worth remembering), and key decisions (choices or resolutions explicitly made).

## Scoring Rubric

- 0: Major errors — missed obvious takeaways, hallucinated items not in the document, or wrong categories
- 1: Partially correct — captured some takeaways but missed important ones or made errors
- 2: Good with minor issues — mostly correct extraction, perhaps debatable on one borderline item
- 3: Excellent — all important takeaways extracted correctly with proper categorization

You MUST provide your response in this exact format:

REASONING: <your detailed analysis>
SCORE: <number>

Where <number> is between 0 and 3.

IMPORTANT: You must include both REASONING: and SCORE: labels. The score MUST appear at the end of your response.

---

## Test Input

{{TEST_INPUT}}

## Extracted Takeaways

{{EXTRACTION_RESULT}}

## Scenario-Specific Criteria

{{JUDGE_CRITERIA}}

---

## General Evaluation Checklist

1. **Action items**: Were concrete tasks correctly identified?
   - Real commitments or assignments → should be extracted
   - Agent/bot responses or handled queries → should NOT be extracted
   - Vague aspirational items → should NOT be extracted
   - Correct assignee when identifiable from project members?
   - Correct status (open vs done)?
2. **Notable facts**: Were significant pieces of information captured?
   - Key constraints, context, or updates → should be extracted
   - Trivial or widely known information → should NOT be extracted
3. **Key decisions**: Were explicit choices or resolutions identified?
   - Finalized decisions → status "decided"
   - Open deliberations → status "open"
   - Minor preferences → should NOT be extracted
4. **No hallucinations**: Are all extracted items grounded in the document?
5. **User ID correctness**: Are assignees and relevant users from the project members list?

Provide your evaluation using the REASONING: and SCORE: format described above.`;

export async function evaluateWithJudge(
  auth: Authenticator,
  testCase: TakeawayTestCase,
  result: TakeawayExecutionResult,
  numRuns: number = 1
): Promise<JudgeResult> {
  const prompt = JUDGE_PROMPT.replace(
    "{{TEST_INPUT}}",
    getTestCaseInputForDisplay(testCase)
  )
    .replace("{{EXTRACTION_RESULT}}", formatExtractionResult(result))
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
        "You are a careful evaluator. Analyze the takeaway extraction and provide a fair assessment.",
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
