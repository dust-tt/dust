import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { measureToolCallOutputFootprints } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { buildModelCallConsumption } from "@app/lib/api/assistant/consumption/model_call_allocation";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import type {
  ConsumptionModelRow,
  ConsumptionPendingToolRow,
} from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/credit_consumption/client";
import type {
  AgentLoopArgsWithTiming,
  AgentLoopRuntimeData,
} from "@app/types/assistant/agent_run";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { ModelId } from "@app/types/shared/model_id";

type ModelCallConsumptionContext = {
  agentMessageModelId: ModelId;
  conversationModelId: ModelId;
  rootAgentMessageId: ModelId;
  runKey: string;
};

export async function recordModelCallConsumptionItems(
  auth: Authenticator,
  {
    emittedActionModelIds,
    featureFlags,
    runAgentArgs,
    runAgentData,
    runId,
  }: {
    emittedActionModelIds: ModelId[];
    featureFlags: WhitelistableFeature[];
    runAgentArgs: AgentLoopArgsWithTiming;
    runAgentData: AgentLoopRuntimeData;
    runId: string | null;
  }
): Promise<void> {
  const { rootAgentMessageId, runKey } = runAgentArgs;
  if (
    !featureFlags.includes("agent_message_consumption_writes") ||
    runId === null ||
    !runKey ||
    !rootAgentMessageId
  ) {
    return;
  }
  const rootAgentMessage =
    await ConversationResource.fetchAgentMessageCreditContext(auth, {
      agentMessageId: rootAgentMessageId,
    });
  if (!rootAgentMessage) {
    return;
  }

  const emittedActions = await AgentMCPActionResource.fetchByModelIds(
    auth,
    emittedActionModelIds
  );

  await recordModelCallConsumption(auth, {
    context: {
      agentMessageModelId: runAgentData.agentMessage.agentMessageId,
      conversationModelId: runAgentData.conversation.id,
      rootAgentMessageId: rootAgentMessage.agentMessageModelId,
      runKey,
    },
    dustRunId: runId,
    emittedActions,
  });
}

/**
 * @cc [owner:id13,label:backend;durability] consumption-outbox-wakeup
 * After processing persisted run usage, the writer MUST signal the run's consumption workflow,
 * including when a retry finds that the consumption rows and outbox event already exist.
 */
export async function recordModelCallConsumption(
  auth: Authenticator,
  {
    context,
    dustRunId,
    emittedActions,
  }: {
    context: ModelCallConsumptionContext;
    dustRunId: string;
    emittedActions: AgentMCPActionResource[];
  }
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const [run] = await RunResource.listByDustRunIds(auth, {
    dustRunIds: [dustRunId],
  });
  if (!run) {
    logger.warn(
      { workspaceId, dustRunId },
      "[Consumption] Reported model call has no run."
    );
    return;
  }

  const usages = await RunResource.listRunUsagesForRuns(auth, { runs: [run] });
  for (const [index, usage] of usages.entries()) {
    await recordRunUsageConsumption(auth, {
      context,
      emittedActions: index === 0 ? emittedActions : [],
      usage,
    });
  }
  if (usages.length > 0) {
    const signalRes = await signalConsumptionEventsAppended(auth.toJSON(), {
      runKey: context.runKey,
    });
    if (signalRes.isErr()) {
      throw signalRes.error;
    }
  }
}

