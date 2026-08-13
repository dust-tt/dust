import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import type { MessageConsumptionDetails } from "@app/lib/api/assistant/agent_message_consumption_attribution/message_details";
import { buildLatestAvailableMessageConsumptionDetails } from "@app/lib/api/assistant/agent_message_consumption_attribution/message_details";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationConsumptionMessageFacts } from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentMessageConsumptionItemResource as ConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { isTerminalAgentMessageStatus } from "@app/types/assistant/conversation";
import type {
  ConversationConsumptionAgentDetails,
  ConversationConsumptionDetails,
  ConversationConsumptionModelDetails,
  ConversationConsumptionResponse,
  ConversationConsumptionToolDetails,
} from "@app/types/assistant/conversation_consumption";

type MessageDetailsEntry = {
  message: ConversationConsumptionMessageFacts;
  details: MessageConsumptionDetails | null;
};

function hasCompleteDetails(
  entry: MessageDetailsEntry
): entry is MessageDetailsEntry & { details: MessageConsumptionDetails } {
  return entry.details !== null;
}

function mergeToolDetails(
  toolGroups: ConversationConsumptionToolDetails[][]
): ConversationConsumptionToolDetails[] {
  const tools = new Map<string, ConversationConsumptionToolDetails>();

  for (const tool of toolGroups.flat()) {
    const key = `${tool.internalMCPServerName ?? "external"}:${tool.toolName}:${tool.label}`;
    const existing = tools.get(key);
    if (existing) {
      existing.callCount += tool.callCount;
      existing.attributedCredits += tool.attributedCredits;
      existing.directCredits += tool.directCredits;
      existing.pending ||= tool.pending;
      continue;
    }

    tools.set(key, { ...tool });
  }

  return [...tools.values()]
    .filter((tool) => tool.attributedCredits > 0)
    .sort((left, right) => right.attributedCredits - left.attributedCredits);
}

function mergeModelDetails(
  modelGroups: ConversationConsumptionModelDetails[][]
): ConversationConsumptionModelDetails[] {
  const models = new Map<string, ConversationConsumptionModelDetails>();

  for (const model of modelGroups.flat()) {
    const key = `${model.providerId}:${model.modelId}`;
    const existing = models.get(key);
    if (existing) {
      existing.attributedCredits += model.attributedCredits;
      continue;
    }

    models.set(key, { ...model });
  }

  return [...models.values()].sort(
    (left, right) => right.attributedCredits - left.attributedCredits
  );
}

function aggregateMessageDetails(
  details: MessageConsumptionDetails[]
): Omit<ConversationConsumptionDetails, "agents"> {
  return {
    agentWorkCredits: details.reduce(
      (total, detail) => total + detail.agentWorkCredits,
      0
    ),
    tools: mergeToolDetails(details.map((detail) => detail.tools)),
    models: mergeModelDetails(details.map((detail) => detail.models)),
  };
}

/**
 * Aggregates the latest stable bill and newest complete attribution available for each message
 * belonging directly to a conversation. In-progress messages are ignored until they reach a
 * terminal state. If any completed billed message lacks a complete attribution, the stable total
 * remains available while the detailed breakdown is withheld.
 */
export async function getConversationConsumption(
  auth: Authenticator,
  {
    conversation,
  }: {
    conversation: ConversationResource;
  }
): Promise<ConversationConsumptionResponse> {
  const facts = await ConsumptionItemResource.fetchConversationConsumptionFacts(
    auth,
    {
      conversation,
      maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    }
  );
  const completedMessages = facts.messages.filter((message) =>
    isTerminalAgentMessageStatus(message.status)
  );
  const billedCredits = completedMessages.reduce(
    (total, message) => total + (message.billedCredits ?? 0),
    0
  );
  const billedMessages = completedMessages.filter(
    (message) => (message.billedCredits ?? 0) > 0
  );
  if (billedMessages.length === 0) {
    return { billedCredits, details: null };
  }

  const dustRunIds = [
    ...new Set(billedMessages.flatMap((message) => message.dustRunIds)),
  ];
  const runs = await RunResource.listByDustRunIds(auth, { dustRunIds });
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });

  const messageDetails: MessageDetailsEntry[] = billedMessages.map(
    (message) => ({
      message,
      details: buildLatestAvailableMessageConsumptionDetails({
        actions: message.actions,
        billedCredits: message.billedCredits,
        dustRunIds: message.dustRunIds,
        items: message.items,
        runs,
        usages,
      }),
    })
  );
  const completeMessageDetails = messageDetails.filter(hasCompleteDetails);
  if (completeMessageDetails.length !== messageDetails.length) {
    return { billedCredits, details: null };
  }
  const detailsByAgentId = new Map<string, typeof completeMessageDetails>();
  for (const entry of completeMessageDetails) {
    const agentId = entry.message.agentConfigurationId;
    const agentDetails = detailsByAgentId.get(agentId) ?? [];
    agentDetails.push(entry);
    detailsByAgentId.set(agentId, agentDetails);
  }

  const agentLabels = await resolveAnalyticsAgentLabels(auth, [
    ...detailsByAgentId.keys(),
  ]);
  const agents: ConversationConsumptionAgentDetails[] = [
    ...detailsByAgentId.entries(),
  ]
    .flatMap(([agentId, entries]) => {
      const label = agentLabels.get(agentId);
      if (!label) {
        return [];
      }

      const aggregate = aggregateMessageDetails(
        entries.map(({ details }) => details)
      );

      return [
        {
          agentId,
          name: label.name,
          pictureUrl: label.pictureUrl,
          billedCredits: entries.reduce(
            (total, { message }) => total + (message.billedCredits ?? 0),
            0
          ),
          agentWorkCredits: aggregate.agentWorkCredits,
          tools: aggregate.tools,
          models: aggregate.models,
        },
      ];
    })
    .sort((left, right) => right.billedCredits - left.billedCredits);

  return {
    billedCredits,
    details: {
      ...aggregateMessageDetails(
        completeMessageDetails.map(({ details }) => details)
      ),
      agents,
    },
  };
}
