import { formatAvailableTools } from "@app/lib/api/assistant/global_agents/sidekick_context";
import { getLLM } from "@app/lib/api/llm";
import type { LLM } from "@app/lib/api/llm/llm";
import type { BatchResultWithRunIds } from "@app/lib/api/llm/types/batch";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import type { ExploratoryToolCallInfo as AgentExploratoryToolCallInfo } from "@app/lib/reinforced_agent/types";
import { buildContinuationMessages } from "@app/lib/reinforced_agent/utils";
import { buildSkillAggregationPrompt } from "@app/lib/reinforcement/aggregate_suggestions";
import { buildSkillAnalysisPrompt } from "@app/lib/reinforcement/analyze_conversation";
import { MAX_REINFORCED_ANALYSIS_STEPS } from "@app/lib/reinforcement/constants";
import {
  buildReinforcedSkillsLLMParams,
  classifySkillToolCalls,
} from "@app/lib/reinforcement/run_reinforced_analysis";
import {
  BATCH_POLL_INTERVAL_MS,
  MODEL_ID,
} from "@app/tests/reinforcement-evals/lib/config";
import {
  buildConversationText,
  type CategorizedTestCase,
  type ExecutionResult,
  isAnalysisTestCase,
  type MockSkillConfig,
  type TestCase,
  type ToolCall,
  type WorkspaceContext,
} from "@app/tests/reinforcement-evals/lib/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

function makeSkillType(config: MockSkillConfig): SkillType {
  return {
    id: 0,
    sId: config.sId,
    createdAt: null,
    updatedAt: null,
    editedBy: null,
    status: "active",
    name: config.name,
    agentFacingDescription: config.description ?? "",
    userFacingDescription: config.description ?? "",
    instructions: config.instructions ?? null,
    icon: null,
    source: null,
    sourceMetadata: null,
    requestedSpaceIds: [],
    tools: (config.tools ?? []).map((t) => ({
      id: 0,
      sId: t.sId,
      name: t.name,
      description: null,
      createdAt: 0,
      updatedAt: 0,
      spaceId: "space_eval",
      serverType: "remote" as const,
      server: {
        name: t.name,
        version: "1.0.0",
        description: t.name,
        sId: t.sId,
        icon: "PuzzleIcon" as const,
        authorization: null,
        tools: [],
        availability: "manual" as const,
        allowMultipleInstances: false,
        documentationUrl: null,
      },
      oAuthUseCase: null,
      editedByUser: null,
    })),
    fileAttachments: [],
    canWrite: false,
    isExtendable: false,
    isDefault: false,
    extendedSkillId: null,
  };
}

function buildPromptForTestCase(testCase: TestCase): {
  systemPrompt: string;
  userMessage: string;
} {
  if (isAnalysisTestCase(testCase)) {
    const skillTypes = testCase.skillConfigs.map(makeSkillType);
    const conversationText = buildConversationText(testCase.conversation);
    return buildSkillAnalysisPrompt(conversationText, skillTypes);
  }
  const skillType = makeSkillType(testCase.skillConfig);
  return buildSkillAggregationPrompt(
    skillType,
    testCase.syntheticSuggestions,
    testCase.existingSuggestions ?? { pending: [], rejected: [] }
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
        throw new Error(
          `Reinforced skills LLM error: ${event.content.message}`
        );
      default:
        break;
    }
  }

  return { toolCalls, responseText };
}

/**
 * Simulate an exploratory tool call using the test case's workspace context.
 */
function simulateExploratoryTool(workspaceContext: WorkspaceContext): string {
  // The skills pipeline only has one exploratory tool: get_available_tools.
  return formatAvailableTools(workspaceContext.tools);
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

    const { exploratoryToolCalls } = classifySkillToolCalls(events);

    // If no exploratory tools were called, we're done.
    if (exploratoryToolCalls.length === 0) {
      return { toolCalls: allToolCalls, responseText: lastResponseText };
    }

    // Simulate exploratory tool responses from workspace context.
    const toolResults: Record<string, string> = {};
    for (const tc of exploratoryToolCalls) {
      toolResults[tc.id] = simulateExploratoryTool(workspaceContext);
    }

    // Build continuation messages and extend conversation.
    // The ExploratoryToolCallInfo shapes are compatible between the two modules.
    // The skills ExploratoryToolCallInfo has the same shape as the agent one
    // (name is a subset: "get_available_tools" vs "get_available_tools" | "get_available_skills").
    const continuationMessages = buildContinuationMessages(
      exploratoryToolCalls as AgentExploratoryToolCallInfo[],
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
      `Failed to initialize LLM for reinforcement eval (model: ${MODEL_ID})`
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
  const params = buildReinforcedSkillsLLMParams(prompt);

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
    pendingParams.set(tc.scenarioId, buildReinforcedSkillsLLMParams(prompt));
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

      const { exploratoryToolCalls } = classifySkillToolCalls(events);

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
            tc.workspaceContext
          );
        }

        const continuationMessages = buildContinuationMessages(
          exploratoryToolCalls as unknown as Parameters<
            typeof buildContinuationMessages
          >[0],
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
