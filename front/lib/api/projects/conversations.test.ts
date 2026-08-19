import { DATABASE_FILE_SYSTEM_POD_PREFIX } from "@app/lib/api/file_system/storage_mode";
import {
  moveConversationOutOfProject,
  moveConversationToProject,
  toPodConversationListItem,
} from "@app/lib/api/projects/conversations";
import { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  AgentMessageModel,
  MessageModel,
  UserConversationReadsModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { ConversationSandboxAdapter } from "@app/lib/resources/conversation_sandbox_adapter";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { isPodConversation } from "@app/types/assistant/conversation";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";
import { Op } from "sequelize";
import { beforeEach, describe, expect, it } from "vitest";

async function fetchRegularAutoGroup(
  space: SpaceResource,
  auth: Authenticator
) {
  const groupReference = space.groups.find((group) => group.isRegularAuto());
  if (!groupReference) {
    return null;
  }
  const [group] = await space.fetchGroupResources(auth, {
    groupReferences: [groupReference],
  });
  return group;
}

async function markConversationAgentMessagesAsSucceeded(
  workspace: WorkspaceType,
  conversationId: ModelId,
  completedAt = new Date()
) {
  const messages = await MessageModel.findAll({
    where: { conversationId, workspaceId: workspace.id },
  });
  const agentMessageIds = messages
    .map((message) => message.agentMessageId)
    .filter((id): id is ModelId => id !== null);

  if (agentMessageIds.length === 0) {
    return;
  }

  await AgentMessageModel.update(
    { status: "succeeded", completedAt },
    {
      where: {
        id: { [Op.in]: agentMessageIds },
        workspaceId: workspace.id,
      },
    }
  );
}

describe("moveConversationToProject", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;
  });

  it("does not move an existing conversation into a database filesystem Pod", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const pod = await SpaceFactory.project(workspace, undefined, {
      name: `${DATABASE_FILE_SYSTEM_POD_PREFIX}Move test`,
    });
    const internalAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const memberGroup = await fetchRegularAutoGroup(pod, internalAuth);
    expect(memberGroup).not.toBeNull();
    await memberGroup?.dangerouslyAddMember(internalAuth, {
      user: auth.getNonNullableUser().toJSON(),
    });
    await auth.refresh();

    const result = await moveConversationToProject(auth, {
      conversation,
      spaceId: pod.sId,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_request_error");
  });

  it("does not move an opted-in standalone conversation into a Pod", async () => {
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    const optInRes = await ConversationResource.inheritDatabaseFileSystem(
      auth,
      conversation.sId
    );
    expect(optInRes.isOk()).toBe(true);
    const pod = await SpaceFactory.project(
      workspace,
      auth.getNonNullableUser().id
    );
    await auth.refresh();

    const result = await moveConversationToProject(auth, {
      conversation,
      spaceId: pod.sId,
    });

    expect(result.isErr() && result.error.code).toBe("invalid_request_error");
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

    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
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
    expect(isPodConversation(updatedConversation)).toBe(true);
  });

  it("destroys the conversation sandbox as part of the move", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    const projectSpace = await SpaceFactory.project(workspace);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
    );
    if (!projectSpaceGroup) {
      throw new Error("Project space regular group not found");
    }
    const addRes = await projectSpaceGroup.dangerouslyAddMember(
      internalAdminAuth,
      { user: auth.getNonNullableUser().toJSON() }
    );
    if (addRes.isErr()) {
      throw new Error(
        `Failed to add user to project space group: ${addRes.error.message}`
      );
    }
    await auth.refresh();
    await SandboxFactory.create(auth, conversation);

    const result = await moveConversationToProject(auth, {
      conversation,
      spaceId: projectSpace.sId,
    });

    expect(result.isOk()).toBe(true);
    // The scope transition strictly destroys the sandbox under the lifecycle
    // lock before the association changes: egress claims, pod env vars, and
    // mounts are all creation-time state, so the next Computer command must
    // rebuild the sandbox from the conversation's new scope. The row survives
    // as deleted with its owner link intact for the in-place recreate.
    const sandbox = await ConversationSandboxAdapter.fetchSandbox(
      auth,
      conversation
    );
    expect(sandbox?.status).toBe("deleted");
    expect(sandbox?.killRequestedAt).toEqual(expect.any(Date));
  });

  it("returns conversation_agent_running when an agent loop is running", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const projectSpace = await SpaceFactory.project(workspace);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
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
      conversation: { ...conversation, isRunningAgentLoop: true },
      spaceId: projectSpace.sId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(DustError);
      expect(result.error.code).toBe("conversation_agent_running");
      expect(result.error.message).toContain(
        "Wait for the agent to finish before moving this conversation."
      );
    }

    const updatedConversationResource = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    expect(updatedConversationResource?.spaceId).toBeNull();
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
      expect(result.error.message).toContain("You must be a member of");
      expect(result.error.message).toContain(projectSpace.name);
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
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
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
    expect(isPodConversation(updatedConversation)).toBe(true);

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
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
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

  it("moves a conversation from one project to another when user is an editor of the source project", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    // Create source project with user as editor
    const sourceProject = await SpaceFactory.project(workspace, user.id);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    // Create destination project and add user as member
    const destinationProject = await SpaceFactory.project(workspace);
    const destinationProjectGroup = await fetchRegularAutoGroup(
      destinationProject,
      internalAdminAuth
    );
    if (!destinationProjectGroup) {
      throw new Error("Destination project regular group not found");
    }
    await destinationProjectGroup.dangerouslyAddMember(internalAdminAuth, {
      user: userJson,
    });

    // Create conversation in source project
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: sourceProject.id,
    });

    await auth.refresh();

    // Move conversation from source project to destination project
    const result = await moveConversationToProject(auth, {
      conversation,
      spaceId: destinationProject.sId,
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

    // The conversation should now be associated to the destination project
    expect(updatedConversation.spaceId).toBe(destinationProject.sId);
    expect(updatedConversation.requestedSpaceIds).toHaveLength(1);
    expect(updatedConversation.requestedSpaceIds[0]).toBe(
      destinationProject.sId
    );
    expect(isPodConversation(updatedConversation)).toBe(true);
  });

  it("returns unauthorized when moving conversation from one project to another and user is not an editor of the source project", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    // Create another user who will be the editor of the source project
    const editorUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editorUser, { role: "user" });

    // Create source project with editorUser as editor (not the current user)
    const sourceProject = await SpaceFactory.project(workspace, editorUser.id);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    // Add current user as member (but not editor) of source project
    const sourceProjectGroup = await fetchRegularAutoGroup(
      sourceProject,
      internalAdminAuth
    );
    if (!sourceProjectGroup) {
      throw new Error("Source project regular group not found");
    }
    await sourceProjectGroup.dangerouslyAddMember(internalAdminAuth, {
      user: userJson,
    });

    // Create destination project and add user as member
    const destinationProject = await SpaceFactory.project(workspace);
    const destinationProjectGroup = await fetchRegularAutoGroup(
      destinationProject,
      internalAdminAuth
    );
    if (!destinationProjectGroup) {
      throw new Error("Destination project regular group not found");
    }
    await destinationProjectGroup.dangerouslyAddMember(internalAdminAuth, {
      user: userJson,
    });

    // Create conversation in source project
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: sourceProject.id,
    });

    await auth.refresh();

    // Try to move conversation from source project to destination project
    const result = await moveConversationToProject(auth, {
      conversation,
      spaceId: destinationProject.sId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(DustError);
      expect(result.error.code).toBe("unauthorized");
      expect(result.error.message).toContain("You must be an editor of");
      expect(result.error.message).toContain(sourceProject.name);
    }
  });

  it("returns internal_error when trying to move conversation to the same project", async () => {
    const user = auth.getNonNullableUser();
    const userJson = user.toJSON();

    // Create project with user as editor
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    // Add user as member of the project
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
    );
    if (!projectSpaceGroup) {
      throw new Error("Project space regular group not found");
    }
    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: userJson,
    });

    // Create conversation in the project
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
    });

    await auth.refresh();

    // Try to move conversation to the same project
    const result = await moveConversationToProject(auth, {
      conversation,
      spaceId: projectSpace.sId,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(DustError);
      expect(result.error.code).toBe("internal_error");
      expect(result.error.message).toBe(
        "Conversation is already in the project"
      );
    }
  });
});

