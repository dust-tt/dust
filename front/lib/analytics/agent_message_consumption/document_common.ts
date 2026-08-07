import type {
  BilledRunUsage,
  ConsumptionAnalyticsMessageMetadata,
} from "@app/lib/analytics/agent_message_consumption/load";
import type { MessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import type { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import type { RunUsageWithRunKeyType } from "@app/lib/resources/run_resource";
import type {
  AgentMessageAnalyticsModel,
  AgentMessageConsumptionAnalyticsData,
  AgentMessageConsumptionAnalyticsUsageType,
} from "@app/types/assistant/analytics";
import type { ModelId } from "@app/types/shared/model_id";
import assert from "assert";

type AgentMessageConsumptionAnalyticsBaseDocument = Pick<
  AgentMessageConsumptionAnalyticsData,
  | "agent"
  | "agent_message_id"
  | "api_key_name"
  | "attribution_version"
  | "completed_at"
  | "consumption_key"
  | "consumption_type"
  | "context_origin"
  | "conversation_id"
  | "message_version"
  | "run_usage_id"
  | "space_id"
  | "step_index"
  | "trigger_id"
  | "usage_type"
  | "user"
  | "workspace_id"
>;

export function modelForUsage(
  model: AgentMessageAnalyticsModel | null,
  usage: RunUsageWithRunKeyType
): AgentMessageAnalyticsModel | null {
  if (!model) {
    return null;
  }

  return {
    ...model,
    provider_id: usage.providerId,
    model_id: usage.modelId,
  };
}

export function makeBaseDocument(
  metadata: ConsumptionAnalyticsMessageMetadata,
  {
    attributionVersion,
    consumptionKey,
    consumptionType,
    runUsageModelId,
    stepIndex,
    usageType,
  }: {
    attributionVersion: number;
    consumptionKey: string;
    consumptionType: AgentMessageConsumptionAnalyticsData["consumption_type"];
    runUsageModelId: ModelId;
    stepIndex: number;
    usageType: AgentMessageConsumptionAnalyticsUsageType;
  }
): AgentMessageConsumptionAnalyticsBaseDocument {
  return {
    agent: metadata.agent,
    agent_message_id: metadata.agentMessageId,
    api_key_name: metadata.apiKeyName,
    attribution_version: attributionVersion,
    completed_at: metadata.completedAt.toISOString(),
    consumption_key: consumptionKey,
    consumption_type: consumptionType,
    context_origin: metadata.contextOrigin,
    conversation_id: metadata.conversationId,
    message_version: metadata.messageVersion.toString(),
    run_usage_id: runUsageModelId.toString(),
    space_id: metadata.spaceId,
    step_index: stepIndex,
    trigger_id: metadata.triggerId,
    usage_type: usageType,
    user: metadata.user,
    workspace_id: metadata.workspaceId,
  };
}

export function reconciledCreditMicroForItem(
  allocation: MessageConsumptionAllocation<BilledRunUsage>,
  item: AgentMessageConsumptionItemResource
): number {
  const creditMicro = allocation.reconciledCreditAmounts.byItem.get(item);
  assert(
    creditMicro !== undefined,
    "Consumption item is missing its reconciled credit amount"
  );
  return creditMicro;
}
