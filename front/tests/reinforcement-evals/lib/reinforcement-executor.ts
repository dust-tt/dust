import {
  formatAvailableTools,
  formatMcpDescription,
} from "@app/lib/api/assistant/global_agents/sidekick_context";
import {
  getBatchLLM,
  getStreamLLM,
  legacyModelIdToModel,
} from "@app/lib/api/llm";
import type { LLM } from "@app/lib/api/llm/llm";
import {
  selectPreferredBatchEndpointForWorkspace,
  selectPreferredStreamEndpointForWorkspace,
} from "@app/lib/api/llm/selectPreferredEndpointForWorkspace";
import type { BatchResultWithRunIds } from "@app/lib/api/llm/types/batch";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type {
  LLMParameters,
  LLMStreamParameters,
} from "@app/lib/api/llm/types/options";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import type { DustBatchEndpointConstructor } from "@app/lib/llms/batch/dust_batch_endpoint";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type { EndpointConfig, Where } from "@app/lib/llms/types/filter";
import type { Model } from "@app/lib/model_constructors/types/models";
import { buildSkillAggregationPrompt } from "@app/lib/reinforcement/aggregate_suggestions";
import { buildSkillAnalysisPrompt } from "@app/lib/reinforcement/analyze_conversation";
import { MAX_REINFORCED_ANALYSIS_STEPS } from "@app/lib/reinforcement/constants";
import { formatSkillContext } from "@app/lib/reinforcement/format_skill_context";
import {
  buildReinforcedSkillsLLMParams,
  classifySkillToolCalls,
} from "@app/lib/reinforcement/run_reinforced_analysis";
import { convertMarkdownToBlockHtml } from "@app/lib/reinforcement/skill_instructions_html";
import {
  DESCRIBE_MCP_TOOL_NAME,
  DESCRIBE_SKILL_TOOL_NAME,
  isExploratoryToolName,
} from "@app/lib/reinforcement/types";
import { buildContinuationMessages } from "@app/lib/reinforcement/utils";
import {
  BATCH_POLL_INTERVAL_MS,
  MODEL_ID,
  VERBOSE,
} from "@app/tests/reinforcement-evals/lib/config";
import type {
  CategorizedTestCase,
  ExecutionResult,
  MockMcpDescription,
  MockSearchKnowledgeNode,
  MockSkillConfig,
  TestCase,
  ToolCall,
  WorkspaceContext,
} from "@app/tests/reinforcement-evals/lib/types";
import {
  buildConversationText,
  isAggregationTestCase,
  isAnalysisTestCase,
} from "@app/tests/reinforcement-evals/lib/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { isString } from "@app/types/shared/utils/general";

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
    instructionsHtml: config.instructions
      ? convertMarkdownToBlockHtml(config.instructions)
      : null,
    icon: null,
    source: null,
    sourceMetadata: null,
    reinforcement: "auto",
    selfImprovementLock: false,
    selfImprovementCostsCapMicroUsd: null,
    selfImprovementCostsCapAwuCredits: null,
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
      isRestrictedToSkills: false,
    })),
    fileAttachments: [],
    canWrite: false,
    canRead: true,
    canAdministrate: false,
    isDefault: false,
    availability: "workspace_users",
  };
}

/**
 * Build the effective workspace context by merging the test case's skill configs
 * into workspaceContext.skillConfigs, so describe_skill can resolve them.
 */
function buildEffectiveWorkspaceContext(testCase: TestCase): WorkspaceContext {
  const testSkillConfigs = isAnalysisTestCase(testCase)
    ? testCase.skillConfigs
    : [testCase.skillConfig];

  const existingSkillIds = new Set(
    (testCase.workspaceContext.skillConfigs ?? []).map((s) => s.sId)
  );
  const newSkillConfigs = testSkillConfigs.filter(
    (s) => !existingSkillIds.has(s.sId)
  );

  if (newSkillConfigs.length === 0) {
    return testCase.workspaceContext;
  }

  return {
    ...testCase.workspaceContext,
    skillConfigs: [
      ...(testCase.workspaceContext.skillConfigs ?? []),
      ...newSkillConfigs,
    ],
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

function mockDescriptionToFormatInput(
  mcpName: string,
  desc: MockMcpDescription
) {
  return {
    name: mcpName,
    description: desc.description,
    tools: (desc.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema:
        t.inputs && t.inputs.length > 0
          ? {
              type: "object",
              properties: Object.fromEntries(
                t.inputs.map((i) => [
                  i.name,
                  {
                    type: i.type,
                    ...(i.description ? { description: i.description } : {}),
                  },
                ])
              ),
              required: t.inputs
                .filter((i) => i.required !== false)
                .map((i) => i.name),
            }
          : undefined,
    })),
  };
}

