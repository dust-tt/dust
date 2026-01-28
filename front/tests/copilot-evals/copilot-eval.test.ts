import { describe, expect, it, vi } from "vitest";

import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { AGENT_COPILOT_AGENT_STATE_SERVER } from "@app/lib/api/actions/servers/agent_copilot_agent_state/metadata";
import { AGENT_COPILOT_CONTEXT_SERVER } from "@app/lib/api/actions/servers/agent_copilot_context/metadata";
import { _getCopilotGlobalAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/copilot";
import { getLLM } from "@app/lib/api/llm";
import { Authenticator } from "@app/lib/auth";
import { filterTestCases } from "@app/tests/copilot-evals/lib/suite-loader";
import type {
  CategorizedTestCase,
  CopilotConfig,
  CopilotExecutionResult,
  JudgeResult,
  MockAgentState,
  TestCase,
  ToolCall,
} from "@app/tests/copilot-evals/lib/types";
import { allTestSuites } from "@app/tests/copilot-evals/test-suites";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { ModelMessageTypeMultiActionsWithoutContentFragment } from "@app/types";

vi.mock("openai", async (importOriginal) => {
  const actual = await importOriginal();
  // @ts-expect-error actual is unknown
  const OriginalOpenAI = actual.OpenAI;
  class OpenAIWithBrowserSupport extends OriginalOpenAI {
    constructor(config: ConstructorParameters<typeof OriginalOpenAI>[0]) {
      super({ ...config, dangerouslyAllowBrowser: true });
    }
  }
  return { ...(actual as object), OpenAI: OpenAIWithBrowserSupport };
});

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal();
  // @ts-expect-error actual is unknown
  const OriginalAnthropic = actual.default;
  class AnthropicWithBrowserSupport extends OriginalAnthropic {
    constructor(config: ConstructorParameters<typeof OriginalAnthropic>[0]) {
      super({ ...config, dangerouslyAllowBrowser: true });
    }
  }
  return { ...(actual as object), default: AnthropicWithBrowserSupport };
});

const RUN_COPILOT_EVAL = process.env.RUN_COPILOT_EVAL === "true";
const JUDGE_RUNS = parseInt(process.env.JUDGE_RUNS ?? "3", 10);
const PASS_THRESHOLD = parseInt(process.env.PASS_THRESHOLD ?? "2", 10);
const FILTER_CATEGORY = process.env.FILTER_CATEGORY;
const FILTER_SCENARIO = process.env.FILTER_SCENARIO;
const TIMEOUT_MS = 180_000;
const MAX_TOOL_CALL_ROUNDS = 5;
const ONE_HOUR_MS = 3_600_000;
const ONE_DAY_MS = 86_400_000;

const COPILOT_MCP_SERVERS = [
  AGENT_COPILOT_AGENT_STATE_SERVER,
  AGENT_COPILOT_CONTEXT_SERVER,
] as const;

async function getCopilotConfig(): Promise<CopilotConfig> {
  const workspace = await WorkspaceFactory.basic();
  const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
  const copilotConfig = _getCopilotGlobalAgent(auth, {
    copilotMCPServerViews: null,
    copilotUserMetadata: null,
  });

  const tools: AgentActionSpecification[] = [];

  for (const server of COPILOT_MCP_SERVERS) {
    for (const tool of server.tools) {
      if (tool.inputSchema) {
        tools.push({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        });
      }
    }
  }

  return {
    instructions: copilotConfig.instructions ?? "",
    model: copilotConfig.model,
    tools,
  };
}

function createMockAuthenticator(): Authenticator {
  return new Authenticator({
    workspace: null,
    user: null,
    role: "none",
    groupModelIds: [],
    subscription: null,
    authMethod: "internal",
  });
}

