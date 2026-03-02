import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  createUserMentions,
  getMentionStatus,
  validateUserMention,
} from "@app/lib/api/assistant/conversation/mentions";
import { createUserMessage } from "@app/lib/api/assistant/conversation/messages";
import { getUserForWorkspace } from "@app/lib/api/user";
import { Authenticator } from "@app/lib/auth";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import {
  ConversationModel,
  ConversationParticipantModel,
  MentionModel,
  UserConversationReadsModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { GroupSpaceFactory } from "@app/tests/utils/GroupSpaceFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { TriggerFactory } from "@app/tests/utils/TriggerFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { AgentMention, MentionType } from "@app/types/assistant/mentions";
import { isRichUserMention } from "@app/types/assistant/mentions";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

describe("createAgentMessages", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    // Create workspace, user, spaces, and groups using the helper
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    // Create a conversation using the factory
    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  it("should store user mentions in the database", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${mentionedUser.username}`,
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
    ];

    const result = await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
    });

    // Verify return value is an array of RichMentionWithStatus
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    const mentionedUserJson = mentionedUser.toJSON();
    expect(result[0]).toMatchObject({
      id: mentionedUser.sId,
      type: "user",
      label: mentionedUserJson.fullName,
      pictureUrl:
        mentionedUserJson.image ?? "/static/humanavatar/anonymous.png",
      description: mentionedUserJson.email,
      status: "pending_conversation_access",
    });
    expect(isRichUserMention(result[0])).toBe(true);

    // Verify user mention was stored in the database
    const userMentionInDb = await MentionModel.findOne({
      where: {
        workspaceId: workspace.id,
        messageId: userMessage.id,
        userId: mentionedUser.id,
      },
    });
    expect(userMentionInDb).not.toBeNull();
    expect(userMentionInDb?.userId).toBe(mentionedUser.id);
    expect(userMentionInDb?.agentConfigurationId).toBeNull();

    // Verify the user is marked as a participant with "subscribed" action.
    const participant = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: mentionedUser.id,
      },
    });
    expect(participant).toBeNull();
  });

  it("should handle multiple user mentions", async () => {
    const user1 = auth.getNonNullableUser();
    const user2 = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user2, { role: "user" });

    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${user1.username} and @${user2.username}`,
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: user1.sId.toString(),
      },
      {
        type: "user",
        userId: user2.sId.toString(),
      },
    ];

    const result = await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
    });

    // Verify return value is an array of RichMentionWithStatus
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(2);
    const user1Mention = result.find((m) => m.id === user1.sId);
    const user2Mention = result.find((m) => m.id === user2.sId);
    expect(user1Mention).toBeDefined();
    expect(user2Mention).toBeDefined();
    const user1Json = user1.toJSON();
    const user2Json = user2.toJSON();
    expect(user1Mention).toMatchObject({
      id: user1.sId,
      type: "user",
      label: user1Json.fullName,
      status: "pending_conversation_access",
    });
    expect(user2Mention).toMatchObject({
      id: user2.sId,
      type: "user",
      label: user2Json.fullName,
      status: "pending_conversation_access",
    });
    expect(isRichUserMention(user1Mention!)).toBe(true);
    expect(isRichUserMention(user2Mention!)).toBe(true);

    // Verify both user mentions were stored
    const allMentionsInDb = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: userMessage.id,
      },
      order: [["userId", "ASC"]],
    });
    expect(allMentionsInDb).toHaveLength(2);
    expect(allMentionsInDb[0].userId).toBe(user1.id);
    expect(allMentionsInDb[1].userId).toBe(user2.id);
    // Both should have null agentConfigurationId
    expect(allMentionsInDb[0].agentConfigurationId).toBeNull();
    expect(allMentionsInDb[1].agentConfigurationId).toBeNull();

    // Verify the users are marked as participants with "subscribed" action.
    const participant1 = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: user1.id,
      },
    });
    expect(participant1).toBeNull();

    const participant2 = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: user2.id,
      },
    });
    expect(participant2).toBeNull();
  });

  it("should handle empty user mentions array", async () => {
    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: "Hello",
    });

    const mentions: MentionType[] = [];

    const result = await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
    });

    // Verify return value is an empty array
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(0);

    // Verify no mentions were stored
    const allMentionsInDb = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: userMessage.id,
      },
    });
    expect(allMentionsInDb).toHaveLength(0);

    // Verify no participants were created
    const participantsInDb = await ConversationParticipantModel.findAll({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
      },
    });
    expect(participantsInDb).toHaveLength(0);
  });

  it("should only process user mentions and ignore agent mentions", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${mentionedUser.username} and @agent`,
    });

    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
      {
        configurationId: "some-agent-id",
      } as AgentMention,
    ];

    const result = await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
    });

    // Verify return value only contains the user mention
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: mentionedUser.sId,
      type: "user",
      status: "pending_conversation_access",
    });
    expect(isRichUserMention(result[0])).toBe(true);

    // Verify only user mention was stored, agent mention should be ignored
    const allMentionsInDb = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: userMessage.id,
      },
    });
    expect(allMentionsInDb).toHaveLength(1);
    expect(allMentionsInDb[0].userId).toBe(mentionedUser.id);
    expect(allMentionsInDb[0].agentConfigurationId).toBeNull();
  });

  it("should deduplicate user mentions and create only unique mentions", async () => {
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    const { userMessage } = await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation,
      content: `Hello @${mentionedUser.username}`,
    });

    // Create duplicate mentions for the same user
    const mentions: MentionType[] = [
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
      {
        type: "user",
        userId: mentionedUser.sId.toString(),
      },
    ];

    const result = await createUserMentions(auth, {
      mentions,
      message: userMessage,
      conversation,
    });

    // Should only return one rich mention despite 3 duplicate mentions
    expect(result).toBeInstanceOf(Array);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: mentionedUser.sId,
      type: "user",
      status: "pending_conversation_access",
    });
    expect(isRichUserMention(result[0])).toBe(true);

    // Verify only one mention was stored in the database
    const allMentionsInDb = await MentionModel.findAll({
      where: {
        workspaceId: workspace.id,
        messageId: userMessage.id,
      },
    });
    expect(allMentionsInDb).toHaveLength(1);
    expect(allMentionsInDb[0].userId).toBe(mentionedUser.id);
    expect(allMentionsInDb[0].agentConfigurationId).toBeNull();
  });

  describe("auto-approval behavior", () => {
    it("should not auto approve mentions in user messages", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: userMessage,
        conversation,
      });

      // Verify return value
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention was auto-approved
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("pending_conversation_access");
    });

    it("should always auto approve mentions for existing participants", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Add user as participant first
      await ConversationResource.upsertParticipation(auth, {
        conversation,
        action: "subscribed",
        user: mentionedUser.toJSON(),
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation,
          agentConfig,
        }
      );

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation,
      });

      // Verify return value - auto-approved because user is already a participant
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "approved",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });

    it("should require approval for mentions in agent messages (non-triggered conversation)", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation,
          agentConfig,
        }
      );

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation,
      });

      // Verify return value - requires approval (pending status)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });

    it("should auto approve mentions in agent messages on triggered conversations if user is mentioned in instructions", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent config for the trigger
      const triggerAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Trigger Agent",
        });

      // Create a trigger
      const trigger = await TriggerFactory.webhook(auth, {
        name: "Test Trigger",
        agentConfigurationId: triggerAgentConfig.sId,
        status: "enabled",
        configuration: { includePayload: true },
      });

      // Create a conversation with triggerId
      const triggeredConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: triggerAgentConfig.sId,
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Update conversation to have a triggerId
      await ConversationModel.update(
        { triggerId: trigger.id },
        { where: { id: triggeredConversation.id } }
      );

      // Fetch updated conversation
      const updatedConversationResult = await getConversation(
        auth,
        triggeredConversation.sId
      );
      expect(updatedConversationResult.isOk()).toBe(true);
      if (!updatedConversationResult.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const updatedConversation = updatedConversationResult.value;
      expect(updatedConversation.triggerId).not.toBeNull();

      // Create agent config with instructions mentioning the user
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      // Update agent config to include user mention in instructions
      const instructionsWithMention = `Please notify :mention_user[${mentionedUser.username}]{sId=${mentionedUser.sId}} about this.`;
      await AgentConfigurationModel.update(
        { instructions: instructionsWithMention },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Fetch updated agent config
      const updatedAgentConfig = await getAgentConfiguration(auth, {
        agentId: agentConfig.sId,
        agentVersion: agentConfig.version,
        variant: "light",
      });
      expect(updatedAgentConfig).not.toBeNull();
      expect(updatedAgentConfig?.instructions).toContain(mentionedUser.sId);

      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation: updatedConversation,
          agentConfig: updatedAgentConfig!,
        }
      );

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation: updatedConversation,
      });

      // Verify return value - auto-approved because user is mentioned in instructions
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "approved",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });

    it("should require approval for mentions in agent messages on triggered conversations if user is NOT mentioned in instructions", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent config for the trigger
      const triggerAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Trigger Agent",
        });

      // Create a trigger
      const trigger = await TriggerFactory.webhook(auth, {
        name: "Test Trigger",
        agentConfigurationId: triggerAgentConfig.sId,
        status: "enabled",
        configuration: { includePayload: true },
      });

      // Create a conversation with triggerId
      const triggeredConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: triggerAgentConfig.sId,
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Update conversation to have a triggerId
      await ConversationModel.update(
        { triggerId: trigger.id },
        { where: { id: triggeredConversation.id } }
      );

      // Fetch updated conversation
      const updatedConversationResult = await getConversation(
        auth,
        triggeredConversation.sId
      );
      expect(updatedConversationResult.isOk()).toBe(true);
      if (!updatedConversationResult.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const updatedConversation = updatedConversationResult.value;
      expect(updatedConversation.triggerId).not.toBeNull();

      // Create agent config WITHOUT mentioning the user in instructions
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      // Ensure instructions don't mention the user
      await AgentConfigurationModel.update(
        { instructions: "Standard instructions without user mentions." },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Fetch updated agent config
      const updatedAgentConfig = await getAgentConfiguration(auth, {
        agentId: agentConfig.sId,
        agentVersion: agentConfig.version,
        variant: "light",
      });
      expect(updatedAgentConfig).not.toBeNull();
      expect(updatedAgentConfig?.instructions).not.toContain(mentionedUser.sId);

      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation: updatedConversation,
          agentConfig: updatedAgentConfig!,
        }
      );

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation: updatedConversation,
      });

      // Verify return value - requires approval because user is NOT mentioned in instructions
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });

    it("should require approval for mentions in agent messages on triggered conversations if instructions are null", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent config for the trigger
      const triggerAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Trigger Agent",
        });

      // Create a trigger
      const trigger = await TriggerFactory.webhook(auth, {
        name: "Test Trigger",
        agentConfigurationId: triggerAgentConfig.sId,
        status: "enabled",
        configuration: { includePayload: true },
      });

      // Create a conversation with triggerId
      const triggeredConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: triggerAgentConfig.sId,
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Update conversation to have a triggerId
      await ConversationModel.update(
        { triggerId: trigger.id },
        { where: { id: triggeredConversation.id } }
      );

      // Fetch updated conversation
      const updatedConversationResult = await getConversation(
        auth,
        triggeredConversation.sId
      );
      expect(updatedConversationResult.isOk()).toBe(true);
      if (!updatedConversationResult.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const updatedConversation = updatedConversationResult.value;
      expect(updatedConversation.triggerId).not.toBeNull();

      // Create agent config with null instructions
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      // Set instructions to null
      await AgentConfigurationModel.update(
        { instructions: null },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Fetch updated agent config
      const updatedAgentConfig = await getAgentConfiguration(auth, {
        agentId: agentConfig.sId,
        agentVersion: agentConfig.version,
        variant: "light",
      });
      expect(updatedAgentConfig).not.toBeNull();
      expect(updatedAgentConfig?.instructions).toBeNull();

      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation: updatedConversation,
          agentConfig: updatedAgentConfig!,
        }
      );

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation: updatedConversation,
      });

      // Verify return value - requires approval because instructions are null
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });
  });

  describe("users that cannot access the conversation", () => {
    it("should set status to user_restricted_by_conversation_access when user cannot access conversation", async () => {
      // Create a restricted space
      // SpaceFactory.regular creates a space with a regular group, which is restricted by default
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      // Refresh to get updated groups
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();
      // Regular spaces created by SpaceFactory.regular are restricted (no global group)
      expect(refreshedRestrictedSpace?.isOpen()).toBe(false);

      // Create a user who is NOT a member of the restricted space
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation with requestedSpaceIds that includes the restricted space
      const restrictedSpaceModelId = getResourceIdFromSId(
        refreshedRestrictedSpace!.sId
      );
      expect(restrictedSpaceModelId).not.toBeNull();

      const restrictedConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        requestedSpaceIds: [restrictedSpaceModelId!],
      });

      // Verify the mentioned user cannot access the conversation
      const canAccess = await ConversationResource.canAccess(
        await Authenticator.fromUserIdAndWorkspaceId(
          mentionedUser.sId,
          workspace.sId
        ),
        restrictedConversation.sId
      );
      expect(canAccess).toBe("conversation_access_restricted");

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: restrictedConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: userMessage,
        conversation: restrictedConversation,
      });

      // Verify return value shows restricted status
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "user_restricted_by_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention was stored with restricted status
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe(
        "user_restricted_by_conversation_access"
      );
    });

    it("should set status to approved when user can access conversation even if not a participant", async () => {
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      // Create an open space (regular space with global group)
      const openSpace = await SpaceFactory.regular(workspace);
      // Add global group to make it open
      const globalGroupRes =
        await GroupResource.fetchWorkspaceGlobalGroup(adminAuth);
      expect(globalGroupRes.isOk()).toBe(true);
      if (!globalGroupRes.isOk()) {
        throw new Error("Failed to fetch global group");
      }
      const globalGroup = globalGroupRes.value;

      // Add global group directly to make it open (if not already there)
      const existingGroupIds = openSpace.groups.map((g) => g.sId);
      const hasGlobalGroup = existingGroupIds.includes(globalGroup.sId);

      // If global group is not already there, associate it directly
      if (!hasGlobalGroup) {
        await GroupSpaceFactory.associate(openSpace, globalGroup);
      }

      // Refresh to get updated groups
      const refreshedOpenSpace = await SpaceResource.fetchById(
        adminAuth,
        openSpace.sId
      );
      expect(refreshedOpenSpace).not.toBeNull();
      expect(refreshedOpenSpace?.isOpen()).toBe(true);

      // Create a user who can access the space (all users can access open spaces)
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation with requestedSpaceIds that includes the open space
      const openSpaceModelId = getResourceIdFromSId(refreshedOpenSpace!.sId);
      expect(openSpaceModelId).not.toBeNull();

      const openConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        requestedSpaceIds: [openSpaceModelId!],
      });

      // Verify the mentioned user can access the conversation
      const canAccess = await ConversationResource.canAccess(
        await Authenticator.fromUserIdAndWorkspaceId(
          mentionedUser.sId,
          workspace.sId
        ),
        openConversation.sId
      );
      expect(canAccess).toBe("allowed");

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: openConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: userMessage,
        conversation: openConversation,
      });

      // Verify return value shows pending status (not restricted, but requires approval for user messages)
      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "pending_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);

      // Verify mention was stored with pending status (not restricted)
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("pending_conversation_access");
      expect(mentionInDb?.status).not.toBe(
        "user_restricted_by_conversation_access"
      );
    });

    it("should prioritize user_restricted_by_conversation_access over auto-approval", async () => {
      // Create a restricted space
      // SpaceFactory.regular creates a space with a regular group, which is restricted by default
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      // Refresh to get updated groups
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();
      // Regular spaces created by SpaceFactory.regular are restricted (no global group)
      expect(refreshedRestrictedSpace?.isOpen()).toBe(false);

      // Create a user who is NOT a member of the restricted space
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation with requestedSpaceIds that includes the restricted space
      const restrictedSpaceModelId = getResourceIdFromSId(
        refreshedRestrictedSpace!.sId
      );
      expect(restrictedSpaceModelId).not.toBeNull();

      const restrictedConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        requestedSpaceIds: [restrictedSpaceModelId!],
      });

      // Add user as participant first (which would normally auto-approve)
      await ConversationResource.upsertParticipation(auth, {
        conversation: restrictedConversation,
        action: "subscribed",
        user: mentionedUser.toJSON(),
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation: restrictedConversation,
          agentConfig,
        }
      );

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(auth, {
        mentions,
        message: agentMessage,
        conversation: restrictedConversation,
      });

      // Verify return value - restricted status takes priority over auto-approval
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "user_restricted_by_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });
  });

  describe("project space members", () => {
    it("should auto-approve mentions for users who are members of the project space", async () => {
      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Create a user who will be mentioned
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Add the mentioned user to the project space
      const addMembersRes = await projectSpace.addMembers(adminAuth, {
        userIds: [mentionedUser.sId],
      });
      expect(addMembersRes.isOk()).toBe(true);

      // Create a conversation in the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a fresh authenticator after adding user to space to refresh permissions
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const refreshedProjectSpace = await SpaceResource.fetchById(
        userAuth,
        projectSpace.sId
      );
      expect(refreshedProjectSpace).not.toBeNull();

      const projectConversation = await createConversation(userAuth, {
        title: "Project Conversation",
        visibility: "unlisted",
        spaceId: refreshedProjectSpace!.id,
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation: projectConversation,
          agentConfig,
        }
      );

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(userAuth, {
        mentions,
        message: agentMessage,
        conversation: projectConversation,
      });

      // Verify return value shows approved status (auto-approved for project space members)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "approved",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });

    it("should require approval for mentions of users who are NOT members of the project space", async () => {
      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Create a user who will be mentioned but is NOT a member of the project space
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation in the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a fresh authenticator after adding user to space to refresh permissions
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const refreshedProjectSpace = await SpaceResource.fetchById(
        userAuth,
        projectSpace.sId
      );
      expect(refreshedProjectSpace).not.toBeNull();

      const projectConversation = await createConversation(userAuth, {
        title: "Project Conversation",
        visibility: "unlisted",
        spaceId: refreshedProjectSpace!.id,
      });

      // Create an agent message
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        {
          name: "Test Agent",
        }
      );

      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation: projectConversation,
          agentConfig,
        }
      );

      const mentions: MentionType[] = [
        {
          type: "user",
          userId: mentionedUser.sId.toString(),
        },
      ];

      const result = await createUserMentions(userAuth, {
        mentions,
        message: agentMessage,
        conversation: projectConversation,
      });

      // Verify return value shows user_restricted_by_conversation_access status (requires approval for non-members)
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: mentionedUser.sId,
        type: "user",
        status: "user_restricted_by_conversation_access",
      });
      expect(isRichUserMention(result[0])).toBe(true);
    });
  });

  describe("getMentionStatus", () => {
    it("should return 'approved' for project conversations when mentioned user is project member", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Add both test user and mentioned user to the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId, mentionedUser.sId],
      });

      // Create a fresh authenticator after adding user to space
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const projectConversation = await ConversationFactory.create(userAuth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        spaceId: projectSpace.id,
      });

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: userAuth,
        workspace,
        conversation: projectConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentionedUserResource = await getUserForWorkspace(userAuth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // Since mentioned user is a project member, isParticipant doesn't matter
      const status = await getMentionStatus(userAuth, {
        conversation: projectConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("approved");
    });

    it("should return 'pending_project_membership' when user is mentioned by project editor", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a project with auth user as editor
      const projectSpace = await SpaceFactory.project(
        workspace,
        auth.getNonNullableUser().id
      );
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Add the test user to the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a fresh authenticator after adding user to space
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const projectConversation = await ConversationFactory.create(userAuth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        spaceId: projectSpace.id,
      });

      const mentionedUserResource = await getUserForWorkspace(userAuth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: userAuth,
        workspace,
        conversation: projectConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const status = await getMentionStatus(userAuth, {
        conversation: projectConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("pending_project_membership");
    });

    it("should return 'user_restricted_by_conversation_access' when user mentioned by non project editor", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const projectSpace = await SpaceFactory.project(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Add the original test user to the project space
      const user = auth.getNonNullableUser();
      await projectSpace.addMembers(adminAuth, {
        userIds: [user.sId],
      });

      // Create a different user who will have limited permissions
      const limitedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, limitedUser, {
        role: "user",
      });

      // Add limited user to project space but without admin rights
      await projectSpace.addMembers(adminAuth, {
        userIds: [limitedUser.sId],
      });

      const limitedAuth = await Authenticator.fromUserIdAndWorkspaceId(
        limitedUser.sId,
        workspace.sId
      );

      // Create conversation with the original user auth
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      const projectConversation = await ConversationFactory.create(userAuth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        spaceId: projectSpace.id,
      });

      const mentionedUserResource = await getUserForWorkspace(limitedAuth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: userAuth,
        workspace,
        conversation: projectConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const status = await getMentionStatus(limitedAuth, {
        conversation: projectConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("user_restricted_by_conversation_access");
    });

    it("should return 'approved' for regular conversations when user is participant", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const regularConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        // No spaceId for regular conversation
      });

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: regularConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentionedUserResource = await getUserForWorkspace(auth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // Test when user is a participant - should be approved
      const status = await getMentionStatus(auth, {
        conversation: regularConversation,
        message: userMessage,
        isParticipant: true,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("approved");
    });

    it("should return 'pending_conversation_access' for regular conversations when user can access but is not participant", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      const regularConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: regularConversation,
        content: `Hello @${mentionedUser.username}`,
      });

      const mentionedUserResource = await getUserForWorkspace(auth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      // User can access but is not participant and it's not a triggered conversation
      const status = await getMentionStatus(auth, {
        conversation: regularConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("pending_conversation_access");
    });

    it("should return 'user_restricted_by_conversation_access' for regular conversations when user cannot access", async () => {
      // Create a user who is a member of the workspace but has no access to the conversation
      const restrictedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, restrictedUser, {
        role: "user",
      });

      // Create a conversation in a restricted space
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const regularConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: "test-agent",
        messagesCreatedAt: [],
        visibility: "unlisted",
        requestedSpaceIds: [restrictedSpace.id],
      });

      const restrictedUserResource = await getUserForWorkspace(auth, {
        userId: restrictedUser.sId,
      });
      if (!restrictedUserResource) {
        throw new Error("User not found");
      }

      // Create a user message
      const { userMessage } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation: regularConversation,
        content: `Hello @${restrictedUser.username}`,
      });

      const status = await getMentionStatus(auth, {
        conversation: regularConversation,
        message: userMessage,
        isParticipant: false,
        mentionedUser: restrictedUserResource,
      });

      expect(status).toBe("user_restricted_by_conversation_access");
    });

    it("should return 'approved' for triggered conversations when user is mentioned in instructions", async () => {
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create an agent config for the trigger
      const triggerAgentConfig =
        await AgentConfigurationFactory.createTestAgent(auth, {
          name: "Trigger Agent",
        });

      // Create a trigger
      const trigger = await TriggerFactory.webhook(auth, {
        name: "Test Trigger",
        agentConfigurationId: triggerAgentConfig.sId,
        status: "enabled",
        configuration: { includePayload: true },
      });

      // Create a conversation
      const triggeredConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: triggerAgentConfig.sId,
        messagesCreatedAt: [],
        visibility: "unlisted",
      });

      // Update conversation to have a triggerId
      await ConversationModel.update(
        { triggerId: trigger.id },
        { where: { id: triggeredConversation.id } }
      );

      // Fetch updated conversation
      const updatedConversationResult = await getConversation(
        auth,
        triggeredConversation.sId
      );
      expect(updatedConversationResult.isOk()).toBe(true);
      if (!updatedConversationResult.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const updatedConversation = updatedConversationResult.value;

      // Update agent config to include user mention in instructions
      const instructionsWithMention = `Please help :mention_user[${mentionedUser.username}]{sId=${mentionedUser.sId}} with their request.`;
      await AgentConfigurationModel.update(
        {
          instructions: instructionsWithMention,
        },
        {
          where: {
            workspaceId: workspace.id,
            sId: triggerAgentConfig.sId,
          },
        }
      );

      // Fetch updated agent config
      const updatedAgentConfig = await getAgentConfiguration(auth, {
        agentId: triggerAgentConfig.sId,
        agentVersion: triggerAgentConfig.version,
        variant: "light",
      });
      expect(updatedAgentConfig).not.toBeNull();
      expect(updatedAgentConfig?.instructions).toContain(mentionedUser.sId);

      // Create an agent message
      const { agentMessage } = await ConversationFactory.createAgentMessage(
        auth,
        {
          workspace,
          conversation: updatedConversation,
          agentConfig: updatedAgentConfig!,
        }
      );

      const mentionedUserResource = await getUserForWorkspace(auth, {
        userId: mentionedUser.sId,
      });
      if (!mentionedUserResource) {
        throw new Error("User not found");
      }

      const status = await getMentionStatus(auth, {
        conversation: updatedConversation,
        message: agentMessage,
        isParticipant: false,
        mentionedUser: mentionedUserResource,
      });

      expect(status).toBe("approved");
    });
  });
});

describe("createUserMessage", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    workspace = setup.workspace;
    auth = setup.authenticator;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test agent",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      visibility: "unlisted",
    });
  });

  it("should add a participant with lastReadAt=null when approving a user mention", async () => {
    // Create a second user who will be mentioned
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    // Create a user message that mentions the second user
    const userJson = auth.getNonNullableUser().toJSON();
    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: `Hello @${mentionedUser.sId}`,
        metadata: {
          type: "create",
          user: userJson,
          rank: 0,
          context: {
            username: userJson.username,
            timezone: "UTC",
            fullName: userJson.fullName,
            email: userJson.email,
            profilePictureUrl: userJson.image,
            origin: "web",
          },
        },
        transaction,
      });
    });

    // Create the mention with status "pending_conversation_access"
    await MentionModel.create({
      messageId: userMessage.id,
      userId: mentionedUser.id,
      workspaceId: workspace.id,
      status: "pending_conversation_access",
    });

    // Verify the mentioned user is not a participant yet
    const isParticipantBefore =
      await ConversationResource.isConversationParticipant(auth, {
        conversation,
        user: mentionedUser.toJSON(),
      });
    expect(isParticipantBefore).toBe(false);

    // Approve the mention
    const result = await validateUserMention(auth, {
      conversationId: conversation.sId,
      userId: mentionedUser.sId,
      messageId: userMessage.sId,
      approvalState: "approved",
    });

    expect(result.isOk()).toBe(true);

    // Verify the mentioned user is now a participant with lastReadAt=null
    const participant = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: mentionedUser.id,
      },
    });
    const conversationRead = await UserConversationReadsModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: mentionedUser.id,
      },
    });

    expect(participant).not.toBeNull();
    expect(conversationRead?.lastReadAt).toBeUndefined();
    expect(participant?.action).toBe("subscribed");
  });

  it("should not add a participant when rejecting a user mention", async () => {
    // Create a second user who will be mentioned
    const mentionedUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, mentionedUser, {
      role: "user",
    });

    // Create a user message that mentions the second user
    const userJson = auth.getNonNullableUser().toJSON();
    const userMessage = await withTransaction(async (transaction) => {
      return createUserMessage(auth, {
        conversation,
        content: `Hello @${mentionedUser.sId}`,
        metadata: {
          type: "create",
          user: userJson,
          rank: 0,
          context: {
            username: userJson.username,
            timezone: "UTC",
            fullName: userJson.fullName,
            email: userJson.email,
            profilePictureUrl: userJson.image,
            origin: "web",
          },
        },
        transaction,
      });
    });

    // Create the mention with status "pending_conversation_access"
    await MentionModel.create({
      messageId: userMessage.id,
      userId: mentionedUser.id,
      workspaceId: workspace.id,
      status: "pending_conversation_access",
    });

    // Reject the mention
    const result = await validateUserMention(auth, {
      conversationId: conversation.sId,
      userId: mentionedUser.sId,
      messageId: userMessage.sId,
      approvalState: "rejected",
    });

    expect(result.isOk()).toBe(true);

    // Verify the mentioned user is NOT a participant
    const participant = await ConversationParticipantModel.findOne({
      where: {
        workspaceId: workspace.id,
        conversationId: conversation.id,
        userId: mentionedUser.id,
      },
    });

    expect(participant).toBeNull();
  });

  describe("project conversation approval", () => {
    it("should add user to project space AND as participant when approving in project conversation", async () => {
      // Create an admin user for this test (needs canAdministrate for addMembers)
      const adminUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, adminUser, {
        role: "admin",
      });

      // Create a project space
      const projectSpace = await SpaceFactory.project(workspace);
      const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );

      // Add the admin user to the project space (they need to be a member/editor)
      await projectSpace.addMembers(internalAdminAuth, {
        userIds: [adminUser.sId],
      });

      // Create a fresh authenticator after adding user to space
      const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );

      // Create a conversation in the project space
      const projectConversation = await createConversation(userAuth, {
        title: "Project Conversation",
        visibility: "unlisted",
        spaceId: projectSpace!.id,
      });

      // Create a user who will be mentioned but is NOT a member of the project space
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a user message that mentions the user
      const userJson = adminUser.toJSON();
      const userMessage = await withTransaction(async (transaction) => {
        return createUserMessage(userAuth, {
          conversation: projectConversation,
          content: `Hello @${mentionedUser.sId}`,
          metadata: {
            type: "create",
            user: userJson,
            rank: 0,
            context: {
              username: userJson.username,
              timezone: "UTC",
              fullName: userJson.fullName,
              email: userJson.email,
              profilePictureUrl: userJson.image,
              origin: "web",
            },
          },
          transaction,
        });
      });

      // Create the mention with status "pending_project_membership"
      await MentionModel.create({
        messageId: userMessage.id,
        userId: mentionedUser.id,
        workspaceId: workspace.id,
        status: "pending_project_membership",
      });

      const mentionedUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
        mentionedUser.sId,
        workspace.sId
      );

      // Verify the mentioned user is NOT a member of the project space before
      const isMemberBefore = projectSpace!.isMember(mentionedUserAuth);
      expect(isMemberBefore).toBe(false);

      // Approve the mention (userAuth has admin role and is a project member)
      // Since this is a project conversation, approval automatically adds user to project space
      const result = await validateUserMention(userAuth, {
        conversationId: projectConversation.sId,
        userId: mentionedUser.sId,
        messageId: userMessage.sId,
        approvalState: "approved",
      });

      expect(result.isOk()).toBe(true);

      // Verify the mentioned user is now a member of the project space
      // Need to refresh the authenticator to get the updated groups.
      await mentionedUserAuth.refresh();
      const isMemberAfter = projectSpace!.isMember(mentionedUserAuth);
      expect(isMemberAfter).toBe(true);

      // Verify the mentioned user is now a participant
      const participant = await ConversationParticipantModel.findOne({
        where: {
          workspaceId: workspace.id,
          conversationId: projectConversation.id,
          userId: mentionedUser.id,
        },
      });
      expect(participant).not.toBeNull();
      expect(participant?.action).toBe("subscribed");

      // Verify the mention status is updated to "approved"
      const mention = await MentionModel.findOne({
        where: {
          messageId: userMessage.id,
          userId: mentionedUser.id,
          workspaceId: workspace.id,
        },
      });
      expect(mention?.status).toBe("approved");
    });
  });
});
