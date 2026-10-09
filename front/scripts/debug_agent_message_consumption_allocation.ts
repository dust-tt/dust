/**
 * Explains how an agent message's bill is split across its LLM calls and tools, and flags LLM
 * calls whose cache was warmed by an unbilled request (a lost attempt that was retried).
 *
 * This script is read-only.
 *
 * One message, in detail:
 * npx tsx scripts/debug_agent_message_consumption_allocation.ts \
 *   --workspaceId 8DpNy5tEUG \
 *   --agentMessageId Ut5LbnRe3M \
 *   --execute
 *
 * One summary row per recent message of a workspace whose stored attribution has no reconciled
 * credits, i.e. that fails to reconcile today:
 * npx tsx scripts/debug_agent_message_consumption_allocation.ts \
 *   --workspaceId 8DpNy5tEUG \
 *   --unreconciledSinceDays 7 \
 *   --limit 50 \
 *   --execute
 */

import { getToolNameFromFunctionCallName } from "@app/lib/actions/tool_display_labels";
import {
  buildLatestMessageConsumptionAllocation,
  compareRunsChronologically,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  splitRecordedUsageCost,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { Authenticator } from "@app/lib/auth";
import { buildAgentMessageBillingPlan } from "@app/lib/credits/agent_message_billing";
import { AgentMessageConsumptionItemModel } from "@app/lib/models/agent/agent_message_consumption_item";
import { MessageModel } from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import {
  getTemporalClientForAgentNamespace,
  getTemporalClientForFrontNamespace,
} from "@app/lib/temporal";
import { makeScript } from "@app/scripts/helpers";
import { makeAgentLoopWorkflowId } from "@app/temporal/agent_loop/lib/workflow_ids";
import { makeAgentMessageAnalyticsWorkflowId } from "@app/temporal/analytics_queue/helpers";
import type { ModelId } from "@app/types/shared/model_id";
import { decodeTimeoutType, tsToDate } from "@temporalio/common";
import { col, fn, Op, where } from "sequelize";

const MIN_CACHE_WARMED_BY_UNBILLED_REQUEST_TOKENS = 1_024;

type ModelActivity = {
  executionRunId: string;
  scheduledAt: Date;
  startedAt: Date | null;
  closedAt: Date | null;
  outcome: string;
  attempt: number | null;
  worker: string | null;
  previousAttemptFailure: string;
};

function credits(creditAmountMicro: number | null | undefined) {
  return creditAmountMicro === null || creditAmountMicro === undefined
    ? "n/a"
    : creditAmountMicro / 1_000_000;
}

async function listAgentLoopModelActivities({
  agentMessageId,
  conversationId,
  workspaceId,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): Promise<ModelActivity[] | null> {
  const workflowId = makeAgentLoopWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
  });

  try {
    const client = await getTemporalClientForAgentNamespace();
    const activities: ModelActivity[] = [];

    for await (const execution of client.workflow.list({
      query: `WorkflowId = ${JSON.stringify(workflowId)}`,
    })) {
      const history = await client.workflow
        .getHandle(workflowId, execution.runId)
        .fetchHistory();
      const activityByScheduledEventId = new Map<string, ModelActivity>();

      for (const event of history.events ?? []) {
        const eventAt = event.eventTime ? tsToDate(event.eventTime) : null;
        const scheduled = event.activityTaskScheduledEventAttributes;
        if (
          scheduled?.activityType?.name ===
            "runModelAndCreateActionsActivity" &&
          eventAt
        ) {
          const activity: ModelActivity = {
            executionRunId: execution.runId,
            scheduledAt: eventAt,
            startedAt: null,
            closedAt: null,
            outcome: "running",
            attempt: null,
            worker: null,
            previousAttemptFailure: "none",
          };
          activityByScheduledEventId.set(String(event.eventId), activity);
          activities.push(activity);
        }

        const started = event.activityTaskStartedEventAttributes;
        const startedActivity = started
          ? activityByScheduledEventId.get(String(started.scheduledEventId))
          : undefined;
        if (started && startedActivity) {
          const lastFailure = started.lastFailure;
          startedActivity.startedAt = eventAt;
          startedActivity.attempt = started.attempt ?? null;
          startedActivity.worker = started.identity ?? null;
          startedActivity.previousAttemptFailure = lastFailure
            ? `${decodeTimeoutType(lastFailure.timeoutFailureInfo?.timeoutType) ?? lastFailure.applicationFailureInfo?.type ?? "unknown"}: ${lastFailure.message ?? ""}`
            : "none";
        }

        const outcome =
          event.activityTaskCompletedEventAttributes ??
          event.activityTaskFailedEventAttributes ??
          event.activityTaskTimedOutEventAttributes ??
          event.activityTaskCanceledEventAttributes;
        const closedActivity = outcome
          ? activityByScheduledEventId.get(String(outcome.scheduledEventId))
          : undefined;
        if (closedActivity) {
          closedActivity.closedAt = eventAt;
          closedActivity.outcome = event.activityTaskCompletedEventAttributes
            ? "completed"
            : event.activityTaskFailedEventAttributes
              ? "failed"
              : event.activityTaskTimedOutEventAttributes
                ? "timed_out"
                : "canceled";
        }
      }
    }

    return activities.sort(
      (left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime()
    );
  } catch (error) {
    console.log(
      `\nAgent-loop history unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}

async function printAttributionWorkflows({
  agentMessageId,
  conversationId,
  workspaceId,
}: {
  agentMessageId: string;
  conversationId: string;
  workspaceId: string;
}): Promise<void> {
  const workflowId = `${makeAgentMessageAnalyticsWorkflowId({
    agentMessageId,
    conversationId,
    workspaceId,
  })}-consumption-attribution-v3`;

  try {
    const client = await getTemporalClientForFrontNamespace();
    const rows = [];
    for await (const execution of client.workflow.list({
      query: `WorkflowId = ${JSON.stringify(workflowId)}`,
    })) {
      const description = await client.workflow
        .getHandle(workflowId, execution.runId)
        .describe();
      const pendingActivity = description.raw.pendingActivities?.[0];
      rows.push({
        runId: execution.runId,
        status: execution.status.name,
        startTime: execution.startTime.toISOString(),
        closeTime: execution.closeTime?.toISOString() ?? "running",
        pendingActivity: pendingActivity?.activityType?.name ?? "none",
        pendingAttempt: pendingActivity?.attempt ?? "none",
        pendingFailure: pendingActivity?.lastFailure
          ? `${pendingActivity.lastFailure.applicationFailureInfo?.type ?? "unknown"}: ${pendingActivity.lastFailure.message ?? ""}`
          : "none",
      });
    }
    console.log("\nAttribution workflows");
    console.table(rows);
  } catch (error) {
    console.log(
      `\nAttribution workflows unavailable: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

type MessageSummary = Record<string, string | number | boolean>;

async function analyzeAgentMessage(
  auth: Authenticator,
  {
    agentMessageId,
    verbose,
    workspaceId,
  }: { agentMessageId: string; verbose: boolean; workspaceId: string }
): Promise<MessageSummary> {
  const creditContext =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId,
    });
  const analyticsContext =
    await ConversationResource.fetchAgentMessageConsumptionAnalyticsContext(
      auth,
      { agentMessageId }
    );
  if (!creditContext || !analyticsContext) {
    return { message: agentMessageId, today: "message not found" };
  }
  const conversationId = analyticsContext.conversation.conversationId;

  const dustRunIds = [...new Set(creditContext.runIds ?? [])];
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });
  const [actions, items] = await Promise.all([
    AgentMCPActionResource.listByAgentMessageIds(auth, [
      creditContext.agentMessageModelId,
    ]),
    AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [creditContext.agentMessageModelId],
      maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    }),
  ]);

  const billingPlan = buildAgentMessageBillingPlan({
    actions: actions.map((action) => ({
      actionId: action.sId,
      internalMCPServerName: action.metadata.internalMCPServerName,
      mcpServerId: action.metadata.mcpServerId ?? null,
      status: action.status,
      toolName: getToolNameFromFunctionCallName(action.functionCallName),
    })),
    contextOrigin: creditContext.triggeringUserMessageOrigin,
    runUsages: usages,
  });
  const llmCreditsWithoutWaivers = buildAgentMessageBillingPlan({
    actions: [],
    contextOrigin: null,
    runUsages: usages,
  }).totals.llmBilledCredits;

  const allocationResult = buildLatestMessageConsumptionAllocation({
    actions,
    billedCredits: creditContext.previousCostCredits,
    dustRunIds,
    hasUnbilledExecution: false,
    items,
    runs,
    usages,
  });
  const recomputedCreditMicroByItem: ReadonlyMap<
    AgentMessageConsumptionItemResource,
    number
  > = allocationResult.isOk()
    ? allocationResult.value.reconciledCreditAmounts.byItem
    : new Map();
  const billingGroups = allocationResult.isOk()
    ? allocationResult.value.billingGroups
    : [];
  const billedCreditMicroByRunUsageModelId = new Map(
    billingGroups.flatMap((group) =>
      group.usages.map(
        ({ usage, billedCreditMicro }) =>
          [usage.runUsageModelId, billedCreditMicro] as const
      )
    )
  );
  const newestAttributionVersion = Math.max(
    ...items.map(({ attributionVersion }) => attributionVersion)
  );
  const reportedItems = allocationResult.isOk()
    ? allocationResult.value.items
    : items.filter(
        (item) => item.attributionVersion === newestAttributionVersion
      );
  const storedItems = items.filter(
    (item) => item.reconciledCreditAmountMicro !== null
  );
  const directCreditAmountMicro = reportedItems.reduce(
    (total, item) => total + (item.directCreditAmountMicro ?? 0),
    0
  );
  const recomputedCreditMicroOf = (
    predicate: (item: AgentMessageConsumptionItemResource) => boolean
  ) =>
    reportedItems
      .filter(predicate)
      .reduce(
        (total, item) => total + (recomputedCreditMicroByItem.get(item) ?? 0),
        0
      );

  const runByModelId = new Map(runs.map((run) => [run.id, run]));
  const runIndexByModelId = new Map(
    [...runs]
      .sort(compareRunsChronologically)
      .map((run, index) => [run.id, index])
  );
  const orderedUsages = [...usages].sort(
    (left, right) =>
      (runIndexByModelId.get(left.runModelId) ?? -1) -
        (runIndexByModelId.get(right.runModelId) ?? -1) ||
      left.runModelId - right.runModelId ||
      left.runUsageModelId - right.runUsageModelId
  );
  const callIndexByRunUsageModelId = new Map(
    orderedUsages.map((usage, index) => [usage.runUsageModelId, index + 1])
  );
  const firstUsagesOfRuns = orderedUsages.filter(
    (usage, index) =>
      index === 0 || orderedUsages[index - 1].runModelId !== usage.runModelId
  );
  const nextCallByRunModelId = new Map(
    firstUsagesOfRuns.flatMap((usage, index) => {
      const nextCall = firstUsagesOfRuns[index + 1];
      return nextCall ? [[usage.runModelId, nextCall] as const] : [];
    })
  );
  const readingUsageByRunUsageModelId = new Map<
    ModelId,
    RunUsageWithRunKeyType
  >(
    orderedUsages.flatMap((usage) => {
      const readingUsage = nextCallByRunModelId.get(usage.runModelId);
      return readingUsage
        ? [[usage.runUsageModelId, readingUsage] as const]
        : [];
    })
  );
  const toolResultTokensReadByRunUsageModelId = new Map<ModelId, number>();
  const ownRowsCreditMicroByRunUsageModelId = new Map<ModelId, number>();
  for (const item of reportedItems) {
    if (item.itemType === "tool") {
      const readingUsage = readingUsageByRunUsageModelId.get(item.runUsageId);
      if (readingUsage) {
        toolResultTokensReadByRunUsageModelId.set(
          readingUsage.runUsageModelId,
          (toolResultTokensReadByRunUsageModelId.get(
            readingUsage.runUsageModelId
          ) ?? 0) + (item.inputTokensCount ?? 0)
        );
      }
    } else {
      ownRowsCreditMicroByRunUsageModelId.set(
        item.runUsageId,
        (ownRowsCreditMicroByRunUsageModelId.get(item.runUsageId) ?? 0) +
          (recomputedCreditMicroByItem.get(item) ?? 0)
      );
    }
  }

  const callRows = orderedUsages.map((usage, index) => {
    const previousUsage = orderedUsages[index - 1];
    const cachedTokens = Math.min(usage.cachedTokens ?? 0, usage.promptTokens);
    const cacheBeyondPreviousCallTokens =
      previousUsage && previousUsage.runModelId !== usage.runModelId
        ? cachedTokens -
          (previousUsage.promptTokens + previousUsage.completionTokens)
        : null;
    return {
      usage,
      cachedTokens,
      cacheBeyondPreviousCallTokens,
      cacheWarmedByUnbilledRequest:
        cacheBeyondPreviousCallTokens !== null &&
        cacheBeyondPreviousCallTokens >
          MIN_CACHE_WARMED_BY_UNBILLED_REQUEST_TOKENS,
      recordedCostSplit: splitRecordedUsageCost(usage),
    };
  });

  const summary: MessageSummary = {
    message: agentMessageId,
    status: creditContext.status,
    origin: creditContext.triggeringUserMessageOrigin ?? "none",
    billedCredits: creditContext.previousCostCredits ?? "none",
    directCredits: directCreditAmountMicro / 1_000_000,
    llmCreditsFromRuns: llmCreditsWithoutWaivers,
    llmCalls: orderedUsages.length,
    retriedCalls: callRows.filter((row) => row.cacheWarmedByUnbilledRequest)
      .length,
    today:
      storedItems.length > 0
        ? `ok (${credits(
            storedItems.reduce(
              (total, item) => total + (item.reconciledCreditAmountMicro ?? 0),
              0
            )
          )})`
        : "no reconciled credits",
    recomputed: allocationResult.isOk() ? "ok" : allocationResult.error.code,
    recomputedInputCredits: credits(
      recomputedCreditMicroOf(
        (item) => item.itemType === "input" || item.itemType === "system"
      )
    ),
    recomputedOutputCredits: credits(
      recomputedCreditMicroOf(
        (item) => item.itemType === "output" || item.itemType === "reasoning"
      )
    ),
    recomputedToolCredits: credits(
      recomputedCreditMicroOf((item) => item.itemType === "tool")
    ),
  };
  if (!verbose) {
    return summary;
  }

  console.log("\nBilling");
  console.table([
    {
      storedCostCredits: creditContext.previousCostCredits,
      ...billingPlan.totals,
      llmCreditsWithoutWaivers,
    },
  ]);
  console.log("\nTool billing lines");
  console.table(
    billingPlan.tools.map((line) => ({
      action: line.action.actionId,
      tool: line.action.toolName,
      billedCredits: line.billedCredits,
      disposition: line.billingDisposition,
    }))
  );

  console.log("\nAllocation (today: stored; recomputed: this branch)");
  console.table([
    {
      ...summary,
      ...(allocationResult.isErr() ? allocationResult.error.context : {}),
      billMinusDirectCredits:
        (creditContext.previousCostCredits ?? 0) -
        directCreditAmountMicro / 1_000_000,
    },
  ]);

  console.log("\nBilling groups (recomputed: this branch)");
  console.table(
    billingGroups.map((group) => ({
      runKey: group.runKey,
      provider: group.providerId,
      model: group.modelId,
      calls: group.usages.length,
      costCredits: credits(Math.round(group.costCreditMicro)),
      billedCredits: credits(group.billedCreditMicro),
      roundingCredits: credits(Math.round(group.roundingCreditMicro)),
    }))
  );

  const modelActivities = await listAgentLoopModelActivities({
    agentMessageId,
    conversationId,
    workspaceId,
  });
  const activityForRun = (createdAt: Date) =>
    modelActivities?.find(
      (activity) =>
        activity.startedAt !== null &&
        activity.startedAt <= createdAt &&
        (activity.closedAt === null || createdAt <= activity.closedAt)
    );

  console.log("\nLLM calls");
  console.table(
    callRows.map(
      (
        {
          usage,
          cachedTokens,
          cacheBeyondPreviousCallTokens,
          cacheWarmedByUnbilledRequest,
          recordedCostSplit,
        },
        index
      ) => {
        const run = runByModelId.get(usage.runModelId);
        const uncachedTokens = usage.promptTokens - cachedTokens;
        const toolResultTokensRead =
          toolResultTokensReadByRunUsageModelId.get(usage.runUsageModelId) ?? 0;
        const activity = run ? activityForRun(run.createdAt) : undefined;
        return {
          call: index + 1,
          runUsageId: usage.runUsageModelId,
          runKey: usage.runKey ?? "none",
          model: usage.modelId,
          runCreatedAt: run?.createdAt.toISOString() ?? "n/a",
          promptTokens: usage.promptTokens,
          cachedTokens,
          uncachedTokens,
          completionTokens: usage.completionTokens,
          costMicroUsd: usage.costMicroUsd,
          inputCostMicroUsd: recordedCostSplit
            ? Math.round(recordedCostSplit.inputCostMicroUsd)
            : "n/a",
          outputCostMicroUsd: recordedCostSplit
            ? Math.round(recordedCostSplit.outputCostMicroUsd)
            : "exceeds recorded cost",
          billedCredits: credits(
            billedCreditMicroByRunUsageModelId.get(usage.runUsageModelId)
          ),
          ownRowsCredits: credits(
            ownRowsCreditMicroByRunUsageModelId.get(usage.runUsageModelId)
          ),
          toolResultTokensRead,
          uncachedToolResultTokens: Math.min(
            toolResultTokensRead,
            uncachedTokens
          ),
          cacheBeyondPreviousCallTokens: cacheBeyondPreviousCallTokens ?? "n/a",
          cacheWarmedByUnbilledRequest,
          modelActivityAttempt: activity?.attempt ?? "n/a",
          previousAttemptFailure: activity?.previousAttemptFailure ?? "n/a",
        };
      }
    )
  );

  const actionSIdByModelId = new Map(
    actions.map((action) => [action.id, action.sId])
  );
  console.log("\nItems");
  console.table(
    reportedItems.map((item) => {
      const readingUsage =
        item.itemType === "tool"
          ? readingUsageByRunUsageModelId.get(item.runUsageId)
          : undefined;
      const recomputedCreditMicro = recomputedCreditMicroByItem.get(item);
      return {
        itemId: item.id,
        type: item.itemType,
        version: item.attributionVersion,
        action:
          item.agentMCPActionId === null
            ? "n/a"
            : (actionSIdByModelId.get(item.agentMCPActionId) ?? "n/a"),
        call: callIndexByRunUsageModelId.get(item.runUsageId) ?? "n/a",
        readByCall: readingUsage
          ? (callIndexByRunUsageModelId.get(readingUsage.runUsageModelId) ??
            "n/a")
          : "n/a",
        inputTokens: item.inputTokensCount ?? "n/a",
        outputTokens: item.outputTokensCount ?? "n/a",
        grossCredits: credits(item.grossAttributedCreditAmountMicro),
        directCredits: credits(item.directCreditAmountMicro),
        storedCredits: credits(item.reconciledCreditAmountMicro),
        recomputedCredits: credits(recomputedCreditMicro),
        differsFromStored:
          recomputedCreditMicro !== undefined &&
          item.reconciledCreditAmountMicro !== recomputedCreditMicro,
      };
    })
  );

  if (modelActivities) {
    console.log("\nAgent-loop model activities");
    console.table(
      modelActivities.map((activity) => ({
        execution: activity.executionRunId,
        scheduledAt: activity.scheduledAt.toISOString(),
        startedAt: activity.startedAt?.toISOString() ?? "n/a",
        closedAt: activity.closedAt?.toISOString() ?? "n/a",
        outcome: activity.outcome,
        attempt: activity.attempt ?? "n/a",
        worker: activity.worker ?? "n/a",
        previousAttemptFailure: activity.previousAttemptFailure,
      }))
    );
  }

  await printAttributionWorkflows({
    agentMessageId,
    conversationId,
    workspaceId,
  });

  return summary;
}

