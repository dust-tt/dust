import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getShrinkWrappedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import type { LlmConversationOptions } from "@app/lib/api/llm/batch_llm";
import {
  downloadBatchResultFromLlm,
  sendBatchCallToLlm,
  storeLlmResult,
} from "@app/lib/api/llm/batch_llm";
import type { BatchStatus } from "@app/lib/api/llm/types/batch";
import type { LLMEvent } from "@app/lib/api/llm/types/events";
import type { LLMStreamParameters } from "@app/lib/api/llm/types/options";
import { Authenticator } from "@app/lib/auth";
import { notifyAgentSuggestionsReady } from "@app/lib/notifications/workflows/agent-suggestions-ready";
import {
  buildAggregationBatchMap,
  buildAggregationSystemPrompt,
  createAgentSuggestionsConversations,
  loadAggregationContext,
} from "@app/lib/reinforced_agent/aggregate_suggestions";
import {
  buildAnalysisPrompt,
  buildAnalysisSystemPrompt,
  buildConversationAnalysisBatchMap,
} from "@app/lib/reinforced_agent/analyze_conversation";
import {
  DEFAULT_MAX_CONVERSATIONS_PER_AGENT,
  DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
} from "@app/lib/reinforced_agent/constants";
import {
  buildReinforcedSpecifications,
  classifyToolCalls,
  createReinforcementConversation,
  getReinforcedLLM,
  getReinforcementDefaultOptions,
  processReinforcedEvents,
  REINFORCEMENT_AGENT_ID,
  reinforcementConversationTitle,
} from "@app/lib/reinforced_agent/run_reinforced_analysis";
import { selectAgentsForReinforcementPipeline } from "@app/lib/reinforced_agent/selection";
import {
  prepareReinforcedToolActions,
  type ReinforcedToolActionInfo,
  storeTerminalToolCallResults,
} from "@app/lib/reinforced_agent/tool_execution";
import type { ReinforcedOperationType } from "@app/lib/reinforced_agent/types";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { updateActiveTrace } from "@langfuse/tracing";
import { ApplicationFailure } from "@temporalio/common";

