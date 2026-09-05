import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { buildLatestMessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  buildRunUsageAttribution,
  buildToolAttribution,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { measureToolCallFootprints } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { getAttachmentCapabilityContext } from "@app/lib/api/assistant/conversation/attachment_capabilities";
import type { Authenticator } from "@app/lib/auth";
import { buildAgentMessageBillingPlan } from "@app/lib/credits/agent_message_billing";
import { roundCreditsToMicroCredits } from "@app/lib/credits/units";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type {
  CompletedAgentMessageConsumptionItem,
  PendingToolConsumptionItem,
} from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import type { AgentMCPActionWithOutputType } from "@app/types/actions";
import type { AttachmentCapabilityContext } from "@app/types/api/assistant/conversation/attachments";
import type { AgentMessageStatus } from "@app/types/assistant/conversation";
import {
  AGENT_MESSAGE_STATUSES_TO_TRACK,
  isTerminalAgentMessageStatus,
} from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

function selectRunUsagesNeedingEvidence({
  actionsByDustRunId,
  currentItems,
  dustRunIdByRunModelId,
  runUsageModelIdsWithUnconsumedToolResults,
  usages,
}: {
  actionsByDustRunId: ReadonlyMap<string, AgentMCPActionResource[]>;
  currentItems: AgentMessageConsumptionItemResource[];
  dustRunIdByRunModelId: ReadonlyMap<ModelId, string>;
  runUsageModelIdsWithUnconsumedToolResults: ReadonlySet<ModelId>;
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
    const runActionById = new Map(
      runActions.map((action) => [action.sId, action])
    );
    const modelItemTypes = modelItemTypesByRunUsageModelId.get(
      usage.runUsageModelId
    );
    const hasUnexpectedMissingActionItem = runActions.some((action) => {
      if (toolItemByActionModelId.has(action.id)) {
        return false;
      }

      const childInfo = action.stepContext.sandboxChildActionInfo;
      if (!isSandboxChildActionInfo(childInfo)) {
        return true;
      }

      const parentAction = runActionById.get(childInfo.parentActionId);
      if (!parentAction) {
        return true;
      }
      const parentItem = toolItemByActionModelId.get(parentAction.id);

      // A sandbox bash can create another child after an earlier attribution pass while its own
      // tool item is still pending. The child is direct-charge-only, so adding its zero-footprint
      // pending row cannot change the run's already-stored model-token partition. Require the
      // durable parent relationship and the exact same producing run before accepting this gap.
      return !(
        parentItem?.completedAt === null &&
        parentItem.runUsageId === usage.runUsageModelId &&
        parentAction.stepContent.id === action.stepContent.id &&
        parentAction.stepContent.dustRunId === dustRunId
      );
    });
    assert(
      !runUsageModelIdsWithEvidence.has(usage.runUsageModelId) ||
        !hasUnexpectedMissingActionItem,
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
        (item.completedAt === null &&
          isToolExecutionStatusFinal(action.status)) ||
        (runUsageModelIdsWithUnconsumedToolResults.has(usage.runUsageModelId) &&
          (item.inputTokensCount ?? 0) > 0)
      );
    });

    return !hasCompleteModelItems || hasActionNeedingEvidence;
  });
}

/**
 * A tool result emitted by the last reported model run of a terminal message was never sent back
 * to the model. Run IDs on the message are de-duplicated in SQL without an ordering guarantee, so
 * use the durable Run chronology instead.
 */
function runUsageModelIdsWithUnconsumedToolResults({
  runs,
  status,
  usages,
}: {
  runs: RunResource[];
  status: AgentMessageStatus;
  usages: RunUsageWithRunKeyType[];
}): ReadonlySet<ModelId> {
  if (!isTerminalAgentMessageStatus(status)) {
    return new Set();
  }

  const runModelIdsWithReportedUsage = new Set(
    usages.map((usage) => usage.runModelId)
  );
  let lastRun: RunResource | null = null;
  for (const run of runs) {
    if (!runModelIdsWithReportedUsage.has(run.id)) {
      continue;
    }
    if (
      lastRun === null ||
      run.createdAt.getTime() > lastRun.createdAt.getTime() ||
      (run.createdAt.getTime() === lastRun.createdAt.getTime() &&
        run.id > lastRun.id)
    ) {
      lastRun = run;
    }
  }

  if (lastRun === null) {
    return new Set();
  }

  return new Set(
    usages
      .filter((usage) => usage.runModelId === lastRun.id)
      .map((usage) => usage.runUsageModelId)
  );
}

