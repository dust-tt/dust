import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import {
  getNovuClient,
  getUserNotificationDelay,
} from "@app/lib/notifications";
import {
  type ConversationDetailsType,
  type ConversationUnreadPayloadType,
  filterParticipantsByNotifyCondition,
  getEmailSummary,
  getMessagePreviewSlack,
  getMessagePreviewText,
  shouldSendNotificationForAgentAnswer,
  shouldSkipConversation,
  shouldSkipNewProjectConversation,
  triggerConversationUnreadNotifications,
} from "@app/lib/notifications/workflows/conversation-unread";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type {
  ConversationType,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_NOTIFICATION_DELAY,
  makeNotificationPreferencesUserMetadata,
} from "@app/types/notification_preferences";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Novu client for notification sending tests
vi.mock(import("../../../lib/notifications"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getNovuClient: vi.fn().mockResolvedValue({
      triggerBulk: vi.fn().mockResolvedValue({ result: [] }),
    }),
  };
});

// Mock runMultiActionsAgent for LLM summary generation
vi.mock("@app/lib/api/assistant/call_llm", () => ({
  runMultiActionsAgent: vi.fn(),
}));

// Mock renderConversationForModel to avoid tokenization issues in tests
vi.mock("@app/lib/api/assistant/conversation_rendering", () => ({
  renderConversationForModel: vi.fn(),
}));

// Import the mocked functions
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import { renderConversationForModel } from "@app/lib/api/assistant/conversation_rendering";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";