// Re-export runToolActivity so the reinforced agent worker registers it,
// allowing the workflow to call it via proxyActivities.
export { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

async function getAuthForWorkspace(
  workspaceId: string
): Promise<Authenticator> {
  const workspace = await WorkspaceResource.fetchById(workspaceId);
  if (!workspace) {
    throw ApplicationFailure.nonRetryable(
      `Workspace not found: ${workspaceId}`
    );
  }
  return Authenticator.internalAdminForWorkspace(workspaceId);
}

/**
 * Common logic for a single reinforced step (analysis or aggregation).
 *
 * Fetches the reinforcement conversation, renders it for the LLM, streams the
 * response, stores the result, and classifies tool calls. Terminal tool calls
 * are processed into suggestions; exploratory tool calls are returned for the
 * workflow to execute.
 */
async function runReinforcedStep({
  auth,
  agentConfig,
  reinforcementConversationId,
  operationType,
  systemPrompt,
  contextId,
  source,
  conversationId,
}: {
  auth: Authenticator;
  agentConfig: LightAgentConfigurationType;
  reinforcementConversationId: string;
  operationType: ReinforcedOperationType;
  systemPrompt: string;
  contextId: string;
  source: "synthetic" | "reinforcement";
  /** When provided, fetches this conversation and passes it to processReinforcedEvents. */
  conversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const llm = await getReinforcedLLM(auth, operationType);
  if (!llm) {
    logger.error(
      { contextId },
      "ReinforcedAgent: no LLM available for step activity"
    );
    return { isTerminal: true, suggestionsCreated: 0 };
  }

  const conversationRes = await getConversation(
    auth,
    reinforcementConversationId
  );
  if (conversationRes.isErr()) {
    throw conversationRes.error;
  }

  const specifications = buildReinforcedSpecifications();
  const modelConfig = llm.getModelConfig();
  const toolsJson = JSON.stringify(
    specifications.map((s) => ({
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
    }))
  );

  const renderResult = await renderConversationForModel(auth, {
    conversation: conversationRes.value,
    model: modelConfig,
    prompt: systemPrompt,
    tools: toolsJson,
    allowedTokenCount:
      modelConfig.contextSize - modelConfig.generationTokensCount,
  });
  if (renderResult.isErr()) {
    throw renderResult.error;
  }

  const llmParams: LLMStreamParameters = {
    conversation: renderResult.value.modelConversation,
    prompt: systemPrompt,
    specifications,
  };

  const events: LLMEvent[] = [];
  for await (const event of llm.stream(llmParams)) {
    events.push(event);
  }

  // Store agent response in the reinforcement conversation.
  const reinforcementConv = await ConversationResource.fetchById(
    auth,
    reinforcementConversationId
  );
  if (!reinforcementConv) {
    throw new Error(
      `Reinforcement conversation not found: ${reinforcementConversationId}`
    );
  }

  const storedResult = await storeLlmResult(
    auth,
    reinforcementConv,
    events,
    REINFORCEMENT_AGENT_ID,
    { runIds: [llm.getTraceId()] }
  );

  const { exploratoryToolCalls, terminalToolCalls } = classifyToolCalls(events);

  // If terminal tools were called, process suggestions.
  if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
    if (terminalToolCalls.length > 0 && exploratoryToolCalls.length > 0) {
      logger.warn(
        { contextId },
        "ReinforcedAgent: LLM is sending both terminal and exploratory tool call."
      );
    }

    // For analysis, fetch the analyzed conversation to store FK reference.
    let conversation: ConversationResource | undefined;
    if (conversationId) {
      conversation =
        (await ConversationResource.fetchById(auth, conversationId)) ??
        undefined;
    }

    const result = await processReinforcedEvents({
      auth,
      agentConfig,
      events,
      source,
      operationType,
      contextId,
      conversation,
    });

    // Store results for all terminal tool calls so the conversation is complete.
    await storeTerminalToolCallResults(auth, {
      successfulToolCalls: result.successfulToolCalls,
      failedToolCalls: result.failedToolCalls,
      agentMessageModelId: storedResult.agentMessageModelId,
    });

    // If any failed, let the LLM retry on the next step.
    if (result.failedToolCalls.length > 0) {
      return {
        isTerminal: false,
        suggestionsCreated: result.suggestionsCreated,
        reinforcementConversationId,
      };
    }

    return {
      isTerminal: true,
      suggestionsCreated: result.suggestionsCreated,
      reinforcementConversationId,
    };
  }

  // Prepare tool actions for the workflow to execute via runRetryableToolActivity.
  const toolActionInfo = await prepareReinforcedToolActions(auth, {
    exploratoryToolCalls,
    agentMessageModelId: storedResult.agentMessageModelId,
    agentMessageId: storedResult.agentMessageSId,
    userMessageId: storedResult.userMessageSId,
    conversationId: reinforcementConversationId,
  });

  return {
    isTerminal: false,
    suggestionsCreated: 0,
    reinforcementConversationId,
    toolActionInfo,
  };
}

/**
 * Selects agent configuration sIds and per-agent conversation budgets for this
 * workspace run.
 */
export async function getAgentConfigurationsActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<{ agentConfigurationId: string; conversationsToSample: number }[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  const agents = await getAgentConfigurationsForView({
    auth,
    agentsGetView: "published",
    variant: "extra_light",
  });

  return selectAgentsForReinforcementPipeline(auth, agents, {});
}

/**
 * List recent conversation sIds that involved a specific agent.
 */
export async function getRecentConversationsForAgentActivity({
  workspaceId,
  agentConfigurationId,
  conversationLookbackDays = DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
  maxConversations = DEFAULT_MAX_CONVERSATIONS_PER_AGENT,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  conversationLookbackDays?: number;
  maxConversations?: number;
}): Promise<string[]> {
  updateActiveTrace({
    name: "Reinforced Agent Workflow",
    metadata: { agentConfigurationId },
  });

  const auth = await getAuthForWorkspace(workspaceId);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - conversationLookbackDays);

  const convSIdsByAgent = await ConversationResource.getConversationSIdsByAgent(
    auth,
    {
      agentSIds: [agentConfigurationId],
      cutoffDate,
      excludeHumanOutOfTheLoop: true,
    }
  );
  const conversationSIds = convSIdsByAgent.get(agentConfigurationId) ?? [];
  // TODO(https://github.com/dust-tt/tasks/issues/7313): This is a placeholder for the actual sampling logic
  return conversationSIds.slice(0, maxConversations);
}

