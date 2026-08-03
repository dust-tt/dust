import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { tokenCountForTexts } from "@app/lib/tokenization";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/provider_credentials", () => ({
  getLlmCredentials: vi.fn(),
}));

vi.mock("@app/lib/tokenization", () => ({
  tokenCountForTexts: vi.fn(),
}));

const INPUT_TOKENS_COUNT = 100;
const OUTPUT_TOKENS_COUNT = 20;
const REASONING_TOKENS_COUNT = 5;

// Every tokenized footprint counts as this many tokens, so tool-call output and result-input
// footprints are deterministic in the assertions below.
const TOKENS_PER_FOOTPRINT = 2;

async function setupSettledMessageWithUsage() {
  const { authenticator: auth, workspace } = await createResourceTest({});

  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: `Attribution ${generateRandomModelSId()}` }
  );
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const { run } = await RunFactory.createWithUsage(auth, {
    inputTokens: INPUT_TOKENS_COUNT,
    outputTokens: OUTPUT_TOKENS_COUNT,
    reasoningTokens: REASONING_TOKENS_COUNT,
  });
  // The default factory status is "created", which is a tracked status, so attribution runs.
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    runIds: [run.dustRunId],
  });

  return {
    auth,
    workspace,
    conversation,
    run,
    conversationId: conversation.sId,
    agentMessageId: agentMessage.sId,
    agentMessageModelId: agentMessage.agentMessageId,
  };
}

describe("computeAndStoreAgentMessageConsumptionAttribution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLlmCredentials).mockResolvedValue({} as never);
    vi.mocked(tokenCountForTexts).mockImplementation(
      async (texts) => new Ok(texts.map(() => TOKENS_PER_FOOTPRINT))
    );
  });

  it("writes one input, output and reasoning row per run usage", async () => {
    const { auth, conversationId, agentMessageId, agentMessageModelId } =
      await setupSettledMessageWithUsage();

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );

    const byType = new Map(items.map((item) => [item.itemType, item]));

    expect(byType.get("input")).toMatchObject({
      itemType: "input",
      inputTokensCount: INPUT_TOKENS_COUNT,
      outputTokensCount: null,
      completedAt: expect.any(Date),
    });
    // The output bucket is the completion tokens net of the reasoning subset.
    expect(byType.get("output")).toMatchObject({
      itemType: "output",
      inputTokensCount: null,
      outputTokensCount: OUTPUT_TOKENS_COUNT - REASONING_TOKENS_COUNT,
    });
    expect(byType.get("reasoning")).toMatchObject({
      itemType: "reasoning",
      inputTokensCount: null,
      outputTokensCount: REASONING_TOKENS_COUNT,
    });

    for (const item of items) {
      expect(item.grossAttributedCreditAmountMicro).toBeGreaterThan(0);
      expect(item.directCreditAmountMicro).toBeNull();
      expect(item.agentMCPActionId).toBeNull();
    }
  });

  it("is idempotent across repeated runs", async () => {
    const { auth, conversationId, agentMessageId, agentMessageModelId } =
      await setupSettledMessageWithUsage();

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });
    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );

    expect(items.map((item) => item.itemType).sort()).toEqual([
      "input",
      "output",
      "reasoning",
    ]);
  });

  it("writes a tool row per action and carves the tool output from the assistant output", async () => {
    const {
      auth,
      workspace,
      conversation,
      run,
      conversationId,
      agentMessageId,
      agentMessageModelId,
    } = await setupSettledMessageWithUsage();

    const { action } = await AgentMCPActionFactory.create(auth, {
      workspace,
      conversationModelId: conversation.id,
      agentMessageModelId,
      status: "succeeded",
      // Stamp the action's step content with the run that emitted it, which is how attribution ties
      // a tool call back to its run usage.
      dustRunId: run.dustRunId,
    });

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId,
      conversationId,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessageModelId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );

    const toolItem = items.find((item) => item.itemType === "tool");
    expect(toolItem).toMatchObject({
      itemType: "tool",
      agentMCPActionId: action.id,
      // The tool call emission and its result footprint each tokenize to TOKENS_PER_FOOTPRINT.
      outputTokensCount: TOKENS_PER_FOOTPRINT,
      inputTokensCount: TOKENS_PER_FOOTPRINT,
    });
    expect(toolItem?.grossAttributedCreditAmountMicro).toBeGreaterThan(0);
    expect(toolItem?.directCreditAmountMicro).toBeGreaterThanOrEqual(0);

    // The tokens the model spent emitting the tool call are carved out of the assistant output
    // bucket, so the two together still sum to the completion tokens net of reasoning.
    const outputItem = items.find((item) => item.itemType === "output");
    expect(
      (outputItem?.outputTokensCount ?? 0) + (toolItem?.outputTokensCount ?? 0)
    ).toBe(OUTPUT_TOKENS_COUNT - REASONING_TOKENS_COUNT);
  });

  it("writes nothing when the message has no runs", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({});

    const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
      auth,
      { name: `Attribution ${generateRandomModelSId()}` }
    );
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [],
    });
    const { agentMessage } = await ConversationFactory.createAgentMessage(
      auth,
      {
        workspace,
        conversation,
        agentConfig: agentConfiguration,
        runIds: null,
      }
    );

    await computeAndStoreAgentMessageConsumptionAttribution(auth, {
      agentMessageId: agentMessage.sId,
      conversationId: conversation.sId,
    });

    const items =
      await AgentMessageConsumptionItemResource.listByAgentMessageModelIds(
        auth,
        {
          agentMessageModelIds: [agentMessage.agentMessageId],
          attributionVersion: AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION,
        }
      );

    expect(items).toHaveLength(0);
  });
});
