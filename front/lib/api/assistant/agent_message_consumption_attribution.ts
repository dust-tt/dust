import { getToolCallDisplayLabel } from "@app/lib/actions/tool_display_labels";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  attributedCreditsForTokens,
  buildRunAttribution,
  getRunTokenRates,
  type RunUsageWithIdentity,
  serializeToolCallForAttribution,
  serializeToolResultForAttribution,
  type ToolCallAttributionEvidence,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/domain";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import {
  AgentMessageConsumptionItemResource,
  type CompletedAgentMessageConsumptionItem,
  type CompletedToolConsumptionItem,
  type PendingToolConsumptionCompletion,
  type PendingToolConsumptionItem,
} from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { tokenCountForTexts } from "@app/lib/tokenization";
import type { AgentMessageConsumptionAttribution } from "@app/types/assistant/agent_message_consumption";
import type {
  AgentMessageConsumptionEvidence,
  AgentMessageDirectToolCreditAmount,
} from "@app/types/assistant/agent_run";
import {
  type AgentMessageStatus,
  UNRESUMABLE_AGENT_MESSAGE_STATUSES,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

export { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION };

type MessageRunEvidence = {
  runs: RunResource[];
  runUsages: RunUsageWithIdentity[];
  hasAllRuns: boolean;
};

async function listRunEvidenceForMessage(
  auth: Authenticator,
  runIds: string[] | null
): Promise<MessageRunEvidence> {
  const dustRunIds = [...new Set(runIds ?? [])];
  if (dustRunIds.length === 0) {
    return { runs: [], runUsages: [], hasAllRuns: true };
  }

  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  return {
    runs,
    runUsages: await RunResource.listRunUsagesForRuns(auth, { runs }),
    hasAllRuns: runs.length === dustRunIds.length,
  };
}

async function measureTokens(
  auth: Authenticator,
  usage: RunUsageWithIdentity,
  texts: string[]
): Promise<number[]> {
  if (texts.length === 0) {
    return [];
  }

  const model = getModelConfigByModelId(usage.modelId);
  if (!model || model.providerId !== usage.providerId) {
    throw new Error(
      `Unsupported model for consumption attribution: ${usage.providerId}/${usage.modelId}`
    );
  }
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const result = await tokenCountForTexts(texts, model, credentials);
  if (result.isErr()) {
    throw result.error;
  }

  return result.value;
}

function resolveEmittingUsageByActionId({
  evidence,
  actions,
  runs,
  runUsages,
  existingItems,
}: {
  evidence: AgentMessageConsumptionEvidence[];
  actions: AgentMCPActionResource[];
  runs: RunResource[];
  runUsages: RunUsageWithIdentity[];
  existingItems: AgentMessageConsumptionItemResource[];
}): Map<ModelId, RunUsageWithIdentity | null> {
  const actionByModelId = new Map(
    actions.map((action) => [action.id, action] as const)
  );
  const runByDustRunId = new Map(
    runs.map((run) => [run.dustRunId, run] as const)
  );
  const usageByModelId = new Map(
    runUsages.map((usage) => [usage.runUsageModelId, usage] as const)
  );
  const usagesByRunModelId = new Map<ModelId, RunUsageWithIdentity[]>();
  for (const usage of runUsages) {
    const usages = usagesByRunModelId.get(usage.runModelId) ?? [];
    usages.push(usage);
    usagesByRunModelId.set(usage.runModelId, usages);
  }

  const usageByActionId = new Map<ModelId, RunUsageWithIdentity | null>();
  for (const modelCall of evidence) {
    const run = modelCall.dustRunId
      ? runByDustRunId.get(modelCall.dustRunId)
      : null;
    if (modelCall.dustRunId && !run) {
      throw new Error(
        `Attribution run does not belong to the agent message: ${modelCall.dustRunId}`
      );
    }
    const usages = run ? (usagesByRunModelId.get(run.id) ?? []) : [];
    if (run && modelCall.actionModelIds.length > 0 && usages.length !== 1) {
      throw new Error(
        `Expected one run usage for a model call emitting tools, found ${usages.length}`
      );
    }
    const usage = usages[0] ?? null;

    for (const actionModelId of modelCall.actionModelIds) {
      if (!actionByModelId.has(actionModelId)) {
        throw new Error("Cannot resolve all emitted tool actions");
      }
      const previousUsage = usageByActionId.get(actionModelId);
      if (
        usageByActionId.has(actionModelId) &&
        previousUsage?.runUsageModelId !== usage?.runUsageModelId
      ) {
        throw new Error("A tool action has conflicting emitting run evidence");
      }
      usageByActionId.set(actionModelId, usage);
    }
  }

  for (const item of existingItems) {
    if (item.itemType !== "tool" || item.agentMCPActionId === null) {
      continue;
    }
    const usage = item.runUsageId
      ? (usageByModelId.get(item.runUsageId) ?? null)
      : null;
    if (item.runUsageId !== null && !usage) {
      throw new Error("A tool item references an unknown run usage");
    }
    const previousUsage = usageByActionId.get(item.agentMCPActionId);
    if (
      usageByActionId.has(item.agentMCPActionId) &&
      previousUsage?.runUsageModelId !== usage?.runUsageModelId
    ) {
      throw new Error("Stored and current emitting run evidence conflict");
    }
    usageByActionId.set(item.agentMCPActionId, usage);
  }

  for (const action of actions) {
    if (!usageByActionId.has(action.id)) {
      if (isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)) {
        usageByActionId.set(action.id, null);
      } else {
        throw new Error(`Emitting run evidence is missing for ${action.sId}`);
      }
    }
  }

  return usageByActionId;
}

