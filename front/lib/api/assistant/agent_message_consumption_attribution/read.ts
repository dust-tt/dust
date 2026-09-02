import { getToolAggregateDisplayLabel } from "@app/lib/actions/tool_display_labels";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import type { ToolConsumptionDetailsOverride } from "@app/lib/api/assistant/agent_message_consumption_attribution/message_details";
import { buildLatestAvailableMessageConsumptionDetails } from "@app/lib/api/assistant/agent_message_consumption_attribution/message_details";
import { resolveAnalyticsAgentLabels } from "@app/lib/api/assistant/observability/agent_labels";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageConsumptionItemResource as ConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { AgentMessageConsumptionResponse } from "@app/types/assistant/agent_message_consumption";
import { getAgentUsageAttributedId } from "@app/types/assistant/assistant";
import type { ModelId } from "@app/types/shared/model_id";
import { removeNulls } from "@app/types/shared/utils/general";

/**
 * Builds the end-user explanation for one agent message. Provider and token facts stay behind this
 * interface. It uses the newest complete attribution version stored for the message, assigns each
 * visible sub-agent subtree to its originating run-agent tool, and folds hidden helper sub-agents
 * into the parent agent's work. If no version covers the message's current runs and tools, the
 * exact bill remains available while details are withheld.
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

  const subAgentBilledCredits = facts.directSubAgents.reduce(
    (total, subAgent) => total + subAgent.subtreeBilledCredits,
    0
  );
  const subAgentsByActionModelId = new Map(
    facts.directSubAgents.map((subAgent) => [subAgent.action.id, subAgent])
  );
  const hiddenHelperActionIds = new Set<ModelId>(
    facts.actions
      .filter((action) => {
        const subAgentId = subAgentsByActionModelId.get(
          action.id
        )?.agentConfigurationId;
        const { toolConfiguration } = action;
        const configuredSubAgentId = isLightServerSideMCPToolConfiguration(
          toolConfiguration
        )
          ? toolConfiguration.childAgentId
          : null;
        const agentId = subAgentId ?? configuredSubAgentId;
        if (!agentId) {
          return false;
        }
        return (
          getAgentUsageAttributedId({
            agentId,
            parentAgentId: facts.agentConfigurationId,
          }) !== agentId
        );
      })
      .map((action) => action.id)
  );
  const visibleSubAgents = facts.directSubAgents.filter(
    ({ action }) => !hiddenHelperActionIds.has(action.id)
  );
  const hiddenSubAgentBilledCredits = facts.directSubAgents.reduce(
    (total, subAgent) =>
      hiddenHelperActionIds.has(subAgent.action.id)
        ? total + subAgent.subtreeBilledCredits
        : total,
    0
  );
  const totalBilledCredits = (facts.billedCredits ?? 0) + subAgentBilledCredits;

  const unavailableResponse: AgentMessageConsumptionResponse = {
    billedCredits: facts.billedCredits,
    totalBilledCredits,
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

  const agentConfigurationIds = [
    ...new Set(
      removeNulls(
        visibleSubAgents.map((subAgent) => subAgent.agentConfigurationId)
      )
    ),
  ];
  const agentLabels = await resolveAnalyticsAgentLabels(
    auth,
    agentConfigurationIds
  );
  const toolDetailsOverridesByActionModelId = new Map<
    ModelId,
    ToolConsumptionDetailsOverride
  >(
    visibleSubAgents.map((subAgent) => {
      const agentLabel = subAgent.agentConfigurationId
        ? agentLabels.get(subAgent.agentConfigurationId)
        : null;
      return [
        subAgent.action.id,
        {
          additionalAttributedCredits: subAgent.subtreeBilledCredits,
          identity: subAgent.agentConfigurationId
            ? `sub-agent:${subAgent.agentConfigurationId}`
            : `sub-agent-action:${subAgent.action.id}`,
          label: agentLabel
            ? `Run ${agentLabel.name}`
            : getToolAggregateDisplayLabel(subAgent.action.toJSON()),
        },
      ];
    })
  );

  const details = buildLatestAvailableMessageConsumptionDetails({
    actions: facts.actions,
    agentWorkDetailsOverride: {
      additionalAttributedCredits: hiddenSubAgentBilledCredits,
      actionModelIds: hiddenHelperActionIds,
    },
    billedCredits: facts.billedCredits,
    dustRunIds: facts.dustRunIds,
    items: facts.items,
    runs,
    toolDetailsOverridesByActionModelId,
    usages,
  });
  if (!details) {
    return unavailableResponse;
  }

  const { models: _models, ...messageDetails } = details;

  return {
    billedCredits: facts.billedCredits,
    totalBilledCredits,
    details: messageDetails,
  };
}
