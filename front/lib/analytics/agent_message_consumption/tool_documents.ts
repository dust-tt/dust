import {
  makeBaseDocument,
  modelForUsage,
  reconciledCreditMicroForItem,
} from "@app/lib/analytics/agent_message_consumption/document_common";
import type {
  AgentMessageConsumptionAnalyticsInput,
  BilledRunUsage,
} from "@app/lib/analytics/agent_message_consumption/load";
import type { MessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageToolConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentMessageConsumptionAnalyticsToolData } from "@app/types/assistant/analytics";
import assert from "assert";

function skillExposesAction(
  skill: SkillResource,
  action: AgentMCPActionResource
): boolean {
  const toolServerId = action.toolConfiguration.toolServerId;
  const toolName = action.toJSON().toolName;

  return skill.mcpServerConfigurations.some(({ view }) => {
    if (view.mcpServerId !== toolServerId) {
      return false;
    }

    // If the server disables the tool, the skill cannot expose it.
    return !view.getToolPermissions.some(
      (permission) => permission.toolName === toolName && !permission.enabled
    );
  });
}

function skillIdsAttributedToAction(
  skills: SkillResource[],
  action: AgentMCPActionResource,
  enabledSkillIds: string[]
): string[] {
  // Attribute every skill that exposes the tool and any skill enabled by the action.
  // The tool document keeps its full credit amount instead of splitting it across these skills.
  return [
    ...new Set([
      ...skills
        .filter((skill) => skillExposesAction(skill, action))
        .map((skill) => skill.sId),
      ...enabledSkillIds,
    ]),
  ];
}

function serverNameForAction(action: AgentMCPActionResource): string {
  const serializedAction = action.toJSON();
  return (
    serializedAction.internalMCPServerName ??
    action.toolConfiguration.mcpServerName
  );
}

function summarizeToolConsumptionItem({
  allocation,
  items,
}: {
  allocation: MessageConsumptionAllocation<BilledRunUsage>;
  items: AgentMessageToolConsumptionItemResource[];
}): Pick<
  AgentMessageConsumptionAnalyticsToolData,
  "credit_micro" | "gross_credit_micro" | "tokens"
> {
  const legacyItem = items.find((item) => item.itemType === "tool");
  const callItem = items.find((item) => item.itemType === "tool_call");
  const directItem = items.find((item) => item.itemType === "tool_direct");
  const resultItem = items.find((item) => item.itemType === "tool_result");
  const resultFootprintTokens =
    resultItem?.inputTokensCount ??
    directItem?.inputTokensCount ??
    legacyItem?.inputTokensCount ??
    0;
  const directCreditMicro = items.reduce(
    (total, item) => total + (item.directCreditAmountMicro ?? 0),
    0
  );
  const attributedCreditMicro = items.reduce(
    (total, item) => total + reconciledCreditMicroForItem(allocation, item),
    0
  );
  assert(
    attributedCreditMicro >= directCreditMicro,
    "Tool credit is smaller than its direct charge"
  );

  return {
    credit_micro: attributedCreditMicro,
    gross_credit_micro: {
      system: 0,
      input: null,
      result_footprint: resultItem?.grossAttributedCreditAmountMicro ?? null,
      output: callItem?.grossAttributedCreditAmountMicro ?? null,
      reasoning: 0,
      direct: directCreditMicro,
      total: attributedCreditMicro,
    },
    tokens: {
      system: 0,
      input: null,
      result_footprint: resultFootprintTokens,
      output: callItem?.outputTokensCount ?? legacyItem?.outputTokensCount ?? 0,
      reasoning: 0,
    },
  };
}

function buildToolConsumptionDocument({
  action,
  allocation,
  enabledSkillIds,
  input,
  items,
  parentAction,
  usage,
}: {
  action: AgentMCPActionResource;
  allocation: MessageConsumptionAllocation<BilledRunUsage>;
  enabledSkillIds: string[];
  input: AgentMessageConsumptionAnalyticsInput;
  items: AgentMessageToolConsumptionItemResource[];
  parentAction: AgentMCPActionResource | undefined;
  usage: BilledRunUsage;
}): AgentMessageConsumptionAnalyticsToolData {
  const serializedAction = action.toJSON();

  return {
    ...makeBaseDocument(input, {
      attributionVersion: allocation.attributionVersion,
      consumptionKey: `tool-action:${action.id}`,
      runUsageModelId: usage.runUsageModelId,
      stepIndex: serializedAction.step,
      usageType: usage.usageType,
    }),
    ...summarizeToolConsumptionItem({ allocation, items }),
    consumption_type: "tool",
    execution_time_ms: serializedAction.executionDurationMs,
    model: modelForUsage(input.model, usage),
    status: serializedAction.status,
    tool: {
      name: serializedAction.toolName,
      server_name: serverNameForAction(action),
      parent_server_name: parentAction ? serverNameForAction(parentAction) : "",
      action_id: action.sId,
      attributed_skill_ids: skillIdsAttributedToAction(
        input.skills,
        action,
        enabledSkillIds
      ),
    },
  };
}

export function buildToolConsumptionDocuments(
  input: AgentMessageConsumptionAnalyticsInput,
  allocation: MessageConsumptionAllocation<BilledRunUsage>
): AgentMessageConsumptionAnalyticsToolData[] {
  const usageByModelId = new Map(
    allocation.messageUsages.map((usage) => [usage.runUsageModelId, usage])
  );
  const actionByModelId = new Map(
    input.actions.map((action) => [action.id, action])
  );
  const actionById = new Map(
    input.actions.map((action) => [action.sId, action])
  );
  const toolItemsByActionModelId = new Map<
    number,
    AgentMessageToolConsumptionItemResource[]
  >();

  for (const item of allocation.items) {
    if (!item.isToolItem()) {
      continue;
    }

    const actionItems =
      toolItemsByActionModelId.get(item.agentMCPActionId) ?? [];
    actionItems.push(item);
    toolItemsByActionModelId.set(item.agentMCPActionId, actionItems);
  }

  return [...toolItemsByActionModelId].map(([actionModelId, items]) => {
    const anchorItem =
      items.find((item) => item.itemType === "tool_call") ?? items[0];
    assert(anchorItem, "Tool consumption action has no posting");
    const usage = usageByModelId.get(anchorItem.runUsageId);
    const action = actionByModelId.get(actionModelId);
    assert(usage, "Tool consumption item references an unknown usage");
    assert(action, "Tool consumption item references an unknown action");

    const parentActionId =
      action.stepContext.sandboxChildActionInfo?.parentActionId;
    return buildToolConsumptionDocument({
      action,
      allocation,
      enabledSkillIds: input.enabledSkillIdsByActionId.get(action.sId) ?? [],
      input,
      items,
      parentAction: parentActionId ? actionById.get(parentActionId) : undefined,
      usage,
    });
  });
}
