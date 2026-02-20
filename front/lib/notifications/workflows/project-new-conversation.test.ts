import { Authenticator } from "@app/lib/auth";
import type { ProjectNewConversationPayloadType } from "@app/lib/notifications/triggers/project-new-conversation";
import { filterMembersByNotifyCondition } from "@app/lib/notifications/triggers/project-new-conversation";
import {
  getMessagePreviewForSlack,
  getMessagePreviewText,
  type ProjectDetailsType,
  shouldSkipConversation,
} from "@app/lib/notifications/workflows/project-new-conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import {
  CONVERSATION_NOTIFICATION_METADATA_KEYS,
  DEFAULT_PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION,
} from "@app/types/notification_preferences";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, test } from "vitest";

describe("filterMembersByNotifyCondition", () => {
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

  test("should include user with 'all_projects' preference", async () => {
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.projectNewConversationNotifyCondition,
      "all_projects"
    );

    const members = [user1];
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(1);
    expect(result[0].sId).toBe(user1.sId);
  });

  test("should exclude user with 'never' preference", async () => {
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.projectNewConversationNotifyCondition,
      "never"
    );

    const members = [user1];
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(0);
  });

  test("should default to 'all_projects' when no preference stored", async () => {
    // No preference set for user1
    const members = [user1];
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(1);
    expect(result[0].sId).toBe(user1.sId);
  });

  test("should handle mixed preferences across multiple users", async () => {
    // Set different preferences
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.projectNewConversationNotifyCondition,
      "all_projects"
    );
    await user2.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.projectNewConversationNotifyCondition,
      "never"
    );
    // user3 has no preference (should default to "all_projects")

    const members = [user1, user2, user3];
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.sId).sort()).toEqual(
      [user1.sId, user3.sId].sort()
    );
  });

  test("should handle invalid preference values by defaulting to 'all_projects'", async () => {
    await user1.setMetadata(
      CONVERSATION_NOTIFICATION_METADATA_KEYS.projectNewConversationNotifyCondition,
      "invalid_preference" // Invalid value
    );

    const members = [user1];
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(1);
    expect(result[0].sId).toBe(user1.sId);
  });

  test("should handle empty members array", async () => {
    const members: UserResource[] = [];
    const result = await filterMembersByNotifyCondition(members);

    expect(result).toHaveLength(0);
  });

  test("should verify default condition is 'all_projects'", () => {
    expect(DEFAULT_PROJECT_NEW_CONVERSATION_NOTIFICATION_CONDITION).toBe(
      "all_projects"
    );
  });
});

describe("project-new-conversation workflow functions", () => {
  const mockConversationDetails: ProjectDetailsType = {
    projectName: "Test Project",
    userThatCreatedConversationFullName: "John Doe",
    conversationTitle: "Test Conversation",
    hasConversationRetentionPolicy: false,
    hasAgentRetentionPolicies: false,
    firstMessageContent:
      "Hello, this is a test message with some content that might be long.",
  };

  describe("shouldSkipConversation", () => {
    let workspace: WorkspaceType;
    let space: SpaceResource;
    let user: UserResource;
    let nonMemberUser: UserResource;
    let auth: Authenticator;
    let conversation: ConversationType;
    let payload: ProjectNewConversationPayloadType;

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
        userThatCreatedConversationId: user.sId,
      };
    });

    test("should return true when subscriberId is null", async () => {
      const result = await shouldSkipConversation({
        subscriberId: null,
        payload,
      });

      expect(result).toBe(true);
    });

    test("should return true when conversation is not found", async () => {
      const invalidPayload = {
        ...payload,
        conversationId: "non-existent-conversation-id",
      };

      const result = await shouldSkipConversation({
        subscriberId: user.sId,
        payload: invalidPayload,
      });

      expect(result).toBe(true);
    });

    test("should return true when conversation has been opened by user", async () => {
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

      const result = await shouldSkipConversation({
        subscriberId: user.sId,
        payload,
      });

      expect(result).toBe(true);
    });

    test("should return true when user is a conversation participant", async () => {
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

      const result = await shouldSkipConversation({
        subscriberId: user.sId,
        payload,
      });

      expect(result).toBe(true);
    });

    test("should return true for non-project conversation", async () => {
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

      const result = await shouldSkipConversation({
        subscriberId: user.sId,
        payload: nonProjectPayload,
      });

      expect(result).toBe(true);
    });

    test("should return true when user is not a project member", async () => {
      const result = await shouldSkipConversation({
        subscriberId: nonMemberUser.sId,
        payload,
      });

      expect(result).toBe(true);
    });

    test("should return false when all conditions allow notification", async () => {
      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversation.sId
      );
      if (!conversationResource) {
        throw new Error("Conversation should exist");
      }

      const result = await shouldSkipConversation({
        subscriberId: user.sId,
        payload,
      });

      expect(result).toBe(false);
    });
  });

  describe("getMessagePreviewText", () => {
    test("should return retention policy message for conversation retention", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        hasConversationRetentionPolicy: true,
        hasAgentRetentionPolicies: false,
      };

      const result = getMessagePreviewText(details);

      expect(result).toBe(
        "Preview not available due to data retention policy on conversations in this workspace."
      );
    });

    test("should return retention policy message for agent retention", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        hasConversationRetentionPolicy: false,
        hasAgentRetentionPolicies: true,
      };

      const result = getMessagePreviewText(details);

      expect(result).toBe(
        "Preview not available due to data retention policy on agents in this conversation."
      );
    });

    test("should return undefined when firstMessageContent is null", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        firstMessageContent: null,
      };

      const result = getMessagePreviewText(details);

      expect(result).toBeUndefined();
    });

    test("should return complete content when message is short", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        firstMessageContent: "Short message",
      };

      const result = getMessagePreviewText(details);

      expect(result).toBe("Short message");
    });

    test("should truncate long content at 300 characters", () => {
      const longContent = "A".repeat(350);
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        firstMessageContent: longContent,
      };

      const result = getMessagePreviewText(details);

      expect(result).toBe("A".repeat(300) + "...");
    });

    test("should strip markdown from content", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        firstMessageContent: "**Bold text** and _italic text_",
      };

      const result = getMessagePreviewText(details);

      expect(result).toBe("Bold text and italic text");
    });

    test("should handle whitespace properly", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        firstMessageContent: "   Content with   extra   spaces   ",
      };

      const result = getMessagePreviewText(details);

      expect(result).toBe("Content with   extra   spaces");
    });
  });

  describe("getMessagePreviewForSlack", () => {
    test("should return undefined when getMessagePreviewText returns undefined", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        firstMessageContent: null,
      };

      const result = getMessagePreviewForSlack(details);

      expect(result).toBeUndefined();
    });

    test("should format single line content with blockquote", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        firstMessageContent: "Single line message",
      };

      const result = getMessagePreviewForSlack(details);

      expect(result).toBe("> Single line message");
    });

    test("should format multi-line content with blockquotes", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        firstMessageContent: "Line 1\nLine 2\nLine 3",
      };

      const result = getMessagePreviewForSlack(details);

      expect(result).toBe("> Line 1\n> Line 2\n> Line 3");
    });

    test("should handle empty lines", () => {
      const details: ProjectDetailsType = {
        ...mockConversationDetails,
        firstMessageContent: "Line 1\n\nLine 3",
      };

      const result = getMessagePreviewForSlack(details);

      expect(result).toBe("> Line 1\n> \n> Line 3");
    });
  });
});
