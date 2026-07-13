import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { makeFairUseAwuCreditsRateLimitKeyForUser } from "@app/lib/api/assistant/rate_limits";
import type { ToolCostCategory } from "@app/lib/api/mcp";
import type { Authenticator } from "@app/lib/auth";
import {
  awuFromMicroUsd,
  computeRunKey,
  getToolBillingInfo,
  intelligenceAwuFromRunUsagesGroupedByRunKey,
  isFreeOrigin,
  toolAwuFromAction,
  toolAwuFromActions,
} from "@app/lib/metronome/events";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import {
  addRateLimiterCount,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import {
  AGENT_MESSAGE_STATUSES_TO_TRACK,
  type UserMessageOrigin,
} from "@app/types/assistant/conversation";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";

interface CreditActionMinimalInput {
  toolName: string;
  internalMCPServerName: InternalMCPServerNameType | null;
  status: ToolExecutionStatus;
}

export interface AgentMessageCreditsModelBreakdown {
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  cacheCreationTokens: number;
  costMicroUsd: number;
  awu: number;
}

export interface AgentMessageCreditsToolBreakdown {
  actionId: string;
  toolName: string;
  internalMCPServerName: InternalMCPServerNameType | null;
  toolCostCategory: ToolCostCategory;
  free: boolean;
  awu: number;
}

export interface AgentMessageCreditsBreakdown {
  llmAwu: number;
  toolAwu: number;
  totalAwu: number;
  byModel: AgentMessageCreditsModelBreakdown[];
  byTool: AgentMessageCreditsToolBreakdown[];
}

/**
 * Same computation as `computeAgentMessageCredits`, but split by LLM vs. tool
 * cost and by model / tool so it can be displayed (e.g. in poke) instead of
 * only summed. `byModel[].awu` is computed by grouping per runKey first
 * (matching `intelligenceAwuFromRunUsagesGroupedByRunKey`), so the sum of
 * `byModel[].awu` always equals `llmAwu` exactly.
 */
export function computeAgentMessageCreditsBreakdown({
  runUsages,
  actions,
  contextOrigin,
}: {
  runUsages: (RunUsageType & { runKey: string | null })[];
  actions: (CreditActionMinimalInput & { actionId: string })[];
  contextOrigin: UserMessageOrigin | null;
}): AgentMessageCreditsBreakdown {
  const finalActions = actions.filter((a) =>
    isToolExecutionStatusFinal(a.status)
  );

  const modelUsageByKey = new Map<
    string,
    Omit<AgentMessageCreditsModelBreakdown, "awu">
  >();
  for (const usage of runUsages) {
    const key = `${usage.providerId}|${usage.modelId}`;
    const existing = modelUsageByKey.get(key) ?? {
      providerId: usage.providerId,
      modelId: usage.modelId,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      costMicroUsd: 0,
    };
    modelUsageByKey.set(key, {
      ...existing,
      promptTokens: existing.promptTokens + usage.promptTokens,
      completionTokens: existing.completionTokens + usage.completionTokens,
      cachedTokens: existing.cachedTokens + (usage.cachedTokens ?? 0),
      cacheCreationTokens:
        existing.cacheCreationTokens + (usage.cacheCreationTokens ?? 0),
      costMicroUsd: existing.costMicroUsd + usage.costMicroUsd,
    });
  }

  const modelAwuByKey = new Map<string, number>();
  if (!isFreeOrigin(contextOrigin)) {
    const byRunKey = new Map<string, RunUsageType[]>();
    for (const usage of runUsages) {
      const runKey = usage.runKey ?? "__legacy__";
      const group = byRunKey.get(runKey) ?? [];
      group.push(usage);
      byRunKey.set(runKey, group);
    }

    for (const group of byRunKey.values()) {
      const costByModel = new Map<string, number>();
      for (const usage of group) {
        const key = `${usage.providerId}|${usage.modelId}`;
        costByModel.set(key, (costByModel.get(key) ?? 0) + usage.costMicroUsd);
      }
      for (const [key, costMicroUsd] of costByModel) {
        modelAwuByKey.set(
          key,
          (modelAwuByKey.get(key) ?? 0) + awuFromMicroUsd(costMicroUsd)
        );
      }
    }
  }

  const byModel = Array.from(modelUsageByKey.entries()).map(([key, usage]) => ({
    ...usage,
    awu: modelAwuByKey.get(key) ?? 0,
  }));

  const byTool = finalActions.map((action) => {
    const { toolCostCategory, freeUsage } = getToolBillingInfo(
      action.internalMCPServerName,
      action.toolName
    );
    return {
      actionId: action.actionId,
      toolName: action.toolName,
      internalMCPServerName: action.internalMCPServerName,
      toolCostCategory,
      free: freeUsage || isFreeOrigin(contextOrigin),
      awu: toolAwuFromAction(action, contextOrigin),
    };
  });

  const llmAwu = intelligenceAwuFromRunUsagesGroupedByRunKey(
    runUsages,
    contextOrigin
  );
  const toolAwu = toolAwuFromActions(finalActions, contextOrigin);

  return { llmAwu, toolAwu, totalAwu: llmAwu + toolAwu, byModel, byTool };
}

export function computeAgentMessageCredits({
  runUsages,
  actions,
  contextOrigin,
}: {
  runUsages: (RunUsageType & { runKey: string | null })[];
  actions: CreditActionMinimalInput[];
  contextOrigin: UserMessageOrigin | null;
}): number | null {
  const finalActions = actions.filter((a) =>
    isToolExecutionStatusFinal(a.status)
  );

  if (runUsages.length === 0 && finalActions.length === 0) {
    return null;
  }

  // Intelligence cost is ceiled per agent-loop execution (runKey) to match the
  // per-execution Metronome events. Tool cost has no ceiling (fixed 1/3 per
  // action), so it is grouping-invariant and stays message-level.
  return (
    intelligenceAwuFromRunUsagesGroupedByRunKey(runUsages, contextOrigin) +
    toolAwuFromActions(finalActions, contextOrigin)
  );
}

/**
 * Compute the agent message credit cost once at the end of the agentic loop and persist it on the
 * agent message. Returns the computed value (or null when there is nothing to track).
 *
 * Called from the finalize activities (alongside the Metronome usage events it is derived from),
 * not from the hot terminal-event path, so publishing the terminal events stays lightweight. The
 * value is not pushed on any event — clients read it from the messages / conversation API on their
 * next revalidation.
 *
 * Computes from the message's full accumulated runIds + all final-status actions (the message-level
 * total), so re-runs (interrupt/resume) overwrite the stored value with the complete cost. Only
 * persists for statuses we track for billing, matching the Metronome gate.
 *
 * Before recomputing, this execution's runs are tagged with their runKey (from `dustRunIds`) so the
 * intelligence cost is ceiled per agent-loop execution — exactly matching the per-execution
 * Metronome events. Tagging is idempotent (same runIds → same runKey), so it stays overwrite-safe
 * across Temporal retries.
 */
export async function computeAndStoreAgentMessageCredits(
  auth: Authenticator,
  {
    agentMessageId,
    dustRunIds,
  }: { agentMessageId: string; dustRunIds?: string[] }
): Promise<number | null> {
  const creditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    });

  if (!creditContext) {
    logger.warn(
      { workspaceId: auth.getNonNullableWorkspace().sId, agentMessageId },
      "[Credits] Agent message not found while computing costCredits."
    );
    return null;
  }

  const { agentMessageModelId, status, runIds, triggeringUserMessageOrigin } =
    creditContext;

  if (!AGENT_MESSAGE_STATUSES_TO_TRACK.includes(status)) {
    return null;
  }

  // Tag this execution's runs with their runKey before recomputing, so the
  // recompute (which reads the message's full accumulated runIds) ceils each
  // execution's intelligence cost independently. Prior executions tagged their
  // own runs in their own finalize.
  if (dustRunIds && dustRunIds.length > 0) {
    await RunResource.setRunKeyForDustRunIds(auth, {
      dustRunIds,
      runKey: computeRunKey(dustRunIds),
    });
  }

  const [runUsages, actions] = await Promise.all([
    fetchRunUsagesForAgentMessage(auth, runIds),
    AgentMCPActionResource.listByAgentMessageIds(auth, [agentMessageModelId]),
  ]);

  const costCredits = computeAgentMessageCredits({
    runUsages,
    actions: actions.map((action) => ({
      toolName: getToolNameFromFunctionCallName(action.functionCallName),
      internalMCPServerName: action.metadata.internalMCPServerName,
      status: action.status,
    })),
    contextOrigin: triggeringUserMessageOrigin,
  });

  await ConversationResource.updateAgentMessageCostCredits(auth, {
    agentMessageModelId,
    costCredits,
  });

  const user = auth.user();
  const plan = auth.plan();
  const assistantLimits = plan?.limits.assistant;
  if (
    user &&
    assistantLimits &&
    costCredits !== null &&
    costCredits > 0 &&
    assistantLimits.maxAwuCredits !== -1
  ) {
    // Always record the credit cost unconditionally. The limit guard lives in
    // isMessagesLimitReached (pre-message), which reads the count via getRateLimiterCount and
    // blocks the next message once the total reaches maxAwuCredits. Using rateLimiter here was
    // incorrect: its Lua script silently drops the write when count + costCredits > limit,
    // causing the counter to stall below the limit and never trigger enforcement.
    await addRateLimiterCount({
      key: makeFairUseAwuCreditsRateLimitKeyForUser(
        auth.getNonNullableWorkspace(),
        user.toJSON(),
        assistantLimits.maxAwuCreditsTimeframe
      ),
      timeframeSeconds: getTimeframeSecondsFromLiteral(
        assistantLimits.maxAwuCreditsTimeframe
      ),
      incrementBy: costCredits,
      logger,
    });
  }

  return costCredits;
}

async function fetchRunUsagesForAgentMessage(
  auth: Authenticator,
  runIds: string[] | null
): Promise<(RunUsageType & { runKey: string | null })[]> {
  const dustRunIds = [...new Set(runIds ?? [])];
  if (dustRunIds.length === 0) {
    return [];
  }

  // All runs are fetched from this message's own runIds, so every usage they
  // produce belongs to this message.
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  return RunResource.listRunUsagesForRuns(auth, { runs });
}
