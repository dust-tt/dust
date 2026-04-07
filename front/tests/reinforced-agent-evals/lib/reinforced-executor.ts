import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import {
  formatAvailableSkills,
  formatAvailableTools,
} from "@app/lib/api/assistant/global_agents/sidekick_context";
import { getLLM } from "@app/lib/api/llm";
import type { LLM } from "@app/lib/api/llm/llm";
import type { BatchResultWithRunIds } from "@app/lib/api/llm/types/batch";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { buildAggregationPrompt } from "@app/lib/reinforced_agent/aggregate_suggestions";
import { buildAnalysisPrompt } from "@app/lib/reinforced_agent/analyze_conversation";
import {
  buildReinforcedLLMParams,
  classifyToolCalls,
} from "@app/lib/reinforced_agent/run_reinforced_analysis";
import type { ExploratoryToolName } from "@app/lib/reinforced_agent/types";
import { MAX_REINFORCED_ANALYSIS_STEPS } from "@app/lib/reinforced_agent/types";
import { buildContinuationMessages } from "@app/lib/reinforced_agent/utils";
import {
  BATCH_POLL_INTERVAL_MS,
  MODEL_ID,
} from "@app/tests/reinforced-agent-evals/lib/config";
import {
  buildConversationText,
  type CategorizedTestCase,
  type ExecutionResult,
  isAnalysisTestCase,
  type MockAgentConfig,
  type TestCase,
  type ToolCall,
  type WorkspaceContext,
} from "@app/tests/reinforced-agent-evals/lib/types";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { assertNever } from "@app/types/shared/utils/assert_never";

function makeAction(input: {
  name: string;
  sId: string;
}): ServerSideMCPServerConfigurationType {
  return {
    id: 0,
    sId: input.sId,
    type: "mcp_server_configuration",
    name: input.name,
    description: null,
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    additionalConfiguration: {},
    mcpServerViewId: input.sId,
    dustAppConfiguration: null,
    secretName: null,
    dustProject: null,
    internalMCPServerId: null,
  };
}

function makeAgentConfig(input: MockAgentConfig): AgentConfigurationType {
  return {
    id: 1,
    sId: "eval-agent",
    version: 1,
    versionCreatedAt: null,
    versionAuthorId: null,
    instructions: null,
    model: {
      modelId: "gpt-4o-mini",
      providerId: "openai",
      temperature: 0.7,
    },
    status: "active",
    scope: "visible",
    userFavorite: false,
    name: input.name,
    description: input.description ?? "",
    pictureUrl: "",
    maxStepsPerRun: 3,
    tags: [],
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    canRead: true,
    canEdit: true,
    instructionsHtml: input.instructionsHtml ?? null,
    actions: (input.tools ?? []).map(makeAction),
  };
}

function buildPromptForTestCase(testCase: TestCase): {
  systemPrompt: string;
  userMessage: string;
} {
  const agentConfig = makeAgentConfig(testCase.agentConfig);
  const agentSkills = testCase.agentConfig.skills ?? [];

  if (isAnalysisTestCase(testCase)) {
    const conversationText = buildConversationText(testCase.conversation);
    return buildAnalysisPrompt(agentConfig, conversationText, agentSkills);
  }
  return buildAggregationPrompt(
    agentConfig,
    testCase.syntheticSuggestions,
    testCase.existingSuggestions ?? { pending: [], rejected: [] },
    agentSkills
  );
}

function extractFromEvents(events: LLMEvent[]): ExecutionResult {
  const toolCalls: ToolCall[] = [];
  let responseText = "";

  for (const event of events) {
    switch (event.type) {
      case "text_delta":
        responseText += event.content.delta;
        break;
      case "text_generated":
        responseText = event.content.text;
        break;
      case "tool_call":
        toolCalls.push({
          name: event.content.name,
          arguments: event.content.arguments,
        });
        break;
      case "error":
        throw new Error(`Reinforced agent LLM error: ${event.content.message}`);
      default:
        break;
    }
  }

  return { toolCalls, responseText };
}

/**
 * Simulate an exploratory tool call using the test case's workspace context.
 */
function simulateExploratoryTool(
  toolName: ExploratoryToolName,
  workspaceContext: WorkspaceContext
): string {
  switch (toolName) {
    case "get_available_skills":
      return formatAvailableSkills(
        workspaceContext.skills,
        workspaceContext.tools
      );
    case "get_available_tools":
      return formatAvailableTools(workspaceContext.tools);
    default:
      assertNever(toolName);
  }
}

/**
 * Run a multi-step LLM conversation. After each LLM call, if exploratory tools
 * are called, simulate their responses from workspace context and continue.
 * Returns accumulated tool calls from all steps.
 */