describe("conversation-unread workflow business logic", () => {
  // This ensures all origins are tested as it is a record
  const userMessageOriginRecord: Record<UserMessageOrigin, boolean> = {
    web: true,
    extension: true,
    cli: true,
    cli_programmatic: true,
    email: false,
    api: false,
    onboarding_conversation: false,
    agent_sidekick: false,
    project_kickoff: false,
    excel: false,
    gsheet: false,
    make: false,
    n8n: false,
    zapier: false,
    powerpoint: false,
    raycast: false,
    slack: false,
    teams: false,
    slack_workflow: false,
    transcript: false,
    triggered: false,
    triggered_programmatic: false,
    zendesk: false,
    reinforced_agent_notification: false,
    reinforced_skill_notification: false,
    reinforcement: false,
  };
  describe("shouldSendNotificationForAgentAnswer", () => {
    it.each(
      Object.entries(userMessageOriginRecord)
    )('should for origin "%s" return %s', (origin, expected) => {
      expect(
        shouldSendNotificationForAgentAnswer(origin as UserMessageOrigin)
      ).toBe(expected);
    });
  });

  describe("getUserNotificationDelay", () => {
    let workspace: LightWorkspaceType;
    let user: UserResource;

    beforeEach(async () => {
      const result = await createResourceTest({ role: "admin" });
      workspace = result.workspace;
      user = result.user;
    });

    it("should return stored preference when valid", async () => {
      // Set notification preference
      await user.setMetadata(
        makeNotificationPreferencesUserMetadata("email"),
        "30_minutes"
      );

      const delay = await getUserNotificationDelay({
        subscriberId: user.sId,
        workspaceId: workspace.sId,
        channel: "email",
      });

      expect(delay).toBe("30_minutes");
    });

    it("should return default when no preference stored", async () => {
      const delay = await getUserNotificationDelay({
        subscriberId: user.sId,
        workspaceId: workspace.sId,
        channel: "email",
      });

      expect(delay).toBe(DEFAULT_NOTIFICATION_DELAY);
    });

    it("should return default when invalid stored value", async () => {
      // Set invalid preference
      await user.setMetadata(
        makeNotificationPreferencesUserMetadata("email"),
        "garbage"
      );

      const delay = await getUserNotificationDelay({
        subscriberId: user.sId,
        workspaceId: workspace.sId,
        channel: "email",
      });

      expect(delay).toBe(DEFAULT_NOTIFICATION_DELAY);
    });

    it("should return default when subscriberId is undefined", async () => {
      const delay = await getUserNotificationDelay({
        subscriberId: undefined,
        workspaceId: workspace.sId,
        channel: "email",
      });

      expect(delay).toBe(DEFAULT_NOTIFICATION_DELAY);
    });
  });

  describe("filterParticipantsByNotifyCondition", () => {
    let workspace: LightWorkspaceType;
    let auth: Authenticator;
    let space: SpaceResource;
    let user1: UserResource;
    let user2: UserResource;
    let user3: UserResource;

    beforeEach(async () => {
      const result = await createResourceTest({ role: "admin" });
      workspace = result.workspace;
      user1 = result.user;
      auth = result.authenticator;

      user2 = await UserFactory.basic();
      user3 = await UserFactory.basic();

      await MembershipFactory.associate(workspace, user2, { role: "user" });
      await MembershipFactory.associate(workspace, user3, { role: "user" });

      space = await SpaceFactory.project(workspace);
    });

    const makeParticipant = (
      user: UserResource,
      lastReadAt: Date | null = null
    ) => ({
      ...user.toJSON(),
      lastReadAt,
    });

    it("should include user with 'all_messages' preference", async () => {
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "all_messages"
      );

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        auth,
        participants,
        mentionedUserIds: new Set(),
        totalParticipantCount: 5,
        spaceModelId: space.id,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    it("should include mentioned user with 'only_mentions' preference", async () => {
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "only_mentions"
      );

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        auth,
        participants,
        mentionedUserIds: new Set([user1.sId]),
        totalParticipantCount: 5,
        spaceModelId: space.id,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    it("should exclude non-mentioned user with 'only_mentions' preference", async () => {
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "only_mentions"
      );

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        auth,
        participants,
        mentionedUserIds: new Set(),
        totalParticipantCount: 5,
        spaceModelId: space.id,
      });

      expect(result).toHaveLength(0);
    });

    it("should include non-mentioned user with 'only_mentions' when totalParticipantCount is 1", async () => {
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "only_mentions"
      );

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        auth,
        participants,
        mentionedUserIds: new Set(),
        totalParticipantCount: 1, // Single participant exception
        spaceModelId: space.id,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    it("should exclude user with 'never' preference", async () => {
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "never"
      );

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        auth,
        participants,
        mentionedUserIds: new Set([user1.sId]),
        totalParticipantCount: 1,
        spaceModelId: space.id,
      });

      expect(result).toHaveLength(0);
    });

    it("should default to 'all_messages' when no preference stored", async () => {
      // No preference set for user1
      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        auth,
        participants,
        mentionedUserIds: new Set(),
        totalParticipantCount: 5,
        spaceModelId: space.id,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    it("should handle mixed preferences across multiple participants", async () => {
      // Set different preferences
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "all_messages"
      );
      await user2.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "only_mentions"
      );
      await user3.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "never"
      );

      const participants = [
        makeParticipant(user1),
        makeParticipant(user2),
        makeParticipant(user3),
      ];

      const result = await filterParticipantsByNotifyCondition({
        auth,
        participants,
        mentionedUserIds: new Set([user2.sId]), // Only user2 is mentioned
        totalParticipantCount: 3,
        spaceModelId: space.id,
      });

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.sId).sort()).toEqual(
        [user1.sId, user2.sId].sort()
      );
    });

    it("should handle null spaceModelId (no project preferences)", async () => {
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "all_messages"
      );

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        auth,
        participants,
        mentionedUserIds: new Set(),
        totalParticipantCount: 5,
        spaceModelId: null,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    describe("project-level preference overrides", () => {
      async function setProjectPreference(
        user: UserResource,
        preference: "all_messages" | "only_mentions" | "never"
      ) {
        const { UserProjectNotificationPreferenceResource } = await import(
          "@app/lib/resources/user_project_notification_preferences_resource"
        );
        const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
          user.sId,
          workspace.sId
        );
        await UserProjectNotificationPreferenceResource.setPreference(
          userAuth,
          { spaceModelId: space.id, preference }
        );
      }

      it("should override general 'all_messages' with project 'never'", async () => {
        await user1.setMetadata(
          CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
          "all_messages"
        );
        await setProjectPreference(user1, "never");

        const participants = [makeParticipant(user1)];
        const result = await filterParticipantsByNotifyCondition({
          auth,
          participants,
          mentionedUserIds: new Set(),
          totalParticipantCount: 5,
          spaceModelId: space.id,
        });

        expect(result).toHaveLength(0);
      });

      it("should override general 'never' with project 'all_messages'", async () => {
        await user1.setMetadata(
          CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
          "never"
        );
        await setProjectPreference(user1, "all_messages");

        const participants = [makeParticipant(user1)];
        const result = await filterParticipantsByNotifyCondition({
          auth,
          participants,
          mentionedUserIds: new Set(),
          totalParticipantCount: 5,
          spaceModelId: space.id,
        });

        expect(result).toHaveLength(1);
        expect(result[0].sId).toBe(user1.sId);
      });

      it("should fall back to general preference when no project preference exists", async () => {
        await user1.setMetadata(
          CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
          "never"
        );

        const participants = [makeParticipant(user1)];
        const result = await filterParticipantsByNotifyCondition({
          auth,
          participants,
          mentionedUserIds: new Set(),
          totalParticipantCount: 5,
          spaceModelId: space.id,
        });

        expect(result).toHaveLength(0);
      });

      it("should override general 'only_mentions' with project 'all_messages'", async () => {
        await user1.setMetadata(
          CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
          "only_mentions"
        );
        await setProjectPreference(user1, "all_messages");

        const participants = [makeParticipant(user1)];
        const result = await filterParticipantsByNotifyCondition({
          auth,
          participants,
          mentionedUserIds: new Set(), // Not mentioned
          totalParticipantCount: 5,
          spaceModelId: space.id,
        });

        // Would be excluded by general "only_mentions", but project overrides to "all_messages"
        expect(result).toHaveLength(1);
        expect(result[0].sId).toBe(user1.sId);
      });

      it("should handle mixed general and project preferences across users", async () => {
        // user1: general=never, project=all_messages -> included
        await user1.setMetadata(
          CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
          "never"
        );
        await setProjectPreference(user1, "all_messages");

        // user2: general=all_messages, no project pref -> included
        await user2.setMetadata(
          CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
          "all_messages"
        );

        // user3: general=all_messages, project=never -> excluded
        await user3.setMetadata(
          CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
          "all_messages"
        );
        await setProjectPreference(user3, "never");

        const participants = [
          makeParticipant(user1),
          makeParticipant(user2),
          makeParticipant(user3),
        ];
        const result = await filterParticipantsByNotifyCondition({
          auth,
          participants,
          mentionedUserIds: new Set(),
          totalParticipantCount: 3,
          spaceModelId: space.id,
        });

        expect(result).toHaveLength(2);
        expect(result.map((p) => p.sId).sort()).toEqual(
          [user1.sId, user2.sId].sort()
        );
      });
    });
  });

  describe("shouldSkipConversation", () => {
    let workspace: LightWorkspaceType;
    let user: UserResource;
    let auth: Authenticator;
    let conversationId: string;
    let conversation: ConversationResource | null;
    let messageId: string;

    beforeEach(async () => {
      const result = await createResourceTest({ role: "admin" });
      workspace = result.workspace;
      user = result.user;
      auth = result.authenticator;

      // Create a test conversation
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Test Agent",
        description: "Test",
      });
      const conversationType = await ConversationFactory.create(auth, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [new Date()],
      });
      conversationId = conversationType.sId;

      // Get the actual message ID from the conversation
      conversation = await ConversationResource.fetchById(auth, conversationId);
      if (!conversation) {
        throw new Error("Conversation should exist");
      }

      const messages = await conversation.fetchMessagesForPage(auth, {
        limit: 10,
      });
      if (messages.messages.length === 0) {
        throw new Error("Conversation should have messages");
      }
      messageId = messages.messages[0].sId;
    });

    const createPayload = () => ({
      workspaceId: workspace.sId,
      conversationId,
      messageId,
    });

    it("should return true when conversation is deleted", async () => {
      if (!conversation) {
        throw new Error("Conversation should exist");
      }
      await destroyConversation(auth, { conversation });
      const result = await shouldSkipConversation({
        subscriberId: user.sId,
        payload: {
          workspaceId: workspace.sId,
          conversationId,
          messageId,
        },
        triggerShouldSkip: true,
        hasUnreadMessages: true,
      });

      expect(result).toBe(true);
    });

    it("should return false when conversation is unread", async () => {
      // Test the normal case: user has unread messages in the conversation
      const result = await shouldSkipConversation({
        subscriberId: user.sId,
        payload: createPayload(),
        triggerShouldSkip: false,
        hasUnreadMessages: true,
      });

      expect(result).toBe(false);
    });

    it("should return false when action is required from user", async () => {
      // First ensure the participant record exists, then set actionRequired=true
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/agent/conversation"
      );

      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversation) {
        throw new Error("Conversation should exist");
      }

      // Upsert the participant record with actionRequired=true
      await ConversationParticipantModel.upsert({
        conversationId: conversation.id,
        userId: user.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: true,
      });

      const result = await shouldSkipConversation({
        subscriberId: user.sId,
        payload: createPayload(),
        triggerShouldSkip: false,
        hasUnreadMessages: false, // No unread messages, but actionRequired is true
      });

      // Should return false (don't skip) because actionRequired is true
      expect(result).toBe(false);
    });
  });

  describe("shouldSkipNewProjectConversation", () => {
    let workspace: WorkspaceType;
    let space: SpaceResource;
    let user: UserResource;
    let nonMemberUser: UserResource;
    let auth: Authenticator;
    let conversation: ConversationType;
    let payload: ConversationUnreadPayloadType;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      user = await UserFactory.basic();
      nonMemberUser = await UserFactory.basic();

      await MembershipFactory.associate(workspace, user, { role: "user" });
      await MembershipFactory.associate(workspace, nonMemberUser, {
        role: "user",
      });

      auth = await Authenticator.fromUserIdAndWorkspaceId(
        user.sId,
        workspace.sId
      );

      // Create a space (project)
      space = await SpaceFactory.project(workspace, user.id);

      // Add user as member of the space - The user is already an editor from SpaceFactory.project,
      // but we'll add them as a member too for testing different membership scenarios

      // Create a test conversation in the space
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: `Test Agent ${Date.now()}`,
        description: "Test",
      });
      conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [new Date()],
        spaceId: space.id,
      });

      payload = {
        workspaceId: workspace.sId,
        conversationId: conversation.sId,
        isNewProjectConversation: true,
      };
    });

    it("should return true when conversation is not found", async () => {
      const invalidPayload = {
        ...payload,
        conversationId: "non-existent-conversation-id",
      };

      const result = await shouldSkipNewProjectConversation({
        subscriberId: user.sId,
        payload: invalidPayload,
      });

      expect(result).toBe(true);
    });

    it("should return true when conversation has been opened by user", async () => {
      // Mark conversation as read
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      if (!conversationResource) {
        throw new Error("Conversation should exist");
      }

      // Mark conversation as read for the user
      await ConversationResource.markAsReadForAuthUser(auth, {
        conversation: conversationResource.toJSON(),
      });

      const result = await shouldSkipNewProjectConversation({
        subscriberId: user.sId,
        payload,
      });

      expect(result).toBe(true);
    });

    it("should return true when user is a conversation participant", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      if (!conversationResource) {
        throw new Error("Conversation should exist");
      }

      // Add user as participant
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/agent/conversation"
      );
      await ConversationParticipantModel.create({
        conversationId: conversationResource.id,
        userId: user.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: false,
      });

      const result = await shouldSkipNewProjectConversation({
        subscriberId: user.sId,
        payload,
      });

      expect(result).toBe(true);
    });

    it("should return true for non-project conversation", async () => {
      // Create a non-project conversation (without spaceId)
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: `Non-Project Agent ${Date.now()}`,
        description: "Test",
      });
      const nonProjectConversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [new Date()],
      });

      const nonProjectPayload = {
        workspaceId: workspace.sId,
        conversationId: nonProjectConversation.sId,
        userThatCreatedConversationId: user.sId,
      };

      const result = await shouldSkipNewProjectConversation({
        subscriberId: user.sId,
        payload: nonProjectPayload,
      });

      expect(result).toBe(true);
    });

    it("should return true when user is not a project member", async () => {
      const result = await shouldSkipNewProjectConversation({
        subscriberId: nonMemberUser.sId,
        payload,
      });

      expect(result).toBe(true);
    });

    it("should return false when all conditions allow notification", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      if (!conversationResource) {
        throw new Error("Conversation should exist");
      }

      const result = await shouldSkipNewProjectConversation({
        subscriberId: user.sId,
        payload,
      });

      expect(result).toBe(false);
    });
  });

  describe("triggerConversationUnreadNotifications", () => {
    let workspace: WorkspaceType;
    let user1: UserResource;
    let user2: UserResource;
    let auth: Authenticator;
    let conversationId: string;
    let messageId: string;

    beforeEach(async () => {
      vi.clearAllMocks();

      workspace = await WorkspaceFactory.basic();
      user1 = await UserFactory.basic();
      user2 = await UserFactory.basic();

      await MembershipFactory.associate(workspace, user1, { role: "admin" });
      await MembershipFactory.associate(workspace, user2, { role: "user" });

      auth = await Authenticator.fromUserIdAndWorkspaceId(
        user1.sId,
        workspace.sId
      );

      // Create a test conversation
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Test Agent",
        description: "Test",
      });
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [new Date()],
      });
      conversationId = conversation.sId;

      // Get the actual message ID from the conversation
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversationResource) {
        throw new Error("Conversation should exist");
      }
      const messages = await conversationResource.fetchMessagesForPage(auth, {
        limit: 10,
      });
      if (messages.messages.length === 0) {
        throw new Error("Conversation should have messages");
      }
      messageId = messages.messages[0].sId;
    });

    it("should return Ok when no participants with unread messages", async () => {
      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversation) {
        throw new Error("Conversation should exist");
      }

      const result = await triggerConversationUnreadNotifications(auth, {
        conversationId,
        messageId,
      });

      expect(result.isOk()).toBe(true);
      // The function should return early without calling Novu if no unread participants
      expect(vi.mocked(getNovuClient)).not.toHaveBeenCalled();
    });

    it("should call getNovuClient when there are unread participants", async () => {
      // Make sure participants exist and have unread messages
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/agent/conversation"
      );
      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversation) {
        throw new Error("Conversation should exist");
      }

      // Create participant records for both users
      await ConversationParticipantModel.upsert({
        conversationId: conversation.id,
        userId: user1.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: false,
      });
      await ConversationParticipantModel.upsert({
        conversationId: conversation.id,
        userId: user2.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: false,
      });

      const result = await triggerConversationUnreadNotifications(auth, {
        conversationId,
        messageId,
      });

      expect(result.isOk()).toBe(true);
      // Verify that Novu client was called (this tests the integration up to the Novu call)
      expect(vi.mocked(getNovuClient)).toHaveBeenCalled();
    });

    it("should filter participants through filterParticipantsByNotifyCondition", async () => {
      // Set up mixed notification preferences
      await user1.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "all_messages"
      );
      await user2.setMetadata(
        CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        "never" // This user should be filtered out
      );

      // Make sure participants exist and have unread messages
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/agent/conversation"
      );
      const conversation = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversation) {
        throw new Error("Conversation should exist");
      }

      // Create participant records for both users
      await ConversationParticipantModel.upsert({
        conversationId: conversation.id,
        userId: user1.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: false,
      });
      await ConversationParticipantModel.upsert({
        conversationId: conversation.id,
        userId: user2.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: false,
      });

      const result = await triggerConversationUnreadNotifications(auth, {
        conversationId,
        messageId,
      });

      expect(result.isOk()).toBe(true);

      // Since user1 has "all_messages" preference, they should receive notifications
      // even though user2 has "never" preference and gets filtered out
      expect(vi.mocked(getNovuClient)).toHaveBeenCalled();
    });

    it("should skip notifications for email-origin user messages", async () => {
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/agent/conversation"
      );
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Email Agent",
        description: "Test",
      });
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [],
      });

      const { messageRow } = await ConversationFactory.createUserMessage({
        auth,
        workspace,
        conversation,
        content: "Forwarded by email",
        origin: "email",
      });

      await ConversationParticipantModel.upsert({
        conversationId: conversation.id,
        userId: user1.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: false,
      });
      await ConversationParticipantModel.upsert({
        conversationId: conversation.id,
        userId: user2.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: false,
      });

      const result = await triggerConversationUnreadNotifications(auth, {
        conversationId: conversation.sId,
        messageId: messageRow.sId,
      });

      expect(result.isOk()).toBe(true);
      expect(vi.mocked(getNovuClient)).not.toHaveBeenCalled();
    });

    it("should skip notifications for agent replies to email-origin user messages", async () => {
      const { ConversationParticipantModel } = await import(
        "@app/lib/models/agent/conversation"
      );
      const agent = await AgentConfigurationFactory.createTestAgent(auth, {
        name: "Email Agent",
        description: "Test",
      });
      const conversation = await ConversationFactory.create(auth, {
        agentConfigurationId: agent.sId,
        messagesCreatedAt: [],
      });

      const { messageRow: userMessageRow } =
        await ConversationFactory.createUserMessage({
          auth,
          workspace,
          conversation,
          content: "Forwarded by email",
          origin: "email",
        });
      const agentMessageRow =
        await ConversationFactory.createAgentMessageWithRank({
          workspace,
          conversationId: conversation.id,
          rank: 1,
          agentConfigurationId: agent.sId,
          parentId: userMessageRow.id,
        });

      await ConversationParticipantModel.upsert({
        conversationId: conversation.id,
        userId: user1.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: false,
      });
      await ConversationParticipantModel.upsert({
        conversationId: conversation.id,
        userId: user2.id,
        workspaceId: workspace.id,
        action: "posted",
        actionRequired: false,
      });

      const result = await triggerConversationUnreadNotifications(auth, {
        conversationId: conversation.sId,
        messageId: agentMessageRow.sId,
      });

      expect(result.isOk()).toBe(true);
      expect(vi.mocked(getNovuClient)).not.toHaveBeenCalled();
    });
  });
});