async function listUnreconciledAgentMessageIds(
  auth: Authenticator,
  { limit, sinceDays }: { limit: number; sinceDays: number }
): Promise<string[]> {
  const workspaceId = auth.getNonNullableWorkspace().id;
  const unreconciledItems = await AgentMessageConsumptionItemModel.findAll({
    attributes: ["agentMessageId"],
    where: {
      workspaceId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      createdAt: { [Op.gte]: new Date(Date.now() - sinceDays * 86_400_000) },
    },
    group: ["agentMessageId"],
    having: where(fn("COUNT", col("reconciledCreditAmountMicro")), 0),
    order: [[fn("MAX", col("createdAt")), "DESC"]],
    limit,
  });
  const messages = await MessageModel.findAll({
    attributes: ["sId"],
    where: {
      workspaceId,
      agentMessageId: unreconciledItems.map(
        ({ agentMessageId }) => agentMessageId
      ),
    },
  });
  return messages.map(({ sId }) => sId);
}

makeScript(
  {
    workspaceId: {
      type: "string",
      demandOption: true,
      description: "Workspace sId.",
    },
    agentMessageId: {
      type: "string",
      description: "Agent message sId to explain in detail.",
    },
    unreconciledSinceDays: {
      type: "number",
      description:
        "Summarize the workspace's messages attributed in the last N days that have no reconciled credits.",
    },
    limit: {
      type: "number",
      default: 50,
      description: "Maximum number of messages to summarize.",
    },
  },
  async ({
    agentMessageId,
    execute,
    limit,
    unreconciledSinceDays,
    workspaceId,
  }) => {
    if (!execute) {
      console.log("Read-only diagnostic. Pass --execute to run it.");
      return;
    }
    const auth = await Authenticator.internalAdminForWorkspace(workspaceId);

    if (agentMessageId) {
      await analyzeAgentMessage(auth, {
        agentMessageId,
        verbose: true,
        workspaceId,
      });
      return;
    }
    if (unreconciledSinceDays === undefined) {
      throw new Error(
        "Pass --agentMessageId or --unreconciledSinceDays to choose messages."
      );
    }

    const agentMessageIds = await listUnreconciledAgentMessageIds(auth, {
      limit,
      sinceDays: unreconciledSinceDays,
    });
    const summaries: MessageSummary[] = [];
    for (const id of agentMessageIds) {
      summaries.push(
        await analyzeAgentMessage(auth, {
          agentMessageId: id,
          verbose: false,
          workspaceId,
        })
      );
    }
    console.log(
      `\n${summaries.length} messages without reconciled credits since ${unreconciledSinceDays} days`
    );
    console.table(summaries);
    console.table(
      Object.entries(
        summaries.reduce<Record<string, number>>((counts, summary) => {
          const key = String(summary.recomputed);
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {})
      ).map(([recomputed, messages]) => ({ recomputed, messages }))
    );
  }
);
