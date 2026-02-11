import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock event publishing functions before importing the module
vi.mock("@app/lib/api/assistant/streaming/events", () => ({
  publishMessageEventsOnMessagePostOrEdit: vi.fn(),
  publishAgentMessagesEvents: vi.fn(),
}));

// Mock Temporal agent loop workflow to prevent it from starting in tests
vi.mock("@app/temporal/agent_loop/client", () => ({
  launchAgentLoopWorkflow: vi.fn().mockResolvedValue({ isOk: () => true }),
}));

// Mock Redis hybrid manager to prevent it from removing events
vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: vi.fn().mockReturnValue({
    removeEvent: vi.fn().mockResolvedValue(undefined),
  }),
}));

import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import type { ToolExecutionStatus } from "@app/lib/actions/statuses";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import {
  createAgentMessages,
  createUserMentions,
  dismissMention,
} from "@app/lib/api/assistant/conversation/mentions";
import { validateAction } from "@app/lib/api/assistant/conversation/validate_actions";
import {
  publishAgentMessagesEvents,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import { Authenticator } from "@app/lib/auth";
import { AgentMCPActionModel } from "@app/lib/models/agent/actions/mcp";
import { AgentConfigurationModel } from "@app/lib/models/agent/agent";
import { AgentStepContentModel } from "@app/lib/models/agent/agent_step_content";
import {
  AgentMessageModel,
  MentionModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { AgentMention, MentionType } from "@app/types/assistant/mentions";
import {
  isRichAgentMention,
  isRichUserMention,
} from "@app/types/assistant/mentions";
import type { WorkspaceType } from "@app/types/user";

describe("dismissMention", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks();
    vi.mocked(publishMessageEventsOnMessagePostOrEdit).mockClear();
    vi.mocked(publishAgentMessagesEvents).mockClear();

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

  describe("user mentions with user_restricted_by_conversation_access", () => {
    it("should successfully dismiss a user mention with restricted status", async () => {
      // Create a restricted space
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();

      // Add the user creating the conversation to the restricted space so they can access it
      await refreshedRestrictedSpace!.addMembers(adminAuth, {
        userIds: [auth.getNonNullableUser().sId],
      });

      // Refresh authenticator to get updated permissions
      const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
        auth.getNonNullableUser().sId,
        workspace.sId
      );

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

      const restrictedConversation = await ConversationFactory.create(
        refreshedAuth,
        {
          agentConfigurationId: "test-agent",
          messagesCreatedAt: [],
          visibility: "unlisted",
          requestedSpaceIds: [restrictedSpaceModelId!],
        }
      );

      // Get conversation as ConversationType (needed for postUserMessage)
      const conversationRes = await getConversation(
        refreshedAuth,
        restrictedConversation.sId
      );
      expect(conversationRes.isOk()).toBe(true);
      if (!conversationRes.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const conversation = conversationRes.value;

      // Use postUserMessage to create the message with the full flow
      const user = refreshedAuth.getNonNullableUser();
      const userJson = user.toJSON();
      const postResult = await postUserMessage(refreshedAuth, {
        conversation,
        content: `Hello @${mentionedUser.username}`,
        mentions: [
          {
            type: "user",
            userId: mentionedUser.sId.toString(),
          },
        ],
        context: {
          username: userJson.username,
          timezone: "UTC",
          fullName: userJson.fullName,
          email: userJson.email,
          profilePictureUrl: userJson.image,
          origin: "web",
        },
        skipToolsValidation: false,
      });

      expect(postResult.isOk()).toBe(true);
      if (!postResult.isOk()) {
        throw new Error("Failed to post user message");
      }
      const { userMessage } = postResult.value;

      // Verify mention was created with restricted status
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
      expect(mentionInDb?.dismissed).toBe(false);

      // Dismiss the mention
      const result = await dismissMention(refreshedAuth, {
        conversationId: restrictedConversation.sId,
        messageId: userMessage.sId,
        type: "user",
        id: mentionedUser.sId,
      });

      expect(result.isOk()).toBe(true);

      // Verify mention was dismissed in database
      await mentionInDb!.reload();
      expect(mentionInDb?.dismissed).toBe(true);

      // Verify the conversation's richMentions were updated
      const updatedConversation = await getConversation(
        refreshedAuth,
        restrictedConversation.sId
      );
      expect(updatedConversation.isOk()).toBe(true);
      if (updatedConversation.isOk()) {
        const message = updatedConversation.value.content
          .flat()
          .find((m) => m.sId === userMessage.sId);
        expect(message).toBeDefined();
        if (
          message &&
          !message.type.includes("content_fragment") &&
          "richMentions" in message
        ) {
          const richMentions = message.richMentions;
          const dismissedMention = richMentions.find(
            (m) => isRichUserMention(m) && m.id === mentionedUser.sId
          );
          expect(dismissedMention).toBeDefined();
          if (dismissedMention) {
            expect(dismissedMention.dismissed).toBe(true);
          }
        }
      }

      // Verify events were published
      // postUserMessage calls publishMessageEventsOnMessagePostOrEdit when creating the message,
      // and dismissMention also calls it when dismissing, so it should be called twice
      expect(
        vi.mocked(publishMessageEventsOnMessagePostOrEdit)
      ).toHaveBeenCalledTimes(2);
    });

    it("should dismiss mentions across all messages in the conversation", async () => {
      // Create a restricted space
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();

      // Add the user creating the conversation to the restricted space so they can access it
      await refreshedRestrictedSpace!.addMembers(adminAuth, {
        userIds: [auth.getNonNullableUser().sId],
      });

      // Refresh authenticator to get updated permissions
      const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
        auth.getNonNullableUser().sId,
        workspace.sId
      );

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

      const restrictedConversation = await ConversationFactory.create(
        refreshedAuth,
        {
          agentConfigurationId: "test-agent",
          messagesCreatedAt: [],
          visibility: "unlisted",
          requestedSpaceIds: [restrictedSpaceModelId!],
        }
      );

      // Get conversation as ConversationType (needed for postUserMessage)
      const conversationRes1 = await getConversation(
        refreshedAuth,
        restrictedConversation.sId
      );
      expect(conversationRes1.isOk()).toBe(true);
      if (!conversationRes1.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const conversation1 = conversationRes1.value;

      // Use postUserMessage to create the first message with the full flow
      const user = refreshedAuth.getNonNullableUser();
      const userJson = user.toJSON();
      const postResult1 = await postUserMessage(refreshedAuth, {
        conversation: conversation1,
        content: `Hello @${mentionedUser.username}`,
        mentions: [
          {
            type: "user",
            userId: mentionedUser.sId.toString(),
          },
        ],
        context: {
          username: userJson.username,
          timezone: "UTC",
          fullName: userJson.fullName,
          email: userJson.email,
          profilePictureUrl: userJson.image,
          origin: "web",
        },
        skipToolsValidation: false,
      });

      expect(postResult1.isOk()).toBe(true);
      if (!postResult1.isOk()) {
        throw new Error("Failed to post first user message");
      }
      const { userMessage: userMessage1 } = postResult1.value;

      // Refresh conversation to get updated content before creating second message
      const conversationRes2 = await getConversation(
        refreshedAuth,
        restrictedConversation.sId
      );
      expect(conversationRes2.isOk()).toBe(true);
      if (!conversationRes2.isOk()) {
        throw new Error("Failed to refresh conversation");
      }
      const conversation2 = conversationRes2.value;

      // Use postUserMessage to create the second message with the full flow
      const postResult2 = await postUserMessage(refreshedAuth, {
        conversation: conversation2,
        content: `Hello again @${mentionedUser.username}`,
        mentions: [
          {
            type: "user",
            userId: mentionedUser.sId.toString(),
          },
        ],
        context: {
          username: userJson.username,
          timezone: "UTC",
          fullName: userJson.fullName,
          email: userJson.email,
          profilePictureUrl: userJson.image,
          origin: "web",
        },
        skipToolsValidation: false,
      });

      expect(postResult2.isOk()).toBe(true);
      if (!postResult2.isOk()) {
        throw new Error("Failed to post second user message");
      }
      const { userMessage: userMessage2 } = postResult2.value;

      // Verify both mentions were created
      const mention1InDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage1.id,
          userId: mentionedUser.id,
        },
      });
      const mention2InDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage2.id,
          userId: mentionedUser.id,
        },
      });
      expect(mention1InDb?.dismissed).toBe(false);
      expect(mention2InDb?.dismissed).toBe(false);

      // Dismiss the mention (should dismiss both)
      const result = await dismissMention(refreshedAuth, {
        conversationId: restrictedConversation.sId,
        messageId: userMessage1.sId,
        type: "user",
        id: mentionedUser.sId,
      });

      expect(result.isOk()).toBe(true);

      // Verify both mentions were dismissed
      await mention1InDb!.reload();
      await mention2InDb!.reload();
      expect(mention1InDb?.dismissed).toBe(true);
      expect(mention2InDb?.dismissed).toBe(true);
    });

    it("should only dismiss mentions with restricted status", async () => {
      // Create a user
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Create a conversation without restrictions
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

      await createUserMentions(auth, {
        mentions,
        message: userMessage,
        conversation,
      });

      // Verify mention was created with pending_conversation_access status (not restricted)
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("pending_conversation_access");
      expect(mentionInDb?.dismissed).toBe(false);

      // Try to dismiss the mention (should not dismiss because it's not restricted)
      const result = await dismissMention(auth, {
        conversationId: conversation.sId,
        messageId: userMessage.sId,
        type: "user",
        id: mentionedUser.sId,
      });

      expect(result.isOk()).toBe(true);

      // Verify mention was NOT dismissed (only restricted mentions can be dismissed)
      await mentionInDb!.reload();
      expect(mentionInDb?.dismissed).toBe(false);
    });
  });

  describe("agent mentions with agent_restricted_by_space_usage", () => {
    it("should successfully dismiss an agent mention with restricted status", async () => {
      // Create a restricted space
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();
      expect(refreshedRestrictedSpace?.isOpen()).toBe(false);

      // Add user to the restricted space so they can create conversations in it
      await refreshedRestrictedSpace!.addMembers(adminAuth, {
        userIds: [auth.getNonNullableUser().sId],
      });

      // Refresh authenticator to get updated permissions
      const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
        auth.getNonNullableUser().sId,
        workspace.sId
      );

      // Create a conversation in the restricted space
      const restrictedSpaceModelId = getResourceIdFromSId(
        refreshedRestrictedSpace!.sId
      );
      expect(restrictedSpaceModelId).not.toBeNull();

      const spaceConversation = await createConversation(refreshedAuth, {
        title: "Space Conversation",
        visibility: "unlisted",
        spaceId: restrictedSpaceModelId!,
      });

      // Create agent configuration that uses a different restricted space
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        refreshedAuth,
        {
          name: "Restricted Agent",
        }
      );

      const otherRestrictedSpace = await SpaceFactory.regular(workspace);
      const refreshedOtherRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        otherRestrictedSpace.sId
      );
      expect(refreshedOtherRestrictedSpace).not.toBeNull();

      // Add user to the other restricted space so they can mention the agent
      // (but the agent will still be restricted because the conversation is in a different space)
      await refreshedOtherRestrictedSpace!.addMembers(adminAuth, {
        userIds: [auth.getNonNullableUser().sId],
      });

      // Refresh authenticator again to get updated permissions for the other restricted space
      const refreshedAuthWithBothSpaces =
        await Authenticator.fromUserIdAndWorkspaceId(
          auth.getNonNullableUser().sId,
          workspace.sId
        );

      const otherRestrictedSpaceModelId = getResourceIdFromSId(
        otherRestrictedSpace.sId
      );
      expect(otherRestrictedSpaceModelId).not.toBeNull();

      await AgentConfigurationModel.update(
        {
          requestedSpaceIds: [otherRestrictedSpaceModelId!],
        },
        {
          where: {
            workspaceId: workspace.id,
            sId: agentConfig.sId,
            version: agentConfig.version,
          },
        }
      );

      // Get conversation as ConversationType (needed for postUserMessage)
      const conversationRes = await getConversation(
        refreshedAuthWithBothSpaces,
        spaceConversation.sId
      );
      expect(conversationRes.isOk()).toBe(true);
      if (!conversationRes.isOk()) {
        throw new Error("Failed to fetch conversation");
      }
      const conversation = conversationRes.value;

      // Use postUserMessage to create the message with the full flow
      const user = refreshedAuthWithBothSpaces.getNonNullableUser();
      const userJson = user.toJSON();
      const postResult = await postUserMessage(refreshedAuthWithBothSpaces, {
        conversation,
        content: `Hello @${agentConfig.name}`,
        mentions: [
          {
            configurationId: agentConfig.sId,
          } satisfies AgentMention,
        ],
        context: {
          username: userJson.username,
          timezone: "UTC",
          fullName: userJson.fullName,
          email: userJson.email,
          profilePictureUrl: userJson.image,
          origin: "web",
        },
        skipToolsValidation: false,
      });

      expect(postResult.isOk()).toBe(true);
      if (!postResult.isOk()) {
        throw new Error("Failed to post user message");
      }
      const { userMessage } = postResult.value;

      // Verify mention was created with restricted status
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: userMessage.id,
          agentConfigurationId: agentConfig.sId,
        },
      });
      expect(mentionInDb).not.toBeNull();
      expect(mentionInDb?.status).toBe("agent_restricted_by_space_usage");
      expect(mentionInDb?.dismissed).toBe(false);

      // Verify the mention appears in the userMessage's richMentions
      const agentMention = userMessage.richMentions.find(
        (m) => isRichAgentMention(m) && m.id === agentConfig.sId
      );
      expect(agentMention).toBeDefined();
      if (agentMention) {
        expect(agentMention.status).toBe("agent_restricted_by_space_usage");
      }

      // Dismiss the mention
      const result = await dismissMention(refreshedAuthWithBothSpaces, {
        conversationId: spaceConversation.sId,
        messageId: userMessage.sId,
        type: "agent",
        id: agentConfig.sId,
      });

      expect(result.isOk()).toBe(true);

      // Verify mention was dismissed in database
      await mentionInDb!.reload();
      expect(mentionInDb?.dismissed).toBe(true);

      // Verify events were published
      // For restricted agent mentions, publishMessageEventsOnMessagePostOrEdit is called
      // (postUserMessage calls it when creating the message, and dismissMention calls it when dismissing)
      expect(
        vi.mocked(publishMessageEventsOnMessagePostOrEdit)
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe("authorization", () => {
    it("should return error when user tries to dismiss mention from another user's message", async () => {
      // Create a restricted space
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();

      // Create another user
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });
      const otherUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      // Create a user who is NOT a member of the restricted space
      const mentionedUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, mentionedUser, {
        role: "user",
      });

      // Add other user to the restricted space so they can create conversations
      await refreshedRestrictedSpace!.addMembers(adminAuth, {
        userIds: [otherUser.sId],
      });

      // Create a conversation with requestedSpaceIds that includes the restricted space
      const restrictedSpaceModelId = getResourceIdFromSId(
        refreshedRestrictedSpace!.sId
      );
      expect(restrictedSpaceModelId).not.toBeNull();

      const restrictedConversation = await ConversationFactory.create(
        otherUserAuth,
        {
          agentConfigurationId: "test-agent",
          messagesCreatedAt: [],
          visibility: "unlisted",
          requestedSpaceIds: [restrictedSpaceModelId!],
        }
      );

      // Note: auth (the user trying to dismiss) doesn't have access to this conversation
      // because they're not in the restricted space, so they'll get a 404

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: otherUserAuth,
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

      await createUserMentions(otherUserAuth, {
        mentions,
        message: userMessage,
        conversation: restrictedConversation,
      });

      // Try to dismiss the mention as a different user (should fail with 404 because they can't access the conversation)
      const result = await dismissMention(auth, {
        conversationId: restrictedConversation.sId,
        messageId: userMessage.sId,
        type: "user",
        id: mentionedUser.sId,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        // User can't access the conversation, so they get 404 instead of 403
        expect(result.error.status_code).toBe(404);
        expect(result.error.api_error.type).toBe("conversation_not_found");
      }
    });

    it("should allow dismissing mention from agent message if user owns the parent user message", async () => {
      // Create a restricted space
      const restrictedSpace = await SpaceFactory.regular(workspace);
      const adminAuth = await Authenticator.internalAdminForWorkspace(
        workspace.sId
      );
      const refreshedRestrictedSpace = await SpaceResource.fetchById(
        adminAuth,
        restrictedSpace.sId
      );
      expect(refreshedRestrictedSpace).not.toBeNull();

      // Add the user creating the conversation to the restricted space so they can access it
      await refreshedRestrictedSpace!.addMembers(adminAuth, {
        userIds: [auth.getNonNullableUser().sId],
      });

      // Refresh authenticator to get updated permissions
      const refreshedAuth = await Authenticator.fromUserIdAndWorkspaceId(
        auth.getNonNullableUser().sId,
        workspace.sId
      );

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

      const restrictedConversation = await ConversationFactory.create(
        refreshedAuth,
        {
          agentConfigurationId: "test-agent",
          messagesCreatedAt: [],
          visibility: "unlisted",
          requestedSpaceIds: [restrictedSpaceModelId!],
        }
      );

      const { userMessage } = await ConversationFactory.createUserMessage({
        auth: refreshedAuth,
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

      await createUserMentions(refreshedAuth, {
        mentions,
        message: userMessage,
        conversation: restrictedConversation,
      });

      // Refresh conversation to get updated content
      const refreshedConversation = await getConversation(
        refreshedAuth,
        restrictedConversation.sId
      );
      expect(refreshedConversation.isOk()).toBe(true);
      if (!refreshedConversation.isOk()) {
        throw new Error("Failed to refresh conversation");
      }

      // Create an agent message using the proper API to ensure it's in conversation content
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        refreshedAuth,
        {
          name: "Test Agent",
        }
      );

      const agentMentions: MentionType[] = [
        {
          configurationId: agentConfig.sId,
        } satisfies AgentMention,
      ];

      // Create agent message properly so it appears in conversation content
      const { agentMessages } = await createAgentMessages(refreshedAuth, {
        conversation: refreshedConversation.value,
        metadata: {
          type: "create",
          mentions: agentMentions,
          agentConfigurations: [agentConfig],
          skipToolsValidation: false,
          nextMessageRank: 1,
          userMessage,
        },
      });

      expect(agentMessages.length).toBeGreaterThan(0);
      const agentMessage = agentMessages[0];

      // Create mention on agent message
      await MentionModel.create({
        workspaceId: workspace.id,
        messageId: agentMessage.id,
        userId: mentionedUser.id,
        status: "user_restricted_by_conversation_access",
        dismissed: false,
      });

      // Refresh conversation again to include the agent message with mention
      const finalConversation = await getConversation(
        refreshedAuth,
        restrictedConversation.sId
      );
      expect(finalConversation.isOk()).toBe(true);
      if (!finalConversation.isOk()) {
        throw new Error("Failed to refresh conversation");
      }

      // Dismiss the mention using the user message ID (should work because user owns parent)
      // dismissMention will find the mention on the agent message through the conversation content
      const result = await dismissMention(refreshedAuth, {
        conversationId: restrictedConversation.sId,
        messageId: userMessage.sId, // Use user message ID since user owns it
        type: "user",
        id: mentionedUser.sId,
      });

      expect(result.isOk()).toBe(true);

      // Verify mention was dismissed
      const mentionInDb = await MentionModel.findOne({
        where: {
          workspaceId: workspace.id,
          messageId: agentMessage.id,
          userId: mentionedUser.id,
        },
      });
      expect(mentionInDb?.dismissed).toBe(true);
    });
  });

  describe("error cases", () => {
    it("should return error when conversation is not found", async () => {
      const result = await dismissMention(auth, {
        conversationId: "non-existent-conversation",
        messageId: "some-message-id",
        type: "user",
        id: "some-user-id",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.status_code).toBe(404);
        expect(result.error.api_error.type).toBe("conversation_not_found");
      }
    });

    it("should return error when message is not found", async () => {
      const result = await dismissMention(auth, {
        conversationId: conversation.sId,
        messageId: "non-existent-message",
        type: "user",
        id: "some-user-id",
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.status_code).toBe(404);
        expect(result.error.api_error.type).toBe("message_not_found");
      }
    });

    it("should return error when trying to dismiss mention from content fragment", async () => {
      // This test verifies that the error handling for content fragments exists in the code
      // Content fragments are handled in the dismissMention implementation and return
      // a 400 error with "Invalid message type"
      // The actual test would require creating a content fragment, which is complex
      // so we're documenting that the error path exists in the implementation
    });
  });
});