async function recordRunUsageConsumption(
  auth: Authenticator,
  {
    context,
    emittedActions,
    usage,
  }: {
    context: ModelCallConsumptionContext;
    emittedActions: AgentMCPActionResource[];
    usage: RunUsageWithRunKeyType;
  }
): Promise<void> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const modelVisibleActions = emittedActions.filter(
    (action) =>
      !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
  );
  const callFootprints = await measureCallFootprints(auth, {
    actions: modelVisibleActions,
    modelId: usage.modelId,
  });

  await withTransaction(async (transaction) => {
    const consumedToolRows =
      await AgentMessageConsumptionItemResource.listConsumptionToolResultsPendingConsumption(
        auth,
        { agentMessageModelId: context.agentMessageModelId, transaction }
      );

    const consumption = buildModelCallConsumption({
      usage,
      emittedToolCalls: modelVisibleActions.map((action, index) => ({
        tool: action,
        measuredOutputTokensCount: callFootprints[index],
      })),
      consumedToolResults: consumedToolRows.map((row) => ({
        tool: row,
        resultTokensCount: row.inputTokensCount ?? 0,
      })),
    });

    const modelRows: ConsumptionModelRow[] = [
      {
        itemType: "input",
        runUsageModelId: usage.runUsageModelId,
        inputTokensCount: consumption.input.inputTokensCount,
        outputTokensCount: null,
        grossAttributedCreditAmountMicro:
          consumption.input.grossCreditAmountMicro,
        reconciledCreditAmountMicro:
          consumption.input.reconciledCreditAmountMicro,
      },
      {
        itemType: "output",
        runUsageModelId: usage.runUsageModelId,
        inputTokensCount: null,
        outputTokensCount: consumption.output.outputTokensCount,
        grossAttributedCreditAmountMicro:
          consumption.output.grossCreditAmountMicro,
        reconciledCreditAmountMicro:
          consumption.output.reconciledCreditAmountMicro,
      },
      ...(consumption.reasoning
        ? [
            {
              itemType: "reasoning" as const,
              runUsageModelId: usage.runUsageModelId,
              inputTokensCount: null,
              outputTokensCount: consumption.reasoning.outputTokensCount,
              grossAttributedCreditAmountMicro:
                consumption.reasoning.grossCreditAmountMicro,
              reconciledCreditAmountMicro:
                consumption.reasoning.reconciledCreditAmountMicro,
            },
          ]
        : []),
    ];
    const pendingToolRows: ConsumptionPendingToolRow[] =
      consumption.emittedToolCalls.map((toolCall) => ({
        agentMCPActionModelId: toolCall.tool.id,
        runUsageModelId: usage.runUsageModelId,
        outputTokensCount: toolCall.outputTokensCount,
        grossAttributedCreditAmountMicro: toolCall.grossCreditAmountMicro,
        reconciledCreditAmountMicro: toolCall.reconciledCreditAmountMicro,
      }));

    const insertedRows =
      await AgentMessageConsumptionItemResource.insertConsumptionRows(auth, {
        conversationModelId: context.conversationModelId,
        agentMessageModelId: context.agentMessageModelId,
        runKey: context.runKey,
        modelRows,
        pendingToolRows,
        transaction,
      });
    if (insertedRows.length === 0) {
      return;
    }

    const resultCreditAmountMicroByConsumptionItemId = new Map(
      consumption.consumedToolResults.map((result) => [
        result.tool.id,
        result.reconciledCreditAmountMicro,
      ])
    );
    await AgentMessageConsumptionItemResource.addReconciledCreditAmounts(auth, {
      creditAmountMicroDeltaByConsumptionItemId:
        resultCreditAmountMicroByConsumptionItemId,
      transaction,
    });

    await AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "items_changed",
        idempotencyKey: `model-call:${usage.runUsageModelId}`,
        runKey: context.runKey,
        rootAgentMessageModelId: context.rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        consumptionItemIds: [
          ...new Set([
            ...insertedRows.map((row) => row.consumptionItemId),
            ...consumption.consumedToolResults.map((result) => result.tool.id),
          ]),
        ],
      },
      transaction,
    });

    if (consumption.toolResultCreditsWereReduced) {
      logger.info(
        {
          workspaceId,
          runKey: context.runKey,
          runUsageModelId: usage.runUsageModelId,
        },
        "[Consumption] Cached input below the tool results it carried."
      );
    }
  });
}

async function measureCallFootprints(
  auth: Authenticator,
  {
    actions,
    modelId,
  }: {
    actions: AgentMCPActionResource[];
    modelId: string;
  }
): Promise<number[]> {
  if (actions.length === 0) {
    return [];
  }

  const footprintsRes = await measureToolCallOutputFootprints(auth, {
    modelId,
    toolCalls: actions.map((action) => ({
      functionCallName: action.functionCallName,
      functionCallArguments: action.functionCallArguments,
    })),
  });
  if (footprintsRes.isErr()) {
    throw footprintsRes.error;
  }

  return footprintsRes.value;
}
