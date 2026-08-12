import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { buildLatestMessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  buildRunUsageAttribution,
  buildToolAttribution,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { measureToolCallFootprints } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import type { Authenticator } from "@app/lib/auth";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { toolAwuFromAction } from "@app/lib/metronome/events";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type {
  CompletedAgentMessageConsumptionItem,
  PendingToolConsumptionItem,
} from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

function selectRunUsagesNeedingEvidence({
  actionsByDustRunId,
  currentItems,
  dustRunIdByRunModelId,
  usages,
}: {
  actionsByDustRunId: ReadonlyMap<string, AgentMCPActionResource[]>;
  currentItems: AgentMessageConsumptionItemResource[];
  dustRunIdByRunModelId: ReadonlyMap<ModelId, string>;
  usages: RunUsageWithRunKeyType[];
}): RunUsageWithRunKeyType[] {
  const modelItemTypesByRunUsageModelId = new Map<ModelId, Set<string>>();
  const toolItemByActionModelId = new Map<
    ModelId,
    AgentMessageConsumptionItemResource
  >();
  const runUsageModelIdsWithEvidence = new Set<ModelId>();

  for (const item of currentItems) {
    runUsageModelIdsWithEvidence.add(item.runUsageId);
    if (item.itemType === "tool") {
      if (item.agentMCPActionId !== null) {
        toolItemByActionModelId.set(item.agentMCPActionId, item);
      }
      continue;
    }
    if (item.runUsageId !== null) {
      const itemTypes =
        modelItemTypesByRunUsageModelId.get(item.runUsageId) ?? new Set();
      itemTypes.add(item.itemType);
      modelItemTypesByRunUsageModelId.set(item.runUsageId, itemTypes);
    }
  }

  return usages.filter((usage) => {
    const dustRunId = dustRunIdByRunModelId.get(usage.runModelId);
    const runActions = (dustRunId && actionsByDustRunId.get(dustRunId)) || [];
    const modelItemTypes = modelItemTypesByRunUsageModelId.get(
      usage.runUsageModelId
    );
    const hasMissingActionItem = runActions.some(
      (action) => !toolItemByActionModelId.has(action.id)
    );
    assert(
      !runUsageModelIdsWithEvidence.has(usage.runUsageModelId) ||
        !hasMissingActionItem,
      "An attributed run usage is missing tool evidence"
    );

    // New usages have no rows. Previously processed usages should have every reported bucket because
    // model evidence is written atomically. Treating a partial set as incomplete is defensive recovery.
    const hasCompleteModelItems =
      modelItemTypes?.has("input") === true &&
      modelItemTypes.has("output") &&
      (usage.reasoningTokens === null || modelItemTypes.has("reasoning"));

    // Tool evidence needs another pass only when absent or when a pending row can now be completed.
    const hasActionNeedingEvidence = runActions.some((action) => {
      const item = toolItemByActionModelId.get(action.id);
      return (
        !item ||
        (item.completedAt === null && isToolExecutionStatusFinal(action.status))
      );
    });

    return !hasCompleteModelItems || hasActionNeedingEvidence;
  });
}

async function buildRunUsageConsumptionEvidence(
  auth: Authenticator,
  {
    enrichedActionByModelId,
    runActions,
    triggeringUserMessageOrigin,
    usage,
  }: {
    enrichedActionByModelId: ReadonlyMap<ModelId, AgentMCPActionWithOutputType>;
    runActions: AgentMCPActionResource[];
    triggeringUserMessageOrigin: UserMessageOrigin | null;
    usage: RunUsageWithRunKeyType;
  }
): Promise<{
  records: CompletedAgentMessageConsumptionItem[];
  pendingToolItems: PendingToolConsumptionItem[];
}> {
  const records: CompletedAgentMessageConsumptionItem[] = [];
  const pendingToolItems: PendingToolConsumptionItem[] = [];

  // Sandbox-child actions are invoked by the in-sandbox dsbx CLI, not by the outer model. They
  // reuse their parent's function-call step content, so measuring them here would tokenize the
  // parent Computer call a second time and separately count a result already carried in the
  // Computer output.
  const modelVisibleRunActions = runActions.filter(
    (action) =>
      !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
  );
  const sandboxChildRunActions = runActions.filter((action) =>
    isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
  );
  const modelVisibleRunActionPairs = modelVisibleRunActions.map((action) => {
    const enrichedAction = enrichedActionByModelId.get(action.id);
    assert(
      enrichedAction,
      "A selected model-visible action must have an enriched counterpart"
    );
    return { action, enrichedAction };
  });

  // Selected usages need both sides of every model-visible tool call so their shared provider
  // output budget is partitioned consistently with the immutable evidence already stored.
  const footprintsRes = await measureToolCallFootprints(auth, {
    modelId: usage.modelId,
    // TODO(2026-07-31 FLAV) Refactor `enrichActionsWithOutputItems` so it still returns the
    // resource.
    toolCalls: modelVisibleRunActionPairs.map(({ action, enrichedAction }) => ({
      action: enrichedAction,
      functionCallArguments: action.functionCallArguments,
    })),
  });
  if (footprintsRes.isErr()) {
    throw new Error(
      `[ConsumptionAttribution] Failed to tokenize tool footprints: ${footprintsRes.error.message}`
    );
  }
  const footprints = footprintsRes.value;

  // Pair each tool call with its enriched form and measured footprint once, here. This is the only
  // place alignment is assumed: measureToolCallFootprints returns counts positioned by the actions
  // it received, and modelVisibleRunActionPairs is aligned with the measured footprints, so index i
  // is the same tool call across both. From here each call carries its own data through the builder,
  // so nothing downstream re-derives the position.
  const measuredToolCalls = modelVisibleRunActionPairs.map(
    ({ action, enrichedAction }, index) => ({
      action,
      enrichedAction,
      footprint: footprints[index],
    })
  );

  // A single partition of the usage: the tool calls take their share of the output budget, and the
  // model buckets take the rest (so the output row here is net of tool emission).
  const { modelItems, toolCalls } = buildRunUsageAttribution({
    usage,
    toolCalls: measuredToolCalls.map((measured) => ({
      tool: measured,
      measuredOutputTokensCount: measured.footprint.callOutputTokensCount,
    })),
  });

  for (const item of modelItems) {
    switch (item.itemType) {
      case "input":
        records.push({
          itemType: "input",
          runUsageModelId: usage.runUsageModelId,
          inputTokensCount: item.inputTokensCount,
          grossAttributedCreditAmountMicro:
            item.grossAttributedCreditAmountMicro,
        });
        break;

      case "output":
      case "reasoning":
        records.push({
          itemType: item.itemType,
          runUsageModelId: usage.runUsageModelId,
          outputTokensCount: item.outputTokensCount,
          grossAttributedCreditAmountMicro:
            item.grossAttributedCreditAmountMicro,
        });
        break;

      default:
        assertNever(item);
    }
  }

  for (const toolCall of toolCalls) {
    const { action, enrichedAction, footprint } = toolCall.tool;

    // A blocked action carries no result and no charge yet, and billing does not charge it. Record
    // only the emitted call output as a pending row. The rest lands once the action is final.
    if (!isToolExecutionStatusFinal(action.status)) {
      pendingToolItems.push({
        action,
        runUsageModelId: usage.runUsageModelId,
        outputTokensCount: toolCall.outputTokensCount,
        grossAttributedCreditAmountMicro:
          toolCall.grossAttributedCreditAmountMicro,
      });
      continue;
    }

    // Zero for a denied call, which billing does not charge. Its emitted output tokens stay
    // attributed here.
    const directCreditAmountMicro = roundCreditsToMicroCredits(
      toolAwuFromAction(
        {
          toolName: enrichedAction.toolName,
          internalMCPServerName: enrichedAction.internalMCPServerName,
          status: action.status,
        },
        triggeringUserMessageOrigin
      )
    );
    const toolAttribution = buildToolAttribution({
      usage,
      toolCall,
      inputTokensCount: footprint.inputTokensCount,
      directCreditAmountMicro,
    });
    records.push({
      itemType: "tool",
      runUsageModelId: usage.runUsageModelId,
      action,
      inputTokensCount: toolAttribution.inputTokensCount,
      outputTokensCount: toolAttribution.outputTokensCount,
      directCreditAmountMicro: toolAttribution.directCreditAmountMicro,
      grossAttributedCreditAmountMicro:
        toolAttribution.grossAttributedCreditAmountMicro,
    });
  }

  for (const action of sandboxChildRunActions) {
    // A blocked child has not reached the nested tool yet. Unlike a directly model-emitted call,
    // it contributes no output footprint while pending.
    if (!isToolExecutionStatusFinal(action.status)) {
      pendingToolItems.push({
        action,
        runUsageModelId: usage.runUsageModelId,
        outputTokensCount: 0,
        grossAttributedCreditAmountMicro: 0,
      });
      continue;
    }

    const enrichedAction = enrichedActionByModelId.get(action.id);
    assert(
      enrichedAction,
      "A completed sandbox child action must have an enriched counterpart"
    );
    const directCreditAmountMicro = roundCreditsToMicroCredits(
      toolAwuFromAction(
        {
          toolName: enrichedAction.toolName,
          internalMCPServerName: enrichedAction.internalMCPServerName,
          status: action.status,
        },
        triggeringUserMessageOrigin
      )
    );

    records.push({
      itemType: "tool",
      runUsageModelId: usage.runUsageModelId,
      action,
      inputTokensCount: 0,
      outputTokensCount: 0,
      directCreditAmountMicro,
      grossAttributedCreditAmountMicro: directCreditAmountMicro,
    });
  }

  return { records, pendingToolItems };
}

async function persistMessageConsumptionAttribution(
  auth: Authenticator,
  {
    actions,
    agentMessageModelId,
    billedCredits,
    conversation,
    dustRunIds,
    pendingToolItems,
    records,
    runs,
    usages,
  }: {
    actions: AgentMCPActionResource[];
    agentMessageModelId: ModelId;
    billedCredits: number | null;
    conversation: ConversationResource;
    dustRunIds: string[];
    pendingToolItems: PendingToolConsumptionItem[];
    records: CompletedAgentMessageConsumptionItem[];
    runs: RunResource[];
    usages: RunUsageWithRunKeyType[];
  }
): Promise<boolean> {
  // Store the immutable evidence first, then materialize the newest complete allocation against the
  // authoritative bill in the same transaction. An incomplete version keeps its evidence with null
  // reconciliation and can be completed by a later finalize.
  return withTransaction(async (transaction) => {
    await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
      conversation,
      agentMessageModelId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records,
      pendingToolItems,
      transaction,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
          transaction,
        }
      );
    const allocation = buildLatestMessageConsumptionAllocation({
      actions,
      billedCredits,
      dustRunIds,
      items,
      runs,
      usages,
    });
    if (!allocation) {
      return false;
    }

    await AgentMessageConsumptionItemResource.setReconciledCreditAmounts(auth, {
      reconciledCreditAmountByItem: allocation.reconciledCreditAmounts.byItem,
      transaction,
    });
    return true;
  });
}