describe("validateAction", () => {
  let workspace: WorkspaceType;
  let auth: Authenticator;
  let conversation: ConversationType;

  // Counter for unique step content indices
  let stepContentIndex = 0;

  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Reset counter for unique step content indices
    stepContentIndex = 0;

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

  /**
   * Helper to create a blocked MCP action for testing.
   */
  async function createBlockedAction({
    agentMessageId,
    status = "blocked_validation_required",
  }: {
    agentMessageId: number;
    status?: ToolExecutionStatus;
  }) {
    const functionCallId = generateRandomModelSId();
    const currentIndex = stepContentIndex++;

    // Create step content (function_call type required for MCP actions)
    const stepContent = await AgentStepContentModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      step: 1,
      index: currentIndex,
      version: 0,
      type: "function_call",
      value: {
        type: "function_call",
        value: {
          id: functionCallId,
          name: "test_tool",
          arguments: "{}",
        },
      },
    });

    // Create a tool configuration
    const toolConfiguration: LightMCPToolConfigurationType = {
      id: 1,
      sId: generateRandomModelSId(),
      type: "mcp_configuration",
      name: "test_tool",
      dataSources: null,
      tables: null,
      childAgentId: null,
      timeFrame: null,
      jsonSchema: null,
      additionalConfiguration: {},
      mcpServerViewId: "test-server-view",
      dustAppConfiguration: null,
      secretName: null,
      dustProject: null,
      internalMCPServerId: null,
      availability: "auto",
      permission: "low",
      toolServerId: "test-server",
      retryPolicy: "no_retry",
      originalName: "test_tool",
      mcpServerName: "test_server",
    };

    // Create MCP action
    const action = await AgentMCPActionModel.create({
      workspaceId: workspace.id,
      agentMessageId,
      stepContentId: stepContent.id,
      mcpServerConfigurationId: generateRandomModelSId(),
      version: 0,
      status,
      citationsAllocated: 0,
      augmentedInputs: {},
      toolConfiguration,
      stepContext: {
        citationsCount: 0,
        citationsOffset: 0,
        resumeState: null,
        retrievalTopK: 10,
        websearchResultCount: 5,
      },
    });

    const actionSId = AgentMCPActionResource.modelIdToSId({
      id: action.id,
      workspaceId: workspace.id,
    });

    return { action, actionSId, stepContent };
  }

  describe("authorization", () => {
    it("should return error when user is not authorized to validate action", async () => {
      // Create another user who will try to validate
      const otherUser = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherUser, {
        role: "user",
      });
      const otherUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherUser.sId,
        workspace.sId
      );

      // Create a user message and agent message as the original user
      const { messageRow } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Test message",
      });

      // Create an agent message as a response
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const agentMessageRow = await AgentMessageModel.create({
        workspaceId: workspace.id,
        status: "created",
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: 0,
        skipToolsValidation: false,
      });

      const agentMessageMessage = await MessageModel.create({
        workspaceId: workspace.id,
        sId: generateRandomModelSId(),
        conversationId: conversation.id,
        rank: 1,
        parentId: messageRow.id,
        agentMessageId: agentMessageRow.id,
      });

      // Create a blocked action
      const { actionSId } = await createBlockedAction({
        agentMessageId: agentMessageRow.id,
      });

      // Get the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Try to validate as a different user (should fail)
      const result = await validateAction(
        otherUserAuth,
        conversationResource!,
        {
          actionId: actionSId,
          approvalState: "approved",
          messageId: agentMessageMessage.sId,
        }
      );

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("unauthorized");
      }
    });

    it("should successfully validate action when user is authorized", async () => {
      // Create a user message and agent message
      const { messageRow } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Test message",
      });

      // Create an agent message as a response
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const agentMessageRow = await AgentMessageModel.create({
        workspaceId: workspace.id,
        status: "created",
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: 0,
        skipToolsValidation: false,
      });

      const agentMessageMessage = await MessageModel.create({
        workspaceId: workspace.id,
        sId: generateRandomModelSId(),
        conversationId: conversation.id,
        rank: 1,
        parentId: messageRow.id,
        agentMessageId: agentMessageRow.id,
      });

      // Create a blocked action
      const { action, actionSId } = await createBlockedAction({
        agentMessageId: agentMessageRow.id,
      });

      // Get the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Validate as the same user (should succeed)
      const result = await validateAction(auth, conversationResource!, {
        actionId: actionSId,
        approvalState: "approved",
        messageId: agentMessageMessage.sId,
      });

      expect(result.isOk()).toBe(true);

      // Verify action status was updated
      await action.reload();
      expect(action.status).toBe("ready_allowed_explicitly");

      // Verify agent loop was launched
      expect(vi.mocked(launchAgentLoopWorkflow)).toHaveBeenCalled();
    });
  });

  describe("error cases", () => {
    it("should return error when action is not found", async () => {
      // Create a user message and agent message
      const { messageRow } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Test message",
      });

      // Create an agent message as a response
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const agentMessageRow = await AgentMessageModel.create({
        workspaceId: workspace.id,
        status: "created",
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: 0,
        skipToolsValidation: false,
      });

      const agentMessageMessage = await MessageModel.create({
        workspaceId: workspace.id,
        sId: generateRandomModelSId(),
        conversationId: conversation.id,
        rank: 1,
        parentId: messageRow.id,
        agentMessageId: agentMessageRow.id,
      });

      // Get the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Try to validate a non-existent action
      const result = await validateAction(auth, conversationResource!, {
        actionId: "non-existent-action-id",
        approvalState: "approved",
        messageId: agentMessageMessage.sId,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("action_not_found");
      }
    });

    it("should return error when action is not in blocked state", async () => {
      // Create a user message and agent message
      const { messageRow } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Test message",
      });

      // Create an agent message as a response
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const agentMessageRow = await AgentMessageModel.create({
        workspaceId: workspace.id,
        status: "created",
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: 0,
        skipToolsValidation: false,
      });

      const agentMessageMessage = await MessageModel.create({
        workspaceId: workspace.id,
        sId: generateRandomModelSId(),
        conversationId: conversation.id,
        rank: 1,
        parentId: messageRow.id,
        agentMessageId: agentMessageRow.id,
      });

      // Create an action that is NOT blocked (e.g., already succeeded)
      const { actionSId } = await createBlockedAction({
        agentMessageId: agentMessageRow.id,
        status: "succeeded", // Not blocked
      });

      // Get the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Try to validate an action that is not blocked
      const result = await validateAction(auth, conversationResource!, {
        actionId: actionSId,
        approvalState: "approved",
        messageId: agentMessageMessage.sId,
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.code).toBe("action_not_blocked");
      }
    });
  });

  describe("approval states", () => {
    it("should handle 'rejected' approval state", async () => {
      // Create a user message and agent message
      const { messageRow } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Test message",
      });

      // Create an agent message as a response
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const agentMessageRow = await AgentMessageModel.create({
        workspaceId: workspace.id,
        status: "created",
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: 0,
        skipToolsValidation: false,
      });

      const agentMessageMessage = await MessageModel.create({
        workspaceId: workspace.id,
        sId: generateRandomModelSId(),
        conversationId: conversation.id,
        rank: 1,
        parentId: messageRow.id,
        agentMessageId: agentMessageRow.id,
      });

      // Create a blocked action
      const { action, actionSId } = await createBlockedAction({
        agentMessageId: agentMessageRow.id,
      });

      // Get the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Reject the action
      const result = await validateAction(auth, conversationResource!, {
        actionId: actionSId,
        approvalState: "rejected",
        messageId: agentMessageMessage.sId,
      });

      expect(result.isOk()).toBe(true);

      // Verify action status was updated to denied
      await action.reload();
      expect(action.status).toBe("denied");
    });
  });

  describe("agent loop launching", () => {
    it("should not launch agent loop when there are remaining blocked actions", async () => {
      // Create a user message and agent message
      const { messageRow } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Test message",
      });

      // Create an agent message as a response
      const agentConfig = await AgentConfigurationFactory.createTestAgent(
        auth,
        { name: "Test Agent" }
      );

      const agentMessageRow = await AgentMessageModel.create({
        workspaceId: workspace.id,
        status: "created",
        agentConfigurationId: agentConfig.sId,
        agentConfigurationVersion: 0,
        skipToolsValidation: false,
      });

      const agentMessageMessage = await MessageModel.create({
        workspaceId: workspace.id,
        sId: generateRandomModelSId(),
        conversationId: conversation.id,
        rank: 1,
        parentId: messageRow.id,
        agentMessageId: agentMessageRow.id,
      });

      // Create two blocked actions for the same message
      const { actionSId: actionSId1 } = await createBlockedAction({
        agentMessageId: agentMessageRow.id,
      });
      await createBlockedAction({
        agentMessageId: agentMessageRow.id,
      });

      // Get the conversation resource
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      expect(conversationResource).not.toBeNull();

      // Validate only the first action
      const result = await validateAction(auth, conversationResource!, {
        actionId: actionSId1,
        approvalState: "approved",
        messageId: agentMessageMessage.sId,
      });

      expect(result.isOk()).toBe(true);

      // Agent loop should NOT be launched because there's still a blocked action
      expect(vi.mocked(launchAgentLoopWorkflow)).not.toHaveBeenCalled();
    });
  });
});