describe("getMessagePreviewText", () => {
  const mockConversationDetails: ConversationDetailsType = {
    projectName: "Test Project",
    author: "John Doe",
    subject: "Test Conversation",
    hasConversationRetentionPolicy: false,
    hasAgentRetentionPolicies: false,
    newMessageContent:
      "Hello, this is a test message with some content that might be long.",
    authorIsAgent: false,
    hasUnreadMentions: false,
    hasUnreadMessages: false,
    isFromTrigger: false,
    workspaceName: "Test Workspace",
    isNewProjectConversation: true,
    mentionedUserIds: [],
    isFromEmailAgentConversation: false,
  };
  it("should return retention policy message for conversation retention", () => {
    const details: ConversationDetailsType = {
      ...mockConversationDetails,
      hasConversationRetentionPolicy: true,
      hasAgentRetentionPolicies: false,
    };

    const result = getMessagePreviewText(details);

    expect(result).toBe(
      "Preview not available due to data retention policy on conversations in this workspace."
    );
  });

  it("should return retention policy message for agent retention", () => {
    const details: ConversationDetailsType = {
      ...mockConversationDetails,
      hasConversationRetentionPolicy: false,
      hasAgentRetentionPolicies: true,
    };

    const result = getMessagePreviewText(details);

    expect(result).toBe(
      "Preview not available due to data retention policy on agents in this conversation."
    );
  });

  it("should return undefined when newMessageContent is null", () => {
    const details: ConversationDetailsType = {
      ...mockConversationDetails,
      newMessageContent: null,
    };

    const result = getMessagePreviewText(details);

    expect(result).toBeUndefined();
  });

  it("should return complete content when message is short", () => {
    const details: ConversationDetailsType = {
      ...mockConversationDetails,
      newMessageContent: "Short message",
    };

    const result = getMessagePreviewText(details);

    expect(result).toBe("Short message");
  });

  it("should truncate long content at 300 characters", () => {
    const longContent = "A".repeat(350);
    const details: ConversationDetailsType = {
      ...mockConversationDetails,
      newMessageContent: longContent,
    };

    const result = getMessagePreviewText(details);

    expect(result).toBe("A".repeat(300) + "...");
  });

  it("should strip markdown from content", () => {
    const details: ConversationDetailsType = {
      ...mockConversationDetails,
      newMessageContent: "**Bold text** and _italic text_",
    };

    const result = getMessagePreviewText(details);

    expect(result).toBe("Bold text and italic text");
  });

  it("should handle whitespace properly", () => {
    const details: ConversationDetailsType = {
      ...mockConversationDetails,
      newMessageContent: "   Content with   extra   spaces   ",
    };

    const result = getMessagePreviewText(details);

    expect(result).toBe("Content with   extra   spaces");
  });
});