/**
 * Analyze a single conversation step for reinforcement.
 *
 * On the first step (`reinforcementConversationId` is undefined), creates a
 * reinforcement conversation and stores the analysis prompt as the user message.
 *
 * On continuation steps, the reinforcement conversation already contains the full
 * history (user message, previous LLM tool calls, tool results stored by
 * runRetryableToolActivity). The conversation is rendered from DB via
 * `renderConversationForModel`.
 *
 * Returns `isTerminal: true` when the LLM calls terminal suggestion tools.
 * Otherwise returns `toolActionInfo` for the workflow to execute tools.
 */
export async function analyzeConversationStepActivity({
  workspaceId,
  agentConfigurationId,
  conversationId,
  reinforcementConversationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  conversationId: string;
  reinforcementConversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);
  const owner = auth.getNonNullableWorkspace();

  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "full",
  });
  if (!agentConfig || agentConfig.id < 0) {
    logger.warn(
      { agentConfigurationId, workspaceId: owner.sId },
      "ReinforcedAgent: agent configuration not found for step activity"
    );
    return { isTerminal: true, suggestionsCreated: 0 };
  }

  // On first step, build the analysis prompt and create a reinforcement conversation.
  if (!reinforcementConversationId) {
    const [conversationRes, agentSkills] = await Promise.all([
      getShrinkWrappedConversation(auth, {
        conversationId,
        includeFeedback: true,
      }),
      SkillResource.listByAgentConfiguration(auth, agentConfig),
    ]);
    if (conversationRes.isErr()) {
      logger.warn(
        { conversationId },
        "ReinforcedAgent: conversation not found for step activity"
      );
      return { isTerminal: true, suggestionsCreated: 0 };
    }

    const prompt = buildAnalysisPrompt(
      agentConfig,
      conversationRes.value.text,
      agentSkills
    );
    reinforcementConversationId = await createReinforcementConversation(auth, {
      prompt,
      operationType: "reinforced_agent_analyze_conversation",
      contextId: conversationId,
      agentConfigurationId,
    });
  }

  return runReinforcedStep({
    auth,
    agentConfig,
    reinforcementConversationId,
    operationType: "reinforced_agent_analyze_conversation",
    systemPrompt: buildAnalysisSystemPrompt(),
    contextId: conversationId,
    source: "synthetic",
    conversationId,
  });
}

/**
 * Finalize aggregation: send notifications and mark synthetic suggestions as approved.
 * Called by the workflow after the aggregation multi-step loop completes.
 */
export async function finalizeAggregationActivity({
  workspaceId,
  agentConfigurationId,
  suggestionsCreated,
  disableNotifications,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  suggestionsCreated: number;
  disableNotifications: boolean;
}): Promise<void> {
  const auth = await getAuthForWorkspace(workspaceId);

  if (suggestionsCreated > 0 && !disableNotifications) {
    const [agentConfig] = await getAgentConfigurations(auth, {
      agentIds: [agentConfigurationId],
      variant: "light",
    });
    if (agentConfig) {
      notifyAgentSuggestionsReady(auth, {
        agentConfiguration: agentConfig,
        suggestionCount: suggestionsCreated,
      });
      await createAgentSuggestionsConversations(auth, agentConfig);
    }
  }

  // Mark all synthetic suggestions as approved (consumed by aggregation).
  const syntheticSuggestions =
    await AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId,
      { sources: ["synthetic"], states: ["pending"] }
    );

  await AgentSuggestionResource.bulkUpdateState(
    auth,
    syntheticSuggestions,
    "approved"
  );

  logger.info(
    {
      agentConfigurationId,
      syntheticCount: syntheticSuggestions.length,
      pendingCreated: suggestionsCreated,
    },
    "ReinforcedAgent: finalized aggregation"
  );
}