function getMockToolResponse(
  toolName: string,
  agentState: MockAgentState
): string {
  const mockResponses: Record<string, () => object> = {
    get_agent_info: () => agentState,

    get_available_models: () => ({
      models: [
        { modelId: "gpt-4-turbo", providerId: "openai", name: "GPT-4 Turbo" },
        { modelId: "gpt-5-mini", providerId: "openai", name: "GPT-5 Mini" },
        {
          modelId: "claude-sonnet-4-5-20250929",
          providerId: "anthropic",
          name: "Claude Sonnet 4.5",
        },
        {
          modelId: "claude-opus-4-20250514",
          providerId: "anthropic",
          name: "Claude Opus 4",
        },
      ],
    }),

    get_available_skills: () => ({
      skills: [
        {
          sId: "skill_web_search",
          name: "Web Search",
          description: "Search the web for information",
        },
        {
          sId: "skill_data_analysis",
          name: "Data Analysis",
          description: "Analyze data and generate insights",
        },
      ],
    }),

    get_available_tools: () => ({
      tools: [
        {
          sId: "mcp_slack",
          name: "Slack",
          description: "Read and send Slack messages",
        },
        {
          sId: "mcp_notion",
          name: "Notion",
          description: "Search Notion workspace",
        },
        {
          sId: "mcp_github",
          name: "GitHub",
          description: "Access GitHub repositories",
        },
      ],
    }),

    get_agent_feedback: () => ({
      feedback: [
        {
          id: "fb1",
          thumbDirection: "down",
          content: "The agent's responses are too formal and robotic",
          createdAt: Date.now() - ONE_DAY_MS,
        },
        {
          id: "fb2",
          thumbDirection: "up",
          content: "Great at finding relevant information quickly",
          createdAt: Date.now() - ONE_DAY_MS * 2,
        },
        {
          id: "fb3",
          thumbDirection: "down",
          content: "Sometimes misses important context from previous messages",
          createdAt: Date.now() - ONE_DAY_MS * 3,
        },
      ],
      total: 3,
    }),

    get_agent_insights: () => ({
      activeUsers: 15,
      conversations: 48,
      messages: 320,
      feedbackStats: {
        thumbsUp: 12,
        thumbsDown: 8,
        thumbsUpRate: 0.6,
      },
      topUsers: [
        { userId: "user1", name: "Alice Smith", conversations: 12 },
        { userId: "user2", name: "Bob Johnson", conversations: 8 },
      ],
    }),

    suggest_prompt_editions: () => ({
      status: "success",
      suggestionsCreated: 1,
      message: "Suggestion created successfully",
    }),

    suggest_tools: () => ({
      status: "success",
      suggestionsCreated: 1,
      message: "Tool suggestion created successfully",
    }),

    suggest_skills: () => ({
      status: "success",
      suggestionsCreated: 1,
      message: "Skill suggestion created successfully",
    }),

    suggest_model: () => ({
      status: "success",
      suggestionsCreated: 1,
      message: "Model suggestion created successfully",
    }),

    list_suggestions: () => ({
      suggestions: [
        {
          id: "sug1",
          kind: "instructions",
          status: "pending",
          createdAt: Date.now() - ONE_HOUR_MS,
          analysis: "Make tone more friendly based on user feedback",
        },
      ],
      total: 1,
    }),
  };

  const responseFactory = mockResponses[toolName];
  if (!responseFactory) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  return JSON.stringify(responseFactory(), null, 2);
}

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

## Evaluation Criteria

{{JUDGE_CRITERIA}}

---

Evaluate the copilot's response against the following:
1. Did it understand the user's intent?
2. Are the suggestions actionable and specific?
3. Did it appropriately use available tools?
4. **CRITICAL: If it called suggest_prompt_editions**, evaluate the quality of the suggested instructions:
   - Do they directly address what the user requested?
   - Are they clear, specific, and well-structured?
   - Do they meaningfully improve upon the existing instructions?
   - Are they appropriate for the agent's purpose?
   - Note: Poor quality instructions should result in a score of 0-1, regardless of other factors
5. Are there any issues (vague advice, missing elements, poor instructions)?

