import { buildLatestMessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import type { Authenticator } from "@app/lib/auth";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";

export class AgentMessageConsumptionItemFactory {
  // Reconciles the stored items of the current attribution version against the message's bill, as
  // the attribution activity does, without rebuilding their evidence. A version that does not
  // reconcile keeps its previously reconciled amounts.
  static async reconcileStoredItems(
    auth: Authenticator,
    { agentMessageId }: { agentMessageId: string }
  ): Promise<void> {
    const creditContext =
      await ConversationResource.fetchAgentMessageCreditContext(auth, {
        agentMessageId,
      });
    if (!creditContext) {
      throw new Error("Agent message credit context was not found");
    }
    const { agentMessageModelId } = creditContext;
    const dustRunIds = [...new Set(creditContext.runIds ?? [])];
    const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
    const usages = await RunResource.listRunUsagesForRuns(auth, {
      includeUnavailable: true,
      runs,
    });
    const actions = await AgentMCPActionResource.listByAgentMessageIds(auth, [
      agentMessageModelId,
    ]);
    const items = (
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      )
    ).filter(
      (item) =>
        item.attributionVersion ===
        AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION
    );
    const allocationResult = buildLatestMessageConsumptionAllocation({
      actions,
      billedCredits: creditContext.previousCostCredits,
      dustRunIds,
      items,
      runs,
      usages,
    });
    if (allocationResult.isErr()) {
      return;
    }

    await AgentMessageConsumptionItemResource.setReconciledCreditAmounts(auth, {
      reconciledCreditAmountByItem:
        allocationResult.value.reconciledCreditAmounts.byItem,
    });
  }
}
