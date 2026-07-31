import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  buildRunUsageAttribution,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import type { Authenticator } from "@app/lib/auth";
import type { CompletedAgentMessageConsumptionItem } from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import logger from "@app/logger/logger";
import { AGENT_MESSAGE_STATUSES_TO_TRACK } from "@app/types/assistant/conversation";
import { assertNever } from "@app/types/shared/utils/assert_never";

/**
 * Records the per-run token attribution breakdown for one settled agent message.
 *
 * This is analytics, not billing: the authoritative charge is computed and stored separately by the
 * credit pipeline. Here we explain the relative composition of that cost by writing one row per
 * model token bucket (input, output, reasoning) for each of the message's run usages.
 *
 * V0.5 covers the model buckets only. Per-tool attribution (the split of the input footprint of
 * each tool result and its direct credits) is a later version and needs tokenization, so it is not
 * produced here: the builder is called with no tool calls.
 *
 * Runs once the message has settled, launched from the analytics queue by the finalize activities.
 * It is idempotent by (agent message, attribution version, run usage, item type): a re-finalize
 * (interrupt/resume, tool confirmation, Temporal retry) re-inserts the same identities as no-ops
 * and adds rows only for run usages that are new since the last pass.
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

  const { agentMessageModelId, status, runIds } = creditContext;

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

  const records: CompletedAgentMessageConsumptionItem[] = usages.flatMap(
    (usage) => {
      const { modelItems } = buildRunUsageAttribution<never>({
        usage,
        toolCalls: [],
      });

      return modelItems.map((item): CompletedAgentMessageConsumptionItem => {
        switch (item.itemType) {
          case "input":
            return {
              itemType: "input",
              runUsageModelId: usage.runUsageModelId,
              inputTokensCount: item.inputTokensCount,
              grossAttributedCreditAmountMicro:
                item.grossAttributedCreditAmountMicro,
            };

          case "output":
          case "reasoning":
            return {
              itemType: item.itemType,
              runUsageModelId: usage.runUsageModelId,
              outputTokensCount: item.outputTokensCount,
              grossAttributedCreditAmountMicro:
                item.grossAttributedCreditAmountMicro,
            };

          default:
            return assertNever(item);
        }
      });
    }
  );

  await AgentMessageConsumptionItemResource.insertCompletedItemsIdempotently(
    auth,
    {
      conversation,
      agentMessageModelId,
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      records,
    }
  );
}
