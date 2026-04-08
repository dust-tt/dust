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
import type { Authenticator } from "@app/lib/auth";
import {
  prepareReinforcedToolActions,
  type ReinforcedToolActionInfo,
  storeTerminalToolCallResults,
} from "@app/lib/reinforced_agent/tool_execution";
import { hasReinforcementEnabled } from "@app/lib/reinforced_agent/workspace_check";
import {
  buildSkillAggregationBatchMap,
  buildSkillAggregationSystemPrompt,
  loadSkillAggregationContext,
} from "@app/lib/reinforcement/aggregate_suggestions";
import {
  buildSkillAnalysisPrompt,
  buildSkillAnalysisSystemPrompt,
  buildSkillConversationAnalysisBatchMap,
} from "@app/lib/reinforcement/analyze_conversation";
import {
  DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
} from "@app/lib/reinforcement/constants";
import {
  buildReinforcedSkillsSpecifications,
  classifySkillToolCalls,
  createReinforcedSkillsConversation,
  getReinforcedSkillsDefaultOptions,
  getReinforcedSkillsLLM,
  processSkillReinforcedEvents,
  REINFORCEMENT_SKILLS_AGENT_ID,
  reinforcedSkillsConversationTitle,
} from "@app/lib/reinforcement/run_reinforced_analysis";
import { findConversationsWithSkills } from "@app/lib/reinforcement/selection";
import type { ReinforcedSkillsOperationType } from "@app/lib/reinforcement/types";
import { getAuthForWorkspace } from "@app/lib/reinforcement/utils";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import logger from "@app/logger/logger";
import { ApplicationFailure } from "@temporalio/common";

// Re-export runToolActivity so the reinforced skills worker registers it,
// allowing the workflow to call it via proxyActivities.
export { runToolActivity } from "@app/temporal/agent_loop/activities/run_tool";

/**
 * Common logic for a single reinforced skills step (analysis or aggregation).
 *
 * Fetches the reinforcement conversation, renders it for the LLM, streams the
 * response, stores the result, and classifies tool calls. Terminal tool calls
 * are processed into suggestions; exploratory tool calls are returned for the
 * workflow to execute.
 */
