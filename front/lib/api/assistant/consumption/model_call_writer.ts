import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import { measureToolCallOutputFootprints } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { buildModelCallConsumption } from "@app/lib/api/assistant/consumption/model_call_allocation";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionEventResource } from "@app/lib/resources/agent_message_consumption_event_resource";
import type {
  ConsumptionModelRow,
  ConsumptionToolCallRow,
  ConsumptionToolResultRow,
} from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import logger from "@app/logger/logger";
import { signalConsumptionEventsAppended } from "@app/temporal/credit_consumption/client";
import type { AgentMessageConsumptionExecutionContext } from "@app/types/assistant/agent_message_consumption";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

type ModelCallConsumptionContext = {
  agentMessageModelId: ModelId;
  conversationModelId: ModelId;
  rootAgentMessageId: ModelId;
  runKey: string;
};

export async function recordModelCallConsumptionItems(
  auth: Authenticator,
  {
    agentMessageModelId,
    consumptionContext,
    conversationModelId,
    dustRunId,
    emittedActionModelIds,
  }: {
    agentMessageModelId: ModelId;
    consumptionContext: AgentMessageConsumptionExecutionContext;
    conversationModelId: ModelId;
    dustRunId: string;
    emittedActionModelIds: ModelId[];
  }
): Promise<void> {
  const emittedActions = await AgentMCPActionResource.fetchByModelIds(
    auth,
    emittedActionModelIds
  );

  const result = await recordModelCallConsumption(auth, {
    context: {
      agentMessageModelId,
      conversationModelId,
      rootAgentMessageId: consumptionContext.rootAgentMessageModelId,
      runKey: consumptionContext.runKey,
    },
    dustRunId,
    emittedActions,
  });
  if (result.isErr()) {
    throw result.error;
  }
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
): Promise<Result<void, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const [run] = await RunResource.listByDustRunIds(auth, {
    dustRunIds: [dustRunId],
  });
  if (!run) {
    logger.warn(
      { workspaceId, dustRunId },
      "[Consumption] Reported model call has no run."
    );
    return new Err(new Error(`Run ${dustRunId} was not found`));
  }

  const usages = await RunResource.listRunUsagesForRuns(auth, { runs: [run] });
  if (usages.length === 0) {
    return new Err(new Error(`Run ${dustRunId} has no reported usage`));
  }
  for (const [index, usage] of usages.entries()) {
    const result = await recordRunUsageConsumption(auth, {
      context,
      emittedActions: index === 0 ? emittedActions : [],
      usage,
    });
    if (result.isErr()) {
      return result;
    }
  }
  await signalConsumptionEventsAppended(auth.toJSON(), {
    runKey: context.runKey,
  });
  return new Ok(undefined);
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
): Promise<Result<void, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;

  const modelVisibleActions = emittedActions.filter(
    (action) =>
      !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
  );
  const callFootprintsRes = await measureCallFootprints(auth, {
    actions: modelVisibleActions,
    modelId: usage.modelId,
  });
  if (callFootprintsRes.isErr()) {
    return callFootprintsRes;
  }
  const callFootprints = callFootprintsRes.value;

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
    const toolCallRows: ConsumptionToolCallRow[] =
      consumption.emittedToolCalls.map((toolCall) => ({
        agentMCPActionModelId: toolCall.tool.id,
        runUsageModelId: usage.runUsageModelId,
        outputTokensCount: toolCall.outputTokensCount,
        grossAttributedCreditAmountMicro: toolCall.grossCreditAmountMicro,
        reconciledCreditAmountMicro: toolCall.reconciledCreditAmountMicro,
      }));
    const toolResultRows: ConsumptionToolResultRow[] =
      consumption.consumedToolResults.map((result) => ({
        agentMCPActionModelId: result.tool.agentMCPActionId,
        runUsageModelId: usage.runUsageModelId,
        inputTokensCount: result.inputTokensCount,
        grossAttributedCreditAmountMicro: result.grossCreditAmountMicro,
        reconciledCreditAmountMicro: result.reconciledCreditAmountMicro,
      }));

    const insertedRows =
      await AgentMessageConsumptionItemResource.insertConsumptionRows(auth, {
        conversationModelId: context.conversationModelId,
        agentMessageModelId: context.agentMessageModelId,
        runKey: context.runKey,
        modelRows,
        toolCallRows,
        toolResultRows,
        transaction,
      });
    if (insertedRows.length === 0) {
      return;
    }

    await AgentMessageConsumptionEventResource.append(auth, {
      event: {
        kind: "items_changed",
        idempotencyKey: `model-call:${usage.runUsageModelId}`,
        runKey: context.runKey,
        rootAgentMessageModelId: context.rootAgentMessageId,
        agentMessageModelId: context.agentMessageModelId,
        consumptionItemIds: insertedRows.map((row) => row.consumptionItemId),
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
  return new Ok(undefined);
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
): Promise<Result<number[], Error>> {
  if (actions.length === 0) {
    return new Ok([]);
  }

  const footprintsRes = await measureToolCallOutputFootprints(auth, {
    modelId,
    toolCalls: actions.map((action) => ({
      functionCallName: action.functionCallName,
      functionCallArguments: action.functionCallArguments,
    })),
  });
  return footprintsRes;
}
