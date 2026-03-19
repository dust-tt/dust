import { getLLM } from "@app/lib/api/llm";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import {
  getTestCaseInputForDisplay,
  type JudgeResult,
  type TestCase,
  type ToolCall,
} from "@app/tests/reinforced-agent-evals/lib/types";

const JUDGE_PROMPT = `You are evaluating the quality of a Reinforced Agent's suggestions.

The Reinforced Agent analyzes conversations or aggregates synthetic suggestions to propose improvements to an AI agent's configuration (instructions, tools, skills).

## Scoring Rubric

- 0: Failed to produce relevant suggestions or major issues (wrong tool, irrelevant content)
- 1: Partially addressed the issue, missing key elements or low quality suggestions
- 2: Good suggestions with minor issues (slightly off-target, incomplete analysis)
- 3: Excellent, well-targeted suggestions that clearly address the identified issues

You MUST provide your response in this exact format:

REASONING: <your detailed analysis>
SCORE: <number>

Where <number> is between 0 and 3.

IMPORTANT: You must include both REASONING: and SCORE: labels. The score MUST appear at the end of your response.

---

## Test Input

{{TEST_INPUT}}

## Tool Calls Made

{{TOOL_CALLS}}

## Response Text (if any)

{{RESPONSE_TEXT}}

## Scenario-Specific Criteria

{{JUDGE_CRITERIA}}

---

## General Evaluation Checklist (apply to all scenarios)

1. **Correct Tool Usage**: Did the reinforced agent call the right tool(s) for the situation?
   - suggest_prompt_edits for instruction improvements
   - suggest_tools for tool additions/removals
   - suggest_skills for skill additions/removals
2. **Suggestion Quality**: Are the suggestions specific, actionable, and well-reasoned?
   - Does the analysis field explain WHY the change is needed?
   - Is the suggested content appropriate and well-written?
3. **Scope Appropriateness**: Did it avoid over-engineering?
   - Focused on the actual issue rather than rewriting everything
   - Suggestions are proportional to the problem
4. **If suggest_prompt_edits was called**:
   - Is the HTML content well-structured?
   - Does it directly address the identified issue?
   - Would it meaningfully improve the agent?
5. **If suggest_tools or suggest_skills was called**:
   - Is the correct tool/skill ID used?
   - Is the action (add/remove) appropriate?
   - Does the analysis explain the use case?

Provide your evaluation using the REASONING: and SCORE: format described above.`;

export async function evaluateWithJudge(
  auth: Authenticator,
  testCase: TestCase,
  toolCalls: ToolCall[],
  responseText: string,
  numRuns: number = 1
): Promise<JudgeResult> {
  const prompt = JUDGE_PROMPT.replace(
    "{{TEST_INPUT}}",
    getTestCaseInputForDisplay(testCase)
  )
    .replace(
      "{{TOOL_CALLS}}",
      toolCalls.length > 0
        ? toolCalls
            .map(
              (tc) => `- ${tc.name}(${JSON.stringify(tc.arguments, null, 2)})`
            )
            .join("\n\n")
        : "(none)"
    )
    .replace("{{RESPONSE_TEXT}}", responseText || "(none)")
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
        "You are a careful evaluator. Analyze the reinforced agent output and provide a fair assessment.",
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