async function buildAttributionRecords(
  auth: Authenticator,
  {
    actions,
    runUsages,
    usageByActionId,
    existingItems,
    directToolCreditAmounts,
    messageStatus,
  }: {
    actions: AgentMCPActionResource[];
    runUsages: RunUsageWithIdentity[];
    usageByActionId: Map<ModelId, RunUsageWithIdentity | null>;
    existingItems: AgentMessageConsumptionItemResource[];
    directToolCreditAmounts: AgentMessageDirectToolCreditAmount[];
    messageStatus: AgentMessageStatus | null;
  }
): Promise<{
  completedItems: CompletedAgentMessageConsumptionItem[];
  pendingToolItems: PendingToolConsumptionItem[];
  completedPendingTools: PendingToolConsumptionCompletion[];
}> {
  const actionsByUsageId = new Map<ModelId, AgentMCPActionResource[]>();
  for (const action of actions) {
    const usage = usageByActionId.get(action.id);
    if (usage) {
      const usageActions = actionsByUsageId.get(usage.runUsageModelId) ?? [];
      usageActions.push(action);
      actionsByUsageId.set(usage.runUsageModelId, usageActions);
    }
  }

  const existingToolItemByActionId = new Map(
    existingItems.flatMap((item) =>
      item.itemType === "tool" && item.agentMCPActionId !== null
        ? ([[item.agentMCPActionId, item] as const] as const)
        : []
    )
  );
  const completedItems: CompletedAgentMessageConsumptionItem[] = [];
  const toolCallEvidenceByActionId = new Map<
    ModelId,
    ToolCallAttributionEvidence
  >();
  for (const usage of runUsages) {
    const usageActions = actionsByUsageId.get(usage.runUsageModelId) ?? [];
    if (
      hasCompleteRunAttribution({ usage, items: existingItems }) &&
      usageActions.every((action) => existingToolItemByActionId.has(action.id))
    ) {
      continue;
    }
    const measuredToolOutputTokensCounts = await measureTokens(
      auth,
      usage,
      usageActions.map(serializeToolCallForAttribution)
    );
    const runAttribution = buildRunAttribution({
      usage,
      actions: usageActions,
      measuredToolOutputTokensCounts,
    });
    completedItems.push(...runAttribution.completedItems);
    for (const toolEvidence of runAttribution.toolCallEvidence) {
      toolCallEvidenceByActionId.set(toolEvidence.action.id, toolEvidence);
    }
  }

  const directCreditByActionId = new Map(
    directToolCreditAmounts.map(
      ({ actionModelId, directCreditAmountMicro }) =>
        [actionModelId, directCreditAmountMicro] as const
    )
  );
  const actionsNeedingResultEvidence = actions.filter((action) => {
    const existingItem = existingToolItemByActionId.get(action.id);
    return (
      directCreditByActionId.has(action.id) &&
      (!existingItem || existingItem.completedAt === null) &&
      usageByActionId.get(action.id) !== null
    );
  });
  const outputItemsByActionId =
    await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
      actionIds: actionsNeedingResultEvidence.map((action) => action.id),
      ignoreContent: false,
    });
  const inputTokensCountByActionId = new Map<ModelId, number>();
  for (const usage of runUsages) {
    const resultActions = actionsNeedingResultEvidence.filter(
      (action) =>
        usageByActionId.get(action.id)?.runUsageModelId ===
          usage.runUsageModelId &&
        (outputItemsByActionId.get(action.id)?.length ?? 0) > 0
    );
    const measuredResultTokensCounts = await measureTokens(
      auth,
      usage,
      resultActions.map((action) =>
        serializeToolResultForAttribution({
          action,
          output: (outputItemsByActionId.get(action.id) ?? []).map(
            (outputItem) => outputItem.content
          ),
        })
      )
    );
    for (const [index, action] of resultActions.entries()) {
      inputTokensCountByActionId.set(
        action.id,
        measuredResultTokensCounts[index]
      );
    }
  }

  const pendingToolItems: PendingToolConsumptionItem[] = [];
  const completedPendingTools: PendingToolConsumptionCompletion[] = [];
  for (const action of actions) {
    const existingItem = existingToolItemByActionId.get(action.id);
    if (existingItem && existingItem.completedAt !== null) {
      continue;
    }

    const usage = usageByActionId.get(action.id) ?? null;
    const toolCallEvidence = toolCallEvidenceByActionId.get(action.id);
    const outputTokensCount = existingItem
      ? existingItem.outputTokensCount
      : (toolCallEvidence?.outputTokensCount ?? null);
    const outputCreditAmountMicro =
      existingItem?.grossAttributedCreditAmountMicro ??
      toolCallEvidence?.grossAttributedCreditAmountMicro ??
      0;
    const isTerminalWithoutToolCompletion =
      messageStatus !== null &&
      UNRESUMABLE_AGENT_MESSAGE_STATUSES.includes(messageStatus);
    if (
      !directCreditByActionId.has(action.id) &&
      !isTerminalWithoutToolCompletion
    ) {
      if (!existingItem) {
        pendingToolItems.push({
          action,
          runUsageModelId: usage?.runUsageModelId ?? null,
          outputTokensCount,
          grossAttributedCreditAmountMicro: outputCreditAmountMicro,
        });
      }
      continue;
    }

    const directCreditAmountMicro =
      directCreditByActionId.get(action.id) ?? null;
    const inputTokensCount = inputTokensCountByActionId.get(action.id) ?? null;
    const rates = usage ? getRunTokenRates(usage) : null;
    const inputCreditAmountMicro =
      inputTokensCount !== null && rates
        ? attributedCreditsForTokens({
            tokensCount: inputTokensCount,
            costMicroUsdPerToken: rates.inputCostMicroUsdPerToken,
          })
        : 0;
    const completedTool: Omit<CompletedToolConsumptionItem, "itemType"> = {
      action,
      runUsageModelId: usage?.runUsageModelId ?? null,
      inputTokensCount,
      outputTokensCount,
      grossAttributedCreditAmountMicro:
        outputCreditAmountMicro +
        inputCreditAmountMicro +
        (directCreditAmountMicro ?? 0),
      directCreditAmountMicro,
    };
    if (existingItem) {
      completedPendingTools.push({
        action,
        inputTokensCount,
        grossAttributedCreditAmountMicro:
          completedTool.grossAttributedCreditAmountMicro,
        directCreditAmountMicro,
      });
    } else {
      completedItems.push({ itemType: "tool", ...completedTool });
    }
  }

  return { completedItems, pendingToolItems, completedPendingTools };
}

