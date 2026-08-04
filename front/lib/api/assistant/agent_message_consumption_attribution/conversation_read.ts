import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import {
  buildMessageConsumptionDetails,
  type MessageConsumptionDetails,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/message_details";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationConsumptionMessageFacts } from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentMessageConsumptionItemResource as ConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { isHiddenHelperSubAgentId } from "@app/types/assistant/assistant";
import type {
  ConversationConsumptionAgentDetails,
  ConversationConsumptionDetails,
  ConversationConsumptionModelDetails,
  ConversationConsumptionResponse,
  ConversationConsumptionToolDetails,
} from "@app/types/assistant/conversation_consumption";

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
    attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    agentWorkCredits: details.reduce(
      (total, detail) => total + detail.agentWorkCredits,
      0
    ),
    tools: mergeToolDetails(details.map((detail) => detail.tools)),
    models: mergeModelDetails(details.map((detail) => detail.models)),
  };
}

function resolveEffectiveAgentId(
  message: ConversationConsumptionMessageFacts,
  messagesById: Map<string, ConversationConsumptionMessageFacts>,
  visited = new Set<string>()
): string {
  if (
    !isHiddenHelperSubAgentId(message.agentConfigurationId) ||
    !message.parentAgentMessageId ||
    visited.has(message.agentMessageId)
  ) {
    return message.agentConfigurationId;
  }

  const parent = messagesById.get(message.parentAgentMessageId);
  if (!parent) {
    return message.agentConfigurationId;
  }

  visited.add(message.agentMessageId);
  return resolveEffectiveAgentId(parent, messagesById, visited);
}

/**
 * Aggregates the exact bill and active-version attribution for a conversation and its run-agent
 * descendants. If any billed message lacks a complete attribution, the exact total remains
 * available while the detailed breakdown is withheld.
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
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    }
  );
  const billedCredits = facts.messages.reduce(
    (total, message) => total + (message.billedCredits ?? 0),
    0
  );
  const billedMessages = facts.messages.filter(
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

  const messageDetails = billedMessages.map((message) => ({
    message,
    details: buildMessageConsumptionDetails({
      actions: message.actions,
      billedCredits: message.billedCredits,
      dustRunIds: message.dustRunIds,
      items: message.items,
      runs,
      usages,
    }),
  }));
  if (messageDetails.some(({ details }) => details === null)) {
    return { billedCredits, details: null };
  }

  const completeMessageDetails = messageDetails.map(({ message, details }) => ({
    message,
    details: details as MessageConsumptionDetails,
  }));
  const messagesById = new Map(
    facts.messages.map((message) => [message.agentMessageId, message])
  );
  const detailsByAgentId = new Map<string, typeof completeMessageDetails>();
  for (const entry of completeMessageDetails) {
    const agentId = resolveEffectiveAgentId(entry.message, messagesById);
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
    .map(([agentId, entries]) => {
      const aggregate = aggregateMessageDetails(
        entries.map(({ details }) => details)
      );
      const label = agentLabels.get(agentId);

      return {
        agentId,
        name: label?.name ?? "Unknown agent",
        pictureUrl: label?.pictureUrl ?? null,
        billedCredits: entries.reduce(
          (total, { message }) => total + (message.billedCredits ?? 0),
          0
        ),
        agentWorkCredits: aggregate.agentWorkCredits,
        tools: aggregate.tools,
        models: aggregate.models,
      };
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
