import { loadAgentMessageConsumptionAnalyticsInput } from "@app/lib/analytics/agent_message_consumption/load";
import {
  USAGE_TYPE_FREE,
  USAGE_TYPE_PROGRAMMATIC,
  USAGE_TYPE_USER,
} from "@app/lib/metronome/constants";
import type { UsageType } from "@app/lib/metronome/types";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { RunResource } from "@app/lib/resources/run_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { describe, expect, it } from "vitest";

async function setupSettledMessage({
  authorless = false,
  usageType = USAGE_TYPE_USER,
}: {
  authorless?: boolean;
  usageType?: UsageType | null;
} = {}) {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const conversationType = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
  });
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationType.sId
  );
  if (!conversation) {
    throw new Error("Conversation was not created");
  }

  const { messageRow: userMessage } =
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      rank: 0,
      content: "Hello",
      authorless,
    });
  const { run } = await RunFactory.createWithUsage(auth, {
    inputTokens: 100,
    outputTokens: 20,
    modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
  });
  const agentMessage = await ConversationFactory.createAgentMessageWithRank({
    workspace,
    conversationId: conversation.id,
    rank: 1,
    parentId: userMessage.id,
    agentConfigurationId: agent.sId,
    agentConfigurationVersion: agent.version,
    resolvedModel: {
      providerId: GPT_5_MINI_MODEL_CONFIG.providerId,
      modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
      reasoningEffort: "none",
    },
    modelResolutionMethod: "agent",
  });
  if (!agentMessage.agentMessageId) {
    throw new Error("Agent message was not created");
  }

  const completedAt = new Date("2026-08-05T12:00:00.000Z");
  await AgentMessageModel.update(
    {
      completedAt,
      costCredits: 5,
      runIds: [run.dustRunId],
      status: "succeeded",
    },
    {
      where: {
        id: agentMessage.agentMessageId,
        workspaceId: workspace.id,
      },
    }
  );
  if (usageType !== null) {
    await RunResource.setUsageTypeForRuns(auth, {
      runs: [run],
      usageType,
    });
  }

  return {
    agent,
    agentMessage,
    auth,
    completedAt,
    conversation,
    run,
    workspace,
  };
}

describe("loadAgentMessageConsumptionAnalyticsInput", () => {
  it("loads the authoritative inputs for billed user usage", async () => {
    const context = await setupSettledMessage();

    const input = await loadAgentMessageConsumptionAnalyticsInput(
      context.auth,
      { agentMessageId: context.agentMessage.sId }
    );

    expect(input).toMatchObject({
      agent: {
        id: context.agent.sId,
        version: context.agent.version.toString(),
        parent_ids: [],
        direct_parent_id: null,
        root_id: context.agent.sId,
        depth: 0,
      },
      agentMessageId: context.agentMessage.sId,
      billedCredits: 5,
      completedAt: context.completedAt,
      conversationId: context.conversation.sId,
      usages: [
        {
          runModelId: context.run.id,
          usageType: USAGE_TYPE_USER,
        },
      ],
      user: { id: context.auth.getNonNullableUser().sId },
      workspaceId: context.workspace.sId,
    });
  });

  it("includes usage explicitly classified as programmatic", async () => {
    const context = await setupSettledMessage({
      usageType: USAGE_TYPE_PROGRAMMATIC,
    });

    const input = await loadAgentMessageConsumptionAnalyticsInput(
      context.auth,
      { agentMessageId: context.agentMessage.sId }
    );

    expect(input?.usages).toEqual([
      expect.objectContaining({ usageType: USAGE_TYPE_PROGRAMMATIC }),
    ]);
  });

  it("keeps the user null when the triggering message is authorless", async () => {
    const context = await setupSettledMessage({ authorless: true });

    const input = await loadAgentMessageConsumptionAnalyticsInput(
      context.auth,
      { agentMessageId: context.agentMessage.sId }
    );

    expect(input?.user).toBeNull();
  });

  it("returns null when every usage is explicitly free", async () => {
    const context = await setupSettledMessage({ usageType: USAGE_TYPE_FREE });

    const input = await loadAgentMessageConsumptionAnalyticsInput(
      context.auth,
      { agentMessageId: context.agentMessage.sId }
    );

    expect(input).toBeNull();
  });

  it("fails when usage has not been classified for billing", async () => {
    const context = await setupSettledMessage({ usageType: null });

    await expect(
      loadAgentMessageConsumptionAnalyticsInput(context.auth, {
        agentMessageId: context.agentMessage.sId,
      })
    ).rejects.toThrow("Run usage billing classification is incomplete");
  });

  it("fails when billed usage has no authoritative message cost", async () => {
    const context = await setupSettledMessage();
    await ConversationResource.updateAgentMessageCostCredits(context.auth, {
      agentMessageModelId: context.agentMessage.agentMessageId!,
      costCredits: null,
    });

    await expect(
      loadAgentMessageConsumptionAnalyticsInput(context.auth, {
        agentMessageId: context.agentMessage.sId,
      })
    ).rejects.toThrow("Billed agent message is missing costCredits");
  });

  it("returns null while the message can still resume", async () => {
    const context = await setupSettledMessage();
    await AgentMessageModel.update(
      { status: "created" },
      {
        where: {
          id: context.agentMessage.agentMessageId!,
          workspaceId: context.workspace.id,
        },
      }
    );

    const input = await loadAgentMessageConsumptionAnalyticsInput(
      context.auth,
      { agentMessageId: context.agentMessage.sId }
    );

    expect(input).toBeNull();
  });
});