export async function materializeAgentMessageConsumptionAttribution(
  auth: Authenticator,
  {
    agentMessageId,
    evidence = [],
    directToolCreditAmounts = [],
    messageStatus = null,
  }: {
    agentMessageId: string;
    evidence?: AgentMessageConsumptionEvidence[];
    directToolCreditAmounts?: AgentMessageDirectToolCreditAmount[];
    messageStatus?: AgentMessageStatus | null;
  }
): Promise<Result<undefined, Error>> {
  try {
    const creditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId,
      });
    if (!creditContext) {
      return new Ok(undefined);
    }
    const [conversation] = await ConversationResource.fetchByModelIds(auth, [
      creditContext.conversationModelId,
    ]);
    if (!conversation) {
      return new Err(new Error("Attribution conversation not found"));
    }

    const [actions, runEvidence, existingItems] = await Promise.all([
      AgentMCPActionResource.listByAgentMessageIds(auth, [
        creditContext.agentMessageModelId,
      ]),
      listRunEvidenceForMessage(auth, creditContext.runIds),
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [creditContext.agentMessageModelId],
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      }),
    ]);
    if (!runEvidence.hasAllRuns) {
      return new Err(new Error("Cannot resolve all runs for attribution"));
    }

    const usageByActionId = resolveEmittingUsageByActionId({
      evidence,
      actions,
      runs: runEvidence.runs,
      runUsages: runEvidence.runUsages,
      existingItems,
    });
    const records = await buildAttributionRecords(auth, {
      actions,
      runUsages: runEvidence.runUsages,
      usageByActionId,
      existingItems,
      directToolCreditAmounts,
      messageStatus,
    });

    await AgentMessageConsumptionItemResource.insertCompletedItemsIdempotently(
      auth,
      {
        conversation,
        agentMessageModelId: creditContext.agentMessageModelId,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        records: records.completedItems,
      }
    );
    for (const item of records.pendingToolItems) {
      await AgentMessageConsumptionItemResource.insertPendingToolItemIdempotently(
        auth,
        {
          conversation,
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
          item,
        }
      );
    }
    for (const item of records.completedPendingTools) {
      await AgentMessageConsumptionItemResource.completePendingToolItemIdempotently(
        auth,
        {
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
          item,
        }
      );
    }

    const storedItems =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [creditContext.agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );
    const storedToolItemByActionId = new Map(
      storedItems.flatMap((item) =>
        item.itemType === "tool" && item.agentMCPActionId !== null
          ? ([[item.agentMCPActionId, item] as const] as const)
          : []
      )
    );
    const completedActionIds = new Set(
      directToolCreditAmounts.map(({ actionModelId }) => actionModelId)
    );
    const isUnresumableMessage =
      messageStatus !== null &&
      UNRESUMABLE_AGENT_MESSAGE_STATUSES.includes(messageStatus);
    if (
      runEvidence.runUsages.some(
        (usage) => !hasCompleteRunAttribution({ usage, items: storedItems })
      ) ||
      actions.some((action) => {
        const item = storedToolItemByActionId.get(action.id);
        return (
          !item ||
          ((completedActionIds.has(action.id) || isUnresumableMessage) &&
            item.completedAt === null)
        );
      })
    ) {
      return new Err(new Error("Consumption attribution is incomplete"));
    }

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