Provide your evaluation using the REASONING: and SCORE: format described above.`;

async function evaluateWithJudge(
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

async function executeCopilot(
  auth: Authenticator,
  config: CopilotConfig,
  userMessage: string,
  agentState: MockAgentState
): Promise<CopilotExecutionResult> {
  const llm = await getLLM(auth, {
    modelId: config.model.modelId,
    temperature: config.model.temperature ?? null,
    reasoningEffort: config.model.reasoningEffort ?? null,
    bypassFeatureFlag: true,
  });

  if (!llm) {
    throw new Error("Failed to initialize LLM for copilot execution");
  }

  const messages: ModelMessageTypeMultiActionsWithoutContentFragment[] = [
    {
      role: "user",
      name: "User",
      content: [{ type: "text", text: userMessage }],
    },
  ];

  const allToolCalls: ToolCall[] = [];
  let responseText = "";

  let events = llm.stream({
    conversation: { messages },
    prompt: config.instructions,
    specifications: config.tools,
  });

  for (let round = 0; round < MAX_TOOL_CALL_ROUNDS; round++) {
    const currentRoundToolCalls: ToolCall[] = [];
    responseText = "";

    for await (const event of events) {
      switch (event.type) {
        case "text_delta":
          responseText += event.content.delta;
          break;
        case "text_generated":
          responseText = event.content.text;
          break;
        case "tool_call":
          currentRoundToolCalls.push({
            name: event.content.name,
            arguments: event.content.arguments,
          });
          break;
        case "error":
          throw new Error(`Copilot LLM error: ${event.content.message}`);
      }
    }

    // No more tool calls - we have the final response
    if (currentRoundToolCalls.length === 0) {
      break;
    }

    allToolCalls.push(...currentRoundToolCalls);

    // Build messages with tool calls and simulated responses
    for (let idx = 0; idx < currentRoundToolCalls.length; idx++) {
      const tc = currentRoundToolCalls[idx];
      const callId = (
        allToolCalls.length -
        currentRoundToolCalls.length +
        idx +
        1
      )
        .toString()
        .padStart(9, "0");

      const functionCall = {
        id: callId,
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      };

      messages.push({
        role: "assistant" as const,
        function_calls: [functionCall],
        contents: [{ type: "function_call" as const, value: functionCall }],
      });

      messages.push({
        role: "function" as const,
        name: tc.name,
        function_call_id: callId,
        content: getMockToolResponse(tc.name, agentState),
      });
    }

    // Continue conversation with tool results
    events = llm.stream({
      conversation: { messages },
      prompt: config.instructions,
      specifications: config.tools,
    });
  }

  return { responseText, toolCalls: allToolCalls };
}

const testCases = RUN_COPILOT_EVAL
  ? filterTestCases(allTestSuites, {
      category: FILTER_CATEGORY,
      scenarioId: FILTER_SCENARIO,
    })
  : [];

const testGroups = new Map<string, Map<string, CategorizedTestCase>>();
for (const testCase of testCases) {
  if (!testGroups.has(testCase.category)) {
    testGroups.set(testCase.category, new Map());
  }
  testGroups.get(testCase.category)!.set(testCase.scenarioId, testCase);
}

describe.skipIf(!RUN_COPILOT_EVAL)("Copilot Evaluation Tests", () => {
  for (const [category, scenarios] of testGroups) {
    describe(category, () => {
      for (const [scenarioId, testCase] of scenarios) {
        it(
          scenarioId,
          async () => {
            const auth = createMockAuthenticator();
            const copilotConfig = await getCopilotConfig();

            const { responseText, toolCalls } = await executeCopilot(
              auth,
              copilotConfig,
              testCase.userMessage,
              testCase.mockState
            );

            // Verify expected tool calls
            const actualToolNames = toolCalls.map((t) => t.name);
            for (const expected of testCase.expectedToolCalls ?? []) {
              expect(
                actualToolNames,
                `Expected tool "${expected}" not called. Tools called: [${actualToolNames.join(", ")}]`
              ).toContain(expected);
            }

            // Verify non-empty response
            expect(
              responseText.length,
              "Copilot returned empty response"
            ).toBeGreaterThan(0);

            const judgeResult = await evaluateWithJudge(
              auth,
              testCase,
              testCase.mockState,
              toolCalls,
              responseText,
              JUDGE_RUNS
            );

            expect(
              judgeResult.finalScore >= PASS_THRESHOLD,
              `Judge score ${judgeResult.finalScore} < threshold ${PASS_THRESHOLD}\nReasoning: ${judgeResult.reasoning}`
            ).toBe(true);
          },
          TIMEOUT_MS
        );
      }
    });
  }
});
