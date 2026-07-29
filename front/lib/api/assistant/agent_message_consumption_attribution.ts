import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { getToolCallDisplayLabel } from "@app/lib/actions/tool_display_labels";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  attributedCreditsForTokens,
  buildPendingRunAttributionItems,
  getRunTokenRates,
  normalizeTokenMeasurements,
  type RunUsageWithIdentity,
  serializeToolCallForAttribution,
  serializeToolResultForAttribution,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/domain";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { getModelConfigByModelId } from "@app/lib/llms/model_configurations";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type { AgentMessageConsumptionAttribution } from "@app/types/assistant/agent_message_consumption";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { Transaction } from "sequelize";

export { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION };

async function listRunUsagesForMessage(
  auth: Authenticator,
  runIds: string[] | null
): Promise<{
  runUsages: RunUsageWithIdentity[];
  hasAllRuns: boolean;
}> {
  const dustRunIds = [...new Set(runIds ?? [])];
  if (dustRunIds.length === 0) {
    return { runUsages: [], hasAllRuns: true };
  }

  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  return {
    runUsages: await RunResource.listRunUsagesForRuns(auth, { runs }),
    hasAllRuns: runs.length === dustRunIds.length,
  };
}

export async function recordAgentMessageModelCallEvidence(
  auth: Authenticator,
  {
    agentMessageId,
    dustRunId,
    actionModelIds,
  }: {
    agentMessageId: string;
    dustRunId: string | null;
    actionModelIds: ModelId[];
  }
): Promise<Result<undefined, Error>> {
  try {
    const creditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId,
      });
    if (!creditContext) {
      return new Err(
        new Error("Attribution context does not own the agent message")
      );
    }
    if (dustRunId !== null && !creditContext.runIds?.includes(dustRunId)) {
      return new Err(
        new Error("Attribution run does not belong to the agent message")
      );
    }

    const run = dustRunId
      ? await RunResource.fetchByDustRunId(auth, { dustRunId })
      : null;
    if (dustRunId !== null && !run) {
      return new Err(new Error(`Run not found for dust run ${dustRunId}`));
    }

    const runUsages = run
      ? await RunResource.listRunUsagesForRuns(auth, { runs: [run] })
      : [];
    if (dustRunId !== null && runUsages.length === 0) {
      return new Err(
        new Error(`Run usage not found for dust run ${dustRunId}`)
      );
    }
    if (
      dustRunId !== null &&
      actionModelIds.length > 0 &&
      runUsages.length !== 1
    ) {
      return new Err(
        new Error(
          `Expected one run usage for a model call emitting tools, found ${runUsages.length}`
        )
      );
    }
    const fetchedActions = await AgentMCPActionResource.fetchByModelIds(
      auth,
      actionModelIds
    );
    const actionByModelId = new Map(
      fetchedActions.map((action) => [action.id, action])
    );
    const actions = actionModelIds.flatMap((actionModelId) => {
      const action = actionByModelId.get(actionModelId);
      return action ? [action] : [];
    });
    if (actions.length !== actionModelIds.length) {
      return new Err(new Error("Cannot resolve all emitted tool actions"));
    }
    if (
      actions.some(
        (action) => action.agentMessageId !== creditContext.agentMessageModelId
      )
    ) {
      return new Err(
        new Error("Cannot attribute actions owned by another agent message")
      );
    }

    await withTransaction(async (transaction: Transaction) => {
      for (const usage of runUsages) {
        await AgentMessageConsumptionItemResource.createIdempotently(
          auth,
          buildPendingRunAttributionItems({
            conversationModelId: creditContext.conversationModelId,
            agentMessageModelId: creditContext.agentMessageModelId,
            usage,
          }),
          { transaction }
        );

        if (runUsages.length === 1) {
          await AgentMessageConsumptionItemResource.createIdempotently(
            auth,
            actions.map((action) => {
              return {
                conversationId: creditContext.conversationModelId,
                agentMessageId: creditContext.agentMessageModelId,
                runUsageId: usage.runUsageModelId,
                agentMCPActionId: action.id,
                itemKey: `tool-action:${action.id}`,
                itemType: "tool" as const,
                attributionVersion:
                  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
                inputTokensCount: null,
                outputTokensCount: null,
                grossAttributedCreditAmountMicro: 0,
                directCreditAmountMicro: null,
                completedAt: null,
              };
            }),
            { transaction }
          );
        }
      }

      if (runUsages.length === 0) {
        await AgentMessageConsumptionItemResource.createIdempotently(
          auth,
          actions.map((action) => ({
            conversationId: creditContext.conversationModelId,
            agentMessageId: creditContext.agentMessageModelId,
            runUsageId: null,
            agentMCPActionId: action.id,
            itemKey: `tool-action:${action.id}`,
            itemType: "tool" as const,
            attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
            inputTokensCount: null,
            outputTokensCount: null,
            grossAttributedCreditAmountMicro: 0,
            directCreditAmountMicro: null,
            completedAt: null,
          })),
          { transaction }
        );
      }
    });

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

