import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { aggregateMessageDetails } from "@app/lib/api/assistant/agent_message_consumption_attribution/conversation_read";
import type { MessageConsumptionDetails } from "@app/lib/api/assistant/agent_message_consumption_attribution/message_details";
import { buildLatestAvailableMessageConsumptionDetails } from "@app/lib/api/assistant/agent_message_consumption_attribution/message_details";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemResource as ConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { AgentMessageConsumptionResponse } from "@app/types/assistant/agent_message_consumption";

/**
 * Builds the end-user explanation for one agent message and its direct sub-agents. Provider and
 * token facts stay behind this interface. Each expanded message uses its newest complete attribution
 * version, then the same aggregation as the conversation breakdown merges their tools. Deeper
 * sub-agent charges remain in agent work so the breakdown still reconciles to the recursive bill.
 */
export async function getAgentMessageConsumption(
  auth: Authenticator,
  {
    conversation,
    agentMessageId,
  }: {
    conversation: ConversationResource;
    agentMessageId: string;
  }
): Promise<AgentMessageConsumptionResponse | null> {
  const facts = await ConsumptionItemResource.fetchMessageConsumptionFacts(
    auth,
    {
      conversation,
      agentMessageId,
      maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    }
  );
  if (!facts) {
    return null;
  }

  const {
    directBilledCredits: directSubAgentBilledCredits,
    totalBilledCredits: subAgentBilledCredits,
  } = await ConversationResource.getSubAgentCostCreditsByMessageId(auth, {
    agentMessageId,
  });
  const totalBilledCredits = (facts.billedCredits ?? 0) + subAgentBilledCredits;

  const unavailableResponse: AgentMessageConsumptionResponse = {
    billedCredits: facts.billedCredits,
    subAgentBilledCredits,
    totalBilledCredits,
    details: null,
  };

  const attributedSubAgentBilledCredits = facts.subAgentMessages.reduce(
    (total, message) => total + (message.billedCredits ?? 0),
    0
  );
  if (attributedSubAgentBilledCredits !== directSubAgentBilledCredits) {
    return unavailableResponse;
  }
  const unexpandedSubAgentBilledCredits =
    subAgentBilledCredits - directSubAgentBilledCredits;

  const billedMessages = [
    {
      actions: facts.actions,
      billedCredits: facts.billedCredits,
      dustRunIds: facts.dustRunIds,
      items: facts.items,
    },
    ...facts.subAgentMessages,
  ].filter((message) => (message.billedCredits ?? 0) > 0);
  if (billedMessages.length === 0) {
    return unavailableResponse;
  }

  const dustRunIds = [
    ...new Set(billedMessages.flatMap((message) => message.dustRunIds)),
  ];
  const runs = await RunResource.listByDustRunIds(auth, {
    dustRunIds,
  });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });
  if (usages.length === 0) {
    return unavailableResponse;
  }

  const details = billedMessages.map((message) =>
    buildLatestAvailableMessageConsumptionDetails({
      ...message,
      runs,
      usages,
    })
  );
  if (details.some((detail) => detail === null)) {
    return unavailableResponse;
  }
  const completeDetails = details.filter(
    (detail): detail is MessageConsumptionDetails => detail !== null
  );

  const {
    models: _models,
    agentWorkCredits,
    ...messageDetails
  } = aggregateMessageDetails(completeDetails);

  return {
    billedCredits: facts.billedCredits,
    subAgentBilledCredits,
    totalBilledCredits,
    details: {
      attributionVersion: Math.min(
        ...completeDetails.map((detail) => detail.attributionVersion)
      ),
      agentWorkCredits: agentWorkCredits + unexpandedSubAgentBilledCredits,
      ...messageDetails,
    },
  };
}
