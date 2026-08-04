import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { buildMessageConsumptionDetails } from "@app/lib/api/assistant/agent_message_consumption_attribution/message_details";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemResource as ConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { AgentMessageConsumptionResponse } from "@app/types/assistant/agent_message_consumption";

/**
 * Builds the end-user explanation for one agent message. Provider and token facts stay behind this
 * interface. If the active attribution version does not cover the message's current runs and tools,
 * the exact bill remains available while details are withheld.
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
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    }
  );
  if (!facts) {
    return null;
  }

  const unavailableResponse: AgentMessageConsumptionResponse = {
    billedCredits: facts.billedCredits,
    details: null,
  };
  if (facts.items.length === 0 || facts.dustRunIds.length === 0) {
    return unavailableResponse;
  }

  const runs = await RunResource.listByDustRunIds(auth, {
    dustRunIds: facts.dustRunIds,
  });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });
  if (usages.length === 0) {
    return unavailableResponse;
  }

  const details = buildMessageConsumptionDetails({
    actions: facts.actions,
    billedCredits: facts.billedCredits,
    dustRunIds: facts.dustRunIds,
    items: facts.items,
    runs,
    usages,
  });
  if (!details) {
    return unavailableResponse;
  }

  const { models: _models, ...messageDetails } = details;

  return {
    billedCredits: facts.billedCredits,
    details: messageDetails,
  };
}