async function materializeModelCallAttribution(
  auth: Authenticator,
  {
    usage,
    items,
    actionByModelId,
  }: {
    usage: RunUsageWithIdentity;
    items: AgentMessageConsumptionItemResource[];
    actionByModelId: Map<ModelId, AgentMCPActionResource>;
  }
): Promise<Result<undefined, Error>> {
  try {
    const usageItems = items.filter(
      (item) => item.runUsageId === usage.runUsageModelId
    );
    const outputItem = usageItems.find((item) => item.itemType === "output");
    if (!outputItem) {
      return new Err(
        new Error(
          `Output attribution missing for usage ${usage.runUsageModelId}`
        )
      );
    }
    if (outputItem.completedAt !== null) {
      return new Ok(undefined);
    }

    const toolItems = usageItems.filter((item) => item.itemType === "tool");
    const actions = toolItems.map((item) => {
      const action = item.agentMCPActionId
        ? actionByModelId.get(item.agentMCPActionId)
        : null;
      if (!action) {
        throw new Error("Tool attribution action is missing");
      }
      return action;
    });

    let measuredToolOutputTokensCounts: number[] = [];
    if (actions.length > 0) {
      const model = getModelConfigByModelId(usage.modelId);
      if (!model || model.providerId !== usage.providerId) {
        return new Err(
          new Error(
            `Unsupported model for consumption attribution: ${usage.providerId}/${usage.modelId}`
          )
        );
      }
      const credentials = await getLlmCredentials(auth, {
        skipEmbeddingApiKeyRequirement: true,
      });
      const tokenCountsResult = await tokenCountForTexts(
        actions.map(serializeToolCallForAttribution),
        model,
        credentials
      );
      if (tokenCountsResult.isErr()) {
        return tokenCountsResult;
      }
      measuredToolOutputTokensCounts = tokenCountsResult.value;
    }

    const reasoningTokensCount = usage.reasoningTokens ?? 0;
    const availableTokensCount = Math.max(
      usage.completionTokens - reasoningTokensCount,
      0
    );
    const toolOutputTokensCounts = normalizeTokenMeasurements(
      measuredToolOutputTokensCounts,
      availableTokensCount
    );
    const toolOutputTokensCount = toolOutputTokensCounts.reduce(
      (total, count) => total + count,
      0
    );
    const outputTokensCount = availableTokensCount - toolOutputTokensCount;
    const rates = getRunTokenRates(usage);

    await withTransaction(async (transaction: Transaction) => {
      const outputUpdatedCount =
        await AgentMessageConsumptionItemResource.updatePendingOutputItem(
          auth,
          {
            runUsageModelId: usage.runUsageModelId,
            attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
            outputTokensCount,
            grossAttributedCreditAmountMicro: attributedCreditsForTokens({
              tokensCount: outputTokensCount,
              costMicroUsdPerToken: rates.outputCostMicroUsdPerToken,
            }),
            transaction,
          }
        );
      if (outputUpdatedCount !== 1) {
        throw new Error("Model output attribution changed concurrently");
      }

      for (const [index, action] of actions.entries()) {
        const tokensCount = toolOutputTokensCounts[index];
        const toolUpdatedCount =
          await AgentMessageConsumptionItemResource.updatePendingToolOutput(
            auth,
            {
              agentMCPActionModelId: action.id,
              attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
              outputTokensCount: tokensCount,
              grossAttributedCreditAmountMicro: attributedCreditsForTokens({
                tokensCount,
                costMicroUsdPerToken: rates.outputCostMicroUsdPerToken,
              }),
              transaction,
            }
          );
        if (toolUpdatedCount !== 1) {
          throw new Error("Tool output attribution changed concurrently");
        }
      }
    });

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

async function recordAgentMessageToolActionAttribution(
  auth: Authenticator,
  {
    agentMessageId,
    action,
    directCreditAmountMicro: capturedDirectCreditAmountMicro,
  }: {
    agentMessageId: string;
    action: AgentMCPActionResource;
    directCreditAmountMicro: number | null | undefined;
  }
): Promise<Result<undefined, Error>> {
  try {
    const item = await AgentMessageConsumptionItemResource.findToolItem(auth, {
      agentMCPActionModelId: action.id,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    });
    if (!item) {
      return new Err(
        new Error(`Consumption attribution item not found for ${action.sId}`)
      );
    }
    if (item.completedAt !== null) {
      return new Ok(undefined);
    }
    if (item.runUsageId !== null && item.outputTokensCount === null) {
      return new Err(
        new Error(`Tool output attribution is incomplete for ${action.sId}`)
      );
    }
    const creditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId,
      });
    if (
      !creditContext ||
      creditContext.agentMessageModelId !== action.agentMessageId
    ) {
      return new Err(
        new Error("Tool attribution does not belong to the agent message")
      );
    }

    const usage = item.runUsageId
      ? await RunResource.fetchRunUsageByModelId(auth, {
          runUsageModelId: item.runUsageId,
        })
      : null;
    let inputTokensCount: number | null = null;
    if (usage) {
      const model = getModelConfigByModelId(usage.modelId);
      if (!model || model.providerId !== usage.providerId) {
        return new Err(
          new Error(
            `Unsupported model for consumption attribution: ${usage.providerId}/${usage.modelId}`
          )
        );
      }
      const outputItemsByActionId =
        await AgentMCPActionResource.fetchOutputItemsByActionIds(auth, {
          actionIds: [action.id],
          ignoreContent: false,
        });
      const outputItems = outputItemsByActionId.get(action.id) ?? [];
      if (outputItems.length > 0) {
        const credentials = await getLlmCredentials(auth, {
          skipEmbeddingApiKeyRequirement: true,
        });
        const tokenCountsResult = await tokenCountForTexts(
          [
            serializeToolResultForAttribution({
              action,
              output: outputItems.map((outputItem) => outputItem.content),
            }),
          ],
          model,
          credentials
        );
        if (tokenCountsResult.isErr()) {
          return tokenCountsResult;
        }
        inputTokensCount = tokenCountsResult.value[0];
      }
    }

    const isFinal = isToolExecutionStatusFinal(action.status);
    if (isFinal && capturedDirectCreditAmountMicro === undefined) {
      return new Err(
        new Error(`Direct credit evidence is missing for ${action.sId}`)
      );
    }
    const directCreditAmountMicro = isFinal
      ? (capturedDirectCreditAmountMicro ?? null)
      : null;
    const rates = usage ? getRunTokenRates(usage) : null;
    const inputCreditAmountMicro =
      inputTokensCount === null || rates === null
        ? 0
        : attributedCreditsForTokens({
            tokensCount: inputTokensCount,
            costMicroUsdPerToken: rates.inputCostMicroUsdPerToken,
          });
    const outputCreditAmountMicro = rates
      ? attributedCreditsForTokens({
          tokensCount: item.outputTokensCount ?? 0,
          costMicroUsdPerToken: rates.outputCostMicroUsdPerToken,
        })
      : 0;
    const grossAttributedCreditAmountMicro =
      outputCreditAmountMicro +
      inputCreditAmountMicro +
      (directCreditAmountMicro ?? 0);

    const updatedCount =
      await AgentMessageConsumptionItemResource.updatePendingToolItem(auth, {
        agentMCPActionModelId: action.id,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        inputTokensCount,
        grossAttributedCreditAmountMicro,
        directCreditAmountMicro,
        completedAt: isFinal ? new Date() : null,
      });
    if (updatedCount !== 1) {
      const currentItem =
        await AgentMessageConsumptionItemResource.findToolItem(auth, {
          agentMCPActionModelId: action.id,
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        });
      if (!currentItem || currentItem.completedAt === null) {
        return new Err(
          new Error(`Failed to update tool attribution ${action.sId}`)
        );
      }
    }

    return new Ok(undefined);
  } catch (error) {
    return new Err(normalizeError(error));
  }
}

