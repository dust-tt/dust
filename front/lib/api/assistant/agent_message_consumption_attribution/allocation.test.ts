import { buildLatestMessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import {
  AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
  buildToolResultInputCreditAmountMicro,
} from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import type { ModelId } from "@app/types/shared/model_id";
import { describe, expect, it } from "vitest";

const MODEL_GROSS_CREDITS_MICRO = 100_000;
const TOOL_CALL_OUTPUT_CREDITS_MICRO = 20_000;
const TOOL_DIRECT_CREDITS_MICRO = 3_000_000;
const TOOL_RESULT_INPUT_TOKENS = 100_000;
const PRODUCING_PROMPT_TOKENS = 1_000;
const PRODUCING_COMPLETION_TOKENS = 20;
const WARMED_CACHED_TOKENS = PRODUCING_PROMPT_TOKENS + TOOL_RESULT_INPUT_TOKENS;

function modelRecords(runUsageModelId: ModelId) {
  return (["input", "output", "reasoning"] as const).map((itemType) =>
    itemType === "input"
      ? {
          itemType,
          runUsageModelId,
          inputTokensCount: 100,
          grossAttributedCreditAmountMicro: MODEL_GROSS_CREDITS_MICRO,
        }
      : {
          itemType,
          runUsageModelId,
          outputTokensCount: 10,
          grossAttributedCreditAmountMicro: MODEL_GROSS_CREDITS_MICRO,
        }
  );
}

async function setupToolResultConsumedBySecondCall({
  consumingCachedTokens,
}: {
  consumingCachedTokens: number;
}) {
  const { authenticator: auth, workspace } = await createResourceTest({});
  const agentConfiguration =
    await AgentConfigurationFactory.createTestAgent(auth);
  const createdConversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const conversation = await ConversationResource.fetchById(
    auth,
    createdConversation.sId
  );
  if (!conversation) {
    throw new Error("Just-created conversation not found.");
  }
  const { run: producingRun, runUsageModelId: producingUsageModelId } =
    await RunFactory.createWithUsage(auth, {
      inputTokens: PRODUCING_PROMPT_TOKENS,
      outputTokens: PRODUCING_COMPLETION_TOKENS,
      reasoningTokens: 5,
    });
  const { run: consumingRun, runUsageModelId: consumingUsageModelId } =
    await RunFactory.createWithUsage(auth, {
      inputTokens:
        PRODUCING_PROMPT_TOKENS +
        PRODUCING_COMPLETION_TOKENS +
        TOOL_RESULT_INPUT_TOKENS +
        100,
      cachedTokens: consumingCachedTokens,
      reasoningTokens: 5,
    });
  const dustRunIds = [producingRun.dustRunId, consumingRun.dustRunId];
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    runIds: dustRunIds,
  });
  const { action } = await AgentMCPActionFactory.create(auth, {
    workspace,
    conversationModelId: conversation.id,
    agentMessageModelId: agentMessage.agentMessageId,
    status: "succeeded",
    dustRunId: producingRun.dustRunId,
  });

  const runs = [producingRun, consumingRun];
  const usages = await RunResource.listRunUsagesForRuns(auth, { runs });
  const producingUsage = usages.find(
    (usage) => usage.runUsageModelId === producingUsageModelId
  );
  if (!producingUsage) {
    throw new Error("Producing usage not found.");
  }
  const toolResultInputCreditsMicro = buildToolResultInputCreditAmountMicro({
    usage: producingUsage,
    inputTokensCount: TOOL_RESULT_INPUT_TOKENS,
  });
  const toolGrossCreditsMicro =
    TOOL_DIRECT_CREDITS_MICRO +
    TOOL_CALL_OUTPUT_CREDITS_MICRO +
    toolResultInputCreditsMicro;

  await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
    conversation,
    agentMessageModelId: agentMessage.agentMessageId,
    attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    records: [
      ...modelRecords(producingUsageModelId),
      ...modelRecords(consumingUsageModelId),
      {
        itemType: "tool",
        runUsageModelId: producingUsageModelId,
        action,
        attributedSkillIds: [],
        inputTokensCount: TOOL_RESULT_INPUT_TOKENS,
        outputTokensCount: 5,
        grossAttributedCreditAmountMicro: toolGrossCreditsMicro,
        directCreditAmountMicro: TOOL_DIRECT_CREDITS_MICRO,
      },
    ],
    pendingToolItems: [],
  });
  const items =
    await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [agentMessage.agentMessageId],
      maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    });

  const protectedWithoutToolInputMicro =
    TOOL_DIRECT_CREDITS_MICRO +
    TOOL_CALL_OUTPUT_CREDITS_MICRO +
    4 * MODEL_GROSS_CREDITS_MICRO;
  const billedCredits = Math.ceil(
    (protectedWithoutToolInputMicro + toolResultInputCreditsMicro / 2) /
      1_000_000
  );

  return {
    actions: [action],
    billedCredits,
    consumingRun,
    dustRunIds,
    items,
    producingRun,
    protectedWithoutToolInputMicro,
    runs,
    toolGrossCreditsMicro,
    toolResultInputCreditsMicro,
    usages,
  };
}

