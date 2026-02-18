import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import {
  getNovuClient,
  getUserNotificationDelay,
} from "@app/lib/notifications";
import {
  filterParticipantsByNotifyCondition,
  getMessagePreview,
  shouldSendNotificationForAgentAnswer,
  shouldSkipConversation,
  triggerConversationUnreadNotifications,
} from "@app/lib/notifications/workflows/conversation-unread";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { UserMetadataModel } from "@app/lib/resources/storage/models/user";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { UserMessageOrigin } from "@app/types/assistant/conversation";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_NOTIFICATION_DELAY,
  makeNotificationPreferencesUserMetadata,
} from "@app/types/notification_preferences";
import type { LightWorkspaceType, WorkspaceType } from "@app/types/user";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("conversation-unread workflow business logic", () => {
  // This ensures all origis are tested as it is a record
  const userMessageOriginRecord: Record<UserMessageOrigin, boolean> = {
    web: true,
    extension: true,
    cli: true,
    cli_programmatic: true,
    email: false,
    api: false,
    onboarding_conversation: false,
    agent_copilot: false,
    project_butler: false,
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
      await UserMetadataModel.create({
        userId: user.id,
        key: makeNotificationPreferencesUserMetadata("email"),
        value: "30_minutes",
      });

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
      await UserMetadataModel.create({
        userId: user.id,
        key: makeNotificationPreferencesUserMetadata("email"),
        value: "garbage",
      });

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
    let workspace: WorkspaceType;
    let user1: UserResource;
    let user2: UserResource;
    let user3: UserResource;

    beforeEach(async () => {
      workspace = await WorkspaceFactory.basic();
      user1 = await UserFactory.basic();
      user2 = await UserFactory.basic();
      user3 = await UserFactory.basic();

      await MembershipFactory.associate(workspace, user1, { role: "user" });
      await MembershipFactory.associate(workspace, user2, { role: "user" });
      await MembershipFactory.associate(workspace, user3, { role: "user" });
    });

    const makeParticipant = (
      user: UserResource,
      lastReadAt: Date | null = null
    ) => ({
      ...user.toJSON(),
      lastReadAt,
    });

    it("should include user with 'all_messages' preference", async () => {
      await UserMetadataModel.create({
        userId: user1.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "all_messages",
      });

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        participants,
        mentionedUserIds: new Set(),
        totalParticipantCount: 5,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    it("should include mentioned user with 'only_mentions' preference", async () => {
      await UserMetadataModel.create({
        userId: user1.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "only_mentions",
      });

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        participants,
        mentionedUserIds: new Set([user1.sId]),
        totalParticipantCount: 5,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    it("should exclude non-mentioned user with 'only_mentions' preference", async () => {
      await UserMetadataModel.create({
        userId: user1.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "only_mentions",
      });

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        participants,
        mentionedUserIds: new Set(),
        totalParticipantCount: 5,
      });

      expect(result).toHaveLength(0);
    });

    it("should include non-mentioned user with 'only_mentions' when totalParticipantCount is 1", async () => {
      await UserMetadataModel.create({
        userId: user1.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "only_mentions",
      });

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        participants,
        mentionedUserIds: new Set(),
        totalParticipantCount: 1, // Single participant exception
      });

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    it("should exclude user with 'never' preference", async () => {
      await UserMetadataModel.create({
        userId: user1.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "never",
      });

      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        participants,
        mentionedUserIds: new Set([user1.sId]),
        totalParticipantCount: 1,
      });

      expect(result).toHaveLength(0);
    });

    it("should default to 'all_messages' when no preference stored", async () => {
      // No preference set for user1
      const participants = [makeParticipant(user1)];
      const result = await filterParticipantsByNotifyCondition({
        participants,
        mentionedUserIds: new Set(),
        totalParticipantCount: 5,
      });

      expect(result).toHaveLength(1);
      expect(result[0].sId).toBe(user1.sId);
    });

    it("should handle mixed preferences across multiple participants", async () => {
      // Set different preferences
      await UserMetadataModel.create({
        userId: user1.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "all_messages",
      });
      await UserMetadataModel.create({
        userId: user2.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "only_mentions",
      });
      await UserMetadataModel.create({
        userId: user3.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "never",
      });

      const participants = [
        makeParticipant(user1),
        makeParticipant(user2),
        makeParticipant(user3),
      ];

      const result = await filterParticipantsByNotifyCondition({
        participants,
        mentionedUserIds: new Set([user2.sId]), // Only user2 is mentioned
        totalParticipantCount: 3,
      });

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.sId).sort()).toEqual(
        [user1.sId, user2.sId].sort()
      );
    });
  });

  describe("shouldSkipConversation", () => {
    let workspace: LightWorkspaceType;
    let user: UserResource;
    let auth: Authenticator;
    let conversationId: string;
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

    afterEach(async () => {
      if (conversationId) {
        await destroyConversation(auth, { conversationId });
      }
    });

    const createPayload = () => ({
      workspaceId: workspace.sId,
      conversationId,
      messageId,
    });

    it("should return true when conversation is deleted", async () => {
      await destroyConversation(auth, { conversationId });
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

  describe("triggerConversationUnreadNotifications", () => {
    let workspace: WorkspaceType;
    let user1: UserResource;
    let user2: UserResource;
    let auth: Authenticator;
    let conversationId: string;
    let messageId: string;

    beforeEach(async () => {
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

    afterEach(async () => {
      if (conversationId) {
        await destroyConversation(auth, { conversationId });
      }
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
      await UserMetadataModel.create({
        userId: user1.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "all_messages",
      });
      await UserMetadataModel.create({
        userId: user2.id,
        key: CONVERSATION_NOTIFICATION_METADATA_KEYS.notifyCondition,
        value: "never", // This user should be filtered out
      });

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
  });
});

describe("getMessagePreview", () => {
  const createMockDetails = (overrides = {}) => ({
    subject: "Test Conversation",
    author: "Test User",
    authorIsAgent: false,
    avatarUrl: "https://example.com/avatar.jpg",
    isFromTrigger: false,
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

    const result = getMessagePreview(details);

    expect(result).toBe(
      "> Preview not available due to data retention policy on conversations in this workspace."
    );
  });

  it("should return retention policy message for agents with retention policy", () => {
    const details = createMockDetails({
      hasAgentRetentionPolicies: true,
      newMessageContent: "This content should be ignored",
    });

    const result = getMessagePreview(details);

    expect(result).toBe(
      "> Preview not available due to data retention policy on agents in this conversation."
    );
  });

  it("should return undefined when newMessageContent is null", () => {
    const details = createMockDetails({ newMessageContent: null });

    const result = getMessagePreview(details);

    expect(result).toBeUndefined();
  });

  it("should return undefined when newMessageContent is empty string", () => {
    const details = createMockDetails({ newMessageContent: "" });

    const result = getMessagePreview(details);

    expect(result).toBeUndefined();
  });

  it("should format simple text content with blockquote", () => {
    const details = createMockDetails({ newMessageContent: "Hello world!" });

    const result = getMessagePreview(details);

    expect(result).toBe("> Hello world!");
  });

  it("should strip markdown formatting", () => {
    const details = createMockDetails({
      newMessageContent: "**Bold** and *italic* text with [link](url)",
    });

    const result = getMessagePreview(details);

    expect(result).toBe("> Bold and italic text with link");
  });

  it("should handle multi-line content with blockquote formatting", () => {
    const details = createMockDetails({
      newMessageContent: "Line 1\nLine 2\nLine 3",
    });

    const result = getMessagePreview(details);

    expect(result).toBe("> Line 1\n> Line 2\n> Line 3");
  });

  it("should truncate content longer than 300 characters", () => {
    const longContent = "a".repeat(350);
    const details = createMockDetails({ newMessageContent: longContent });

    const result = getMessagePreview(details);

    expect(result).toBe(`> ${"a".repeat(300)}...`);
  });

  it("should not add ellipsis for content exactly 300 characters", () => {
    const exactContent = "a".repeat(300);
    const details = createMockDetails({ newMessageContent: exactContent });

    const result = getMessagePreview(details);

    expect(result).toBe(`> ${exactContent}`);
  });

  it("should handle content with whitespace trimming", () => {
    const details = createMockDetails({
      newMessageContent: "   \n  Hello world!  \n   ",
    });

    const result = getMessagePreview(details);

    expect(result).toBe("> Hello world!");
  });

  it("should handle complex multiline content with markdown and truncation", () => {
    const complexContent = `**Important message**\n\nThis is a long paragraph with *formatting* and [links](url).\n${"word ".repeat(40)}More content here.`;
    const details = createMockDetails({ newMessageContent: complexContent });

    const result = getMessagePreview(details);

    expect(result).toBeDefined();
    expect(result?.startsWith("> Important message")).toBe(true);
    expect(result?.includes("\n>")).toBe(true); // Should have blockquote formatting for multiple lines
    if (result && result.length > 300) {
      expect(result.endsWith("...")).toBe(true);
    }
  });
});
