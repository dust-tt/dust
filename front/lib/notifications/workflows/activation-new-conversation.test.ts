import type { Authenticator } from "@app/lib/auth";
import { AgentMessageModel } from "@app/lib/models/agent/conversation";
import { shouldSkipActivationNewConversation } from "@app/lib/notifications/workflows/activation-new-conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

async function backdateMessageCreatedAt({
  messageId,
  workspaceId,
  createdAt,
}: {
  messageId: number;
  workspaceId: number;
  createdAt: Date;
}) {
  // biome-ignore lint/plugin/noRawSql: test helper backdating timestamps
  await frontSequelize.query(
    `UPDATE messages SET "createdAt" = :createdAt WHERE id = :id AND "workspaceId" = :workspaceId`,
    {
      replacements: {
        createdAt: createdAt.toISOString(),
        id: messageId,
        workspaceId,
      },
    }
  );
}

describe("shouldSkipActivationNewConversation", () => {
  let workspace: WorkspaceType;
  let user: UserResource;
  let auth: Authenticator;
  let agent: LightAgentConfigurationType;
  let conversation: ConversationType;

  beforeEach(async () => {
    const result = await createResourceTest({ role: "user" });
    workspace = result.workspace;
    user = result.user;
    auth = result.authenticator;

    agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "ActivationAgent",
      description: "Test",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
  });

  it("skips when subscriberId is missing", async () => {
    expect(
      await shouldSkipActivationNewConversation({
        subscriberId: null,
        payload: {
          workspaceId: workspace.sId,
          conversationId: conversation.sId,
        },
      })
    ).toBe(true);
  });

  it("skips when the workspace disables email and Slack notifications", async () => {
    await WorkspaceResource.updateMetadata(workspace.id, {
      allowConversationExternalNotifications: false,
    });

    expect(
      await shouldSkipActivationNewConversation({
        subscriberId: user.sId,
        payload: {
          workspaceId: workspace.sId,
          conversationId: conversation.sId,
        },
      })
    ).toBe(true);
  });

  it("skips when the conversation does not exist", async () => {
    expect(
      await shouldSkipActivationNewConversation({
        subscriberId: user.sId,
        payload: {
          workspaceId: workspace.sId,
          conversationId: "conv_missing",
        },
      })
    ).toBe(true);
  });

  it("skips when there is no succeeded agent reply", async () => {
    const { messageRow: userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello",
        rank: 0,
      });

    await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 1,
      agentConfigurationId: agent.sId,
      parentId: userMessage.id,
    });

    expect(
      await shouldSkipActivationNewConversation({
        subscriberId: user.sId,
        payload: {
          workspaceId: workspace.sId,
          conversationId: conversation.sId,
        },
      })
    ).toBe(true);
  });

  it("does not skip when there is an unread succeeded agent reply", async () => {
    const { messageRow: userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello",
        rank: 0,
      });

    const agentReply = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 1,
      agentConfigurationId: agent.sId,
      parentId: userMessage.id,
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: agentReply.agentMessageId!,
      status: "succeeded",
    });

    expect(
      await shouldSkipActivationNewConversation({
        subscriberId: user.sId,
        payload: {
          workspaceId: workspace.sId,
          conversationId: conversation.sId,
        },
      })
    ).toBe(false);
  });

  it("skips when the succeeded agent reply was already read", async () => {
    const { messageRow: userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello",
        rank: 0,
      });

    const agentReply = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 1,
      agentConfigurationId: agent.sId,
      parentId: userMessage.id,
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: agentReply.agentMessageId!,
      status: "succeeded",
    });

    await ConversationResource.markAsReadForAuthUser(auth, {
      conversation,
      lastReadAt: new Date(Date.now() + 60_000),
    });

    expect(
      await shouldSkipActivationNewConversation({
        subscriberId: user.sId,
        payload: {
          workspaceId: workspace.sId,
          conversationId: conversation.sId,
        },
      })
    ).toBe(true);
  });

  it("does not skip when an agent completes after lastRead", async () => {
    const { messageRow: userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Hello",
        rank: 0,
      });

    const agentReply = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 1,
      agentConfigurationId: agent.sId,
      parentId: userMessage.id,
    });

    const createdAt = new Date("2024-01-01T00:00:00.000Z");
    const lastReadAt = new Date("2024-01-02T00:00:00.000Z");
    const completedAt = new Date("2024-01-03T00:00:00.000Z");

    await backdateMessageCreatedAt({
      messageId: agentReply.id,
      workspaceId: workspace.id,
      createdAt,
    });
    await AgentMessageModel.update(
      { status: "succeeded", completedAt },
      {
        where: {
          id: agentReply.agentMessageId!,
          workspaceId: workspace.id,
        },
      }
    );

    await ConversationResource.markAsReadForAuthUser(auth, {
      conversation,
      lastReadAt,
    });

    expect(
      await shouldSkipActivationNewConversation({
        subscriberId: user.sId,
        payload: {
          workspaceId: workspace.sId,
          conversationId: conversation.sId,
        },
      })
    ).toBe(false);
  });
});