function hasCompleteRunAttribution({
  usage,
  items,
}: {
  usage: RunUsageWithIdentity;
  items: AgentMessageConsumptionItemResource[];
}): boolean {
  const usageItems = items.filter(
    (item) => item.runUsageId === usage.runUsageModelId
  );
  const inputItem = usageItems.find((item) => item.itemType === "input");
  const outputItem = usageItems.find((item) => item.itemType === "output");
  const reasoningItem = usageItems.find(
    (item) => item.itemType === "reasoning"
  );
  if (!inputItem || !outputItem) {
    return false;
  }
  if (
    usage.reasoningTokens !== null &&
    reasoningItem?.outputTokensCount !== usage.reasoningTokens
  ) {
    return false;
  }
  if (inputItem.inputTokensCount !== usage.promptTokens) {
    return false;
  }

  const attributedOutputTokensCount = usageItems.reduce(
    (total, item) => total + (item.outputTokensCount ?? 0),
    0
  );
  return attributedOutputTokensCount === usage.completionTokens;
}

export async function getAgentMessageConsumptionAttribution(
  auth: Authenticator,
  {
    agentMessageId,
  }: {
    agentMessageId: string;
  }
): Promise<Result<AgentMessageConsumptionAttribution | null, Error>> {
  try {
    const creditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId,
      });
    if (!creditContext) {
      return new Ok(null);
    }

    const [items, actions, runEvidence] = await Promise.all([
      AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
        agentMessageModelIds: [creditContext.agentMessageModelId],
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      }),
      AgentMCPActionResource.listByAgentMessageIds(auth, [
        creditContext.agentMessageModelId,
      ]),
      listRunEvidenceForMessage(auth, creditContext.runIds),
    ]);
    if (!runEvidence.hasAllRuns) {
      return new Ok(null);
    }
    const { runUsages } = runEvidence;
    if (items.length === 0 || items.some((item) => item.completedAt === null)) {
      return new Ok(null);
    }

    const toolItems = items.filter((item) => item.itemType === "tool");
    const expectedRunUsageIds = new Set(
      runUsages.map((usage) => usage.runUsageModelId)
    );
    const representedRunUsageIds = new Set(
      items.flatMap((item) =>
        item.itemType !== "tool" && item.runUsageId !== null
          ? [item.runUsageId]
          : []
      )
    );
    if (
      toolItems.length !== actions.length ||
      representedRunUsageIds.size !== expectedRunUsageIds.size ||
      [...representedRunUsageIds].some(
        (runUsageId) => !expectedRunUsageIds.has(runUsageId)
      ) ||
      toolItems.some(
        (item) =>
          item.runUsageId !== null && !expectedRunUsageIds.has(item.runUsageId)
      ) ||
      runUsages.some((usage) => !hasCompleteRunAttribution({ usage, items }))
    ) {
      return new Ok(null);
    }

    const actionByModelId = new Map<ModelId, AgentMCPActionResource>(
      actions.map((action) => [action.id, action])
    );
    const serializedItems = items.map((item) => {
      const action = item.agentMCPActionId
        ? actionByModelId.get(item.agentMCPActionId)
        : null;
      if (item.itemType === "tool" && !action) {
        return null;
      }

      const serializedAction = action?.toJSON();
      return {
        itemType: item.itemType,
        inputTokensCount: item.inputTokensCount,
        outputTokensCount: item.outputTokensCount,
        grossAttributedCreditAmountMicro: item.grossAttributedCreditAmountMicro,
        directCreditAmountMicro: item.directCreditAmountMicro,
        tool: serializedAction
          ? {
              actionId: serializedAction.sId,
              displayName: getToolCallDisplayLabel(
                serializedAction.functionCallName,
                "done"
              ),
              functionCallName: serializedAction.functionCallName,
              internalMCPServerName: serializedAction.internalMCPServerName,
              toolName: serializedAction.toolName,
            }
          : null,
      };
    });
    if (serializedItems.some((item) => item === null)) {
      return new Ok(null);
    }

    const completeItems = serializedItems.filter(
      (item): item is NonNullable<typeof item> => item !== null
    );
    return new Ok({
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      grossAttributedCreditAmountMicro: completeItems.reduce(
        (total, item) => total + item.grossAttributedCreditAmountMicro,
        0
      ),
      items: completeItems,
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