/**
 * Single step of aggregation for reinforcement (streaming mode).
 *
 * Mirrors `analyzeConversationStepActivity` but for the aggregation phase.
 * On the first step, loads the aggregation context (synthetic suggestions,
 * agent config, etc.) and creates a reinforcement conversation.
 * On continuation steps, re-renders from DB (which includes previous tool results).
 *
 * Returns `isTerminal: true` when the LLM calls terminal suggestion tools.
 * Otherwise returns `toolActionInfo` for the workflow to execute exploratory tools.
 */
export async function aggregateSuggestionsStepActivity({
  workspaceId,
  agentConfigurationId,
  reinforcementConversationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  reinforcementConversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "full",
  });
  if (!agentConfig || agentConfig.id < 0) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: agent configuration not found for aggregation step activity"
    );
    return { isTerminal: true, suggestionsCreated: 0 };
  }

  // On first step, load aggregation context and create a reinforcement conversation.
  if (!reinforcementConversationId) {
    const ctx = await loadAggregationContext(auth, agentConfigurationId);
    if (!ctx) {
      return { isTerminal: true, suggestionsCreated: 0 };
    }

    reinforcementConversationId = await createReinforcementConversation(auth, {
      prompt: ctx.prompt,
      operationType: "reinforced_agent_aggregate_suggestions",
      contextId: agentConfigurationId,
      agentConfigurationId,
    });
  }

  return runReinforcedStep({
    auth,
    agentConfig,
    reinforcementConversationId,
    operationType: "reinforced_agent_aggregate_suggestions",
    systemPrompt: buildAggregationSystemPrompt(),
    contextId: agentConfigurationId,
    source: "reinforcement",
  });
}

// ---------------------------------------------------------------------------
// Batch activities
// ---------------------------------------------------------------------------

/**
 * Build analysis prompts and submit a batch for conversation analysis.
 *
 * For first-time conversations (no entry in `existingReinforcementConversationMap`),
 * builds the analysis prompt and creates a new reinforcement conversation.
 * For continuation conversations, reuses the existing reinforcement conversation
 * which already contains the full history (previous LLM calls + tool results).
 *
 * In both cases, `sendBatchCallToLlm` fetches the conversation from DB and
 * calls `renderConversationForModel` to build the LLM parameters.
 *
 * Returns null if no conversations could be prepared.
 */
