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
import type {
  AgentMessageConsumptionItemResource,
  AgentMessageModelConsumptionItemResource,
} from "@app/lib/resources/agent_message_consumption_item_resource";
import type {
  AgentMessageConsumptionAnalyticsLlmData,
  AgentMessageConsumptionAnalyticsLlmGrossCreditMicro,
  AgentMessageConsumptionAnalyticsLlmTokens,
} from "@app/types/assistant/analytics";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";

function emptyTokens(): AgentMessageConsumptionAnalyticsLlmTokens {
  return {
    system: 0,
    input: 0,
    result_footprint: null,
    output: 0,
    reasoning: 0,
  };
}

function emptyGrossCredits(): AgentMessageConsumptionAnalyticsLlmGrossCreditMicro {
  return {
    system: 0,
    input: 0,
    result_footprint: null,
    output: 0,
    reasoning: 0,
    direct: 0,
    total: 0,
  };
}

// Match each model run to the step stored on its output content. If no content identifies the run,
// use its zero-based position in the message's run list.
function stepIndexByRunModelId({
  dustRunIds,
  runs,
  stepContents,
}: Pick<
  AgentMessageConsumptionAnalyticsInput,
  "dustRunIds" | "runs" | "stepContents"
>): Map<ModelId, number> {
  const fallbackStepByDustRunId = new Map(
    dustRunIds.map((dustRunId, index) => [dustRunId, index])
  );
  const contentStepByDustRunId = new Map<string, number>();
  for (const content of stepContents) {
    if (content.dustRunId === null) {
      continue;
    }

    const current = contentStepByDustRunId.get(content.dustRunId);
    if (current === undefined || content.step < current) {
      contentStepByDustRunId.set(content.dustRunId, content.step);
    }
  }

  return new Map(
    runs.map((run) => [
      run.id,
      contentStepByDustRunId.get(run.dustRunId) ??
        fallbackStepByDustRunId.get(run.dustRunId) ??
        0,
    ])
  );
}

function modelItemsByRunUsageModelId(
  items: AgentMessageConsumptionItemResource[]
): Map<ModelId, AgentMessageModelConsumptionItemResource[]> {
  const itemsByRunUsageModelId = new Map<
    ModelId,
    AgentMessageModelConsumptionItemResource[]
  >();

  for (const item of items) {
    if (!item.isModelItem()) {
      continue;
    }

    const usageItems = itemsByRunUsageModelId.get(item.runUsageId) ?? [];
    usageItems.push(item);
    itemsByRunUsageModelId.set(item.runUsageId, usageItems);
  }

  return itemsByRunUsageModelId;
}

function summarizeLlmConsumptionItems({
  allocation,
  items,
}: {
  allocation: MessageConsumptionAllocation<BilledRunUsage>;
  items: AgentMessageModelConsumptionItemResource[];
}): Pick<
  AgentMessageConsumptionAnalyticsLlmData,
  "credit_micro" | "gross_credit_micro" | "tokens"
> {
  const tokens = emptyTokens();
  const grossCreditMicro = emptyGrossCredits();

  for (const item of items) {
    const creditMicro = reconciledCreditMicroForItem(allocation, item);

    switch (item.itemType) {
      case "system":
        tokens.system += item.inputTokensCount ?? 0;
        grossCreditMicro.system += creditMicro;
        break;

      case "input":
        tokens.input = (tokens.input ?? 0) + (item.inputTokensCount ?? 0);
        grossCreditMicro.input = (grossCreditMicro.input ?? 0) + creditMicro;
        break;

      case "output":
      case "reasoning":
        tokens[item.itemType] += item.outputTokensCount ?? 0;
        grossCreditMicro[item.itemType] += creditMicro;
        break;

      default:
        assertNever(item.itemType);
    }
  }

  grossCreditMicro.total =
    grossCreditMicro.system +
    (grossCreditMicro.input ?? 0) +
    grossCreditMicro.output +
    grossCreditMicro.reasoning;

  return {
    credit_micro: grossCreditMicro.total,
    gross_credit_micro: grossCreditMicro,
    tokens,
  };
}

function buildLlmConsumptionDocument({
  allocation,
  input,
  items,
  stepIndex,
  usage,
}: {
  allocation: MessageConsumptionAllocation<BilledRunUsage>;
  input: AgentMessageConsumptionAnalyticsInput;
  items: AgentMessageModelConsumptionItemResource[];
  stepIndex: number;
  usage: BilledRunUsage;
}): AgentMessageConsumptionAnalyticsLlmData {
  return {
    ...makeBaseDocument(input, {
      attributionVersion: allocation.attributionVersion,
      consumptionKey: `run-usage:${usage.runUsageModelId}`,
      runUsageModelId: usage.runUsageModelId,
      stepIndex,
      usageType: usage.usageType,
    }),
    ...summarizeLlmConsumptionItems({ allocation, items }),
    consumption_type: "llm",
    // The agent message stores only aggregate model latency, which cannot be split across runs.
    // TODO(2026-08-07 flav): Persist execution duration on each run and index it here.
    execution_time_ms: null,
    model: modelForUsage(input.model, usage),
    status: input.messageStatus,
    tool: null,
  };
}

export function buildLlmConsumptionDocuments(
  input: AgentMessageConsumptionAnalyticsInput,
  allocation: MessageConsumptionAllocation<BilledRunUsage>
): AgentMessageConsumptionAnalyticsLlmData[] {
  const itemsByUsageModelId = modelItemsByRunUsageModelId(allocation.items);
  const stepByRunModelId = stepIndexByRunModelId(input);
  const documents: AgentMessageConsumptionAnalyticsLlmData[] = [];

  for (const usage of allocation.messageUsages) {
    documents.push(
      buildLlmConsumptionDocument({
        allocation,
        input,
        items: itemsByUsageModelId.get(usage.runUsageModelId) ?? [],
        stepIndex: stepByRunModelId.get(usage.runModelId) ?? 0,
        usage,
      })
    );
  }

  return documents;
}
