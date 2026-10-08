import { buildLatestMessageConsumptionAllocation } from "@app/lib/api/assistant/agent_message_consumption_attribution/allocation";
import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import type { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { RunUsageModel } from "@app/lib/resources/storage/models/runs";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import {
  GPT_5_MINI_TOKENS_PER_CREDIT,
  RunFactory,
} from "@app/tests/utils/RunFactory";
import type { ModelIdType } from "@app/types/assistant/models/types";
import { describe, expect, it } from "vitest";

type CallSpec = {
  promptTokens: number;
  cachedTokens?: number;
  completionTokens: number;
  reasoningTokens?: number;
  recordedCostMicroUsd?: number;
};

type ToolSpec = {
  emittedByCall: number;
  resultTokens: number;
  callOutputTokens: number;
  directCreditAmountMicro: number;
};

async function allocateMessage({
  billedCredits,
  calls,
  modelId,
  tools,
}: {
  billedCredits: number;
  calls: CallSpec[];
  modelId?: ModelIdType;
  tools: ToolSpec[];
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

  const createdRuns: Awaited<ReturnType<typeof RunFactory.createWithUsage>>[] =
    [];
  for (const call of calls) {
    const createdRun = await RunFactory.createWithUsage(auth, {
      inputTokens: call.promptTokens,
      cachedTokens: call.cachedTokens ?? 0,
      outputTokens: call.completionTokens,
      reasoningTokens: call.reasoningTokens ?? 0,
      modelId,
    });
    if (call.recordedCostMicroUsd !== undefined) {
      await RunUsageModel.update(
        { costMicroUsd: call.recordedCostMicroUsd },
        { where: { id: createdRun.runUsageModelId, workspaceId: workspace.id } }
      );
    }
    createdRuns.push(createdRun);
  }
  const runs = createdRuns.map(({ run }) => run);
  const dustRunIds = runs.map((run) => run.dustRunId);
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    runIds: dustRunIds,
  });

  const actions: AgentMCPActionResource[] = [];
  for (const tool of tools) {
    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId: agentMessage.agentMessageId,
      status: "succeeded",
      dustRunId: dustRunIds[tool.emittedByCall],
    });
    actions.push(action);
  }

  await AgentMessageConsumptionItemResource.recordItemsIdempotently(auth, {
    conversation,
    agentMessageModelId: agentMessage.agentMessageId,
    attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    records: [
      ...calls.flatMap((call, callIndex) => {
        const { runUsageModelId } = createdRuns[callIndex];
        const toolCallOutputTokens = tools
          .filter((tool) => tool.emittedByCall === callIndex)
          .reduce((total, tool) => total + tool.callOutputTokens, 0);
        return [
          {
            itemType: "input" as const,
            runUsageModelId,
            inputTokensCount: call.promptTokens,
            grossAttributedCreditAmountMicro: 1,
          },
          {
            itemType: "output" as const,
            runUsageModelId,
            outputTokensCount:
              call.completionTokens -
              (call.reasoningTokens ?? 0) -
              toolCallOutputTokens,
            grossAttributedCreditAmountMicro: 1,
          },
          {
            itemType: "reasoning" as const,
            runUsageModelId,
            outputTokensCount: call.reasoningTokens ?? 0,
            grossAttributedCreditAmountMicro: 1,
          },
        ];
      }),
      ...tools.map((tool, toolIndex) => ({
        itemType: "tool" as const,
        runUsageModelId: createdRuns[tool.emittedByCall].runUsageModelId,
        action: actions[toolIndex],
        attributedSkillIds: [],
        inputTokensCount: tool.resultTokens,
        outputTokensCount: tool.callOutputTokens,
        grossAttributedCreditAmountMicro: tool.directCreditAmountMicro + 1,
        directCreditAmountMicro: tool.directCreditAmountMicro,
      })),
    ],
    pendingToolItems: [],
  });
  const items =
    await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(auth, {
      agentMessageModelIds: [agentMessage.agentMessageId],
      maxAttributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
    });

  const result = buildLatestMessageConsumptionAllocation({
    actions,
    billedCredits,
    dustRunIds,
    hasUnbilledExecution: false,
    items,
    runs,
    usages: await RunResource.listRunUsagesForRuns(auth, { runs }),
  });
  const byItem = result.isOk()
    ? result.value.reconciledCreditAmounts.byItem
    : new Map<AgentMessageConsumptionItemResource, number>();
  const creditsOf = (item: AgentMessageConsumptionItemResource | undefined) =>
    ((item && byItem.get(item)) ?? 0) / 1_000_000;
  const usageModelIdOf = (callIndex: number) =>
    createdRuns[callIndex].runUsageModelId;

  return {
    failure: result.isErr() ? result.error.code : null,
    totalCredits:
      [...byItem.values()].reduce((total, amount) => total + amount, 0) /
      1_000_000,
    callItemCredits: (
      callIndex: number,
      itemType: "input" | "output" | "reasoning"
    ) =>
      creditsOf(
        items.find(
          (item) =>
            item.runUsageId === usageModelIdOf(callIndex) &&
            item.itemType === itemType
        )
      ),
    toolCredits: (toolIndex: number) =>
      creditsOf(
        items.find((item) => item.agentMCPActionId === actions[toolIndex].id)
      ),
  };
}

