import { loadAgentMessageConsumptionAnalyticsInput } from "@app/lib/analytics/agent_message_consumption/load";
import type { Authenticator } from "@app/lib/auth";
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
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { RunFactory } from "@app/tests/utils/RunFactory";
import { GPT_5_MINI_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import type { WorkspaceType } from "@app/types/user";
import { describe, expect, it } from "vitest";

async function createAgenticMessage({
  auth,
  workspace,
  depth,
  agenticOriginMessageId,
  authorless = false,
  agentName,
}: {
  auth: Authenticator;
  workspace: WorkspaceType;
  depth: number;
  agenticOriginMessageId?: string;
  authorless?: boolean;
  agentName?: string;
}) {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    name: agentName,
  });
  const conversationType = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
    depth,
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
      agenticMessageType: agenticOriginMessageId ? "run_agent" : undefined,
      agenticOriginMessageId,
      authorless,
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
  const agentMessageModelId = agentMessage.agentMessageId;
  if (!agentMessageModelId) {
    throw new Error("Agent message was not created");
  }

  return { agent, agentMessage, agentMessageModelId, conversation };
}

async function appendHandoverMessage({
  auth,
  workspace,
  conversation,
  rank,
  agenticOriginMessageId,
  agentName,
}: {
  auth: Authenticator;
  workspace: WorkspaceType;
  conversation: ConversationResource;
  rank: number;
  agenticOriginMessageId: string;
  agentName: string;
}) {
  const agent = await AgentConfigurationFactory.createTestAgent(auth, {
    name: agentName,
  });
  const { messageRow: userMessage } =
    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      rank,
      content: "Continue with another agent",
      agenticMessageType: "agent_handover",
      agenticOriginMessageId,
    });
  const agentMessage = await ConversationFactory.createAgentMessageWithRank({
    workspace,
    conversationId: conversation.id,
    rank: rank + 1,
    parentId: userMessage.id,
    agentConfigurationId: agent.sId,
    agentConfigurationVersion: agent.version,
  });

  return { agent, agentMessage };
}

async function setupSettledMessage({
  authorless = false,
  completedAt = new Date("2026-08-05T12:00:00.000Z"),
  depth = 0,
  agenticOriginMessageId,
  agentName,
  testContext,
  usageType = USAGE_TYPE_USER,
}: {
  authorless?: boolean;
  completedAt?: Date;
  depth?: number;
  agenticOriginMessageId?: string;
  agentName?: string;
  testContext?: { authenticator: Authenticator; workspace: WorkspaceType };
  usageType?: UsageType | null;
} = {}) {
  const { authenticator: auth, workspace } =
    testContext ??
    (await createResourceTest({
      role: "admin",
    }));
  const { agent, agentMessage, agentMessageModelId, conversation } =
    await createAgenticMessage({
      auth,
      workspace,
      depth,
      agenticOriginMessageId,
      authorless,
      agentName,
    });
  const { run } = await RunFactory.createWithUsage(auth, {
    inputTokens: 100,
    outputTokens: 20,
    modelId: GPT_5_MINI_MODEL_CONFIG.modelId,
  });
  await AgentMessageModel.update(
    {
      completedAt,
      costCredits: 5,
      runIds: [run.dustRunId],
      status: "succeeded",
    },
    {
      where: {
        id: agentMessageModelId,
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
      user: {
        id: context.auth.getNonNullableUser().sId,
        group_ids: [],
      },
      workspaceId: context.workspace.sId,
    });
  });

  it("loads the user's consumption groups at message completion", async () => {
    const testContext = await createResourceTest({ role: "admin" });
    const group = await GroupFactory.regularManual(
      testContext.workspace,
      "Analytics group"
    );
    await GroupFactory.withMembers(testContext.authenticator, group, [
      testContext.authenticator.getNonNullableUser(),
    ]);
    const context = await setupSettledMessage({
      completedAt: new Date(),
      testContext,
    });

    const input = await loadAgentMessageConsumptionAnalyticsInput(
      context.auth,
      { agentMessageId: context.agentMessage.sId }
    );

    expect(input?.user).toEqual({
      id: testContext.authenticator.getNonNullableUser().sId,
      group_ids: [group.sId],
    });
  });

  it("lists the full agent chain from the root to the direct parent", async () => {
    const testContext = await createResourceTest({ role: "admin" });
    const root = await createAgenticMessage({
      auth: testContext.authenticator,
      workspace: testContext.workspace,
      depth: 0,
      agentName: "Root agent",
    });
    const firstHandover = await appendHandoverMessage({
      auth: testContext.authenticator,
      workspace: testContext.workspace,
      conversation: root.conversation,
      rank: 2,
      agenticOriginMessageId: root.agentMessage.sId,
      agentName: "First handover agent",
    });
    const secondHandover = await appendHandoverMessage({
      auth: testContext.authenticator,
      workspace: testContext.workspace,
      conversation: root.conversation,
      rank: 4,
      agenticOriginMessageId: firstHandover.agentMessage.sId,
      agentName: "Second handover agent",
    });
    const thirdHandover = await appendHandoverMessage({
      auth: testContext.authenticator,
      workspace: testContext.workspace,
      conversation: root.conversation,
      rank: 6,
      agenticOriginMessageId: secondHandover.agentMessage.sId,
      agentName: "Third handover agent",
    });
    const directParent = await appendHandoverMessage({
      auth: testContext.authenticator,
      workspace: testContext.workspace,
      conversation: root.conversation,
      rank: 8,
      agenticOriginMessageId: thirdHandover.agentMessage.sId,
      agentName: "Direct parent agent",
    });
    const child = await setupSettledMessage({
      testContext,
      depth: 1,
      agenticOriginMessageId: directParent.agentMessage.sId,
      agentName: "Child agent",
    });

    const input = await loadAgentMessageConsumptionAnalyticsInput(child.auth, {
      agentMessageId: child.agentMessage.sId,
    });

    expect(input?.agent).toMatchObject({
      parent_ids: [
        root.agent.sId,
        firstHandover.agent.sId,
        secondHandover.agent.sId,
        thirdHandover.agent.sId,
        directParent.agent.sId,
      ],
      direct_parent_id: directParent.agent.sId,
      root_id: root.agent.sId,
      depth: 1,
    });
  });

  it("preserves the agent chain when the parent conversation was deleted", async () => {
    const testContext = await createResourceTest({ role: "admin" });
    const parent = await createAgenticMessage({
      auth: testContext.authenticator,
      workspace: testContext.workspace,
      depth: 0,
      agentName: "Deleted parent agent",
    });
    const child = await setupSettledMessage({
      testContext,
      depth: 1,
      agenticOriginMessageId: parent.agentMessage.sId,
      agentName: "Child agent",
    });
    await parent.conversation.updateVisibilityToDeleted(
      testContext.authenticator
    );

    const input = await loadAgentMessageConsumptionAnalyticsInput(child.auth, {
      agentMessageId: child.agentMessage.sId,
    });

    expect(input?.agent).toMatchObject({
      parent_ids: [parent.agent.sId],
      direct_parent_id: parent.agent.sId,
      root_id: parent.agent.sId,
      depth: 1,
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

  it("loads billed consumption when the conversation was deleted", async () => {
    const context = await setupSettledMessage();
    await context.conversation.updateVisibilityToDeleted(context.auth);

    const input = await loadAgentMessageConsumptionAnalyticsInput(
      context.auth,
      { agentMessageId: context.agentMessage.sId }
    );

    expect(input).toMatchObject({
      billedCredits: 5,
      conversationId: context.conversation.sId,
    });
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