describe("buildLatestMessageConsumptionAllocation", () => {
  it("reconciles the result input of a tool consumed by a retried call with a warmed cache", async () => {
    const setup = await setupToolResultConsumedBySecondCall({
      consumingCachedTokens: WARMED_CACHED_TOKENS,
    });
    expect(setup.toolResultInputCreditsMicro).toBeGreaterThan(2_000_000);

    const result = buildLatestMessageConsumptionAllocation({
      actions: setup.actions,
      attemptedRunIds: [
        setup.producingRun.dustRunId,
        "llm_trace_lost_attempt",
        setup.consumingRun.dustRunId,
      ],
      billedCredits: setup.billedCredits,
      dustRunIds: setup.dustRunIds,
      hasUnbilledExecution: false,
      items: setup.items,
      runs: setup.runs,
      usages: setup.usages,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    const { byItem } = result.value.reconciledCreditAmounts;
    const reconciledCreditsMicro = [...byItem.values()].reduce(
      (total, amount) => total + amount,
      0
    );
    expect(reconciledCreditsMicro).toBe(setup.billedCredits * 1_000_000);

    const toolItem = setup.items.find((item) => item.itemType === "tool");
    const toolReconciledMicro = toolItem ? byItem.get(toolItem) : undefined;
    expect(toolReconciledMicro).toBeGreaterThanOrEqual(
      TOOL_DIRECT_CREDITS_MICRO + TOOL_CALL_OUTPUT_CREDITS_MICRO
    );
    expect(toolReconciledMicro).toBeLessThan(setup.toolGrossCreditsMicro);
    for (const item of setup.items) {
      if (item.itemType === "output" || item.itemType === "reasoning") {
        expect(byItem.get(item)).toBe(item.grossAttributedCreditAmountMicro);
      }
    }
  });

  it.each([
    {
      description: "no attempts were recorded",
      lostAttempt: null,
      consumingCachedTokens: WARMED_CACHED_TOKENS,
    },
    {
      description: "no attempt was lost",
      lostAttempt: "none",
      consumingCachedTokens: WARMED_CACHED_TOKENS,
    },
    {
      description: "only the first call was retried",
      lostAttempt: "before_first_call",
      consumingCachedTokens: WARMED_CACHED_TOKENS,
    },
    {
      description: "the lost attempt did not warm the cache",
      lostAttempt: "before_second_call",
      consumingCachedTokens: PRODUCING_PROMPT_TOKENS,
    },
  ] as const)(
    "keeps the tool result input protected when $description",
    async ({ lostAttempt, consumingCachedTokens }) => {
      const setup = await setupToolResultConsumedBySecondCall({
        consumingCachedTokens,
      });
      const attemptedRunIds =
        lostAttempt === null
          ? null
          : [
              ...(lostAttempt === "before_first_call"
                ? ["llm_trace_lost_attempt"]
                : []),
              setup.producingRun.dustRunId,
              ...(lostAttempt === "before_second_call"
                ? ["llm_trace_lost_attempt"]
                : []),
              setup.consumingRun.dustRunId,
            ];

      const result = buildLatestMessageConsumptionAllocation({
        actions: setup.actions,
        attemptedRunIds,
        billedCredits: setup.billedCredits,
        dustRunIds: setup.dustRunIds,
        hasUnbilledExecution: false,
        items: setup.items,
        runs: setup.runs,
        usages: setup.usages,
      });

      expect(result.isErr() && result.error.code).toBe("reconciliation_failed");
    }
  );
});
