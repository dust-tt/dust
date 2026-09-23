import {
  runTool,
  TOOL,
} from "@app/tests/conversational-building-evals/lib/tool-runner";
import type {
  ExecutionResult,
  JudgeResult,
  SeededScenario,
  TestCase,
} from "@app/tests/conversational-building-evals/lib/types";
import { getTestCaseUserMessageForDisplay } from "@app/tests/conversational-building-evals/lib/types";
import { getJudgeLLM } from "@app/tests/utils/eval_llm";

const JUDGE_PROMPT = `You are evaluating an AI agent that helps users build and improve Agents and Skills from a conversation.
A Skill is a named set of instructions (block-structured HTML) plus an agent-facing description.
An Agent is a configured assistant: a name, a description and instructions.
The agent never applies changes directly: it records a suggestion through a \`suggest_*\` tool
that the entity's editors review later.

## Scoring Rubric

- 0: Failed to address intent or major issues
- 1: Partially addressed, missing key elements
- 2: Good response with minor issues
- 3: Excellent, fully actionable suggestion

You MUST provide your response in this exact format:

REASONING: <your detailed analysis>
SCORE: <number>

Where <number> is between 0 and 3.

IMPORTANT: You must include both REASONING: and SCORE: labels. The score MUST appear at the end of your response.

---

## Scenario

User message:
{{USER_MESSAGE}}

## Skills in the workspace (as the agent could read them with describe_skill)

{{WORKSPACE_SKILLS}}

## Tools and knowledge seeded in the workspace (the only valid inline references)

{{WORKSPACE_REFERENCES}}

## Agents in the workspace (as the agent could read them with get_agent_details)

{{WORKSPACE_AGENTS}}

## Final suggestion tool call

{{FINAL_TOOL_CALL}}

## Tools Called (in order)

{{TOOL_CALLS}}

## Agent's Final Response

{{AGENT_RESPONSE}}

## Scenario-Specific Criteria

{{JUDGE_CRITERIA}}

---

## General Evaluation Checklist (apply to all scenarios)

1. **Intent Understanding**: Did the agent correctly understand which skill to change and what the user wanted changed?
2. **Suggestion Content** (the key output, carried by the final suggestion tool call's arguments):
   - Does the suggestion implement exactly what the user asked, without inventing unrelated changes?
   - For skill updates: do the edits preserve the parts of the existing instructions the user did
     not ask to change? Each \`instructionEdits\` item replaces one block identified by
     \`targetBlockId\`: the id must exist in the skill's instructions (or be the root id for a full
     rewrite), and the \`content\` must be a complete, well-formed replacement for that block,
     including its wrapping tag.
   - For agent instruction changes: the same block rules apply as for skills. When the request
     concerns one section of the instructions, the edit must target that section's block (or a
     block inside it) and leave every other block untouched; rewriting the root or unrelated
     blocks for a local change = score 0-1.
   - For agent creations: are the name, description and instructions coherent with the request,
     and are the instructions complete enough for the agent to do its job without inventing
     capabilities (tools, knowledge) that were not verified to exist?
   - Inline references: a \`<tool id=.../>\` tag must use the id of a seeded tool and a
     \`<knowledge .../>\` tag must match a seeded document exactly (id, title, space, dsv). Any
     reference to a tool or document that is not listed above is invented.
   - Are the new instructions clear, specific and well-structured?
   - **CRITICAL**: a suggestion that targets the wrong entity, targets a non-existent block, or
     would lose existing content the user wanted kept = score 0-1, regardless of other factors.
3. **Tool Usage**: Did it read a skill before editing it (it cannot know block ids otherwise)?
   Did it avoid redundant calls?
4. **Response Quality**: Is the closing message short and clear? Does it tell the user a
   suggestion was recorded for editors to review rather than pretending the change is live?
5. **Entity Mention**: Does the message carrying the suggestion directives also name the entity
   it acted on, as \`:build_skill[Skill Name]{sId=<skillId>}\` or
   \`:build_agent[Agent Name]{sId=<agentId>}\`, with the same id the suggestion targets, so the
   user can click it open? An entity named in plain text, or with an invented id, does not render
   as a clickable chip.

Provide your evaluation using the REASONING: and SCORE: format described above.`;

