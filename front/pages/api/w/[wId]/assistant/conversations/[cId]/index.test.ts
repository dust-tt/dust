import { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { getConversationUrlAccessMode } from "@app/types/assistant/conversation";
import { assert, describe, expect, it } from "vitest";

import handler from "./index";

async function setupUserRequestWithConversation({
  privateByDefaultEnabled,
}: {
  privateByDefaultEnabled: boolean;
}) {
  const { req, res, workspace, auth, user, globalSpace } =
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

  req.query.wId = workspace.sId;
  req.query.cId = conversation.sId;
  req.url = `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}`;

  return { req, res, workspace, auth, user, conversation };
}

describe("GET /api/w/[wId]/assistant/conversations/[cId]", () => {
  it("returns 200 for non-participants when private conversation URLs are disabled", async () => {
    const { req, res } = await setupUserRequestWithConversation({
      privateByDefaultEnabled: false,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("returns 404 conversation_not_found for non-participants when private conversation URLs are enabled", async () => {
    const { req, res } = await setupUserRequestWithConversation({
      privateByDefaultEnabled: true,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("conversation_not_found");
  });

  it("returns 200 for participants when private conversation URLs are enabled", async () => {
    const { req, res, auth, user, conversation } =
      await setupUserRequestWithConversation({
        privateByDefaultEnabled: true,
      });

    await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "posted",
      user: user.toJSON(),
      lastReadAt: null,
    });

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it("returns 200 for project conversations for non-participants when private conversation URLs are enabled", async () => {
    const { req, res, workspace, user } = await createPrivateApiMockRequest({
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

    req.query.wId = workspace.sId;
    req.query.cId = conversation.sId;
    req.url = `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}`;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
  });

  it.skip("returns 404 conversation_not_found for admins when private conversation URLs are enabled and they are not participants", async () => {
    const { req, res, workspace, globalSpace } =
      await createPrivateApiMockRequest({
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

    req.query.wId = workspace.sId;
    req.query.cId = conversation.sId;
    req.url = `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}`;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData().error.type).toBe("conversation_not_found");
  });
});

describe("PATCH /api/w/[wId]/assistant/conversations/[cId]", () => {
  it("updates conversation URL access mode", async () => {
    const { req, res, workspace, auth, globalSpace } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "PATCH",
      });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [new Date()],
    });

    req.query.wId = workspace.sId;
    req.query.cId = conversation.sId;
    req.url = `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}`;
    req.body = { accessMode: "workspace_members" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

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
    const { req, res, workspace, auth, globalSpace } =
      await createPrivateApiMockRequest({
        role: "admin",
        method: "PATCH",
      });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
      requestedSpaceIds: [globalSpace.id],
      messagesCreatedAt: [new Date()],
    });

    req.query.wId = workspace.sId;
    req.query.cId = conversation.sId;
    req.url = `/api/w/${workspace.sId}/assistant/conversations/${conversation.sId}`;
    req.body = { accessMode: "everyone" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });
});