async function buildRunUsageConsumptionEvidence(
  auth: Authenticator,
  {
    capabilities,
    enrichedActionByModelId,
    directCreditAmountMicroByActionModelId,
    includeToolResultFootprints,
    runActions,
    usage,
  }: {
    capabilities: AttachmentCapabilityContext;
    enrichedActionByModelId: ReadonlyMap<ModelId, AgentMCPActionWithOutputType>;
    directCreditAmountMicroByActionModelId: ReadonlyMap<ModelId, number>;
    includeToolResultFootprints: boolean;
    runActions: AgentMCPActionResource[];
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
    capabilities,
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
    ({ action }, index) => ({
      action,
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
    const { action, footprint } = toolCall.tool;

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
    const directCreditAmountMicro = directCreditAmountMicroByActionModelId.get(
      action.id
    );
    assert(
      directCreditAmountMicro !== undefined,
      "A completed action must have a canonical billing line"
    );
    const toolAttribution = buildToolAttribution({
      usage,
      toolCall,
      inputTokensCount: includeToolResultFootprints
        ? footprint.inputTokensCount
        : 0,
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

    const directCreditAmountMicro = directCreditAmountMicroByActionModelId.get(
      action.id
    );
    assert(
      directCreditAmountMicro !== undefined,
      "A completed sandbox child action must have a canonical billing line"
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
  // Store the evidence first, remove any terminal result footprint that never reached another model
  // run, then materialize the newest complete allocation against the authoritative bill. Every step
  // is idempotent on persisted state, so none of them share a transaction. An incomplete version
  // keeps its evidence with null reconciliation and can be completed by a later finalize.
  await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
    conversation,
    agentMessageModelId,
    attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    records,
    pendingToolItems,
  });

  const items =
    await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [agentMessageModelId],
      maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    });
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
  });
  return true;
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
 * rather than replaced (the row cannot be re-inserted past its idempotency key). If the message
 * becomes terminal without another reported model run, that footprint is removed in place: the
 * result was produced, but never consumed.
 */
export interface AgentMessageConsumptionAttributionComputation {
  actions?: AgentMCPActionResource[];
  consumptionUpdate?: { costCredits: number | null };
}

async function computeAndStoreAgentMessageConsumptionAttributionComputation(
  auth: Authenticator,
  {
    agentMessageId,
    conversationId,
  }: { agentMessageId: string; conversationId: string }
): Promise<AgentMessageConsumptionAttributionComputation> {
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
    return {};
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
    return {};
  }

  const dustRunIds = [...new Set(runIds ?? [])];
  if (dustRunIds.length === 0) {
    return {};
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId,
    {
      dangerouslySkipPermissionFiltering: true,
      includeDeleted: true,
    }
  );
  if (!conversation) {
    logger.warn(
      { workspaceId, agentMessageId, conversationId },
      "[ConsumptionAttribution] Conversation not found."
    );
    return {};
  }

  // Tool results are re-rendered below to measure them, so they need the same attachment
  // capabilities the conversation used when the results were sent to the model.
  const capabilities = await getAttachmentCapabilityContext(auth, conversation);

  // Every usage is reached through this message's own runIds, so each one belongs to this message.
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });
  const unconsumedToolResultRunUsageModelIds =
    runUsageModelIdsWithUnconsumedToolResults({ runs, status, usages });

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

  const toolBillingPlan = buildAgentMessageBillingPlan({
    actions: actions.map((actionResource) => ({
      actionResource,
      internalMCPServerName: actionResource.metadata.internalMCPServerName,
      mcpServerId: actionResource.metadata.mcpServerId ?? null,
      status: actionResource.status,
      toolName: getToolNameFromFunctionCallName(
        actionResource.functionCallName
      ),
    })),
    contextOrigin: triggeringUserMessageOrigin,
    runUsages: [],
  });
  const directCreditAmountMicroByActionModelId = new Map(
    toolBillingPlan.tools.map(({ action, billedCredits }) => [
      action.actionResource.id,
      roundCreditsToMicroCredits(billedCredits),
    ])
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
    runUsageModelIdsWithUnconsumedToolResults:
      unconsumedToolResultRunUsageModelIds,
    usages,
  });
  const dustRunIdsToProcess = new Set(
    usagesToProcess
      .map((usage) => dustRunIdByRunModelId.get(usage.runModelId))
      .filter((dustRunId): dustRunId is string => dustRunId !== undefined)
  );
  const actionsToEnrich = actions.filter(
    (action) =>
      !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo) &&
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
      capabilities,
      enrichedActionByModelId,
      directCreditAmountMicroByActionModelId,
      includeToolResultFootprints: !unconsumedToolResultRunUsageModelIds.has(
        usage.runUsageModelId
      ),
      runActions,
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

  return {
    actions,
    consumptionUpdate: hasCompleteAllocation
      ? { costCredits: billedCredits }
      : undefined,
  };
}

export async function computeAndStoreAgentMessageConsumptionAttribution(
  auth: Authenticator,
  message: { agentMessageId: string; conversationId: string }
): Promise<{ costCredits: number | null } | undefined> {
  const { consumptionUpdate } =
    await computeAndStoreAgentMessageConsumptionAttributionComputation(
      auth,
      message
    );

  return consumptionUpdate;
}

/**
 * Returns the action snapshot loaded for attribution so the immediately following analytics index
 * can reuse it instead of querying the same rows again.
 */
export async function computeAndStoreAgentMessageConsumptionAttributionForAnalytics(
  auth: Authenticator,
  message: { agentMessageId: string; conversationId: string }
): Promise<AgentMessageConsumptionAttributionComputation> {
  return computeAndStoreAgentMessageConsumptionAttributionComputation(
    auth,
    message
  );
}