async function runReinforcedSkillsStep({
  auth,
  reinforcementConversationId,
  operationType,
  systemPrompt,
  contextId,
  source,
  conversation,
}: {
  auth: Authenticator;
  reinforcementConversationId: string;
  operationType: ReinforcedSkillsOperationType;
  systemPrompt: string;
  contextId: string;
  source: "synthetic" | "reinforcement";
  conversation?: ConversationResource;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const llm = await getReinforcedSkillsLLM(auth, operationType);
  if (!llm) {
    logger.error(
      { contextId, workspaceId: auth.getNonNullableWorkspace().sId },
      "ReinforcedSkills: no LLM available for step activity"
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

  const specifications = buildReinforcedSkillsSpecifications();
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
    REINFORCEMENT_SKILLS_AGENT_ID,
    { runIds: [llm.getTraceId()] }
  );

  const { exploratoryToolCalls, terminalToolCalls } =
    classifySkillToolCalls(events);

  // If terminal tools were called, process suggestions.
  if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
    if (terminalToolCalls.length > 0 && exploratoryToolCalls.length > 0) {
      logger.warn(
        { contextId, workspaceId: auth.getNonNullableWorkspace().sId },
        "ReinforcedSkills: LLM is sending both terminal and exploratory tool call."
      );
    }

    const result = await processSkillReinforcedEvents({
      auth,
      events,
      source,
      operationType,
      contextId,
      conversation,
    });

    // Store results for all terminal tool calls so the conversation is complete.
    // The skill types have the same shape as agent types (id, name, arguments)
    // but different nominal type names, so we cast through unknown.
    await storeTerminalToolCallResults(auth, {
      successfulToolCalls: result.successfulToolCalls as unknown as Parameters<
        typeof storeTerminalToolCallResults
      >[1]["successfulToolCalls"],
      failedToolCalls: result.failedToolCalls as unknown as Parameters<
        typeof storeTerminalToolCallResults
      >[1]["failedToolCalls"],
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
  // The skill exploratory tool call type has the same shape as the agent type.
  const toolActionInfo = await prepareReinforcedToolActions(auth, {
    exploratoryToolCalls: exploratoryToolCalls as unknown as Parameters<
      typeof prepareReinforcedToolActions
    >[1]["exploratoryToolCalls"],
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

// ---------------------------------------------------------------------------
// Activities
// ---------------------------------------------------------------------------

/**
 * Checks if skill reinforcement is allowed for this workspace.
 */
export async function isSkillReinforcementAllowedActivity({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<boolean> {
  const auth = await getAuthForWorkspace(workspaceId);
  return hasReinforcementEnabled(auth);
}

/**
 * Discover recent conversations that used skills.
 */
export async function getRecentConversationsWithSkillsActivity({
  workspaceId,
  lookbackDays = DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
  maxConversations = DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  skillId,
}: {
  workspaceId: string;
  lookbackDays?: number;
  maxConversations?: number;
  skillId?: string;
}): Promise<{ conversationSId: string; skillSIds: string[] }[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);

  return findConversationsWithSkills(auth, {
    cutoffDate,
    maxConversations,
    skillId,
  });
}

/**
 * Analyze a single conversation step for skill reinforcement.
 *
 * On the first step (`reinforcementConversationId` is undefined), creates a
 * reinforcement conversation and stores the analysis prompt as the user message.
 *
 * On continuation steps, the reinforcement conversation already contains the full
 * history. The conversation is rendered from DB via `renderConversationForModel`.
 *
 * Returns `isTerminal: true` when the LLM calls terminal suggestion tools.
 * Otherwise returns `toolActionInfo` for the workflow to execute tools.
 */
export async function analyzeConversationStepActivity({
  workspaceId,
  conversationId,
  skillSIds,
  reinforcementConversationId,
}: {
  workspaceId: string;
  conversationId: string;
  skillSIds: string[];
  reinforcementConversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  // On first step, build the analysis prompt and create a reinforcement conversation.
  if (!reinforcementConversationId) {
    const [conversationRes, skills] = await Promise.all([
      getShrinkWrappedConversation(auth, {
        conversationId,
        includeFeedback: true,
        includeActionDetails: true,
      }),
      SkillResource.fetchByIds(auth, skillSIds),
    ]);
    if (conversationRes.isErr()) {
      logger.warn(
        { conversationId },
        "ReinforcedSkills: conversation not found for step activity"
      );
      return { isTerminal: true, suggestionsCreated: 0 };
    }

    if (skills.length === 0) {
      logger.warn(
        { conversationId, skillSIds },
        "ReinforcedSkills: no skills found for step activity"
      );
      return { isTerminal: true, suggestionsCreated: 0 };
    }

    const skillTypes = skills.map((s) => s.toJSON(auth));

    const prompt = buildSkillAnalysisPrompt(
      conversationRes.value.text,
      skillTypes
    );
    reinforcementConversationId = await createReinforcedSkillsConversation(
      auth,
      {
        prompt,
        operationType: "reinforcement_analyze_conversation",
        contextId: conversationId,
      }
    );
  }

  // Fetch the source conversation for FK reference in suggestions.
  const conversation =
    (await ConversationResource.fetchById(auth, conversationId)) ?? undefined;

  return runReinforcedSkillsStep({
    auth,
    reinforcementConversationId,
    operationType: "reinforcement_analyze_conversation",
    systemPrompt: buildSkillAnalysisSystemPrompt(),
    contextId: conversationId,
    source: "synthetic",
    conversation,
  });
}

/**
 * Find skills that have pending synthetic suggestions ready for aggregation.
 */
export async function getSkillsWithSyntheticSuggestionsActivity({
  workspaceId,
  skillId,
}: {
  workspaceId: string;
  skillId?: string;
}): Promise<string[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  // Fetch all pending synthetic suggestions for the workspace (or scoped skill),
  // then extract distinct skill sIds.
  const filters: Parameters<
    typeof SkillSuggestionResource.listBySkillConfigurationId
  >[2] = {
    sources: ["synthetic"],
    states: ["pending"],
  };

  if (skillId) {
    const suggestions =
      await SkillSuggestionResource.listBySkillConfigurationId(
        auth,
        skillId,
        filters
      );
    return suggestions.length > 0 ? [skillId] : [];
  }

  // Single query: list all pending synthetic suggestions across the workspace.
  const allSuggestions = await SkillSuggestionResource.listByWorkspace(
    auth,
    filters
  );

  return [...new Set(allSuggestions.map((s) => s.skillConfigurationSId))];
}

/**
 * Single step of aggregation for a specific skill (streaming mode).
 *
 * On the first step, loads the aggregation context and creates a reinforcement conversation.
 * On continuation steps, re-renders from DB (which includes previous tool results).
 *
 * Returns `isTerminal: true` when the LLM calls terminal suggestion tools.
 * Otherwise returns `toolActionInfo` for the workflow to execute exploratory tools.
 */
export async function aggregateSuggestionsForSkillStepActivity({
  workspaceId,
  skillId,
  reinforcementConversationId,
}: {
  workspaceId: string;
  skillId: string;
  reinforcementConversationId?: string;
}): Promise<{
  isTerminal: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  // On first step, load aggregation context and create a reinforcement conversation.
  if (!reinforcementConversationId) {
    const ctx = await loadSkillAggregationContext(auth, skillId);
    if (!ctx) {
      return { isTerminal: true, suggestionsCreated: 0 };
    }

    reinforcementConversationId = await createReinforcedSkillsConversation(
      auth,
      {
        prompt: ctx.prompt,
        operationType: "reinforcement_aggregate_suggestions",
        contextId: skillId,
      }
    );
  }

  return runReinforcedSkillsStep({
    auth,
    reinforcementConversationId,
    operationType: "reinforcement_aggregate_suggestions",
    systemPrompt: buildSkillAggregationSystemPrompt(),
    contextId: skillId,
    source: "reinforcement",
  });
}

/**
 * Finalize aggregation for a skill: delete synthetic suggestions (they have been
 * consolidated into reinforcement suggestions).
 */
export async function finalizeSkillAggregationActivity({
  workspaceId,
  skillId,
  suggestionsCreated,
  disableNotifications,
}: {
  workspaceId: string;
  skillId: string;
  suggestionsCreated: number;
  disableNotifications: boolean;
}): Promise<void> {
  const auth = await getAuthForWorkspace(workspaceId);

  // Delete synthetic suggestions (consumed by aggregation).
  const syntheticSuggestions =
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
      sources: ["synthetic"],
      states: ["pending"],
    });

  for (const suggestion of syntheticSuggestions) {
    await suggestion.delete(auth);
  }

  logger.info(
    {
      skillId,
      syntheticCount: syntheticSuggestions.length,
      pendingCreated: suggestionsCreated,
      disableNotifications,
    },
    "ReinforcedSkills: finalized skill aggregation"
  );
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

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_analyze_conversation"
  );
  if (!llm) {
    throw ApplicationFailure.nonRetryable(
      "ReinforcedSkills: no LLM available for batch status check"
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
 * Build analysis prompts for skill conversations and submit as a batch.
 * For first-time conversations, builds prompts via buildSkillConversationAnalysisBatchMap.
 * For continuation conversations, reuses existing reinforcement conversations.
 */
export async function startSkillConversationAnalysisBatchActivity({
  workspaceId,
  conversationsWithSkills,
  existingReinforcementConversationMap,
}: {
  workspaceId: string;
  conversationsWithSkills: { conversationSId: string; skillSIds: string[] }[];
  existingReinforcementConversationMap?: Record<string, string>;
}): Promise<{
  batchId: string;
  reinforcementConversationMap: Record<string, string>;
} | null> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_analyze_conversation"
  );
  if (!llm) {
    logger.warn(
      { workspaceId },
      "ReinforcedSkills: no LLM available for conversation analysis batch"
    );
    return null;
  }

  // Build the analysis prompt for first-time conversations.
  const firstTimeConversations = conversationsWithSkills.filter(
    (c) => !existingReinforcementConversationMap?.[c.conversationSId]
  );

  let batchMap: Map<string, LLMStreamParameters> | null = null;
  if (firstTimeConversations.length > 0) {
    batchMap = await buildSkillConversationAnalysisBatchMap(
      auth,
      firstTimeConversations
    );
  }

  const systemPrompt = buildSkillAnalysisSystemPrompt();
  const specifications = buildReinforcedSkillsSpecifications();

  const batchConversations: LlmConversationOptions[] = [];
  const orderedAnalysedConversationIds: string[] = [];

  for (const { conversationSId } of conversationsWithSkills) {
    const existingReinforcementConvId =
      existingReinforcementConversationMap?.[conversationSId];

    if (existingReinforcementConvId) {
      // Continuation: reuse existing reinforcement conversation.
      batchConversations.push({
        newMessages: [],
        existingConversationId: existingReinforcementConvId,
        prompt: systemPrompt,
        specifications,
        userContextOrigin: "reinforcement",
      });
      orderedAnalysedConversationIds.push(conversationSId);
    } else {
      // First time: create a new reinforcement conversation with the analysis prompt.
      const llmParams = batchMap?.get(conversationSId);
      if (!llmParams) {
        continue;
      }
      const { conversation, ...llmParamsWithoutConversation } = llmParams;
      batchConversations.push({
        newMessages: conversation.messages,
        title: reinforcedSkillsConversationTitle(
          "reinforcement_analyze_conversation",
          conversationSId
        ),
        ...llmParamsWithoutConversation,
        ...getReinforcedSkillsDefaultOptions(
          "reinforcement_analyze_conversation",
          conversationSId
        ),
      });
      orderedAnalysedConversationIds.push(conversationSId);
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
      workspaceId,
      batchId: result.value.batchId,
      conversationCount: batchConversations.length,
      continuationCount: Object.keys(existingReinforcementConversationMap ?? {})
        .length,
    },
    "ReinforcedSkills: started conversation analysis batch"
  );

  return {
    batchId: result.value.batchId,
    reinforcementConversationMap,
  };
}

/**
 * Download batch results for skill conversation analysis and create suggestions.
 * For conversations where the LLM called only terminal tools, creates suggestions.
 * For conversations where the LLM called exploratory tools, returns continuation info.
 */
export async function processSkillConversationAnalysisBatchResultActivity({
  workspaceId,
  batchId,
  reinforcementConversationMap,
}: {
  workspaceId: string;
  batchId: string;
  reinforcementConversationMap: Record<string, string>;
}): Promise<ConversationContinuationInfo[]> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_analyze_conversation"
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
      REINFORCEMENT_SKILLS_AGENT_ID
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
      classifySkillToolCalls(events);

    // If terminal tools were called, process suggestions.
    if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
      const result = await processSkillReinforcedEvents({
        auth,
        events,
        source: "synthetic",
        operationType: "reinforcement_analyze_conversation",
        contextId: analysedConvId,
        conversation: conversationById.get(analysedConvId),
      });
      totalCreated += result.suggestionsCreated;

      // Store results for all terminal tool calls so the conversation is complete.
      const storedInfo = storedResultInfo.get(reinforcementConvId);
      if (storedInfo) {
        await storeTerminalToolCallResults(auth, {
          successfulToolCalls:
            result.successfulToolCalls as unknown as Parameters<
              typeof storeTerminalToolCallResults
            >[1]["successfulToolCalls"],
          failedToolCalls: result.failedToolCalls as unknown as Parameters<
            typeof storeTerminalToolCallResults
          >[1]["failedToolCalls"],
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
          exploratoryToolCalls: exploratoryToolCalls as unknown as Parameters<
            typeof prepareReinforcedToolActions
          >[1]["exploratoryToolCalls"],
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
      batchId,
      conversationCount: batchEvents.size,
      suggestionsCreated: totalCreated,
      continuationCount: continuations.length,
    },
    "ReinforcedSkills: processed conversation analysis batch results"
  );

  return continuations;
}

/**
 * Build aggregation prompt for a skill and submit as a batch.
 * Returns the batch ID and reinforcement conversation IDs,
 * or null if there are no suggestions to aggregate.
 */
export async function startSkillAggregationBatchActivity({
  workspaceId,
  skillId,
  existingReinforcementConversationId,
}: {
  workspaceId: string;
  skillId: string;
  existingReinforcementConversationId?: string;
}): Promise<{
  batchId: string;
  reinforcementConversationIds: string[];
} | null> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_aggregate_suggestions"
  );
  if (!llm) {
    logger.warn(
      { workspaceId, skillId },
      "ReinforcedSkills: no LLM available for aggregation batch"
    );
    return null;
  }

  const systemPrompt = buildSkillAggregationSystemPrompt();
  const specifications = buildReinforcedSkillsSpecifications();

  let batchConversations: LlmConversationOptions[];

  if (existingReinforcementConversationId) {
    // Continuation: reuse existing reinforcement conversation.
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
    const batchMap = await buildSkillAggregationBatchMap(auth, skillId);
    if (!batchMap) {
      return null;
    }

    batchConversations = [];
    for (const [, llmParams] of batchMap) {
      const { conversation, ...llmParamsWithoutConversation } = llmParams;
      batchConversations.push({
        newMessages: conversation.messages,
        title: reinforcedSkillsConversationTitle(
          "reinforcement_aggregate_suggestions",
          skillId
        ),
        ...llmParamsWithoutConversation,
        ...getReinforcedSkillsDefaultOptions(
          "reinforcement_aggregate_suggestions",
          skillId
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
      skillId,
      workspaceId,
      batchId,
    },
    "ReinforcedSkills: started aggregation batch"
  );

  return { batchId, reinforcementConversationIds: conversationIds };
}

/**
 * Download aggregation batch results and process tool calls.
 * Returns `needsContinuation: true` with `toolActionInfo` when the LLM called
 * exploratory tools (or terminal tools failed). Returns `needsContinuation: false`
 * when terminal tools succeeded.
 */
export async function processSkillAggregationBatchResultActivity({
  workspaceId,
  skillId,
  batchId,
  reinforcementConversationIds,
}: {
  workspaceId: string;
  skillId: string;
  batchId: string;
  reinforcementConversationIds: string[];
}): Promise<{
  needsContinuation: boolean;
  suggestionsCreated: number;
  reinforcementConversationId?: string;
  toolActionInfo?: ReinforcedToolActionInfo;
}> {
  const auth = await getAuthForWorkspace(workspaceId);

  const llm = await getReinforcedSkillsLLM(
    auth,
    "reinforcement_aggregate_suggestions"
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
      REINFORCEMENT_SKILLS_AGENT_ID
    );

  // The aggregation batch has a single entry — get the first result.
  const firstConvId = reinforcementConversationIds[0];
  const events = batchEvents.get(firstConvId);

  if (!events) {
    return { needsContinuation: false, suggestionsCreated: 0 };
  }

  const { exploratoryToolCalls, terminalToolCalls } =
    classifySkillToolCalls(events);

  // If terminal tools were called, process suggestions.
  if (terminalToolCalls.length > 0 || exploratoryToolCalls.length === 0) {
    const result = await processSkillReinforcedEvents({
      auth,
      events,
      source: "reinforcement",
      operationType: "reinforcement_aggregate_suggestions",
      contextId: skillId,
    });

    // Store results for all terminal tool calls.
    const storedInfo = storedResultInfo.get(firstConvId);
    if (storedInfo) {
      await storeTerminalToolCallResults(auth, {
        successfulToolCalls:
          result.successfulToolCalls as unknown as Parameters<
            typeof storeTerminalToolCallResults
          >[1]["successfulToolCalls"],
        failedToolCalls: result.failedToolCalls as unknown as Parameters<
          typeof storeTerminalToolCallResults
        >[1]["failedToolCalls"],
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
        skillId,
        batchId,
        suggestionsCreated: result.suggestionsCreated,
      },
      "ReinforcedSkills: processed aggregation batch results"
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
    exploratoryToolCalls: exploratoryToolCalls as unknown as Parameters<
      typeof prepareReinforcedToolActions
    >[1]["exploratoryToolCalls"],
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
