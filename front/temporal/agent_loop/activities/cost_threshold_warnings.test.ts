import { recordAgentMessageTotal } from "@app/lib/api/assistant/consumption/counters";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { checkCostAndSubagentsThresholds } from "@app/temporal/agent_loop/activities/cost_threshold_warnings";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { describe, expect, it, vi } from "vitest";

vi.unmock("@app/lib/api/redis");

async function setupRootMessage() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const agentConfiguration = await AgentConfigurationFactory.createTestAgent(
    auth,
    { name: `Guardrail ${generateRandomModelSId()}` }
  );
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agentConfiguration.sId,
    messagesCreatedAt: [],
  });
  const { agentMessage } = await ConversationFactory.createAgentMessage(auth, {
    workspace,
    conversation,
    agentConfig: agentConfiguration,
    runIds: [],
  });

  return {
    auth,
    workspace,
    conversation,
    agentMessage,
    eventData: {
      agentMessageId: agentMessage.sId,
      conversationId: conversation.sId,
      step: 1,
    },
  };
}

describe("checkCostAndSubagentsThresholds", () => {
  it("reads the tree's spend from the root hash", async () => {
    const { auth, agentMessage, eventData } = await setupRootMessage();
    await recordAgentMessageTotal({
      workspaceId: auth.getNonNullableWorkspace().sId,
      rootAgentMessageId: agentMessage.agentMessageId,
      agentMessageId: agentMessage.agentMessageId,
      totalCreditAmountMicro: 1_000_000,
    });

    const result = await checkCostAndSubagentsThresholds({
      auth,
      isRootAgentMessage: true,
      useAgentMessageConsumption: true,
      eventData,
    });

    expect(result.totalCostMicroUsd).toBe(8_500);
    expect(result.hardCapExceeded).toBe(false);
    expect(result.subagentHardCapExceeded).toBe(false);
  });

  it("falls back to the legacy calculation when the root hash is missing", async () => {
    const { auth, agentMessage, eventData } = await setupRootMessage();
    const { run } = await RunFactory.createWithUsage(auth, {
      inputTokens: 2_000,
      outputTokens: 300,
    });
    await AgentMessageModel.update(
      { runIds: [run.dustRunId] },
      {
        where: {
          id: agentMessage.agentMessageId,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      }
    );

    const result = await checkCostAndSubagentsThresholds({
      auth,
      isRootAgentMessage: true,
      useAgentMessageConsumption: true,
      eventData,
    });

    expect(result.totalCostMicroUsd).toBeGreaterThan(0);
  });

  it("checks nothing for a sub-agent message", async () => {
    const { auth, eventData } = await setupRootMessage();

    expect(
      await checkCostAndSubagentsThresholds({
        auth,
        isRootAgentMessage: false,
        useAgentMessageConsumption: false,
        eventData,
      })
    ).toEqual({
      totalCostMicroUsd: 0,
      hardCapExceeded: false,
      subagentLaunchCount: 0,
      subagentHardCapExceeded: false,
    });
  });
});
