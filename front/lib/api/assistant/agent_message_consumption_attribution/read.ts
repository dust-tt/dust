import { isToolExecutionStatusFinal } from "@app/lib/actions/statuses";
import { getToolAggregateDisplayLabel } from "@app/lib/actions/tool_display_labels";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { AgentMessageConsumptionItemResource as ConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import type { AgentMCPActionType } from "@app/types/actions";
import type {
  AgentMessageConsumptionResponse,
  AgentMessageConsumptionToolDetails,
} from "@app/types/assistant/agent_message_consumption";
import type { ModelId } from "@app/types/shared/model_id";

const MICRO_CREDITS_PER_CREDIT = 1_000_000;

function creditsFromMicroCredits(microCredits: number): number {
  return microCredits / MICRO_CREDITS_PER_CREDIT;
}

/**
 * Reconciles stable attribution estimates with the exact billed total without changing stored
 * rows. Any shortfall is assigned to agent work because it cannot be safely attributed to a tool.
 */
function buildConsumptionTotals({
  items,
  billedCredits,
}: {
  items: AgentMessageConsumptionItemResource[];
  billedCredits: number | null;
}): {
  grossAttributedCredits: number;
  agentWorkCredits: number;
  estimatedCacheSavingsCredits: number | null;
} {
  const storedGrossAttributedCreditAmountMicro = items.reduce(
    (total, item) => total + item.grossAttributedCreditAmountMicro,
    0
  );
  const storedAgentWorkCreditAmountMicro = items.reduce(
    (total, item) =>
      item.itemType === "tool"
        ? total
        : total + item.grossAttributedCreditAmountMicro,
    0
  );
  const billedCreditAmountMicro =
    billedCredits === null ? null : billedCredits * MICRO_CREDITS_PER_CREDIT;
  const unattributedBilledCreditAmountMicro =
    billedCreditAmountMicro === null
      ? 0
      : Math.max(
          billedCreditAmountMicro - storedGrossAttributedCreditAmountMicro,
          0
        );
  const grossAttributedCredits = creditsFromMicroCredits(
    storedGrossAttributedCreditAmountMicro + unattributedBilledCreditAmountMicro
  );

  return {
    grossAttributedCredits,
    agentWorkCredits: creditsFromMicroCredits(
      storedAgentWorkCreditAmountMicro + unattributedBilledCreditAmountMicro
    ),
    estimatedCacheSavingsCredits:
      billedCredits === null
        ? null
        : Math.max(grossAttributedCredits - billedCredits, 0),
  };
}

/** Ensures every provider-reported model bucket has a row for the active attribution version. */
function hasCompleteModelAttribution(
  items: AgentMessageConsumptionItemResource[],
  usages: Awaited<ReturnType<typeof RunResource.listRunUsagesForRuns>>
): boolean {
  const itemTypesByRunUsageModelId = new Map<ModelId, Set<string>>();

  for (const item of items) {
    if (item.itemType === "tool" || item.runUsageId === null) {
      continue;
    }

    const itemTypes =
      itemTypesByRunUsageModelId.get(item.runUsageId) ?? new Set();
    itemTypes.add(item.itemType);
    itemTypesByRunUsageModelId.set(item.runUsageId, itemTypes);
  }

  return usages.every((usage) => {
    const itemTypes = itemTypesByRunUsageModelId.get(usage.runUsageModelId);
    return (
      itemTypes?.has("input") === true &&
      itemTypes.has("output") &&
      (usage.reasoningTokens === null || itemTypes.has("reasoning"))
    );
  });
}

/** Ensures every attributable action has a row and every settled action has final evidence. */
function hasCompleteToolAttribution({
  actions,
  items,
  dustRunIdsWithUsage,
}: {
  actions: AgentMCPActionResource[];
  items: AgentMessageConsumptionItemResource[];
  dustRunIdsWithUsage: Set<string>;
}): boolean {
  const toolItemByActionModelId = new Map<
    ModelId,
    AgentMessageConsumptionItemResource
  >();
  for (const item of items) {
    if (item.itemType === "tool" && item.agentMCPActionId !== null) {
      toolItemByActionModelId.set(item.agentMCPActionId, item);
    }
  }
  const actionModelIds = new Set(actions.map((action) => action.id));

  for (const actionModelId of toolItemByActionModelId.keys()) {
    if (!actionModelIds.has(actionModelId)) {
      return false;
    }
  }

  for (const action of actions) {
    const dustRunId = action.stepContent.dustRunId;
    if (!dustRunId || !dustRunIdsWithUsage.has(dustRunId)) {
      continue;
    }

    const item = toolItemByActionModelId.get(action.id);
    if (!item) {
      return false;
    }
    if (
      isToolExecutionStatusFinal(action.status) &&
      item.completedAt === null
    ) {
      return false;
    }
  }

  return true;
}

function toolIdentity(action: AgentMCPActionType): string {
  const serverIdentity =
    action.mcpServerId ??
    action.internalMCPServerName ??
    action.functionCallName;

  return `${serverIdentity}:${action.toolName}`;
}

/** Groups repeated executions by tool identity while preserving first-use display order. */
function buildToolDetails({
  actions,
  items,
}: {
  actions: AgentMCPActionResource[];
  items: AgentMessageConsumptionItemResource[];
}): AgentMessageConsumptionToolDetails[] | null {
  const actionByModelId = new Map(actions.map((action) => [action.id, action]));
  const groupedTools = new Map<
    string,
    AgentMessageConsumptionToolDetails & { firstStep: number }
  >();

  for (const item of items) {
    if (item.itemType !== "tool" || item.agentMCPActionId === null) {
      continue;
    }

    const action = actionByModelId.get(item.agentMCPActionId);
    if (!action) {
      return null;
    }

    const serialized = action.toJSON();
    const identity = toolIdentity(serialized);
    const current = groupedTools.get(identity);
    const grossAttributedCredits = creditsFromMicroCredits(
      item.grossAttributedCreditAmountMicro
    );
    const directCredits = creditsFromMicroCredits(
      item.directCreditAmountMicro ?? 0
    );

    if (current) {
      groupedTools.set(identity, {
        ...current,
        callCount: current.callCount + 1,
        grossAttributedCredits:
          current.grossAttributedCredits + grossAttributedCredits,
        directCredits: current.directCredits + directCredits,
        pending: current.pending || item.completedAt === null,
        firstStep: Math.min(current.firstStep, serialized.step),
      });
      continue;
    }

    groupedTools.set(identity, {
      label: getToolAggregateDisplayLabel(serialized),
      internalMCPServerName: serialized.internalMCPServerName,
      toolName: serialized.toolName,
      callCount: 1,
      grossAttributedCredits,
      directCredits,
      pending: item.completedAt === null,
      firstStep: serialized.step,
    });
  }

  return [...groupedTools.values()]
    .sort((left, right) => left.firstStep - right.firstStep)
    .map(({ firstStep: _firstStep, ...tool }) => tool);
}

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

  const dustRunIdByRunModelId = new Map(
    runs.map((run) => [run.id, run.dustRunId])
  );
  const dustRunIdsWithUsage = new Set(
    usages.flatMap((usage) => {
      const dustRunId = dustRunIdByRunModelId.get(usage.runModelId);
      return dustRunId ? [dustRunId] : [];
    })
  );

  if (
    !hasCompleteModelAttribution(facts.items, usages) ||
    !hasCompleteToolAttribution({
      actions: facts.actions,
      items: facts.items,
      dustRunIdsWithUsage,
    })
  ) {
    return unavailableResponse;
  }

  const tools = buildToolDetails({
    actions: facts.actions,
    items: facts.items,
  });
  if (!tools) {
    return unavailableResponse;
  }

  const {
    grossAttributedCredits,
    agentWorkCredits,
    estimatedCacheSavingsCredits,
  } = buildConsumptionTotals({
    items: facts.items,
    billedCredits: facts.billedCredits,
  });

  return {
    billedCredits: facts.billedCredits,
    details: {
      attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
      grossAttributedCredits,
      estimatedCacheSavingsCredits,
      agentWorkCredits,
      tools,
    },
  };
}
