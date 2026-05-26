import { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getConversationIds(
  workspace: { sId: string },
  key: { secret: string },
  spaceId: string
) {
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceId}/conversation_ids`,
    {
      headers: { authorization: `Bearer ${key.secret}` },
    }
  );
}

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/conversation_ids", () => {
  it("returns 403 if not system key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: false,
    });

    const space = await SpaceFactory.regular(workspace);

    const response = await getConversationIds(workspace, key, space.sId);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  });

  it("returns 404 if space does not exist", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await getConversationIds(
      workspace,
      key,
      "non-existent-space-id"
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  });

  it("returns conversation IDs in a space", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.regular(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const addMembersRes = await space.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      name: "Test Agent",
    });

    const convo1 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agent.sId,
      requestedSpaceIds: [space.id],
      spaceId: space.id,
      messagesCreatedAt: [new Date()],
    });
    const convo2 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agent.sId,
      requestedSpaceIds: [space.id],
      spaceId: space.id,
      messagesCreatedAt: [new Date()],
    });

    const response = await getConversationIds(workspace, key, space.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.conversationIds)).toBe(true);
    expect(data.conversationIds.length).toBeGreaterThanOrEqual(2);
    expect(data.conversationIds).toContain(convo1.sId);
    expect(data.conversationIds).toContain(convo2.sId);
  });

  it("excludes deleted conversations", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.regular(workspace);
    const user = await UserFactory.basic();
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const adminAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const addMembersRes = await space.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      name: "Test Agent",
    });

    const convo1 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agent.sId,
      requestedSpaceIds: [space.id],
      spaceId: space.id,
      messagesCreatedAt: [new Date()],
    });
    const convo2 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agent.sId,
      requestedSpaceIds: [space.id],
      spaceId: space.id,
      messagesCreatedAt: [new Date()],
    });

    await ConversationModel.update(
      { visibility: "deleted" },
      { where: { id: convo2.id } }
    );

    const response = await getConversationIds(workspace, key, space.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversationIds).toContain(convo1.sId);
    expect(data.conversationIds).not.toContain(convo2.sId);
  });

  it("returns empty array for space with no conversations", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.regular(workspace);

    const response = await getConversationIds(workspace, key, space.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.conversationIds)).toBe(true);
    expect(data.conversationIds.length).toBe(0);
  });
});