/**
 * Simulate an exploratory tool call using the test case's workspace context.
 */
function simulateExploratoryTool(
  toolName: string,
  args: Record<string, unknown>,
  workspaceContext: WorkspaceContext
): string {
  if (!isExploratoryToolName(toolName)) {
    throw new Error(`Unknown exploratory tool: ${toolName}`);
  }

  switch (toolName) {
    case "get_available_tools":
      return formatAvailableTools(workspaceContext.tools);
    case DESCRIBE_MCP_TOOL_NAME: {
      const mcpId = args["mcpId"];
      if (!isString(mcpId)) {
        return "Error: mcpId parameter is required";
      }
      const desc = workspaceContext.mcpDescriptions?.find(
        (d) => d.sId === mcpId
      );
      if (!desc) {
        return `MCP server not found: ${mcpId}`;
      }
      const mcpName =
        workspaceContext.tools.find((t) => t.sId === mcpId)?.name ?? mcpId;
      return formatMcpDescription(
        mcpId,
        mockDescriptionToFormatInput(mcpName, desc)
      );
    }
    case DESCRIBE_SKILL_TOOL_NAME: {
      const skillId = args["skillId"];
      if (!isString(skillId)) {
        return "Error: skillId parameter is required";
      }
      const skillConfig = workspaceContext.skillConfigs?.find(
        (s) => s.sId === skillId
      );
      if (!skillConfig) {
        return `Skill not found: ${skillId}`;
      }
      return formatSkillContext(makeSkillType(skillConfig));
    }
    case "search_knowledge": {
      const nodes = workspaceContext.searchKnowledgeNodes ?? [];
      const dsvMap = new Map<string, MockSearchKnowledgeNode>();
      for (const node of nodes) {
        if (!dsvMap.has(node.dataSourceViewId)) {
          dsvMap.set(node.dataSourceViewId, node);
        }
      }
      const dataSourceViews = [...dsvMap.values()].map((n) => ({
        dataSourceViewId: n.dataSourceViewId,
        name: n.title,
        connectorProvider: n.connectorProvider ?? null,
        category: "folder",
        spaceId: n.spaceId,
        childrenCount: nodes.filter(
          (x) => x.dataSourceViewId === n.dataSourceViewId
        ).length,
      }));
      return JSON.stringify({ dataSourceViews, nodes }, null, 2);
    }
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
  workspaceContext: WorkspaceContext,
  scenarioId: string
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
    if (VERBOSE && exploratoryToolCalls.length > 0) {
      console.log(
        `[${scenarioId}] Exploratory tool calls input:`,
        JSON.stringify(exploratoryToolCalls, null, 2)
      );
    }

    // If no exploratory tools were called, we're done.
    if (exploratoryToolCalls.length === 0) {
      return { toolCalls: allToolCalls, responseText: lastResponseText };
    }

    // Simulate exploratory tool responses from workspace context.
    const toolResults: Record<string, string> = {};
    for (const tc of exploratoryToolCalls) {
      toolResults[tc.id] = simulateExploratoryTool(
        tc.name,
        tc.arguments,
        workspaceContext
      );
    }
    if (VERBOSE && exploratoryToolCalls.length > 0) {
      console.log(
        `[${scenarioId}] Exploratory tool calls output:`,
        JSON.stringify(toolResults, null, 2)
      );
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

async function getBatchLLMInstance(
  auth: Authenticator,
  credentials: LLMCredentialsType,
  model: Model
): Promise<LLM> {
  const filter: Where<EndpointConfig> = {
    model: { eq: model },
  };
  const endpoint = await selectPreferredBatchEndpointForWorkspace(auth, filter);

  if (!endpoint) {
    throw new Error(
      `Failed to get endpoint for reinforcement eval (batch model: ${model})`
    );
  }

  const llmParameters: LLMParameters<DustBatchEndpointConstructor> = {
    credentials,
    modelInfo: { endpoint },
    bypassFeatureFlag: true,
  };

  const llm = await getBatchLLM(auth, llmParameters);
  if (!llm) {
    throw new Error(
      `Failed to initialize LLM for reinforcement eval (batch model: ${model})`
    );
  }

  return llm;
}

async function getStreamLLMInstance(
  auth: Authenticator,
  credentials: LLMCredentialsType,
  model: Model
): Promise<LLM<DustStreamEndpointConstructor>> {
  const filter: Where<EndpointConfig> = {
    model: { eq: model },
  };
  const endpoint = await selectPreferredStreamEndpointForWorkspace(
    auth,
    filter
  );

  if (!endpoint) {
    throw new Error(
      `Failed to get endpoint for reinforcement eval (stream model: ${model})`
    );
  }

  const llmParameters: LLMParameters<DustStreamEndpointConstructor> = {
    credentials,
    modelInfo: { endpoint },
    bypassFeatureFlag: true,
  };

  const llm = await getStreamLLM(auth, llmParameters);
  if (!llm) {
    throw new Error(
      `Failed to initialize LLM for reinforcement eval (stream model: ${model})`
    );
  }

  return llm;
}

async function getLLMInstance(
  auth: Authenticator,
  surface: "stream" | "batch" = "stream"
): Promise<LLM> {
  const model = legacyModelIdToModel(MODEL_ID);
  if (!model) {
    throw new Error(`Unknown model for reinforcement eval: ${MODEL_ID}`);
  }

  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });

  switch (surface) {
    case "stream":
      return getStreamLLMInstance(auth, credentials, model);
    case "batch":
      return getBatchLLMInstance(auth, credentials, model);
    default:
      assertNever(surface);
  }
}

export async function executeReinforced(
  auth: Authenticator,
  testCase: TestCase
): Promise<ExecutionResult> {
  const llm = await getLLMInstance(auth);
  const prompt = buildPromptForTestCase(testCase);
  const operationType = isAggregationTestCase(testCase)
    ? "reinforcement_aggregate_suggestions"
    : "reinforcement_analyze_conversation";
  const params = buildReinforcedSkillsLLMParams(prompt, operationType);

  return executeMultiStep(
    llm,
    params,
    buildEffectiveWorkspaceContext(testCase),
    testCase.scenarioId
  );
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
  const llm = await getLLMInstance(auth, "batch");

  const effectiveContextById = new Map<string, WorkspaceContext>();
  for (const tc of testCases) {
    effectiveContextById.set(tc.scenarioId, buildEffectiveWorkspaceContext(tc));
  }

  // Build initial params for all test cases.
  let pendingParams = new Map<string, LLMStreamParameters>();
  for (const tc of testCases) {
    const prompt = buildPromptForTestCase(tc);
    const operationType = isAggregationTestCase(tc)
      ? "reinforcement_aggregate_suggestions"
      : "reinforcement_analyze_conversation";
    pendingParams.set(
      tc.scenarioId,
      buildReinforcedSkillsLLMParams(prompt, operationType)
    );
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
        if (VERBOSE) {
          console.log(
            `[${scenarioId}] Exploratory tool calls inputs:`,
            JSON.stringify(exploratoryToolCalls, null, 2)
          );
        }
        // Simulate tool responses and prepare continuation params.
        const effectiveContext = effectiveContextById.get(scenarioId)!;
        const toolResultsMap: Record<string, string> = {};
        for (const toolCall of exploratoryToolCalls) {
          toolResultsMap[toolCall.id] = simulateExploratoryTool(
            toolCall.name,
            toolCall.arguments,
            effectiveContext
          );
        }
        if (VERBOSE) {
          console.log(
            `[${scenarioId}] Exploratory tool calls results:`,
            JSON.stringify(toolResultsMap, null, 2)
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