// What the agent could have read: the seeded skills as `describe_skill` renders them.
async function renderWorkspaceSkills(
  scenario: SeededScenario
): Promise<string> {
  const rendered: string[] = [];
  for (const skillId of scenario.skillIdsByKey.values()) {
    rendered.push(
      await runTool(scenario.auth, TOOL.describeSkill, { skillId })
    );
  }
  return rendered.length > 0 ? rendered.join("\n\n") : "(none)";
}

function renderWorkspaceReferences(scenario: SeededScenario): string {
  const lines: string[] = [];
  for (const [key, toolId] of scenario.toolIdsByKey) {
    lines.push(`- tool "${key}": <tool id="${toolId}" name="..."/>`);
  }
  for (const [key, node] of scenario.knowledgeByKey) {
    lines.push(
      `- knowledge "${key}": <knowledge id="${node.nodeId}" title="${node.title}" space="${node.spaceId}" dsv="${node.dataSourceViewId}" hasChildren="false"/>`
    );
  }
  return lines.length > 0 ? lines.join("\n") : "(none)";
}

async function renderWorkspaceAgents(
  scenario: SeededScenario
): Promise<string> {
  const rendered: string[] = [];
  for (const agentId of scenario.agentIdsByKey.values()) {
    rendered.push(
      await runTool(scenario.auth, TOOL.describeAgent, { agentId })
    );
  }
  return rendered.length > 0 ? rendered.join("\n\n") : "(none)";
}

export async function evaluateWithJudge(
  scenario: SeededScenario,
  testCase: TestCase,
  execution: ExecutionResult,
  numRuns: number
): Promise<JudgeResult> {
  const { auth } = scenario;
  const { toolCalls, responseText, finalToolCall } = execution;

  const prompt = JUDGE_PROMPT.replace(
    "{{USER_MESSAGE}}",
    getTestCaseUserMessageForDisplay(testCase)
  )
    .replace("{{WORKSPACE_SKILLS}}", await renderWorkspaceSkills(scenario))
    .replace("{{WORKSPACE_REFERENCES}}", renderWorkspaceReferences(scenario))
    .replace("{{WORKSPACE_AGENTS}}", await renderWorkspaceAgents(scenario))
    .replace(
      "{{FINAL_TOOL_CALL}}",
      finalToolCall
        ? `${finalToolCall.name}(${JSON.stringify(finalToolCall.arguments, null, 2)})`
        : "(none)"
    )
    .replace(
      "{{TOOL_CALLS}}",
      toolCalls.length > 0
        ? toolCalls
            .map((tc) => `- ${tc.name}(${JSON.stringify(tc.arguments)})`)
            .join("\n")
        : "(none)"
    )
    .replace("{{AGENT_RESPONSE}}", responseText || "(empty)")
    .replace("{{JUDGE_CRITERIA}}", testCase.judgeCriteria);

  const llm = await getJudgeLLM(auth);

  // The runs are independent samples of the same prompt, so they run concurrently.
  const runJudge = async (): Promise<{
    score: number | null;
    reasoning: string | null;
  }> => {
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
        "You are a careful evaluator. Analyze the agent run and provide a fair assessment.",
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
    const parsedScore = scoreMatch ? parseInt(scoreMatch[1], 10) : null;
    const score =
      parsedScore !== null && parsedScore >= 0 && parsedScore <= 3
        ? parsedScore
        : null;

    const reasoningMatch = response.match(
      /REASONING:\s*([\s\S]+?)(?=SCORE:|$)/i
    );
    return { score, reasoning: reasoningMatch?.[1].trim() ?? null };
  };

  const runs = await Promise.all(
    Array.from({ length: numRuns }, () => runJudge())
  );
  const scores = runs.flatMap((r) => (r.score === null ? [] : [r.score]));
  const lastReasoning =
    runs
      .map((r) => r.reasoning)
      .filter((r): r is string => r !== null)
      .at(-1) ?? "";

  const finalScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  return { finalScore, scores, reasoning: lastReasoning };
}