const {
  input: INPUT,
  cachedInput: CACHED_INPUT,
  output: OUTPUT,
} = GPT_5_MINI_TOKENS_PER_CREDIT;
const TOOL_DIRECT_CREDIT_AMOUNT_MICRO = 3_000_000;

describe("buildLatestMessageConsumptionAllocation", () => {
  it("charges each call its own cost when the bill equals the provider cost", async () => {
    const allocation = await allocateMessage({
      billedCredits: 5,
      calls: [
        { promptTokens: INPUT, completionTokens: OUTPUT },
        { promptTokens: 2 * INPUT, completionTokens: OUTPUT },
      ],
      tools: [],
    });

    expect(allocation.callItemCredits(0, "input")).toBeCloseTo(1, 5);
    expect(allocation.callItemCredits(0, "output")).toBeCloseTo(1, 5);
    expect(allocation.callItemCredits(1, "input")).toBeCloseTo(2, 5);
    expect(allocation.callItemCredits(1, "output")).toBeCloseTo(1, 5);
  });

  it("spreads the rounding up of the bill over every row in proportion to its cost", async () => {
    const allocation = await allocateMessage({
      billedCredits: 2,
      calls: [{ promptTokens: INPUT, completionTokens: (OUTPUT * 6) / 10 }],
      tools: [],
    });

    expect(allocation.callItemCredits(0, "input")).toBeCloseTo(
      1 * (2 / 1.6),
      5
    );
    expect(allocation.callItemCredits(0, "output")).toBeCloseTo(
      0.6 * (2 / 1.6),
      5
    );
  });

  it("gives a tool its direct credits and its call output, but no input when no call reads its result", async () => {
    const allocation = await allocateMessage({
      billedCredits: 5,
      calls: [{ promptTokens: INPUT, completionTokens: OUTPUT }],
      tools: [
        {
          emittedByCall: 0,
          resultTokens: INPUT,
          callOutputTokens: OUTPUT / 2,
          directCreditAmountMicro: TOOL_DIRECT_CREDIT_AMOUNT_MICRO,
        },
      ],
    });

    expect(allocation.callItemCredits(0, "input")).toBeCloseTo(1, 5);
    expect(allocation.callItemCredits(0, "output")).toBeCloseTo(0.5, 5);
    expect(allocation.toolCredits(0)).toBeCloseTo(3 + 0.5, 5);
  });

  it("prices a tool result read by an uncached call at the full input rate", async () => {
    const allocation = await allocateMessage({
      billedCredits: 9,
      calls: [
        { promptTokens: INPUT, completionTokens: OUTPUT },
        { promptTokens: 3 * INPUT, completionTokens: OUTPUT },
      ],
      tools: [
        {
          emittedByCall: 0,
          resultTokens: 2 * INPUT,
          callOutputTokens: OUTPUT / 2,
          directCreditAmountMicro: TOOL_DIRECT_CREDIT_AMOUNT_MICRO,
        },
      ],
    });

    expect(allocation.callItemCredits(0, "input")).toBeCloseTo(1, 5);
    expect(allocation.callItemCredits(0, "output")).toBeCloseTo(0.5, 5);
    expect(allocation.toolCredits(0)).toBeCloseTo(3 + 0.5 + 2, 5);
    expect(allocation.callItemCredits(1, "input")).toBeCloseTo(1, 5);
    expect(allocation.callItemCredits(1, "output")).toBeCloseTo(1, 5);
  });

  it("prices a tool result read from cache at the cached rate", async () => {
    const allocation = await allocateMessage({
      billedCredits: 8,
      calls: [
        { promptTokens: INPUT, completionTokens: OUTPUT },
        {
          promptTokens: 2 * CACHED_INPUT,
          cachedTokens: 2 * CACHED_INPUT,
          completionTokens: OUTPUT,
        },
      ],
      tools: [
        {
          emittedByCall: 0,
          resultTokens: CACHED_INPUT,
          callOutputTokens: OUTPUT / 2,
          directCreditAmountMicro: TOOL_DIRECT_CREDIT_AMOUNT_MICRO,
        },
      ],
    });

    expect(allocation.toolCredits(0)).toBeCloseTo(3 + 0.5 + 1, 5);
    expect(allocation.callItemCredits(1, "input")).toBeCloseTo(1, 5);
  });

  it("gives a call's uncached tokens to the tool results it read first", async () => {
    const allocation = await allocateMessage({
      billedCredits: 9,
      calls: [
        { promptTokens: INPUT, completionTokens: OUTPUT },
        {
          promptTokens: 2 * CACHED_INPUT,
          cachedTokens: 2 * CACHED_INPUT - INPUT,
          completionTokens: (OUTPUT * 11) / 10,
        },
      ],
      tools: [
        {
          emittedByCall: 0,
          resultTokens: CACHED_INPUT,
          callOutputTokens: OUTPUT / 2,
          directCreditAmountMicro: TOOL_DIRECT_CREDIT_AMOUNT_MICRO,
        },
      ],
    });

    expect(allocation.toolCredits(0)).toBeCloseTo(3 + 0.5 + 1 + 0.9, 5);
    expect(allocation.callItemCredits(1, "input")).toBeCloseTo(1, 5);
  });

  it.each([
    { description: "above", billedCredits: 6 },
    { description: "below", billedCredits: 4 },
    { description: "zero, as for a free origin", billedCredits: 0 },
  ])(
    "fails when the LLM bill is $description the billed cost of the calls",
    async ({ billedCredits }) => {
      const allocation = await allocateMessage({
        billedCredits,
        calls: [{ promptTokens: 3 * INPUT, completionTokens: 2 * OUTPUT }],
        tools: [],
      });

      expect(allocation.failure).toBe("llm_bill_mismatch");
    }
  );

  it("fails when tool direct credits exceed the bill", async () => {
    const allocation = await allocateMessage({
      billedCredits: 2,
      calls: [{ promptTokens: INPUT, completionTokens: OUTPUT }],
      tools: [
        {
          emittedByCall: 0,
          resultTokens: 0,
          callOutputTokens: OUTPUT / 2,
          directCreditAmountMicro: TOOL_DIRECT_CREDIT_AMOUNT_MICRO,
        },
      ],
    });

    expect(allocation.failure).toBe("direct_credits_exceed_bill");
  });

  it("fails when a call's output costs more than its recorded cost", async () => {
    const allocation = await allocateMessage({
      billedCredits: 1,
      calls: [
        {
          promptTokens: INPUT,
          completionTokens: 2 * OUTPUT,
          recordedCostMicroUsd: 8_500,
        },
      ],
      tools: [],
    });

    expect(allocation.failure).toBe("output_exceeds_recorded_cost");
  });

  it.each([
    {
      message: "sJNMafecDh",
      modelId: "gemini-3.8-flash",
      billedCredits: 11,
      calls: [
        { promptTokens: 15_181, completionTokens: 381, reasoningTokens: 311 },
        {
          promptTokens: 58_060,
          cachedTokens: 55_839,
          completionTokens: 4_442,
          reasoningTokens: 2_932,
        },
      ],
      tools: [
        { resultTokens: 16_859, callOutputTokens: 33 },
        { resultTokens: 22_636, callOutputTokens: 30 },
      ],
    },
    {
      message: "jo5n2QWY2Y",
      modelId: "gpt-5.2",
      billedCredits: 8,
      calls: [
        { promptTokens: 9_675, completionTokens: 139, reasoningTokens: 92 },
        {
          promptTokens: 41_570,
          cachedTokens: 41_472,
          completionTokens: 653,
          reasoningTokens: 109,
        },
      ],
      tools: [{ resultTokens: 31_740, callOutputTokens: 34 }],
    },
  ] as const)(
    "reconciles $message, whose retried call read its tool results from cache",
    async ({ billedCredits, calls, modelId, tools }) => {
      const allocation = await allocateMessage({
        billedCredits,
        calls: [...calls],
        modelId,
        tools: tools.map((tool) => ({
          ...tool,
          emittedByCall: 0,
          directCreditAmountMicro: TOOL_DIRECT_CREDIT_AMOUNT_MICRO,
        })),
      });

      expect(allocation.failure).toBeNull();
      expect(allocation.totalCredits).toBe(billedCredits);
    }
  );
});
