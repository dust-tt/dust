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
import { skillIdsAttributedToAction } from "@app/lib/api/assistant/agent_message_consumption_attribution/skill_attribution";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import type { AgentMessageToolConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { AgentMessageConsumptionAnalyticsToolData } from "@app/types/assistant/analytics";
import assert from "assert";

function serverNameForAction(action: AgentMCPActionResource): string {
  const serializedAction = action.toJSON();
  return (
    serializedAction.internalMCPServerName ??
    action.toolConfiguration.mcpServerName
  );
}

function summarizeToolConsumptionItem({
  allocation,
  item,
}: {
  allocation: MessageConsumptionAllocation<BilledRunUsage>;
  item: AgentMessageToolConsumptionItemResource;
}): Pick<
  AgentMessageConsumptionAnalyticsToolData,
  "credit_micro" | "gross_credit_micro" | "tokens"
> {
  const resultFootprintTokens = item.inputTokensCount ?? 0;
  const directCreditMicro = item.directCreditAmountMicro ?? 0;
  const attributedCreditMicro = reconciledCreditMicroForItem(allocation, item);
  assert(
    attributedCreditMicro >= directCreditMicro,
    "Tool credit is smaller than its direct charge"
  );

  // TODO(2026-08-07 OBSERVABILITY): We currently exclusively store the direct charge credits and
  // gross credits but we don't have credit consumption just for the result footprint.
  return {
    credit_micro: attributedCreditMicro,
    gross_credit_micro: {
      system: 0,
      input: null,
      result_footprint: null,
      output: null,
      reasoning: 0,
      direct: directCreditMicro,
      total: attributedCreditMicro,
    },
    tokens: {
      system: 0,
      input: null,
      result_footprint: resultFootprintTokens,
      output: item.outputTokensCount ?? 0,
      reasoning: 0,
    },
  };
}

function buildToolConsumptionDocument({
  action,
  allocation,
  enabledSkillIds,
  input,
  item,
  parentAction,
  usage,
}: {
  action: AgentMCPActionResource;
  allocation: MessageConsumptionAllocation<BilledRunUsage>;
  enabledSkillIds: string[];
  input: AgentMessageConsumptionAnalyticsInput;
  item: AgentMessageToolConsumptionItemResource;
  parentAction: AgentMCPActionResource | undefined;
  usage: BilledRunUsage;
}): AgentMessageConsumptionAnalyticsToolData {
  const serializedAction = action.toJSON();

  return {
    ...makeBaseDocument(input, {
      attributionVersion: allocation.attributionVersion,
      consumptionKey: item.itemKey,
      runUsageModelId: item.runUsageId,
      stepIndex: serializedAction.step,
      usageType: usage.usageType,
    }),
    ...summarizeToolConsumptionItem({ allocation, item }),
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
  const documents: AgentMessageConsumptionAnalyticsToolData[] = [];

  for (const item of allocation.items) {
    if (!item.isToolItem()) {
      continue;
    }

    const usage = usageByModelId.get(item.runUsageId);
    const action = actionByModelId.get(item.agentMCPActionId);
    assert(usage, "Tool consumption item references an unknown usage");
    assert(action, "Tool consumption item references an unknown action");

    const parentActionId =
      action.stepContext.sandboxChildActionInfo?.parentActionId;
    documents.push(
      buildToolConsumptionDocument({
        action,
        allocation,
        enabledSkillIds: input.enabledSkillIdsByActionId.get(action.sId) ?? [],
        input,
        item,
        parentAction: parentActionId
          ? actionById.get(parentActionId)
          : undefined,
        usage,
      })
    );
  }

  return documents;
}
