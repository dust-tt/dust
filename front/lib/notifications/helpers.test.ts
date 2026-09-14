import { Authenticator } from "@app/lib/auth";
import { AgentDataRetentionModel } from "@app/lib/models/agent/agent_data_retention";
import {
  AgentMessageModel,
  ConversationModel,
  MentionModel,
} from "@app/lib/models/agent/conversation";
import { getConversationDetails } from "@app/lib/notifications/helpers";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { frontSequelize } from "@app/lib/resources/storage";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
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
  // Sequelize validates FK exclusivity on update; raw SQL avoids that hook.
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

describe("getConversationDetails", () => {
  let workspace: WorkspaceType;
  let user: UserResource;
  let mentionedUser: UserResource;
  let auth: Authenticator;
  let agent: LightAgentConfigurationType;
  let conversation: ConversationType;

  beforeEach(async () => {
    const result = await createResourceTest({ role: "user" });
    workspace = result.workspace;
    user = result.user;
    auth = result.authenticator;

    mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "DetailsAgent",
      description: "Test agent",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    await ConversationModel.update(
      { title: "Quarterly plan &amp; budget" },
      { where: { id: conversation.id, workspaceId: workspace.id } }
    );
    conversation = { ...conversation, title: "Quarterly plan &amp; budget" };
  });

  it("returns details for a user message", async () => {
    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello team",
      origin: "web",
    });

    const result = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: messageRow.sId,
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }

    expect(result.value.subject).toBe("Quarterly plan & budget");
    expect(result.value.author).toBe(user.fullName());
    expect(result.value.authorIsAgent).toBe(false);
    expect(result.value.authorUserId).toBe(user.sId);
    expect(result.value.newMessageContent).toBe("Hello team");
    expect(result.value.workspaceName).toBe(workspace.name);
    expect(result.value.hasUnreadMessages).toBe(true);
    expect(result.value.isFromEmailAgentConversation).toBe(false);
    expect(result.value.isFromSlackAgentConversation).toBe(false);
    expect(result.value.isFromTrigger).toBe(false);
  });

  it("extracts approved mentions and unread mention flags for the subscriber", async () => {
    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hey @mentioned",
    });

    await MentionModel.create({
      messageId: messageRow.id,
      userId: mentionedUser.id,
      workspaceId: workspace.id,
      status: "approved",
    });

    // Use subscriberId (not auth) so hasUnreadMentions is evaluated for that user.
    const forAuthor = await getConversationDetails({
      subscriberId: user.sId,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: messageRow.sId,
      },
    });
    expect(forAuthor.isOk()).toBe(true);
    if (forAuthor.isOk()) {
      expect(forAuthor.value.mentionedUserIds).toEqual([mentionedUser.sId]);
      expect(forAuthor.value.hasUnreadMentions).toBe(false);
    }

    const forMentioned = await getConversationDetails({
      subscriberId: mentionedUser.sId,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: messageRow.sId,
      },
    });
    expect(forMentioned.isOk()).toBe(true);
    if (forMentioned.isOk()) {
      expect(forMentioned.value.mentionedUserIds).toEqual([mentionedUser.sId]);
      expect(forMentioned.value.hasUnreadMentions).toBe(true);
      expect(forMentioned.value.hasUnreadMessages).toBe(true);
    }
  });

  it("flags email and slack origins on user messages and agent replies", async () => {
    const { messageRow: emailUserMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "From email",
        origin: "email",
        rank: 0,
      });

    const emailDetails = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: emailUserMessage.sId,
      },
    });
    expect(emailDetails.isOk()).toBe(true);
    if (emailDetails.isOk()) {
      expect(emailDetails.value.isFromEmailAgentConversation).toBe(true);
      expect(emailDetails.value.isFromSlackAgentConversation).toBe(false);
    }

    const slackConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const { messageRow: slackUserMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: slackConversation,
        content: "From slack",
        origin: "slack",
        rank: 0,
      });
    const agentReply = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: slackConversation.id,
      rank: 1,
      agentConfigurationId: agent.sId,
      parentId: slackUserMessage.id,
    });
    await ConversationFactory.setAgentMessageStatus({
      workspace,
      agentMessageModelId: agentReply.agentMessageId!,
      status: "succeeded",
    });

    const agentDetails = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: slackConversation.sId,
        messageId: agentReply.sId,
      },
    });
    expect(agentDetails.isOk()).toBe(true);
    if (agentDetails.isOk()) {
      expect(agentDetails.value.authorIsAgent).toBe(true);
      expect(agentDetails.value.author).toBe("DetailsAgent");
      expect(agentDetails.value.isFromSlackAgentConversation).toBe(true);
      expect(agentDetails.value.isFromEmailAgentConversation).toBe(false);
    }
  });

  it("marks hasUnreadMessages when an agent completes after lastRead", async () => {
    const { messageRow: userMessage } =
      await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Please answer",
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

    const result = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: agentReply.sId,
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.hasUnreadMessages).toBe(true);
    }
  });

  it("reports no unread messages after the conversation was fully read", async () => {
    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Already seen",
    });

    await ConversationResource.markAsReadForAuthUser(auth, {
      conversation,
      lastReadAt: new Date(Date.now() + 60_000),
    });

    const result = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: messageRow.sId,
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.hasUnreadMessages).toBe(false);
      expect(result.value.hasUnreadMentions).toBe(false);
    }
  });

  it("resolves first visible message and project name for new project conversations", async () => {
    const space = await SpaceFactory.project(workspace, user.id);
    // Refresh auth so space membership is visible to conversation creation.
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const projectConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      spaceId: space.id,
    });
    await ConversationModel.update(
      { title: "Kickoff" },
      { where: { id: projectConversation.id, workspaceId: workspace.id } }
    );

    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation: projectConversation,
      content: "First visible message",
      origin: "web",
    });

    const result = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: projectConversation.sId,
        isNewProjectConversation: true,
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.isNewProjectConversation).toBe(true);
      expect(result.value.projectName).toBe(space.name);
      expect(result.value.newMessageContent).toBe("First visible message");
      expect(result.value.subject).toBe("Kickoff");
    }
  });

  it("returns conversation_not_found for a soft-deleted conversation", async () => {
    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Gone soon",
    });

    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(conversationResource).not.toBeNull();
    await conversationResource!.updateVisibilityToDeleted(auth);

    const result = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: messageRow.sId,
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("conversation_not_found");
    }
  });

  it("returns message_not_found for an unknown message id", async () => {
    const result = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: "msg_does_not_exist",
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("message_not_found");
    }
  });

  it("returns a placeholder when subscriberId is empty", async () => {
    const result = await getConversationDetails({
      subscriberId: "",
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: "msg_anything",
      },
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.subject).toBe("Deleted conversation");
      expect(result.value.hasUnreadMessages).toBe(false);
    }
  });

  it("detects conversation and agent retention policies", async () => {
    const { messageRow } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Retention check",
    });

    await WorkspaceResource.updateConversationsRetention(workspace.id, 30);

    const withConversationRetention = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: messageRow.sId,
      },
    });
    expect(withConversationRetention.isOk()).toBe(true);
    if (withConversationRetention.isOk()) {
      expect(
        withConversationRetention.value.hasConversationRetentionPolicy
      ).toBe(true);
    }

    await WorkspaceResource.updateConversationsRetention(workspace.id, -1);
    await AgentDataRetentionModel.create({
      workspaceId: workspace.id,
      agentConfigurationId: agent.sId,
      retentionDays: 14,
    });

    const agentReply = await ConversationFactory.createAgentMessageWithRank({
      workspace,
      conversationId: conversation.id,
      rank: 1,
      agentConfigurationId: agent.sId,
      parentId: messageRow.id,
    });

    const withAgentRetention = await getConversationDetails({
      auth,
      payload: {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        messageId: agentReply.sId,
      },
    });
    expect(withAgentRetention.isOk()).toBe(true);
    if (withAgentRetention.isOk()) {
      expect(withAgentRetention.value.hasConversationRetentionPolicy).toBe(
        false
      );
      expect(withAgentRetention.value.hasAgentRetentionPolicies).toBe(true);
    }
  });
});