describe("moveConversationOutOfProject", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;
  });

  it("does not move a conversation out of a database filesystem Pod", async () => {
    const user = auth.getNonNullableUser();
    const pod = await SpaceFactory.project(workspace, user.id, {
      name: `${DATABASE_FILE_SYSTEM_POD_PREFIX}Move out test`,
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
      spaceId: pod.id,
    });
    await auth.refresh();

    const result = await moveConversationOutOfProject(auth, { conversation });

    expect(result.isErr() && result.error.code).toBe("invalid_request_error");
  });

  it("moves a project conversation out and clears its spaceId", async () => {
    const user = auth.getNonNullableUser();

    // Create project with user as editor and add user as member.
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
    );
    if (!projectSpaceGroup) {
      throw new Error("Project space regular group not found");
    }
    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: user.toJSON(),
    });

    // Create conversation in the project.
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
    });

    await auth.refresh();

    // Verify conversation is in the project.
    expect(isPodConversation(conversation)).toBe(true);

    const result = await moveConversationOutOfProject(auth, {
      conversation,
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

    // The conversation should no longer be associated to a project.
    expect(updatedConversation.spaceId).toBeNull();
    expect(isPodConversation(updatedConversation)).toBe(false);
  });

  it("destroys the sandbox so the Pod's scope, env, and secrets are dropped", async () => {
    const user = auth.getNonNullableUser();
    const projectSpace = await SpaceFactory.project(workspace, user.id);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
    );
    if (!projectSpaceGroup) {
      throw new Error("Project space regular group not found");
    }
    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: user.toJSON(),
    });
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
    });
    await auth.refresh();
    await SandboxFactory.create(auth, conversation);

    const result = await moveConversationOutOfProject(auth, {
      conversation,
    });

    expect(result.isOk()).toBe(true);
    const sandbox = await ConversationSandboxAdapter.fetchSandbox(
      auth,
      conversation
    );
    expect(sandbox?.status).toBe("deleted");
    expect(sandbox?.killRequestedAt).toEqual(expect.any(Date));
  });

  it("validates against the conversation's current state, not the caller's snapshot", async () => {
    // The caller's snapshot claims the conversation is in a pod (as a
    // concurrent move could make true stale), but the database says
    // standalone. Validation must run against the under-lock re-fetch, fail
    // the move, and leave the sandbox untouched.
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });
    await SandboxFactory.create(auth, conversation);
    const staleSnapshot = {
      ...conversation,
      spaceId: generateRandomModelSId("spc"),
    };

    const result = await moveConversationOutOfProject(auth, {
      conversation: staleSnapshot,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("internal_error");
    }
    const sandbox = await ConversationSandboxAdapter.fetchSandbox(
      auth,
      conversation
    );
    expect(sandbox?.status).toBe("running");
    expect(sandbox?.killRequestedAt).toBeNull();
  });

  it("returns internal_error when conversation is not in a project", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    const result = await moveConversationOutOfProject(auth, {
      conversation,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(DustError);
      expect(result.error.code).toBe("internal_error");
      expect(result.error.message).toBe("Conversation is not in a project");
    }
  });

  it("returns unauthorized when user is not an editor of the project", async () => {
    const user = auth.getNonNullableUser();

    // Create another user who will be the editor of the project.
    const editorUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editorUser, { role: "user" });

    // Create project with editorUser as editor (not the current user).
    const projectSpace = await SpaceFactory.project(workspace, editorUser.id);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    // Add current user as member (but not editor) of project.
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
    );
    if (!projectSpaceGroup) {
      throw new Error("Project space regular group not found");
    }
    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: user.toJSON(),
    });

    // Create conversation in the project.
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
    });

    await auth.refresh();

    const result = await moveConversationOutOfProject(auth, {
      conversation,
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBeInstanceOf(DustError);
      expect(result.error.code).toBe("unauthorized");
      expect(result.error.message).toContain("You must be an editor of");
      expect(result.error.message).toContain(projectSpace.name);
    }
  });

  it("preserves unread status for participants when moving conversation out of project", async () => {
    // Create multiple users.
    const user1 = auth.getNonNullableUser();
    const user2 = await UserFactory.basic();
    const user3 = await UserFactory.basic();

    // Add users to workspace.
    await MembershipFactory.associate(workspace, user2, { role: "user" });
    await MembershipFactory.associate(workspace, user3, { role: "user" });

    // Create authenticators for each user.
    const auth1 = auth;
    const auth2 = await Authenticator.fromUserIdAndWorkspaceId(
      user2.sId,
      workspace.sId
    );
    const auth3 = await Authenticator.fromUserIdAndWorkspaceId(
      user3.sId,
      workspace.sId
    );

    // Create project with user1 as editor and add all users as members.
    const projectSpace = await SpaceFactory.project(workspace, user1.id);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
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
    await projectSpaceGroup.dangerouslyAddMember(internalAdminAuth, {
      user: user3.toJSON(),
    });

    await auth1.refresh();
    await auth2.refresh();
    await auth3.refresh();

    // Create agent and conversation in the project.
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth1, {
      name: "Test Agent",
      description: "Test Agent Description",
    });

    const conversation = await ConversationFactory.create(auth1, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
    });

    // Add all users as participants.
    // user1 and user2 will be marked as read later, user3 should remain unread.
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
    // Explicitly set lastReadAt to null for user3 to keep them unread.
    await ConversationResource.upsertParticipation(auth3, {
      conversation,
      action: "posted",
      user: user3.toJSON(),
      lastReadAt: null,
    });

    // Get conversation resource to check updatedAt.
    const conversationResourceBefore = await ConversationResource.fetchById(
      auth1,
      conversation.sId
    );
    if (!conversationResourceBefore) {
      throw new Error("Conversation not found");
    }
    const oldUpdatedAt = conversationResourceBefore.updatedAt;

    // Mark user1 and user2 as read (they have read the conversation).
    await ConversationResource.markAsReadForAuthUser(auth1, {
      conversation,
    });
    await ConversationResource.markAsReadForAuthUser(auth2, {
      conversation,
    });
    // user3 remains unread (no markAsRead call).

    // Verify initial state: user1 and user2 are read, user3 is unread.
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

    if (user1Before?.lastReadAt) {
      expect(user1Before.lastReadAt >= oldUpdatedAt).toBe(true);
    }
    if (user2Before?.lastReadAt) {
      expect(user2Before.lastReadAt >= oldUpdatedAt).toBe(true);
    }

    // Move conversation out of the project.
    const result = await moveConversationOutOfProject(auth1, {
      conversation,
    });

    expect(result.isOk()).toBe(true);

    // Get updated conversation resource.
    const conversationResourceAfter = await ConversationResource.fetchById(
      auth1,
      conversation.sId
    );
    if (!conversationResourceAfter) {
      throw new Error("Conversation not found after move");
    }
    const newUpdatedAt = conversationResourceAfter.updatedAt;

    // Verify conversation was moved out.
    const updatedConversation = conversationResourceAfter.toJSON();
    expect(updatedConversation.spaceId).toBeNull();
    expect(isPodConversation(updatedConversation)).toBe(false);

    // Get participants after move.
    const participantsAfter =
      await conversationResourceAfter.listParticipants(auth1);
    const user1After = participantsAfter.find((p) => p.sId === user1.sId);
    const user2After = participantsAfter.find((p) => p.sId === user2.sId);
    const user3After = participantsAfter.find((p) => p.sId === user3.sId);

    expect(user1After).toBeDefined();
    expect(user2After).toBeDefined();
    expect(user3After).toBeDefined();

    // Verify user1 and user2 remain read (lastReadAt should be >= newUpdatedAt).
    expect(user1After?.lastReadAt).not.toBeNull();
    expect(user2After?.lastReadAt).not.toBeNull();
    if (user1After?.lastReadAt) {
      expect(user1After.lastReadAt >= newUpdatedAt).toBe(true);
    }
    if (user2After?.lastReadAt) {
      expect(user2After.lastReadAt >= newUpdatedAt).toBe(true);
    }

    // Verify user3 remains unread (lastReadAt should still be null).
    expect(user3After?.lastReadAt).toBeNull();
  });

  it("preserves unread status when some participants have old lastReadAt", async () => {
    // Create users.
    const user1 = auth.getNonNullableUser();
    const user2 = await UserFactory.basic();

    await MembershipFactory.associate(workspace, user2, { role: "user" });

    const auth1 = auth;
    const auth2 = await Authenticator.fromUserIdAndWorkspaceId(
      user2.sId,
      workspace.sId
    );

    // Create project with user1 as editor and add both users as members.
    const projectSpace = await SpaceFactory.project(workspace, user1.id);
    const internalAdminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const projectSpaceGroup = await fetchRegularAutoGroup(
      projectSpace,
      internalAdminAuth
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

    // Create conversation in the project.
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth1);
    const conversation = await ConversationFactory.create(auth1, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: projectSpace.id,
    });

    // Add participants.
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

    // Get conversation resource.
    const conversationResource = await ConversationResource.fetchById(
      auth1,
      conversation.sId
    );
    if (!conversationResource) {
      throw new Error("Conversation not found");
    }
    const oldUpdatedAt = conversationResource.updatedAt;

    // Mark user1 as read with a timestamp that's >= oldUpdatedAt.
    await ConversationResource.markAsReadForAuthUser(auth1, {
      conversation,
    });

    // Manually set user2's lastReadAt to be before oldUpdatedAt (simulating an old read).
    const oldReadTime = new Date(oldUpdatedAt.getTime() - 10000); // 10 seconds before
    await UserConversationReadsModel.upsert({
      conversationId: conversation.id,
      userId: user2.id,
      workspaceId: workspace.id,
      lastReadAt: oldReadTime,
    });

    // Move conversation out of the project.
    const result = await moveConversationOutOfProject(auth1, {
      conversation,
    });

    expect(result.isOk()).toBe(true);

    // Verify results.
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

    // user1 should remain read (was read before move).
    expect(user1After?.lastReadAt).not.toBeNull();
    if (user1After?.lastReadAt) {
      expect(user1After.lastReadAt >= newUpdatedAt).toBe(true);
    }

    // user2 should remain unread (had old read timestamp, so was effectively unread).
    // Their lastReadAt should not have been updated.
    expect(user2After?.lastReadAt).not.toBeNull();
    if (user2After?.lastReadAt) {
      expect(user2After.lastReadAt < newUpdatedAt).toBe(true);
    }
  });
});

