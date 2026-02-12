import { moveConversationToProject } from "@app/lib/api/projects/conversations";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { UserConversationReadsModel } from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { isProjectConversation } from "@app/types/assistant/conversation";
import { beforeEach, describe, expect, it } from "vitest";

describe("moveConversationToProject", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;
  });

  it("moves a non-project conversation to a project and updates its space", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    // Create a project space and add the user as a member.
    const projectSpace = await SpaceFactory.project(workspace);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const projectSpaceGroup = projectSpace.groups.find(
      (g) => g.kind === "regular"
    );
    if (!projectSpaceGroup) {
      throw new Error("Project space regular group not found");
    }
    const addRes = await projectSpaceGroup.dangerouslyAddMember(
      internalAdminAuth,
      {
        user: userJson,
      }
    );
    if (addRes.isErr()) {
      throw new Error(
        `Failed to add user to project space group: ${addRes.error.message}`
      );
    }

    await auth.refresh();

    const result = await moveConversationToProject(auth, {
      conversation,
      spaceId: projectSpace.sId,
    });

    expect(result.isOk()).toBe(true);

    const updatedConversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(updatedConversationResource).not.toBeNull();
    if (!updatedConversationResource) {
      throw new Error("Conversation not found after move");
    }
    const updatedConversation = updatedConversationResource.toJSON();

    // The conversation should now be associated to the project space
    expect(updatedConversation.spaceId).toBe(projectSpace.sId);
    // And its requestedSpaceIds should match the project space
    expect(updatedConversation.requestedSpaceIds).toHaveLength(1);
    expect(updatedConversation.requestedSpaceIds[0]).toBe(projectSpace.sId);
    expect(isProjectConversation(updatedConversation)).toBe(true);
  });

  it("returns unauthorized when user is not a member of the project", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const projectSpace = await SpaceFactory.project(workspace);

    const result = await moveConversationToProject(auth, {
      conversation,
      spaceId: projectSpace.sId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(DustError);
      expect(result.error.code).toBe("unauthorized");
      expect(result.error.message).toBe("User is not a member of the project");
    }
  });

  it("preserves unread status for participants when moving conversation to project", async () => {
    // Create multiple users
    const user1 = auth.getNonNullableUser();
    const user2 = await UserFactory.basic();
    const user3 = await UserFactory.basic();

    // Add users to workspace
    await MembershipFactory.associate(workspace, user2, { role: "user" });
    await MembershipFactory.associate(workspace, user3, { role: "user" });

    // Create authenticators for each user
    const auth1 = auth;
    const auth2 = await Authenticator.fromUserIdAndWorkspaceId(
      user2.sId,
      workspace.sId
    );
    const auth3 = await Authenticator.fromUserIdAndWorkspaceId(
      user3.sId,
      workspace.sId
    );

    // Create agent and conversation
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth1, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth1, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    // Add all users as participants
    // user1 and user2 will be marked as read later, user3 should remain unread
    await ConversationResource.upsertParticipation(auth1, {
      conversation,
      action: "posted",
      user: user1.toJSON(),
    });
    await ConversationResource.upsertParticipation(auth2, {
      conversation,
      action: "posted",
      user: user2.toJSON(),
    });
    // Explicitly set lastReadAt to null for user3 to keep them unread
    await ConversationResource.upsertParticipation(auth3, {
      conversation,
      action: "posted",
      user: user3.toJSON(),
      lastReadAt: null,
    });

    // Get conversation resource to check updatedAt
    const conversationResourceBefore = await ConversationResource.fetchById(
      auth1,
      conversation.sId
    );
    if (!conversationResourceBefore) {
      throw new Error("Conversation not found");
    }
    const oldUpdatedAt = conversationResourceBefore.updatedAt;

    // Mark user1 and user2 as read (they have read the conversation)
    await ConversationResource.markAsReadForAuthUser(auth1, {
      conversation,
    });
    await ConversationResource.markAsReadForAuthUser(auth2, {
      conversation,
    });
    // user3 remains unread (no markAsRead call)

    // Verify initial state: user1 and user2 are read, user3 is unread
    const participantsBefore =
      await conversationResourceBefore.listParticipants(auth1);
    const user1Before = participantsBefore.find((p) => p.sId === user1.sId);
    const user2Before = participantsBefore.find((p) => p.sId === user2.sId);
    const user3Before = participantsBefore.find((p) => p.sId === user3.sId);

    expect(user1Before).toBeDefined();
    expect(user2Before).toBeDefined();
    expect(user3Before).toBeDefined();
    expect(user1Before?.lastReadAt).not.toBeNull();
    expect(user2Before?.lastReadAt).not.toBeNull();
    expect(user3Before?.lastReadAt).toBeNull();

    // Verify user1 and user2 were read (lastReadAt >= oldUpdatedAt)
    if (user1Before?.lastReadAt) {
      expect(user1Before.lastReadAt >= oldUpdatedAt).toBe(true);
    }
    if (user2Before?.lastReadAt) {
      expect(user2Before.lastReadAt >= oldUpdatedAt).toBe(true);
    }

    // Create a project space and add all users as members
    const projectSpace = await SpaceFactory.project(workspace);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const projectSpaceGroup = projectSpace.groups.find(
      (g) => g.kind === "regular"
    );
    if (!projectSpaceGroup) {
      throw new Error("Project space regular group not found");
    }

    // Add all users to the project
    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: user1.toJSON(),
    });
    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: user2.toJSON(),
    });
    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: user3.toJSON(),
    });

    await auth1.refresh();
    await auth2.refresh();
    await auth3.refresh();

    // Move conversation to project
    const result = await moveConversationToProject(auth1, {
      conversation,
      spaceId: projectSpace.sId,
    });

    expect(result.isOk()).toBe(true);

    // Get updated conversation resource
    const conversationResourceAfter = await ConversationResource.fetchById(
      auth1,
      conversation.sId
    );
    if (!conversationResourceAfter) {
      throw new Error("Conversation not found after move");
    }
    const newUpdatedAt = conversationResourceAfter.updatedAt;

    // Verify conversation was moved
    const updatedConversation = conversationResourceAfter.toJSON();
    expect(updatedConversation.spaceId).toBe(projectSpace.sId);
    expect(isProjectConversation(updatedConversation)).toBe(true);

    // Get participants after move
    const participantsAfter =
      await conversationResourceAfter.listParticipants(auth1);
    const user1After = participantsAfter.find((p) => p.sId === user1.sId);
    const user2After = participantsAfter.find((p) => p.sId === user2.sId);
    const user3After = participantsAfter.find((p) => p.sId === user3.sId);

    expect(user1After).toBeDefined();
    expect(user2After).toBeDefined();
    expect(user3After).toBeDefined();

    // Verify user1 and user2 remain read (lastReadAt should be >= newUpdatedAt)
    expect(user1After?.lastReadAt).not.toBeNull();
    expect(user2After?.lastReadAt).not.toBeNull();
    if (user1After?.lastReadAt) {
      // lastReadAt should be close to newUpdatedAt (within a few seconds)
      const timeDiff = Math.abs(
        user1After.lastReadAt.getTime() - newUpdatedAt.getTime()
      );
      expect(timeDiff).toBeLessThan(5000); // Within 5 seconds
      // And should be >= newUpdatedAt (or very close)
      expect(user1After.lastReadAt >= newUpdatedAt || timeDiff < 1000).toBe(
        true
      );
    }
    if (user2After?.lastReadAt) {
      const timeDiff = Math.abs(
        user2After.lastReadAt.getTime() - newUpdatedAt.getTime()
      );
      expect(timeDiff).toBeLessThan(5000);
      expect(user2After.lastReadAt >= newUpdatedAt || timeDiff < 1000).toBe(
        true
      );
    }

    // Verify user3 remains unread (lastReadAt should still be null)
    expect(user3After?.lastReadAt).toBeNull();

    // Verify unread status by checking lastReadAt directly
    // (fetchById doesn't load userParticipation, so toJSON() would default to unread)
    const { lastReadAt: lr1 } =
      await ConversationResource.getActionRequiredAndLastReadAtForUser(
        auth1,
        conversationResourceAfter.id
      );
    const { lastReadAt: lr2 } =
      await ConversationResource.getActionRequiredAndLastReadAtForUser(
        auth2,
        conversationResourceAfter.id
      );
    const { lastReadAt: lr3 } =
      await ConversationResource.getActionRequiredAndLastReadAtForUser(
        auth3,
        conversationResourceAfter.id
      );

    // user1 and user2 should be read (lastReadAt >= newUpdatedAt)
    expect(lr1).not.toBeNull();
    expect(lr2).not.toBeNull();
    if (lr1) {
      expect(
        lr1 >= newUpdatedAt ||
          Math.abs(lr1.getTime() - newUpdatedAt.getTime()) < 1000
      ).toBe(true);
    }
    if (lr2) {
      expect(
        lr2 >= newUpdatedAt ||
          Math.abs(lr2.getTime() - newUpdatedAt.getTime()) < 1000
      ).toBe(true);
    }

    // user3 should be unread (lastReadAt is null)
    expect(lr3).toBeNull();
  });

  it("preserves unread status when some participants have old lastReadAt", async () => {
    // Create users
    const user1 = auth.getNonNullableUser();
    const user2 = await UserFactory.basic();

    await MembershipFactory.associate(workspace, user2, { role: "user" });

    const auth1 = auth;
    const auth2 = await Authenticator.fromUserIdAndWorkspaceId(
      user2.sId,
      workspace.sId
    );

    // Create conversation
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth1);
    const conversation = await ConversationFactory.create(auth1, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    // Add participants
    await ConversationResource.upsertParticipation(auth1, {
      conversation,
      action: "posted",
      user: user1.toJSON(),
    });
    await ConversationResource.upsertParticipation(auth2, {
      conversation,
      action: "posted",
      user: user2.toJSON(),
    });

    // Get conversation resource
    const conversationResource = await ConversationResource.fetchById(
      auth1,
      conversation.sId
    );
    if (!conversationResource) {
      throw new Error("Conversation not found");
    }
    const oldUpdatedAt = conversationResource.updatedAt;

    // Mark user1 as read with a timestamp that's >= oldUpdatedAt
    await ConversationResource.markAsReadForAuthUser(auth1, {
      conversation,
    });

    // Manually set user2's lastReadAt to be before oldUpdatedAt (simulating an old read)
    // This simulates a user who read the conversation a long time ago
    const oldReadTime = new Date(oldUpdatedAt.getTime() - 10000); // 10 seconds before
    await UserConversationReadsModel.upsert({
      conversationId: conversation.id,
      userId: user2.id,
      workspaceId: workspace.id,
      lastReadAt: oldReadTime,
    });

    // Verify initial state
    const participantsBefore =
      await conversationResource.listParticipants(auth1);
    const user1Before = participantsBefore.find((p) => p.sId === user1.sId);
    const user2Before = participantsBefore.find((p) => p.sId === user2.sId);

    expect(user1Before?.lastReadAt).not.toBeNull();
    expect(user2Before?.lastReadAt).not.toBeNull();
    if (user1Before?.lastReadAt) {
      expect(user1Before.lastReadAt >= oldUpdatedAt).toBe(true);
    }
    if (user2Before?.lastReadAt) {
      expect(user2Before.lastReadAt < oldUpdatedAt).toBe(true);
    }

    // Create project and add users
    const projectSpace = await SpaceFactory.project(workspace);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const projectSpaceGroup = projectSpace.groups.find(
      (g) => g.kind === "regular"
    );
    if (!projectSpaceGroup) {
      throw new Error("Project space regular group not found");
    }

    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: user1.toJSON(),
    });
    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: user2.toJSON(),
    });

    await auth1.refresh();
    await auth2.refresh();

    // Move conversation
    const result = await moveConversationToProject(auth1, {
      conversation,
      spaceId: projectSpace.sId,
    });

    expect(result.isOk()).toBe(true);

    // Verify results
    const conversationResourceAfter = await ConversationResource.fetchById(
      auth1,
      conversation.sId
    );
    if (!conversationResourceAfter) {
      throw new Error("Conversation not found after move");
    }
    const newUpdatedAt = conversationResourceAfter.updatedAt;

    const participantsAfter =
      await conversationResourceAfter.listParticipants(auth1);
    const user1After = participantsAfter.find((p) => p.sId === user1.sId);
    const user2After = participantsAfter.find((p) => p.sId === user2.sId);

    // user1 should remain read (was read before move)
    expect(user1After?.lastReadAt).not.toBeNull();
    if (user1After?.lastReadAt) {
      const timeDiff = Math.abs(
        user1After.lastReadAt.getTime() - newUpdatedAt.getTime()
      );
      expect(timeDiff).toBeLessThan(5000);
    }

    // user2 should remain unread (had old read timestamp, so was effectively unread)
    // Their lastReadAt should not have been updated
    expect(user2After?.lastReadAt).not.toBeNull();
    if (user2After?.lastReadAt) {
      // Should still be approximately the old read time (not updated)
      // Allow for small timestamp differences due to database precision
      const timeDiff = Math.abs(
        user2After.lastReadAt.getTime() - oldReadTime.getTime()
      );
      expect(timeDiff).toBeLessThan(1000); // Within 1 second
      // And should be < newUpdatedAt, making them unread
      expect(user2After.lastReadAt < newUpdatedAt).toBe(true);
    }

    // Verify unread status by checking lastReadAt directly
    // (fetchById doesn't load userParticipation, so toJSON() would default to unread)
    const { lastReadAt: lr1 } =
      await ConversationResource.getActionRequiredAndLastReadAtForUser(
        auth1,
        conversationResourceAfter.id
      );
    const { lastReadAt: lr2 } =
      await ConversationResource.getActionRequiredAndLastReadAtForUser(
        auth2,
        conversationResourceAfter.id
      );

    // user1 should be read (lastReadAt >= newUpdatedAt)
    expect(lr1).not.toBeNull();
    if (lr1) {
      expect(
        lr1 >= newUpdatedAt ||
          Math.abs(lr1.getTime() - newUpdatedAt.getTime()) < 1000
      ).toBe(true);
    }

    // user2 should be unread (lastReadAt < newUpdatedAt)
    expect(lr2).not.toBeNull();
    if (lr2) {
      expect(lr2 < newUpdatedAt).toBe(true);
    }
  });
});