export async function startConversationAnalysisBatchActivity({
  workspaceId,
  agentConfigurationId,
  analysedConversationIds,
  existingReinforcementConversationMap,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  analysedConversationIds: string[];
  existingReinforcementConversationMap?: Record<string, string>;
}): Promise<{
  batchId: string;
  reinforcementConversationMap: Record<string, string>;
} | null> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_analyze_conversation"
  );
  if (!llm) {
    return null;
  }

  // Build the analysis prompt for first-time conversations.
  // For continuation conversations, the prompt is already in the DB.
  const firstTimeConversationIds = analysedConversationIds.filter(
    (id) => !existingReinforcementConversationMap?.[id]
  );

  let batchMap: Map<string, LLMStreamParameters> | null = null;
  if (firstTimeConversationIds.length > 0) {
    batchMap = await buildConversationAnalysisBatchMap(auth, {
      agentConfigurationId,
      conversationIds: firstTimeConversationIds,
    });
  }

  const systemPrompt = buildAnalysisSystemPrompt();
  const specifications = buildReinforcedSpecifications();

  const batchConversations: LlmConversationOptions[] = [];
  const orderedAnalysedConversationIds: string[] = [];

  for (const analysedConvId of analysedConversationIds) {
    const existingReinforcementConvId =
      existingReinforcementConversationMap?.[analysedConvId];

    if (existingReinforcementConvId) {
      // Continuation: reuse existing reinforcement conversation.
      // No new messages — the conversation already contains the full history.
      batchConversations.push({
        newMessages: [],
        existingConversationId: existingReinforcementConvId,
        prompt: systemPrompt,
        specifications,
        userContextOrigin: "reinforcement",
      });
      orderedAnalysedConversationIds.push(analysedConvId);
    } else {
      // First time: create a new reinforcement conversation with the analysis prompt.
      const llmParams = batchMap?.get(analysedConvId);
      if (!llmParams) {
        continue;
      }
      const { conversation, ...llmParamsWithoutConversation } = llmParams;
      batchConversations.push({
        newMessages: conversation.messages,
        title: reinforcementConversationTitle(
          "reinforced_agent_analyze_conversation",
          analysedConvId
        ),
        ...llmParamsWithoutConversation,
        ...getReinforcementDefaultOptions(
          "reinforced_agent_analyze_conversation",
          agentConfigurationId
        ),
      });
      orderedAnalysedConversationIds.push(analysedConvId);
    }
  }

  if (batchConversations.length === 0) {
    return null;
  }

  const result = await sendBatchCallToLlm(auth, llm, batchConversations);
  if (result.isErr()) {
    throw result.error;
  }

  // Build the map of analysed conversation ID -> reinforcement conversation ID.
  const reinforcementConversationMap: Record<string, string> = {
    ...(existingReinforcementConversationMap ?? {}),
  };
  for (let i = 0; i < orderedAnalysedConversationIds.length; i++) {
    reinforcementConversationMap[orderedAnalysedConversationIds[i]] =
      result.value.conversationIds[i];
  }

  logger.info(
    {
      agentConfigurationId,
      workspaceId,
      batchId: result.value.batchId,
      conversationCount: batchConversations.length,
      continuationCount: Object.keys(existingReinforcementConversationMap ?? {})
        .length,
    },
    "ReinforcedAgent: started conversation analysis batch"
  );

  return {
    batchId: result.value.batchId,
    reinforcementConversationMap,
  };
}

/**
 * Check the status of a batch.
 */
export async function checkBatchStatusActivity({
  workspaceId,
  batchId,
}: {
  workspaceId: string;
  batchId: string;
}): Promise<BatchStatus> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_analyze_conversation"
  );
  if (!llm) {
    throw ApplicationFailure.nonRetryable(
      "ReinforcedAgent: no LLM available for batch status check"
    );
  }

  return llm.getBatchStatus(batchId);
}

export interface ConversationContinuationInfo {
  analysedConversationId: string;
  reinforcementConversationId: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}

/**
 * Download batch results for conversation analysis and create suggestions.
 * Also stores agent messages in the reinforced agent conversations.
 *
 * For conversations where the LLM called only terminal tools, creates suggestions.
 * For conversations where the LLM called exploratory tools, creates tool actions
 * and returns continuation info for the workflow to execute them.
 */