describe("toPodConversationListItem", () => {
  let auth: Authenticator;
  let workspace: Awaited<ReturnType<typeof createResourceTest>>["workspace"];

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    workspace = setup.workspace;
  });

  it("returns an empty array when no conversations are provided", async () => {
    const result = await toPodConversationListItem(auth, { conversations: [] });
    expect(result).toEqual([]);
  });

  it("maps conversations with user and succeeded agent messages to list items", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Pod List Agent",
    });

    const conversationType = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date("2024-06-01T10:00:00Z")],
    });

    await markConversationAgentMessagesAsSucceeded(
      workspace,
      conversationType.id
    );

    const [conversationResource] =
      await ConversationResource.fetchByIdsWithReadState(auth, [
        conversationType.sId,
      ]);
    if (!conversationResource) {
      throw new Error("Conversation not found");
    }

    const [item] = await toPodConversationListItem(auth, {
      conversations: [conversationResource],
    });

    expect(item.id).toBe(conversationType.sId);
    expect(item.title).toBe("Test Conversation");
    expect(item.description).toBe("Test user Message.");
    expect(item.replyCount).toBe(1);
    expect(item.creator).toMatchObject({
      name: expect.any(String),
      visual: expect.any(String),
      isRounded: true,
    });
    expect(item.avatars).toHaveLength(1);
    expect(item.avatars[0]).toMatchObject({
      name: "Pod List Agent",
      visual: agentConfig.pictureUrl,
      isRounded: false,
    });
    expect(item.isRunningAgentLoop).toBe(false);
    expect(item.created).toBe(conversationResource.createdAt.getTime());
    expect(item.updated).toBe(conversationResource.updatedAt.getTime());
  });

  it("excludes agent messages that have not succeeded", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);

    const conversationType = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date("2024-06-01T10:00:00Z")],
    });

    const [conversationResource] =
      await ConversationResource.fetchByIdsWithReadState(auth, [
        conversationType.sId,
      ]);
    if (!conversationResource) {
      throw new Error("Conversation not found");
    }

    const [item] = await toPodConversationListItem(auth, {
      conversations: [conversationResource],
    });

    expect(item.replyCount).toBe(0);
    expect(item.avatars).toHaveLength(0);
  });

  it("excludes user messages with hidden origins", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);

    const conversationType = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation: conversationType,
      content: "Hidden anchor message",
      origin: "project_kickoff",
      rank: 0,
    });

    const [conversationResource] =
      await ConversationResource.fetchByIdsWithReadState(auth, [
        conversationType.sId,
      ]);
    if (!conversationResource) {
      throw new Error("Conversation not found");
    }

    const [item] = await toPodConversationListItem(auth, {
      conversations: [conversationResource],
    });

    expect(item.description).toBe("");
    expect(item.replyCount).toBe(0);
    expect(item.creator).toBeUndefined();
  });

  it("keeps only the latest version per message rank", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Latest Version Agent",
    });

    const conversationType = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
    });

    await ConversationFactory.createUserMessage({
      auth,
      workspace,
      conversation: conversationType,
      content: "Visible user message",
      rank: 0,
    });

    const oldAgentMessage = await AgentMessageModel.create({
      status: "succeeded",
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: agentConfig.version,
      conversationId: conversationType.id,
      workspaceId: workspace.id,
      skipToolsValidation: false,
      completedAt: new Date("2024-06-01T10:00:00Z"),
    });
    await MessageModel.create({
      sId: generateRandomModelSId(),
      rank: 1,
      version: 0,
      conversationId: conversationType.id,
      parentId: null,
      agentMessageId: oldAgentMessage.id,
      workspaceId: workspace.id,
    });

    const newAgentMessage = await AgentMessageModel.create({
      status: "succeeded",
      agentConfigurationId: agentConfig.sId,
      agentConfigurationVersion: agentConfig.version,
      conversationId: conversationType.id,
      workspaceId: workspace.id,
      skipToolsValidation: false,
      completedAt: new Date("2024-06-01T11:00:00Z"),
    });
    await MessageModel.create({
      sId: generateRandomModelSId(),
      rank: 1,
      version: 1,
      conversationId: conversationType.id,
      parentId: null,
      agentMessageId: newAgentMessage.id,
      workspaceId: workspace.id,
    });

    const [conversationResource] =
      await ConversationResource.fetchByIdsWithReadState(auth, [
        conversationType.sId,
      ]);
    if (!conversationResource) {
      throw new Error("Conversation not found");
    }

    const [item] = await toPodConversationListItem(auth, {
      conversations: [conversationResource],
    });

    expect(item.replyCount).toBe(1);
    expect(item.avatars).toHaveLength(1);
    expect(item.avatars[0]?.name).toBe("Latest Version Agent");
  });

  it("computes unreadMessageCount from the user's last read timestamp", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);
    const messageTime = new Date("2024-06-01T12:00:00Z");

    const conversationType = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [messageTime],
    });

    await markConversationAgentMessagesAsSucceeded(
      workspace,
      conversationType.id,
      messageTime
    );

    const user = auth.getNonNullableUser();
    await UserConversationReadsModel.upsert({
      conversationId: conversationType.id,
      userId: user.id,
      workspaceId: workspace.id,
      lastReadAt: new Date("2024-06-01T10:00:00Z"),
    });

    const [conversationResource] =
      await ConversationResource.fetchByIdsWithReadState(auth, [
        conversationType.sId,
      ]);
    if (!conversationResource) {
      throw new Error("Conversation not found");
    }

    const [item] = await toPodConversationListItem(auth, {
      conversations: [conversationResource],
    });

    expect(item.unreadMessageCount).toBe(2);

    await ConversationResource.markAsReadForAuthUser(auth, {
      conversation: conversationType,
    });

    const [readConversationResource] =
      await ConversationResource.fetchByIdsWithReadState(auth, [
        conversationType.sId,
      ]);
    if (!readConversationResource) {
      throw new Error("Conversation not found after mark as read");
    }

    const [readItem] = await toPodConversationListItem(auth, {
      conversations: [readConversationResource],
    });

    expect(readItem.unreadMessageCount).toBe(0);
  });

  it("maps multiple conversations in a single call", async () => {
    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth);

    const firstConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date("2024-06-01T10:00:00Z")],
    });
    const secondConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date("2024-06-02T10:00:00Z")],
    });

    await markConversationAgentMessagesAsSucceeded(
      workspace,
      firstConversation.id
    );
    await markConversationAgentMessagesAsSucceeded(
      workspace,
      secondConversation.id
    );

    const conversationResources =
      await ConversationResource.fetchByIdsWithReadState(auth, [
        firstConversation.sId,
        secondConversation.sId,
      ]);

    const items = await toPodConversationListItem(auth, {
      conversations: conversationResources,
    });

    expect(items).toHaveLength(2);
    expect(items.map((item) => item.id).sort()).toEqual(
      [firstConversation.sId, secondConversation.sId].sort()
    );
  });
});