/**
 * Records the per-run consumption attribution breakdown for one settled agent message.
 *
 * This is analytics, not billing: the authoritative charge is computed and stored separately by the
 * credit pipeline. Here we explain the relative composition of that cost by writing, per run usage,
 * one row per model token bucket (input, output, reasoning) and one row per tool call. A directly
 * model-visible tool row carries the output tokens the model spent emitting the call, the input
 * tokens its result would occupy if carried into a later prompt, and the tool's direct credit
 * charge. Sandbox-child calls are direct-charge-only: the outer model emits only the parent
 * Computer call and receives the child's result through the Computer output.
 *
 * Runs once the message has settled, launched from the analytics queue by the finalize activities.
 * It is idempotent by (agent message, attribution version, run usage, item type) for model rows and
 * by (agent message, attribution version, action) for tool rows. Before doing any tokenization, a
 * re-finalize (interrupt/resume, tool confirmation, Temporal retry) reads those identities and only
 * rebuilds new or incomplete run usages. A usage containing a newly completed tool is rebuilt as a
 * unit because all its emitted calls share one provider output-token budget. Reconciliation itself
 * always runs over the full persisted message because the authoritative rounded bill may change.
 *
 * A finalize also fires while the loop is paused on a tool awaiting approval, so an action can be
 * seen here before it is final. Such an action has no result and no charge yet, and billing does not
 * charge it, so its tool row is written pending: only the output the model already spent emitting the
 * call, carved out of the assistant bucket like any other tool call. When a later finalize sees the
 * action final, that pending row is completed in place with the result footprint and direct charge,
 * rather than replaced (the row cannot be re-inserted past its idempotency key).
 */