export async function processConversationAnalysisBatchResultActivity({
  workspaceId,
  agentConfigurationId,
  batchId,
  reinforcementConversationMap,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  batchId: string;
  reinforcementConversationMap: Record<string, string>;
}): Promise<ConversationContinuationInfo[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "light",
  });
  if (!agentConfig) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: agent not found for batch result processing"
    );
    return [];
  }

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_analyze_conversation"
  );
  if (!llm) {
    return [];
  }

  // Invert the map: reinforcementConvId -> analysedConvId.
  const reinforcementToAnalysed = new Map<string, string>();
  const reinforcementConversationIds: string[] = [];
  for (const [analysedId, reinforcementId] of Object.entries(
    reinforcementConversationMap
  )) {
    reinforcementToAnalysed.set(reinforcementId, analysedId);
    reinforcementConversationIds.push(reinforcementId);
  }

  // Download results and store agent messages in reinforcement conversations.
  const { events: batchEvents, storedResultInfo } =
    await downloadBatchResultFromLlm(
      auth,
      llm,
      batchId,
      reinforcementConversationIds,
      REINFORCEMENT_AGENT_ID
    );

  // Resolve analysed conversations for FK storage.
  const analysedConversationIds = Object.keys(reinforcementConversationMap);
  const analysedConversations = await ConversationResource.fetchByIds(
    auth,
    analysedConversationIds
  );
  const conversationById = new Map(
    analysedConversations.map((c) => [c.sId, c])
  );

  let totalCreated = 0;
  const continuations: ConversationContinuationInfo[] = [];

  for (const [reinforcementConvId, events] of batchEvents) {
    const analysedConvId =
      reinforcementToAnalysed.get(reinforcementConvId) ?? reinforcementConvId;

    const { exploratoryToolCalls, terminalToolCalls } =
      classifyToolCalls(events);

    // If terminal tools were called, process suggestions.
    if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
      const result = await processReinforcedEvents({
        auth,
        agentConfig,
        events,
        source: "synthetic",
        operationType: "reinforced_agent_analyze_conversation",
        contextId: analysedConvId,
        conversation: conversationById.get(analysedConvId),
      });
      totalCreated += result.suggestionsCreated;

      // Store results for all terminal tool calls so the conversation is complete.
      const storedInfo = storedResultInfo.get(reinforcementConvId);
      if (storedInfo) {
        await storeTerminalToolCallResults(auth, {
          successfulToolCalls: result.successfulToolCalls,
          failedToolCalls: result.failedToolCalls,
          agentMessageModelId: storedInfo.agentMessageModelId,
        });

        // If any failed, add to continuations so the LLM can retry.
        if (result.failedToolCalls.length > 0) {
          continuations.push({
            analysedConversationId: analysedConvId,
            reinforcementConversationId: reinforcementConvId,
          });
        }
      }
    } else {
      // Only exploratory tools — prepare actions for the workflow to execute.
      const storedInfo = storedResultInfo.get(reinforcementConvId);
      if (storedInfo) {
        const toolActionInfo = await prepareReinforcedToolActions(auth, {
          exploratoryToolCalls,
          agentMessageModelId: storedInfo.agentMessageModelId,
          agentMessageId: storedInfo.agentMessageSId,
          userMessageId: storedInfo.userMessageSId,
          conversationId: reinforcementConvId,
        });

        continuations.push({
          analysedConversationId: analysedConvId,
          reinforcementConversationId: reinforcementConvId,
          toolActionInfo,
        });
      }
    }
  }

  logger.info(
    {
      agentConfigurationId,
      batchId,
      conversationCount: batchEvents.size,
      suggestionsCreated: totalCreated,
      continuationCount: continuations.length,
    },
    "ReinforcedAgent: processed conversation analysis batch results"
  );

  return continuations;
}

/**
 * Build aggregation prompt and submit it as a batch.
 * Returns the batch ID and reinforced agent conversation sIds,
 * or null if there are no suggestions to aggregate.
 */
export async function startAggregationBatchActivity({
  workspaceId,
  agentConfigurationId,
  existingReinforcementConversationId,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  existingReinforcementConversationId?: string;
}): Promise<{
  batchId: string;
  reinforcementConversationIds: string[];
} | null> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_aggregate_suggestions"
  );
  if (!llm) {
    return null;
  }

  const systemPrompt = buildAggregationSystemPrompt();
  const specifications = buildReinforcedSpecifications();

  let batchConversations: LlmConversationOptions[];

  if (existingReinforcementConversationId) {
    // Continuation: reuse existing reinforcement conversation (already has tool results).
    batchConversations = [
      {
        newMessages: [],
        existingConversationId: existingReinforcementConversationId,
        prompt: systemPrompt,
        specifications,
        userContextOrigin: "reinforcement",
      },
    ];
  } else {
    // First time: build the aggregation prompt.
    const batchMap = await buildAggregationBatchMap(auth, agentConfigurationId);
    if (!batchMap) {
      return null;
    }

    batchConversations = [];
    for (const [, llmParams] of batchMap) {
      const { conversation, ...llmParamsWithoutConversation } = llmParams;
      batchConversations.push({
        newMessages: conversation.messages,
        title: reinforcementConversationTitle(
          "reinforced_agent_aggregate_suggestions",
          agentConfigurationId
        ),
        ...llmParamsWithoutConversation,
        ...getReinforcementDefaultOptions(
          "reinforced_agent_aggregate_suggestions",
          agentConfigurationId
        ),
      });
    }
  }

  const sendResult = await sendBatchCallToLlm(auth, llm, batchConversations);
  if (sendResult.isErr()) {
    throw sendResult.error;
  }
  const { batchId, conversationIds } = sendResult.value;

  logger.info(
    {
      agentConfigurationId,
      workspaceId,
      batchId,
    },
    "ReinforcedAgent: started aggregation batch"
  );

  return { batchId, reinforcementConversationIds: conversationIds };
}

