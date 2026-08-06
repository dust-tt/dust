import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ActivationPodFactory } from "@app/tests/utils/ActivationPodFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { getConversationUrlAccessMode } from "@app/types/assistant/conversation";
import { honoApp } from "@front-api/app";
import { assert, describe, expect, it } from "vitest";

async function setupUserRequestWithConversation({
  privateByDefaultEnabled,
}: {
  privateByDefaultEnabled: boolean;
}) {
  const { workspace, auth, user, globalSpace } =
    await createPrivateApiMockRequest({
      role: "user",
      method: "GET",
    });

  const adminUser = await UserFactory.basic();
  await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
  const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
    adminUser.sId,
    workspace.sId
  );

  const conversation = await ConversationFactory.create(adminAuth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    requestedSpaceIds: [globalSpace.id],
    messagesCreatedAt: [new Date()],
  });

  const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
    privateConversationUrlsByDefault: privateByDefaultEnabled,
  });
  assert(
    updateResult.isOk(),
    "Failed to update private conversation URLs setting"
  );

  return { workspace, auth, user, conversation };
}

function getConversation(workspace: { sId: string }, cId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}`
  );
}

function patchConversation(
  workspace: { sId: string },
  cId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/w/:wId/assistant/conversations/:cId", () => {
  it("returns 200 for non-participants when private conversation URLs are disabled", async () => {
    const { workspace, conversation } = await setupUserRequestWithConversation({
      privateByDefaultEnabled: false,
    });

    const response = await getConversation(workspace, conversation.sId);

    expect(response.status).toBe(200);
  });

  it("returns 404 conversation_not_found for non-participants when private conversation URLs are enabled", async () => {
    const { workspace, conversation } = await setupUserRequestWithConversation({
      privateByDefaultEnabled: true,
    });

    const response = await getConversation(workspace, conversation.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("conversation_not_found");
  });

  it("returns 200 for participants when private conversation URLs are enabled", async () => {
    const { workspace, auth, user, conversation } =
      await setupUserRequestWithConversation({
        privateByDefaultEnabled: true,
      });

    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: user.toJSON(),
      lastReadAt: null,
    });

    const response = await getConversation(workspace, conversation.sId);

    expect(response.status).toBe(200);
  });

  it("returns 200 for project conversations for non-participants when private conversation URLs are enabled", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
      method: "GET",
    });

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    const projectSpace = await SpaceFactory.project(workspace, adminUser.id);
    const addMemberResult = await projectSpace.addMembers(adminAuth, {
      userIds: [adminUser.sId, user.sId],
    });
    assert(addMemberResult.isOk(), "Failed to add users to project space");
    const refreshedAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    const conversation = await ConversationFactory.create(refreshedAdminAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [projectSpace.id],
      spaceId: projectSpace.id,
      messagesCreatedAt: [new Date()],
    });

    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      privateConversationUrlsByDefault: true,
    });
    assert(
      updateResult.isOk(),
      "Failed to enable private conversation URLs setting"
    );

    const response = await getConversation(workspace, conversation.sId);

    expect(response.status).toBe(200);
  });

  it("returns the activation pod's uiView on pod conversations, and null otherwise", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
      method: "GET",
    });

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    const projectSpace = await SpaceFactory.project(workspace, adminUser.id);
    const addMemberResult = await projectSpace.addMembers(adminAuth, {
      userIds: [adminUser.sId, user.sId],
    });
    assert(addMemberResult.isOk(), "Failed to add users to project space");
    const refreshedAdminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    await ActivationPodFactory.create(refreshedAdminAuth, {
      pod: projectSpace,
      uiView: "compact",
    });

    const compactConversation = await ConversationFactory.create(
      refreshedAdminAuth,
      {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        requestedSpaceIds: [projectSpace.id],
        spaceId: projectSpace.id,
        messagesCreatedAt: [new Date()],
      }
    );

    const compactResponse = await getConversation(
      workspace,
      compactConversation.sId
    );
    expect(compactResponse.status).toBe(200);
    expect((await compactResponse.json()).conversation.uiView).toBe("compact");

    const otherProjectSpace = await SpaceFactory.project(
      workspace,
      adminUser.id
    );
    const addOtherMemberResult = await otherProjectSpace.addMembers(
      refreshedAdminAuth,
      { userIds: [adminUser.sId, user.sId] }
    );
    assert(addOtherMemberResult.isOk(), "Failed to add users to project space");
    const secondRefreshedAdminAuth =
      await Authenticator.fromUserIdAndWorkspaceId(
        adminUser.sId,
        workspace.sId
      );

    const standardConversation = await ConversationFactory.create(
      secondRefreshedAdminAuth,
      {
        agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
        requestedSpaceIds: [otherProjectSpace.id],
        spaceId: otherProjectSpace.id,
        messagesCreatedAt: [new Date()],
      }
    );

    const standardResponse = await getConversation(
      workspace,
      standardConversation.sId
    );
    expect(standardResponse.status).toBe(200);
    expect((await standardResponse.json()).conversation.uiView).toBeNull();
  });

  it("returns 404 conversation_not_found for admins when private conversation URLs are enabled and they are not participants", async () => {
    const { workspace, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, regularUser, { role: "user" });
    const regularUserAuth = await Authenticator.fromUserIdAndWorkspaceId(
      regularUser.sId,
      workspace.sId
    );

    const conversation = await ConversationFactory.create(regularUserAuth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [new Date()],
    });

    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      privateConversationUrlsByDefault: true,
    });
    assert(
      updateResult.isOk(),
      "Failed to update private conversation URLs setting"
    );

    const response = await getConversation(workspace, conversation.sId);

    expect(response.status).toBe(404);
    expect((await response.json()).error.type).toBe("conversation_not_found");
  });

  it("hydrates read state on the returned conversation", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "user",
      method: "GET",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [new Date()],
    });

    const unreadResponse = await getConversation(workspace, conversation.sId);
    expect(unreadResponse.status).toBe(200);
    const unreadBody = await unreadResponse.json();
    expect(unreadBody.conversation.unread).toBe(true);
    expect(unreadBody.conversation.lastReadMs).toBeNull();

    const patchResponse = await patchConversation(workspace, conversation.sId, {
      read: true,
    });
    expect(patchResponse.status).toBe(200);

    const readResponse = await getConversation(workspace, conversation.sId);
    expect(readResponse.status).toBe(200);
    const readBody = await readResponse.json();
    expect(readBody.conversation.unread).toBe(false);
    expect(readBody.conversation.lastReadMs).toEqual(expect.any(Number));
  });
});

describe("PATCH /api/w/:wId/assistant/conversations/:cId", () => {
  it("updates conversation URL access mode", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
      method: "PATCH",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [new Date()],
    });

    const response = await patchConversation(workspace, conversation.sId, {
      accessMode: "workspace_members",
    });

    expect(response.status).toBe(200);

    const updatedConversation = await ConversationResource.fetchById(
      auth,
      conversation.sId
    );
    assert(updatedConversation, "Expected conversation to exist");
    expect(getConversationUrlAccessMode(updatedConversation.metadata)).toBe(
      "workspace_members"
    );
  });

  it("returns 400 on unsupported URL access mode", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "admin",
      method: "PATCH",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [new Date()],
    });

    const response = await patchConversation(workspace, conversation.sId, {
      accessMode: "everyone",
    });

    expect(response.status).toBe(400);
  });

  it("marks an unread conversation as read", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "user",
      method: "PATCH",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [new Date()],
    });

    const before =
      await ConversationResource.fetchConversationWithParticipantState(
        auth,
        conversation.sId
      );
    assert(before.isOk(), "Expected conversation to be fetched");
    expect(before.value.unread).toBe(true);

    const response = await patchConversation(workspace, conversation.sId, {
      read: true,
    });
    expect(response.status).toBe(200);

    const after =
      await ConversationResource.fetchConversationWithParticipantState(
        auth,
        conversation.sId
      );
    assert(after.isOk(), "Expected conversation to be fetched");
    expect(after.value.unread).toBe(false);
    expect(after.value.lastReadMs).not.toBeNull();
  });

  it("skips the lastReadAt write when the conversation is already read", async () => {
    const { workspace, auth, globalSpace } = await createPrivateApiMockRequest({
      role: "user",
      method: "PATCH",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [new Date()],
    });

    const firstResponse = await patchConversation(workspace, conversation.sId, {
      read: true,
    });
    expect(firstResponse.status).toBe(200);

    const firstState =
      await ConversationResource.fetchConversationWithParticipantState(
        auth,
        conversation.sId
      );
    assert(firstState.isOk(), "Expected conversation to be fetched");
    const firstLastReadMs = firstState.value.lastReadMs;
    expect(firstLastReadMs).not.toBeNull();

    // Ensure a second write would produce a different lastReadAt.
    await new Promise((resolve) => setTimeout(resolve, 20));

    const secondResponse = await patchConversation(
      workspace,
      conversation.sId,
      { read: true }
    );
    expect(secondResponse.status).toBe(200);

    const secondState =
      await ConversationResource.fetchConversationWithParticipantState(
        auth,
        conversation.sId
      );
    assert(secondState.isOk(), "Expected conversation to be fetched");
    expect(secondState.value.lastReadMs).toBe(firstLastReadMs);
  });
});