export async function computeAndStoreAgentMessageConsumptionAttribution(
  auth: Authenticator,
  {
    agentMessageId,
    conversationId,
  }: { agentMessageId: string; conversationId: string }
): Promise<{ costCredits: number | null } | undefined> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const creditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    });
  if (!creditContext) {
    logger.warn(
      { workspaceId, agentMessageId },
      "[ConsumptionAttribution] Agent message not found."
    );
    return;
  }

  const {
    agentMessageModelId,
    previousCostCredits: billedCredits,
    status,
    runIds,
    triggeringUserMessageOrigin,
  } = creditContext;

  // Attribution only explains what was billed, so it mirrors the billing status gate: an untracked
  // status has no charge to compose.
  if (!AGENT_MESSAGE_STATUSES_TO_TRACK.includes(status)) {
    return;
  }

  const dustRunIds = [...new Set(runIds ?? [])];
  if (dustRunIds.length === 0) {
    return;
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId
  );
  if (!conversation) {
    logger.warn(
      { workspaceId, agentMessageId, conversationId },
      "[ConsumptionAttribution] Conversation not found."
    );
    return;
  }

  // Every usage is reached through this message's own runIds, so each one belongs to this message.
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });

  // Group the message's tool calls by the run that emitted them. Each action carries its emitting
  // step content, whose dustRunId identifies that run and is the same identifier the run usages are
  // keyed by.
  const [actions, existingItems] = await Promise.all([
    AgentMCPActionResource.listByAgentMessageIds(auth, [agentMessageModelId]),
    AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [agentMessageModelId],
      maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    }),
  ]);
  const currentItems = existingItems.filter(
    (item) =>
      item.attributionVersion === AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION
  );

  const dustRunIdByRunModelId = new Map(
    runs.map((run) => [run.id, run.dustRunId])
  );

  const actionsByDustRunId = new Map<string, AgentMCPActionResource[]>();
  for (const action of actions) {
    const dustRunId = action.stepContent.dustRunId;
    if (!dustRunId) {
      // Legacy step contents predate dustRunId stamping. Their actions cannot be tied to a run, so
      // they are left out of the tool attribution rather than guessed.
      continue;
    }
    const runActions = actionsByDustRunId.get(dustRunId) ?? [];
    runActions.push(action);
    actionsByDustRunId.set(dustRunId, runActions);
  }

  const usagesToProcess = selectRunUsagesNeedingEvidence({
    actionsByDustRunId,
    currentItems,
    dustRunIdByRunModelId,
    usages,
  });
  const dustRunIdsToProcess = new Set(
    usagesToProcess
      .map((usage) => dustRunIdByRunModelId.get(usage.runModelId))
      .filter((dustRunId): dustRunId is string => dustRunId !== undefined)
  );
  const actionsToEnrich = actions.filter(
    (action) =>
      action.stepContent.dustRunId !== null &&
      dustRunIdsToProcess.has(action.stepContent.dustRunId)
  );
  const enrichedActions =
    actionsToEnrich.length > 0
      ? await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
          actions: actionsToEnrich,
          ignoreContent: false,
        })
      : [];
  const enrichedActionByModelId = new Map(
    enrichedActions.map((action) => [action.id, action])
  );

  const records: CompletedAgentMessageConsumptionItem[] = [];
  // Tool calls whose action is still blocked (awaiting approval or authentication). Written pending:
  // only the emitted call output is known, the result footprint and direct charge wait for the
  // action to settle.
  const pendingToolItems: PendingToolConsumptionItem[] = [];

  for (const usage of usagesToProcess) {
    const dustRunId = dustRunIdByRunModelId.get(usage.runModelId);
    const runActions = (dustRunId && actionsByDustRunId.get(dustRunId)) || [];
    const usageEvidence = await buildRunUsageConsumptionEvidence(auth, {
      enrichedActionByModelId,
      runActions,
      triggeringUserMessageOrigin,
      usage,
    });
    records.push(...usageEvidence.records);
    pendingToolItems.push(...usageEvidence.pendingToolItems);
  }

  const hasCompleteAllocation = await persistMessageConsumptionAttribution(
    auth,
    {
      actions,
      agentMessageModelId,
      billedCredits,
      conversation,
      dustRunIds,
      pendingToolItems,
      records,
      runs,
      usages,
    }
  );

  return hasCompleteAllocation ? { costCredits: billedCredits } : undefined;
}
