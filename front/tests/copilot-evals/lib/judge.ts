import { getLLM } from "@app/lib/api/llm";
import type { Authenticator } from "@app/lib/auth";
import type {
  JudgeResult,
  MockAgentState,
  TestCase,
  ToolCall,
} from "@app/tests/copilot-evals/lib/types";

const JUDGE_PROMPT = `You are evaluating the quality of an Agent Builder Copilot's response.

## Scoring Rubric

- 0: Failed to address intent or major issues
- 1: Partially addressed, missing key elements
- 2: Good response with minor issues
- 3: Excellent, fully actionable response

You MUST provide your response in this exact format:

REASONING: <your detailed analysis>
SCORE: <number>

Where <number> is between 0 and 3.

IMPORTANT: You must include both REASONING: and SCORE: labels. The score MUST appear at the end of your response.

---

## Scenario

User message:
{{USER_MESSAGE}}

## Agent State (what the copilot saw)

{{AGENT_STATE}}

## Tools Called

{{TOOL_CALLS}}

## Copilot's Response

{{COPILOT_RESPONSE}}

## Scenario-Specific Criteria

{{JUDGE_CRITERIA}}

---

## General Evaluation Checklist (apply to all scenarios)

1. **Intent Understanding**: Did the copilot correctly understand what the user was asking?
2. **Actionable Response**: Are the suggestions specific and actionable (not vague or generic)?
3. **Tool Usage**: Did it use appropriate tools for the task? Did it avoid unnecessary tool calls?
4. **Response Quality**:
   - Is the response well-organized and easy to follow?
   - Does it explain the rationale behind suggestions?
5. **If suggest_prompt_edits was called**, evaluate instruction quality:
   - Do the suggested instructions directly address the user's request?
   - Are they clear, specific, and well-structured?
   - Do they meaningfully improve upon existing instructions (not just reword)?
   - Are they appropriate for the agent's stated purpose?
   - **CRITICAL**: Poor quality suggested instructions = score 0-1, regardless of other factors
6. **Scope Appropriateness**:
   - Did it avoid over-engineering (e.g., complete rewrites when a small edit was requested)?
   - Did it ask clarifying questions when the request was genuinely ambiguous?

The instruction changes provided in suggest_prompt_edits are visualized as inline diffs in the agent builder.
This is the key output of copilot. The users will not only see the copilot response, but also the inline diffs of the instruction changes.

At this point, you judging the quality of the copilot response AND the quality of the instruction changes. We are not yet judging on agent name, description, suggested tools, suggested skills, or suggested models.

Provide your evaluation using the REASONING: and SCORE: format described above.`;

export async function evaluateWithJudge(
  auth: Authenticator,
  testCase: TestCase,
  agentState: MockAgentState,
  toolCalls: ToolCall[],
  copilotResponse: string,
  numRuns: number = 1
): Promise<JudgeResult> {
  const prompt = JUDGE_PROMPT.replace("{{USER_MESSAGE}}", testCase.userMessage)
    .replace("{{AGENT_STATE}}", JSON.stringify(agentState, null, 2))
    .replace(
      "{{TOOL_CALLS}}",
      toolCalls.length > 0
        ? toolCalls
            .map((tc) => `- ${tc.name}(${JSON.stringify(tc.arguments)})`)
            .join("\n")
        : "(none)"
    )
    .replace("{{COPILOT_RESPONSE}}", copilotResponse)
    .replace("{{JUDGE_CRITERIA}}", testCase.judgeCriteria);

  const scores: number[] = [];
  let lastReasoning = "";

  const llm = await getLLM(auth, {
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
        "You are a careful evaluator. Analyze the copilot response and provide a fair assessment.",
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