describe("getMessagePreviewSlack", () => {
  const createMockDetails = (overrides = {}) => ({
    subject: "Test Conversation",
    author: "Test User",
    authorIsAgent: false,
    avatarUrl: "https://example.com/avatar.jpg",
    isFromTrigger: false,
    isFromEmailAgentConversation: false,
    workspaceName: "Test Workspace",
    mentionedUserIds: [],
    hasUnreadMessages: true,
    hasUnreadMentions: false,
    hasConversationRetentionPolicy: false,
    hasAgentRetentionPolicies: false,
    newMessageContent: null,
    ...overrides,
  });

  it("should return retention policy message for conversations with retention policy", () => {
    const details = createMockDetails({
      hasConversationRetentionPolicy: true,
      newMessageContent: "This content should be ignored",
    });

    const result = getMessagePreviewSlack(details);

    expect(result).toBe(
      "> Preview not available due to data retention policy on conversations in this workspace."
    );
  });

  it("should return retention policy message for agents with retention policy", () => {
    const details = createMockDetails({
      hasAgentRetentionPolicies: true,
      newMessageContent: "This content should be ignored",
    });

    const result = getMessagePreviewSlack(details);

    expect(result).toBe(
      "> Preview not available due to data retention policy on agents in this conversation."
    );
  });

  it("should return undefined when newMessageContent is null", () => {
    const details = createMockDetails({ newMessageContent: null });

    const result = getMessagePreviewSlack(details);

    expect(result).toBeUndefined();
  });

  it("should return undefined when newMessageContent is empty string", () => {
    const details = createMockDetails({ newMessageContent: "" });

    const result = getMessagePreviewSlack(details);

    expect(result).toBeUndefined();
  });

  it("should format simple text content with blockquote", () => {
    const details = createMockDetails({ newMessageContent: "Hello world!" });

    const result = getMessagePreviewSlack(details);

    expect(result).toBe("> Hello world!");
  });

  it("should strip markdown formatting", () => {
    const details = createMockDetails({
      newMessageContent: "**Bold** and *italic* text with [link](url)",
    });

    const result = getMessagePreviewSlack(details);

    expect(result).toBe("> Bold and italic text with link");
  });

  it("should handle multi-line content with blockquote formatting", () => {
    const details = createMockDetails({
      newMessageContent: "Line 1\nLine 2\nLine 3",
    });

    const result = getMessagePreviewSlack(details);

    expect(result).toBe("> Line 1\n> Line 2\n> Line 3");
  });

  it("should truncate content longer than 300 characters", () => {
    const longContent = "a".repeat(350);
    const details = createMockDetails({ newMessageContent: longContent });

    const result = getMessagePreviewSlack(details);

    expect(result).toBe(`> ${"a".repeat(300)}...`);
  });

  it("should not add ellipsis for content exactly 300 characters", () => {
    const exactContent = "a".repeat(300);
    const details = createMockDetails({ newMessageContent: exactContent });

    const result = getMessagePreviewSlack(details);

    expect(result).toBe(`> ${exactContent}`);
  });

  it("should handle content with whitespace trimming", () => {
    const details = createMockDetails({
      newMessageContent: "   \n  Hello world!  \n   ",
    });

    const result = getMessagePreviewSlack(details);

    expect(result).toBe("> Hello world!");
  });

  it("should handle complex multiline content with markdown and truncation", () => {
    const complexContent = `**Important message**\n\nThis is a long paragraph with *formatting* and [links](url).\n${"word ".repeat(40)}More content here.`;
    const details = createMockDetails({ newMessageContent: complexContent });

    const result = getMessagePreviewSlack(details);

    expect(result).toBeDefined();
    expect(result?.startsWith("> Important message")).toBe(true);
    expect(result?.includes("\n>")).toBe(true); // Should have blockquote formatting for multiple lines
    if (result && result.length > 300) {
      expect(result.endsWith("...")).toBe(true);
    }
  });
});

