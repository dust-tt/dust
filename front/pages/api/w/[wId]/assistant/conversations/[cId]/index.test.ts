import { Authenticator } from "@app/lib/auth";
import {
  ConversationModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationForkResource } from "@app/lib/resources/conversation_fork_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
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

  it("includes the readable parent conversation title in forkedFrom", async () => {
    const { req, res, workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
      method: "GET",
    });
    const agent = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Fork Fetch Agent",
      description: "Fork fetch agent",
    });

    const parentConversationTitle = "Quarterly Review Data";
    const parentConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date("2026-01-05T00:00:00.000Z")],
    });
    const childConversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    await ConversationModel.update(
      { title: parentConversationTitle },
      {
        where: {
          id: parentConversation.id,
          workspaceId: workspace.id,
        },
      }
    );

    const parentConversationResource = await ConversationResource.fetchById(
      auth,
      parentConversation.sId
    );
    const childConversationResource = await ConversationResource.fetchById(
      auth,
      childConversation.sId
    );
    assert(parentConversationResource, "Parent conversation not found");
    assert(childConversationResource, "Child conversation not found");

    const sourceMessage = await MessageModel.findOne({
      where: {
        conversationId: parentConversation.id,
        workspaceId: workspace.id,
        rank: 1,
      },
    });
    assert(sourceMessage, "Source message not found");

    const branchedAt = new Date("2026-01-06T00:00:00.000Z");
    await ConversationForkResource.makeNew(auth, {
      parentConversation: parentConversationResource,
      childConversation: childConversationResource,
      sourceMessageModelId: sourceMessage.id,
      branchedAt,
    });

    req.query.wId = workspace.sId;
    req.query.cId = childConversation.sId;
    req.url = `/api/w/${workspace.sId}/assistant/conversations/${childConversation.sId}`;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData().conversation.forkedFrom).toEqual({
      parentConversationId: parentConversation.sId,
      parentConversationTitle,
      sourceMessageId: sourceMessage.sId,
      branchedAt: branchedAt.getTime(),
      user: auth.getNonNullableUser().toJSON(),
    });
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

  it("omits the parent conversation title when the parent is unreadable", async () => {
    const {
      req,
      res,
      workspace,
      auth: userAuth,
    } = await createPrivateApiMockRequest({
      role: "user",
      method: "GET",
    });

    const adminUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, adminUser, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      adminUser.sId,
      workspace.sId
    );

    const restrictedSpace = await SpaceFactory.regular(workspace);
    const addMemberResult = await restrictedSpace.addMembers(adminAuth, {
      userIds: [adminUser.sId],
    });
    assert(addMemberResult.isOk(), "Failed to add admin to restricted space");

    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      name: "Restricted Fork Source Agent",
      description: "Restricted fork source agent",
    });
    const parentConversationTitle = "Restricted parent";
    const parentConversation = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [new Date("2026-01-03T00:00:00.000Z")],
      requestedSpaceIds: [restrictedSpace.id],
      spaceId: restrictedSpace.id,
    });
    const childConversation = await ConversationFactory.create(userAuth, {
      agentConfigurationId: agent.sId,
      messagesCreatedAt: [],
    });
    await ConversationModel.update(
      { title: parentConversationTitle },
      {
        where: {
          id: parentConversation.id,
          workspaceId: workspace.id,
        },
      }
    );

    const parentConversationResource = await ConversationResource.fetchById(
      adminAuth,
      parentConversation.sId
    );
    const childConversationResource = await ConversationResource.fetchById(
      adminAuth,
      childConversation.sId
    );
    assert(parentConversationResource, "Parent conversation not found");
    assert(childConversationResource, "Child conversation not found");

    const sourceMessage = await MessageModel.findOne({
      where: {
        conversationId: parentConversation.id,
        workspaceId: workspace.id,
        rank: 1,
      },
    });
    assert(sourceMessage, "Source message not found");

    const branchedAt = new Date("2026-01-04T00:00:00.000Z");
    await ConversationForkResource.makeNew(adminAuth, {
      parentConversation: parentConversationResource,
      childConversation: childConversationResource,
      sourceMessageModelId: sourceMessage.id,
      branchedAt,
    });

    expect(
      await ConversationResource.fetchById(userAuth, parentConversation.sId)
    ).toBeNull();

    req.query.wId = workspace.sId;
    req.query.cId = childConversation.sId;
    req.url = `/api/w/${workspace.sId}/assistant/conversations/${childConversation.sId}`;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);

    const responseConversation = res._getJSONData().conversation;
    expect(responseConversation.forkedFrom).toEqual({
      parentConversationId: parentConversation.sId,
      sourceMessageId: sourceMessage.sId,
      branchedAt: branchedAt.getTime(),
      user: adminAuth.getNonNullableUser().toJSON(),
    });
    expect(responseConversation.forkedFrom).not.toHaveProperty(
      "parentConversationTitle"
    );
  });

  it("returns 404 conversation_not_found for admins when private conversation URLs are enabled and they are not participants", async () => {
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