export async function materializeAgentMessageConsumptionAttribution(
  auth: Authenticator,
  {
    agentMessageId,
    directToolCreditAmounts = [],
  }: {
    agentMessageId: string;
    directToolCreditAmounts?: {
      actionModelId: ModelId;
      directCreditAmountMicro: number | null;
    }[];
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

    const [actions, runUsageEvidence, initialItems] = await Promise.all([
      AgentMCPActionResource.listByAgentMessageIds(auth, [
        creditContext.agentMessageModelId,
      ]),
      listRunUsagesForMessage(auth, creditContext.runIds),
      AgentMessageConsumptionItemResource.listByAgentMessage(auth, {
        agentMessageModelId: creditContext.agentMessageModelId,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      }),
    ]);
    if (!runUsageEvidence.hasAllRuns) {
      return new Err(new Error("Cannot resolve all runs for attribution"));
    }
    const { runUsages } = runUsageEvidence;
    const representedRunUsageIds = new Set(
      initialItems.flatMap((item) =>
        item.itemType !== "tool" && item.runUsageId !== null
          ? [item.runUsageId]
          : []
      )
    );
    for (const usage of runUsages) {
      if (representedRunUsageIds.has(usage.runUsageModelId)) {
        continue;
      }
      await AgentMessageConsumptionItemResource.createIdempotently(
        auth,
        buildPendingRunAttributionItems({
          conversationModelId: creditContext.conversationModelId,
          agentMessageModelId: creditContext.agentMessageModelId,
          usage,
        })
      );
    }
    const itemActionIds = new Set(
      initialItems.flatMap((item) =>
        item.agentMCPActionId ? [item.agentMCPActionId] : []
      )
    );
    const sandboxChildActions = actions.filter(
      (action) =>
        !itemActionIds.has(action.id) &&
        isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
    );
    await AgentMessageConsumptionItemResource.createIdempotently(
      auth,
      sandboxChildActions.map((action) => ({
        conversationId: creditContext.conversationModelId,
        agentMessageId: creditContext.agentMessageModelId,
        runUsageId: null,
        agentMCPActionId: action.id,
        itemKey: `tool-action:${action.id}`,
        itemType: "tool" as const,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        inputTokensCount: null,
        outputTokensCount: null,
        grossAttributedCreditAmountMicro: 0,
        directCreditAmountMicro: null,
        completedAt: null,
      }))
    );

    const items =
      sandboxChildActions.length > 0 ||
      representedRunUsageIds.size < runUsages.length
        ? await AgentMessageConsumptionItemResource.listByAgentMessage(auth, {
            agentMessageModelId: creditContext.agentMessageModelId,
            attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
          })
        : initialItems;
    const actionByModelId = new Map(
      actions.map((action) => [action.id, action])
    );
    const directCreditByActionId = new Map(
      directToolCreditAmounts.map((item) => [
        item.actionModelId,
        item.directCreditAmountMicro,
      ])
    );
    let firstError: Error | null = null;
    const failedRunUsageIds = new Set<ModelId>();
    for (const usage of runUsages) {
      const result = await materializeModelCallAttribution(auth, {
        usage,
        items,
        actionByModelId,
      });
      if (result.isErr() && firstError === null) {
        firstError = result.error;
      }
      if (result.isErr()) {
        failedRunUsageIds.add(usage.runUsageModelId);
      }
    }
    const toolItemByActionId = new Map(
      items.flatMap((item) =>
        item.itemType === "tool" && item.agentMCPActionId !== null
          ? [[item.agentMCPActionId, item] as const]
          : []
      )
    );
    for (const action of actions) {
      const toolItem = toolItemByActionId.get(action.id);
      if (
        toolItem?.runUsageId !== null &&
        toolItem?.runUsageId !== undefined &&
        failedRunUsageIds.has(toolItem.runUsageId)
      ) {
        continue;
      }
      const result = await recordAgentMessageToolActionAttribution(auth, {
        agentMessageId,
        action,
        directCreditAmountMicro: directCreditByActionId.get(action.id),
      });
      if (result.isErr() && firstError === null) {
        firstError = result.error;
      }
    }

    return firstError ? new Err(firstError) : new Ok(undefined);
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

    const [items, actions, runUsageEvidence] = await Promise.all([
      AgentMessageConsumptionItemResource.listByAgentMessage(auth, {
        agentMessageModelId: creditContext.agentMessageModelId,
        attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      }),
      AgentMCPActionResource.listByAgentMessageIds(auth, [
        creditContext.agentMessageModelId,
      ]),
      listRunUsagesForMessage(auth, creditContext.runIds),
    ]);
    if (!runUsageEvidence.hasAllRuns) {
      return new Ok(null);
    }
    const { runUsages } = runUsageEvidence;
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