describe("getEmailSummary", () => {
  let workspace: WorkspaceType;
  let user: UserResource;
  let conversation: ConversationType;

  const createMockDetails = (overrides = {}) => ({
    subject: "Test Conversation",
    author: "Test User",
    authorIsAgent: false,
    isFromTrigger: false,
    isFromEmailAgentConversation: false,
    workspaceName: "Test Workspace",
    mentionedUserIds: [],
    hasUnreadMessages: true,
    hasUnreadMentions: false,
    hasConversationRetentionPolicy: false,
    hasAgentRetentionPolicies: false,
    newMessageContent: "Test message content",
    ...overrides,
  });

  beforeEach(async () => {
    // Create test resources with proper authentication
    const result = await createResourceTest({ role: "admin" });
    workspace = result.workspace;
    user = result.user;

    // Create authenticator and agent for testing
    const auth = result.authenticator;
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test agent for email summary tests",
    });

    conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [], // Create empty conversation
    });

    // Add an unread message to the conversation
    await ConversationFactory.createUserMessage({
      auth,
      workspace: result.workspace,
      conversation,
      content: "This is an unread message for testing",
    });

    // Ensure the conversation has unread messages by setting lastReadMs to null
    // or to a timestamp before the message creation
    const conversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    if (conversationResource) {
      // Set up participation with null lastReadAt to make messages unread
      await ConversationResource.upsertParticipation(auth, {
        conversation,
        action: "posted",
        user: user.toJSON(),
        lastReadAt: new Date(new Date().getTime() - 100 * 24 * 60 * 60 * 1000), // Set lastReadAt to 100 days ago to ensure messages are unread
      });
    }

    // Set up consistent mock for renderConversationForModel
    vi.mocked(renderConversationForModel).mockResolvedValue(
      new Ok({
        modelConversation: {
          messages: [
            {
              role: "user",
              name: "Test User",
              content: [
                { type: "text", text: "This is an unread message for testing" },
              ],
            },
          ],
        },
        tokensUsed: 100,
        prunedContext: false,
      })
    );

    vi.clearAllMocks();
  });

  it("should return retention policy message for conversations with retention policy", async () => {
    const details = createMockDetails({
      hasConversationRetentionPolicy: true,
    });

    const mockPayload = {
      conversationId: conversation.sId,
      workspaceId: workspace.sId,
      origin: "web" as const,
      messageId: "msg_test_123",
    };

    const result = await getEmailSummary({
      details,
      subscriberId: user.sId,
      payload: mockPayload,
    });

    expect(result).toBe(
      "Summary not generated due to data retention policy on conversations in this workspace."
    );

    // Should not call LLM when retention policy is present
    expect(runMultiActionsAgent).not.toHaveBeenCalled();
  });

  it("should return retention policy message for agents with retention policy", async () => {
    const details = createMockDetails({
      hasAgentRetentionPolicies: true,
    });

    const mockPayload = {
      conversationId: conversation.sId,
      workspaceId: workspace.sId,
      origin: "web" as const,
      messageId: "msg_test_123",
    };

    const result = await getEmailSummary({
      details,
      subscriberId: user.sId,
      payload: mockPayload,
    });

    expect(result).toBe(
      "Summary not generated due to data retention policy on agents in this conversation."
    );

    // Should not call LLM when retention policy is present
    expect(runMultiActionsAgent).not.toHaveBeenCalled();
  });

  it("should return LLM-generated summary when no retention policies", async () => {
    const details = createMockDetails();
    const mockSummary =
      "John needs you to review the quarterly report by Friday.";

    const mockPayload = {
      conversationId: conversation.sId,
      workspaceId: workspace.sId,
      origin: "web" as const,
      messageId: "msg_test_123",
    };

    vi.mocked(runMultiActionsAgent).mockResolvedValueOnce(
      new Ok({
        actions: [
          {
            name: "conversation_summary",
            arguments: {
              conversation_summary: mockSummary,
            },
          },
        ],
      })
    );

    const result = await getEmailSummary({
      details,
      subscriberId: user.sId,
      payload: mockPayload,
    });

    expect(result).toBe(mockSummary);
    expect(runMultiActionsAgent).toHaveBeenCalledOnce();
  });

  it("should return null when LLM generation fails", async () => {
    const details = createMockDetails();

    const mockPayload = {
      conversationId: conversation.sId,
      workspaceId: workspace.sId,
      origin: "web" as const,
      messageId: "msg_test_123",
    };

    vi.mocked(runMultiActionsAgent).mockResolvedValueOnce(
      new Err(new Error("Generation failed"))
    );

    const result = await getEmailSummary({
      details,
      subscriberId: user.sId,
      payload: mockPayload,
    });

    expect(result).toBeNull();
    expect(runMultiActionsAgent).toHaveBeenCalledOnce();
  });

  it("should strip markdown from LLM-generated summary", async () => {
    const details = createMockDetails();
    const mockSummaryWithMarkdown =
      "**John** needs you to review the *quarterly report* by Friday.";
    const expectedStrippedSummary =
      "John needs you to review the quarterly report by Friday.";

    const mockPayload = {
      conversationId: conversation.sId,
      workspaceId: workspace.sId,
      origin: "web" as const,
      messageId: "msg_test_123",
    };

    vi.mocked(runMultiActionsAgent).mockResolvedValueOnce(
      new Ok({
        actions: [
          {
            name: "conversation_summary",
            arguments: {
              conversation_summary: mockSummaryWithMarkdown,
            },
          },
        ],
      })
    );

    const result = await getEmailSummary({
      details,
      subscriberId: user.sId,
      payload: mockPayload,
    });

    expect(result).toBe(expectedStrippedSummary);
  });
});
