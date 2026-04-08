import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getShrinkWrappedConversation } from "@app/lib/api/assistant/conversation/shrink_wrap";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import { storeLlmResult } from "@app/lib/api/llm/batch_llm";
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
  buildSkillAggregationSystemPrompt,
  loadSkillAggregationContext,
} from "@app/lib/reinforced_skills/aggregate_suggestions";
import {
  buildSkillAnalysisPrompt,
  buildSkillAnalysisSystemPrompt,
} from "@app/lib/reinforced_skills/analyze_conversation";
import {
  DEFAULT_MAX_CONVERSATIONS_PER_RUN,
  DEFAULT_REINFORCEMENT_LOOKBACK_WINDOW_DAYS,
} from "@app/lib/reinforced_skills/constants";
import {
  buildReinforcedSkillsSpecifications,
  classifySkillToolCalls,
  createReinforcedSkillsConversation,
  getReinforcedSkillsLLM,
  processSkillReinforcedEvents,
  REINFORCEMENT_SKILLS_AGENT_ID,
} from "@app/lib/reinforced_skills/run_reinforced_analysis";
import { findConversationsWithSkills } from "@app/lib/reinforced_skills/selection";
import type { ReinforcedSkillsOperationType } from "@app/lib/reinforced_skills/types";
import { getAuthForWorkspace } from "@app/lib/reinforced_skills/utils";
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
      { contextId },
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
        { contextId },
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
        operationType: "reinforced_skills_analyze_conversation",
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
    operationType: "reinforced_skills_analyze_conversation",
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

  if (skillId) {
    // Check if this specific skill has synthetic suggestions.
    const suggestions =
      await SkillSuggestionResource.listBySkillConfigurationId(auth, skillId, {
        sources: ["synthetic"],
        states: ["pending"],
      });
    return suggestions.length > 0 ? [skillId] : [];
  }

  // Find all skills with pending synthetic suggestions across the workspace.
  const allSkills = await SkillResource.listByWorkspace(auth);
  const skillIdsWithSuggestions: string[] = [];

  for (const skill of allSkills) {
    const suggestions =
      await SkillSuggestionResource.listBySkillConfigurationId(
        auth,
        skill.sId,
        { sources: ["synthetic"], states: ["pending"] }
      );
    if (suggestions.length > 0) {
      skillIdsWithSuggestions.push(skill.sId);
    }
  }

  return skillIdsWithSuggestions;
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
        operationType: "reinforced_skills_aggregate_suggestions",
        contextId: skillId,
      }
    );
  }

  return runReinforcedSkillsStep({
    auth,
    reinforcementConversationId,
    operationType: "reinforced_skills_aggregate_suggestions",
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
    "reinforced_skills_analyze_conversation"
  );
  if (!llm) {
    throw ApplicationFailure.nonRetryable(
      "ReinforcedSkills: no LLM available for batch status check"
    );
  }

  return llm.getBatchStatus(batchId);
}
