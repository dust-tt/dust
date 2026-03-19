import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { getLLM } from "@app/lib/api/llm";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { buildAggregationPrompt } from "@app/lib/reinforced_agent/aggregate_suggestions";
import { buildAnalysisPrompt } from "@app/lib/reinforced_agent/analyze_conversation";
import { buildReinforcedLLMParams } from "@app/lib/reinforced_agent/run_reinforced_analysis";
import {
  BATCH_POLL_INTERVAL_MS,
  MODEL_ID,
} from "@app/tests/reinforced-agent-evals/lib/config";
import {
  buildConversationText,
  buildToolsAndSkillsContextFromWorkspace,
  type CategorizedTestCase,
  type ExecutionResult,
  isAnalysisTestCase,
  type MockAgentConfig,
  type TestCase,
  type ToolCall,
} from "@app/tests/reinforced-agent-evals/lib/types";
import type { AgentConfigurationType } from "@app/types/assistant/agent";

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
  const toolsAndSkillsContext = buildToolsAndSkillsContextFromWorkspace(
    testCase.workspaceContext
  );
  const agentConfig = makeAgentConfig(testCase.agentConfig);
  const agentSkills = testCase.agentConfig.skills ?? [];

  if (isAnalysisTestCase(testCase)) {
    const conversationText = buildConversationText(testCase.conversation);
    return buildAnalysisPrompt(
      agentConfig,
      conversationText,
      toolsAndSkillsContext,
      agentSkills
    );
  }
  return buildAggregationPrompt(
    agentConfig,
    testCase.syntheticSuggestions,
    testCase.existingSuggestions ?? { pending: [], rejected: [] },
    toolsAndSkillsContext,
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

  const events: LLMEvent[] = [];
  for await (const event of llm.stream(params)) {
    events.push(event);
  }

  return extractFromEvents(events);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeBatch(
  auth: Authenticator,
  testCases: CategorizedTestCase[]
): Promise<Map<string, ExecutionResult>> {
  const llm = await getLLMInstance(auth);

  const batchMap = new Map<
    string,
    ReturnType<typeof buildReinforcedLLMParams>
  >();
  for (const tc of testCases) {
    const prompt = buildPromptForTestCase(tc);
    batchMap.set(tc.scenarioId, buildReinforcedLLMParams(prompt));
  }

  const batchId = await llm.sendBatchProcessing(batchMap);

  let status = await llm.getBatchStatus(batchId);
  while (status === "computing") {
    await sleep(BATCH_POLL_INTERVAL_MS);
    status = await llm.getBatchStatus(batchId);
  }

  if (status === "aborted") {
    throw new Error(`LLM batch was aborted (batchId: ${batchId})`);
  }

  const batchResult = await llm.getBatchResult(batchId);

  const results = new Map<string, ExecutionResult>();
  for (const tc of testCases) {
    const events = batchResult.get(tc.scenarioId);
    if (!events) {
      throw new Error(
        `No batch result for scenario "${tc.scenarioId}" (batchId: ${batchId})`
      );
    }
    results.set(tc.scenarioId, extractFromEvents(events));
  }

  return results;
}