/**
 * Download aggregation batch results and process tool calls.
 * Also stores agent messages in the reinforced agent conversations.
 *
 * Returns `needsContinuation: true` with `toolActionInfo` when the LLM called
 * exploratory tools (or terminal tools failed). The workflow should execute tools
 * and resubmit the batch. Returns `needsContinuation: false` when terminal tools
 * succeeded — the workflow should then finalize (notify + mark synthetic approved).
 */
export async function processAggregationBatchResultActivity({
  workspaceId,
  agentConfigurationId,
  batchId,
  reinforcementConversationIds,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  batchId: string;
  reinforcementConversationIds: string[];
}): Promise<{
  needsContinuation: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  const [agentConfig] = await getAgentConfigurations(auth, {
    agentIds: [agentConfigurationId],
    variant: "light",
  });
  if (!agentConfig) {
    logger.warn(
      { agentConfigurationId },
      "ReinforcedAgent: agent not found for aggregation result processing"
    );
    return { needsContinuation: false, suggestionsCreated: 0 };
  }

  const llm = await getReinforcedLLM(
    auth,
    "reinforced_agent_aggregate_suggestions"
  );
  if (!llm) {
    return { needsContinuation: false, suggestionsCreated: 0 };
  }

  // Download results and store agent messages in reinforcement conversations.
  const { events: batchEvents, storedResultInfo } =
    await downloadBatchResultFromLlm(
      auth,
      llm,
      batchId,
      reinforcementConversationIds,
      REINFORCEMENT_AGENT_ID
    );

  // The aggregation batch has a single entry — get the first result.
  const firstConvId = reinforcementConversationIds[0];
  const events = batchEvents.get(firstConvId);

  if (!events) {
    return { needsContinuation: false, suggestionsCreated: 0 };
  }

  const { exploratoryToolCalls, terminalToolCalls } = classifyToolCalls(events);

  // If terminal tools were called, process suggestions.
  if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
    const result = await processReinforcedEvents({
      auth,
      agentConfig,
      events,
      source: "reinforcement",
      operationType: "reinforced_agent_aggregate_suggestions",
      contextId: agentConfigurationId,
    });

    // Store results for all terminal tool calls.
    const storedInfo = storedResultInfo.get(firstConvId);
    if (storedInfo) {
      await storeTerminalToolCallResults(auth, {
        successfulToolCalls: result.successfulToolCalls,
        failedToolCalls: result.failedToolCalls,
        agentMessageModelId: storedInfo.agentMessageModelId,
      });

      // If any failed, continue the loop for retry.
      if (result.failedToolCalls.length > 0) {
        return {
          needsContinuation: true,
          suggestionsCreated: result.suggestionsCreated,
          reinforcementConversationId: firstConvId,
        };
      }
    }

    logger.info(
      {
        agentConfigurationId,
        batchId,
        suggestionsCreated: result.suggestionsCreated,
      },
      "ReinforcedAgent: processed aggregation batch results"
    );

    return {
      needsContinuation: false,
      suggestionsCreated: result.suggestionsCreated,
    };
  }

  // Only exploratory tools — prepare actions for the workflow to execute.
  const storedInfo = storedResultInfo.get(firstConvId);
  if (!storedInfo) {
    return { needsContinuation: false, suggestionsCreated: 0 };
  }

  const toolActionInfo = await prepareReinforcedToolActions(auth, {
    exploratoryToolCalls,
    agentMessageModelId: storedInfo.agentMessageModelId,
    agentMessageId: storedInfo.agentMessageSId,
    userMessageId: storedInfo.userMessageSId,
    conversationId: firstConvId,
  });

  return {
    needsContinuation: true,
    suggestionsCreated: 0,
    reinforcementConversationId: firstConvId,
    toolActionInfo,
  };
}
