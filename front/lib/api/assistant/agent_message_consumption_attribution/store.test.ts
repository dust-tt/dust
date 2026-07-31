import { AGENT_MESSAGE_CONSUMPTION_ATTRIBUTION_VERSION } from "@app/lib/api/assistant/agent_message_consumption_attribution/attribution_builder";
import { computeAndStoreAgentMessageConsumptionAttribution } from "@app/lib/api/assistant/agent_message_consumption_attribution/store";
import { AgentMessageConsumptionItemResource } from "@app/lib/resources/agent_message_consumption_item_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { describe, expect, it } from "vitest";

const INPUT_TOKENS_COUNT = 100;
const OUTPUT_TOKENS_COUNT = 20;
const REASONING_TOKENS_COUNT = 5;

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
    conversationId: conversation.sId,
    agentMessageId: agentMessage.sId,
    agentMessageModelId: agentMessage.agentMessageId,
  };
}

describe("computeAndStoreAgentMessageConsumptionAttribution", () => {
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