async function executeMultiStep(
  llm: LLM,
  initialParams: LLMStreamParameters,
  workspaceContext: WorkspaceContext
): Promise<ExecutionResult> {
  const allToolCalls: ToolCall[] = [];
  let lastResponseText = "";
  let currentParams = initialParams;

  for (let step = 0; step < MAX_REINFORCED_ANALYSIS_STEPS; step++) {
    const events: LLMEvent[] = [];
    for await (const event of llm.stream(currentParams)) {
      events.push(event);
    }

    const stepResult = extractFromEvents(events);
    allToolCalls.push(...stepResult.toolCalls);
    lastResponseText = stepResult.responseText;

    const { exploratoryToolCalls } = classifyToolCalls(events);

    // If no exploratory tools were called, we're done.
    if (exploratoryToolCalls.length === 0) {
      return { toolCalls: allToolCalls, responseText: lastResponseText };
    }

    // Simulate exploratory tool responses from workspace context.
    const toolResults: Record<string, string> = {};
    for (const tc of exploratoryToolCalls) {
      toolResults[tc.id] = simulateExploratoryTool(tc.name, workspaceContext);
    }

    // Build continuation messages and extend conversation.
    const continuationMessages = buildContinuationMessages(
      exploratoryToolCalls,
      toolResults
    );

    currentParams = {
      ...currentParams,
      conversation: {
        messages: [
          ...currentParams.conversation.messages,
          ...continuationMessages,
        ],
      },
    };
  }

  return { toolCalls: allToolCalls, responseText: lastResponseText };
}

async function getLLMInstance(auth: Authenticator): Promise<LLM> {
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const llm = await getLLM(auth, {
    credentials,
    modelId: MODEL_ID,
    bypassFeatureFlag: true,
  });
  if (!llm) {
    throw new Error(
      `Failed to initialize LLM for reinforced agent eval (model: ${MODEL_ID})`
    );
  }
  return llm;
}

export async function executeReinforced(
  auth: Authenticator,
  testCase: TestCase
): Promise<ExecutionResult> {
  const llm = await getLLMInstance(auth);
  const prompt = buildPromptForTestCase(testCase);
  const params = buildReinforcedLLMParams(prompt);

  return executeMultiStep(llm, params, testCase.workspaceContext);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function submitAndWaitForBatch(
  llm: LLM,
  batchMap: Map<string, LLMStreamParameters>
): Promise<BatchResultWithRunIds> {
  const batchId = await llm.sendBatchProcessing(batchMap);

  let status = await llm.getBatchStatus(batchId);
  while (status === "computing") {
    await sleep(BATCH_POLL_INTERVAL_MS);
    status = await llm.getBatchStatus(batchId);
  }

  if (status === "aborted") {
    throw new Error(`LLM batch was aborted (batchId: ${batchId})`);
  }

  return llm.getBatchResult(batchId);
}

export async function executeBatch(
  auth: Authenticator,
  testCases: CategorizedTestCase[]
): Promise<Map<string, ExecutionResult>> {
  const llm = await getLLMInstance(auth);

  const testCaseById = new Map<string, CategorizedTestCase>();
  for (const tc of testCases) {
    testCaseById.set(tc.scenarioId, tc);
  }

  // Build initial params for all test cases.
  let pendingParams = new Map<string, LLMStreamParameters>();
  for (const tc of testCases) {
    const prompt = buildPromptForTestCase(tc);
    pendingParams.set(tc.scenarioId, buildReinforcedLLMParams(prompt));
  }

  const results = new Map<string, ExecutionResult>();
  // Accumulate tool calls across steps for each scenario.
  const accumulatedToolCalls = new Map<string, ToolCall[]>();
  let step = 0;

  while (step < MAX_REINFORCED_ANALYSIS_STEPS && pendingParams.size > 0) {
    const batchResult = await submitAndWaitForBatch(llm, pendingParams);

    const nextPendingParams = new Map<string, LLMStreamParameters>();

    for (const [scenarioId, { events }] of batchResult) {
      const stepResult = extractFromEvents(events);
      const prev = accumulatedToolCalls.get(scenarioId) ?? [];
      const allToolCalls = [...prev, ...stepResult.toolCalls];
      accumulatedToolCalls.set(scenarioId, allToolCalls);

      const { exploratoryToolCalls } = classifyToolCalls(events);

      if (exploratoryToolCalls.length === 0) {
        // Terminal — done for this scenario.
        results.set(scenarioId, {
          toolCalls: allToolCalls,
          responseText: stepResult.responseText,
        });
      } else {
        // Simulate tool responses and prepare continuation params.
        const tc = testCaseById.get(scenarioId)!;
        const toolResultsMap: Record<string, string> = {};
        for (const toolCall of exploratoryToolCalls) {
          toolResultsMap[toolCall.id] = simulateExploratoryTool(
            toolCall.name,
            tc.workspaceContext
          );
        }

        const continuationMessages = buildContinuationMessages(
          exploratoryToolCalls,
          toolResultsMap
        );

        const currentParams = pendingParams.get(scenarioId)!;
        nextPendingParams.set(scenarioId, {
          ...currentParams,
          conversation: {
            messages: [
              ...currentParams.conversation.messages,
              ...continuationMessages,
            ],
          },
        });
      }
    }

    pendingParams = nextPendingParams;
    step++;
  }

  // Any scenarios still pending after max steps — return what we have.
  for (const [scenarioId] of pendingParams) {
    const allToolCalls = accumulatedToolCalls.get(scenarioId) ?? [];
    results.set(scenarioId, { toolCalls: allToolCalls, responseText: "" });
  }

  return results;
}
