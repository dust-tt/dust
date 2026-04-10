import { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  ConversationModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { ModelId } from "@app/types/shared/model_id";
import type { WorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it } from "vitest";

async function makeConversation(
  workspace: WorkspaceType,
  title: string,
  {
    requestedSpaceIds = [],
    spaceId = null,
  }: {
    requestedSpaceIds?: ModelId[];
    spaceId?: ModelId | null;
  } = {}
): Promise<ConversationResource> {
  const conversation = await ConversationModel.create({
    workspaceId: workspace.id,
    sId: generateRandomModelSId(),
    title,
    requestedSpaceIds,
    spaceId,
  });

  return new ConversationResource(
    ConversationResource.model,
    conversation.get(),
    null
  );
}

async function makeSourceAgentMessage({
  auth,
  conversationModelId,
}: {
  auth: Authenticator;
  conversationModelId: ModelId;
}): Promise<MessageModel> {
  const workspace = auth.getNonNullableWorkspace();

  const agentMessage = await AgentMessageModel.create({
    workspaceId: workspace.id,
    agentConfigurationId: "agent-configuration-id",
    agentConfigurationVersion: 0,
    skipToolsValidation: false,
  });

  return MessageModel.create({
    workspaceId: workspace.id,
    sId: generateRandomModelSId(),
    rank: 1,
    conversationId: conversationModelId,
    parentId: null,
    userMessageId: null,
    agentMessageId: agentMessage.id,
    contentFragmentId: null,
  });
}

async function makeUserMessage({
  auth,
  conversationModelId,
}: {
  auth: Authenticator;
  conversationModelId: ModelId;
}): Promise<MessageModel> {
  const workspace = auth.getNonNullableWorkspace();
  const user = auth.getNonNullableUser();

  const userMessage = await UserMessageModel.create({
    userId: user.id,
    workspaceId: workspace.id,
    content: "Source message",
    userContextUsername: "testuser",
    userContextTimezone: "UTC",
    userContextFullName: "Test User",
    userContextEmail: "test@example.com",
    userContextProfilePictureUrl: null,
    userContextOrigin: "web",
    clientSideMCPServerIds: [],
  });

  return MessageModel.create({
    workspaceId: workspace.id,
    sId: generateRandomModelSId(),
    rank: 0,
    conversationId: conversationModelId,
    parentId: null,
    userMessageId: userMessage.id,
    agentMessageId: null,
    contentFragmentId: null,
  });
}

describe("ConversationForkResource", () => {
  let workspace: Awaited<ReturnType<typeof WorkspaceFactory.basic>>;
  let auth: Authenticator;
  let user: Awaited<ReturnType<typeof UserFactory.basic>>;
  let parentConversation: ConversationResource;
  let childConversation: ConversationResource;
  let sourceMessage: MessageModel;

  beforeEach(async () => {
    workspace = await WorkspaceFactory.basic();
    user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "user" });
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    parentConversation = await makeConversation(workspace, "Parent");
    childConversation = await makeConversation(workspace, "Child");
    sourceMessage = await makeSourceAgentMessage({
      auth,
      conversationModelId: parentConversation.id,
    });
  });

  it("creates a fork attributed to the authenticated user", async () => {
    const branchedAt = new Date("2026-04-10T10:00:00.000Z");

    const fork = await ConversationForkResource.makeNew(auth, {
      parentConversation,
      childConversation,
      sourceMessageModelId: sourceMessage.id,
      branchedAt,
    });

    expect(fork.sId).toMatch(/^cfk_/);
    expect(fork.workspaceId).toBe(workspace.id);
    expect(fork.parentConversationId).toBe(parentConversation.id);
    expect(fork.childConversationId).toBe(childConversation.id);
    expect(fork.createdByUserId).toBe(user.id);
    expect(fork.sourceMessageId).toBe(sourceMessage.id);

    expect(fork.toJSON()).toMatchObject({
      id: fork.id,
      sId: fork.sId,
      parentConversationId: parentConversation.sId,
      parentConversationModelId: parentConversation.id,
      childConversationId: childConversation.sId,
      childConversationModelId: childConversation.id,
      createdByUserId: user.sId,
      createdByUserModelId: user.id,
      sourceMessageId: sourceMessage.sId,
      sourceMessageModelId: sourceMessage.id,
      branchedAt: branchedAt.getTime(),
    });
  });

  it("fetches forks by child conversation ids within the authenticated workspace", async () => {
    const fork = await ConversationForkResource.makeNew(auth, {
      parentConversation,
      childConversation,
      sourceMessageModelId: sourceMessage.id,
      branchedAt: new Date("2026-04-10T10:00:00.000Z"),
    });

    const otherWorkspace = await WorkspaceFactory.basic();
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(otherWorkspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      otherWorkspace.sId
    );
    const otherParent = await makeConversation(otherWorkspace, "Other parent");
    const otherChild = await makeConversation(otherWorkspace, "Other child");
    const otherSourceMessage = await makeSourceAgentMessage({
      auth: otherAuth,
      conversationModelId: otherParent.id,
    });

    await ConversationForkResource.makeNew(otherAuth, {
      parentConversation: otherParent,
      childConversation: otherChild,
      sourceMessageModelId: otherSourceMessage.id,
      branchedAt: new Date("2026-04-10T11:00:00.000Z"),
    });

    const fetched = await ConversationForkResource.fetchByChildConversationIds(
      auth,
      [childConversation.sId, otherChild.sId]
    );

    expect(fetched).toHaveLength(1);
    expect(fetched[0].id).toBe(fork.id);
  });

  it("filters sId fetches by parent and child conversation permissions", async () => {
    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    let adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const addMembersRes = await restrictedSpace.addMembers(adminAuth, {
      userIds: [adminUser.sId],
    });
    expect(addMembersRes.isOk()).toBe(true);
    adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    const restrictedParentConversation = await makeConversation(
      workspace,
      "Restricted parent",
      {
        requestedSpaceIds: [restrictedSpace.id],
        spaceId: restrictedSpace.id,
      }
    );
    const restrictedChildConversation = await makeConversation(
      workspace,
      "Restricted child",
      {
        requestedSpaceIds: [restrictedSpace.id],
        spaceId: restrictedSpace.id,
      }
    );
    const restrictedSourceMessage = await makeSourceAgentMessage({
      auth: adminAuth,
      conversationModelId: restrictedParentConversation.id,
    });

    const fork = await ConversationForkResource.makeNew(adminAuth, {
      parentConversation: restrictedParentConversation,
      childConversation: restrictedChildConversation,
      sourceMessageModelId: restrictedSourceMessage.id,
      branchedAt: new Date("2026-04-10T10:00:00.000Z"),
    });

    const adminFetchedByChild =
      await ConversationForkResource.fetchByChildConversationIds(adminAuth, [
        restrictedChildConversation.sId,
      ]);
    expect(adminFetchedByChild.map((f) => f.id)).toEqual([fork.id]);
    await expect(
      ConversationForkResource.fetchById(auth, fork.sId)
    ).resolves.toBeNull();
    await expect(
      ConversationForkResource.fetchByChildConversationIds(auth, [
        restrictedChildConversation.sId,
      ])
    ).resolves.toEqual([]);
    await expect(
      ConversationForkResource.listByParentConversationModelId(
        auth,
        restrictedParentConversation.id
      )
    ).resolves.toEqual([]);
  });

  it("lists forks from a parent conversation from newest to oldest", async () => {
    const firstChild = childConversation;
    const secondChild = await makeConversation(workspace, "Second child");

    await ConversationForkResource.makeNew(auth, {
      parentConversation,
      childConversation: firstChild,
      sourceMessageModelId: sourceMessage.id,
      branchedAt: new Date("2026-04-10T10:00:00.000Z"),
    });
    await ConversationForkResource.makeNew(auth, {
      parentConversation,
      childConversation: secondChild,
      sourceMessageModelId: sourceMessage.id,
      branchedAt: new Date("2026-04-10T11:00:00.000Z"),
    });

    const forks =
      await ConversationForkResource.listByParentConversationModelId(
        auth,
        parentConversation.id
      );

    expect(forks.map((f) => f.childConversationId)).toEqual([
      secondChild.id,
      firstChild.id,
    ]);
  });

  it("rejects source messages outside the parent conversation", async () => {
    const wrongSourceMessage = await makeSourceAgentMessage({
      auth,
      conversationModelId: childConversation.id,
    });
    const secondChild = await makeConversation(workspace, "Second child");

    await expect(
      ConversationForkResource.makeNew(auth, {
        parentConversation,
        childConversation: secondChild,
        sourceMessageModelId: wrongSourceMessage.id,
        branchedAt: new Date("2026-04-10T10:00:00.000Z"),
      })
    ).rejects.toThrow(
      "Cannot create a conversation fork from a missing source agent message."
    );
  });

  it("rejects source messages that are not agent messages", async () => {
    const userMessage = await makeUserMessage({
      auth,
      conversationModelId: parentConversation.id,
    });
    const secondChild = await makeConversation(workspace, "Second child");

    await expect(
      ConversationForkResource.makeNew(auth, {
        parentConversation,
        childConversation: secondChild,
        sourceMessageModelId: userMessage.id,
        branchedAt: new Date("2026-04-10T10:00:00.000Z"),
      })
    ).rejects.toThrow(
      "Cannot create a conversation fork from a missing source agent message."
    );
  });

  it("deletes fork rows by source message model ids", async () => {
    await ConversationForkResource.makeNew(auth, {
      parentConversation,
      childConversation,
      sourceMessageModelId: sourceMessage.id,
      branchedAt: new Date("2026-04-10T10:00:00.000Z"),
    });

    const deletedCount =
      await ConversationForkResource.deleteBySourceMessageModelIds(auth, {
        sourceMessageModelIds: [sourceMessage.id],
      });

    expect(deletedCount).toBe(1);
    const fetched = await ConversationForkResource.fetchByChildConversationIds(
      auth,
      [childConversation.sId]
    );
    expect(fetched).toEqual([]);
  });

  it("deletes fork rows where a conversation is either parent or child", async () => {
    const grandParentConversation = await makeConversation(
      workspace,
      "Grand parent"
    );
    const grandParentSourceMessage = await makeSourceAgentMessage({
      auth,
      conversationModelId: grandParentConversation.id,
    });

    await ConversationForkResource.makeNew(auth, {
      parentConversation: grandParentConversation,
      childConversation: parentConversation,
      sourceMessageModelId: grandParentSourceMessage.id,
      branchedAt: new Date("2026-04-10T09:00:00.000Z"),
    });
    await ConversationForkResource.makeNew(auth, {
      parentConversation,
      childConversation,
      sourceMessageModelId: sourceMessage.id,
      branchedAt: new Date("2026-04-10T10:00:00.000Z"),
    });

    const deletedCount =
      await ConversationForkResource.deleteForConversationModelId(auth, {
        conversationModelId: parentConversation.id,
      });

    expect(deletedCount).toBe(2);
    const fetched = await ConversationForkResource.fetchByChildConversationIds(
      auth,
      [parentConversation.sId, childConversation.sId]
    );
    expect(fetched).toEqual([]);
  });

  it("deletes fork rows in the authenticated workspace", async () => {
    const fork = await ConversationForkResource.makeNew(auth, {
      parentConversation,
      childConversation,
      sourceMessageModelId: sourceMessage.id,
      branchedAt: new Date("2026-04-10T10:00:00.000Z"),
    });

    const deleteResult = await fork.delete(auth, {});
    expect(deleteResult.isOk()).toBe(true);

    const fetched = await ConversationForkResource.fetchById(auth, fork.sId);
    expect(fetched).toBeNull();
  });
});
