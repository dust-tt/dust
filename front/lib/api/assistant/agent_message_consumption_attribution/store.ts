import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { isSandboxChildActionInfo } from "@app/lib/actions/types";
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  buildRunUsageAttribution,
  buildToolAttribution,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { measureToolCallFootprints } from "@app/lib/api/assistant/agent_message_consumption_attribution/tool_footprint";
import { getAttachmentCapabilityContext } from "@app/lib/api/assistant/conversation/attachment_capabilities";
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
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";
import assert from "assert";

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
 * by (agent message, attribution version, action) for tool rows: a re-finalize (interrupt/resume,
 * tool confirmation, Temporal retry) re-inserts the same identities as no-ops and adds rows only for
 * run usages or actions that are new since the last pass. Records are computed for the whole message
 * before any write, so a tokenization failure throws and the retry recomputes from scratch rather
 * than locking in a partial breakdown.
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
): Promise<void> {
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

  const { agentMessageModelId, status, runIds, triggeringUserMessageOrigin } =
    creditContext;

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

  // Tool results are re-rendered below to measure them, so they need the same attachment
  // capabilities the conversation used when the results were sent to the model.
  const capabilities = await getAttachmentCapabilityContext(auth, conversation);

  // Every usage is reached through this message's own runIds, so each one belongs to this message.
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });

  // Group the message's tool calls by the run that emitted them. Each action carries its emitting
  // step content, whose dustRunId identifies that run and is the same identifier the run usages are
  // keyed by.
  const actions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
    agentMessageModelId,
  ]);
  const enrichedActions =
    await AgentMCPActionResource.enrichActionsWithOutputItems(auth, {
      actions,
      ignoreContent: false,
    });
  const enrichedActionById = new Map(
    enrichedActions.map((action) => [action.id, action])
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

  const records: CompletedAgentMessageConsumptionItem[] = [];
  // Tool calls whose action is still blocked (awaiting approval or authentication). Written pending:
  // only the emitted call output is known, the result footprint and direct charge wait for the
  // action to settle.
  const pendingToolItems: PendingToolConsumptionItem[] = [];

  for (const usage of usages) {
    const dustRunId = dustRunIdByRunModelId.get(usage.runModelId);
    const runActions = (dustRunId && actionsByDustRunId.get(dustRunId)) || [];
    const runActionPairs = runActions.map((action) => {
      const enrichedAction = enrichedActionById.get(action.id);
      assert(enrichedAction, "Every action must have an enriched counterpart");
      return { action, enrichedAction };
    });
    // Sandbox-child actions are invoked by the in-sandbox dsbx CLI, not by the outer model. They
    // reuse their parent's function-call step content, so measuring them here would tokenize the
    // parent Computer call a second time and separately count a result already carried in the
    // Computer output.
    const modelVisibleRunActionPairs = runActionPairs.filter(
      ({ action }) =>
        !isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
    );
    const sandboxChildRunActionPairs = runActionPairs.filter(({ action }) =>
      isSandboxChildActionInfo(action.stepContext.sandboxChildActionInfo)
    );

    // Token footprints of this run's model-visible tool calls: the output the model spent emitting
    // each call and the input its result occupied. Everything is priced against this one usage below.
    const footprintsRes = await measureToolCallFootprints(auth, {
      modelId: usage.modelId,
      capabilities,
      // TODO(2026-07-31 FLAV) Refactor `enrichActionsWithOutputItems` so it still returns the
      // resource.
      toolCalls: modelVisibleRunActionPairs.map(
        ({ action, enrichedAction }) => ({
          action: enrichedAction,
          functionCallArguments: action.functionCallArguments,
        })
      ),
    });
    if (footprintsRes.isErr()) {
      throw new Error(
        `[ConsumptionAttribution] Failed to tokenize tool footprints: ${footprintsRes.error.message}`
      );
    }
    const footprints = footprintsRes.value;

    // Pair each tool call with its enriched form and measured footprint once, here. This is the only
    // place alignment is assumed: measureToolCallFootprints returns counts positioned by the actions
    // it received, and modelVisibleRunActionPairs is aligned with the measured footprints, so index
    // i is the same tool call across both. From here each call carries its own data through the
    // builder, so nothing downstream re-derives the position.
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

    toolCalls.forEach((toolCall) => {
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
        return;
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
    });

    for (const { action, enrichedAction } of sandboxChildRunActionPairs) {
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
  }

  // One atomic write for the whole pass. The resource inserts the model buckets and the final tools,
  // completes in place any tool a prior pass left pending, and records the still-blocked tools as
  // pending, so this materializer never coordinates a read followed by separate inserts and updates.
  await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
    conversation,
    agentMessageModelId,
    attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    records,
    pendingToolItems,
  });
}
