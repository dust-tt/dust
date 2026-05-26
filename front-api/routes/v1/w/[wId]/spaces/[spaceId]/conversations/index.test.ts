// biome-ignore-all lint/plugin/noRawSql: test file uses raw SQL for setup and verification
import { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { honoApp } from "@front-api/app";
import { describe, expect, it } from "vitest";

function getConversations(
  workspace: { sId: string },
  spaceSId: string,
  key: { secret: string },
  query?: Record<string, string>
) {
  const qs = query
    ? "?" +
      Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&")
    : "";
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/spaces/${spaceSId}/conversations${qs}`,
    {
      headers: { authorization: `Bearer ${key.secret}` },
    }
  );
}

describe("system-only authentication tests", () => {
  it("returns 403 if not system key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: false,
    });

    const space = await SpaceFactory.regular(workspace);
    const response = await getConversations(workspace, space.sId, key);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  });
});

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/conversations", () => {
  it("should return 403 if not using system key", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: false,
    });

    const space = await SpaceFactory.regular(workspace);
    const response = await getConversations(workspace, space.sId, key);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  });

  it("should return 404 if space does not exist", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const response = await getConversations(
      workspace,
      "non-existent-space-id",
      key
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  });

  it("should return 405 for unsupported method", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.regular(workspace);
    const response = await honoApp.request(
      `/api/v1/w/${workspace.sId}/spaces/${space.sId}/conversations`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${key.secret}` },
      }
    );

    expect(response.status).toBe(405);
  });

  it("should return conversations in a space", async () => {
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

    // Add user to space so they can create conversations
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

    const response = await getConversations(workspace, space.sId, key);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversations).toBeDefined();
    expect(Array.isArray(data.conversations)).toBe(true);
    expect(data.conversations.length).toBeGreaterThanOrEqual(2);

    const conversationIds = data.conversations.map((c: any) => c.sId);
    expect(conversationIds).toContain(convo1.sId);
    expect(conversationIds).toContain(convo2.sId);

    // Verify conversation structure
    const firstConvo = data.conversations.find(
      (c: any) => c.sId === convo1.sId
    );
    expect(firstConvo).toBeDefined();
    expect(firstConvo.sId).toBe(convo1.sId);
    expect(firstConvo.url).toBeDefined();
    expect(firstConvo.url).toContain(convo1.sId);
  });

  it("should include deleted conversations", async () => {
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

    // Add user to space so they can create conversations
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

    // Delete convo2
    await ConversationModel.update(
      { visibility: "deleted" },
      { where: { id: convo2.id } }
    );

    const response = await getConversations(workspace, space.sId, key);

    expect(response.status).toBe(200);
    const data = await response.json();
    const conversationIds = data.conversations.map((c: any) => c.sId);
    expect(conversationIds).toContain(convo1.sId);
    expect(conversationIds).toContain(convo2.sId); // Deleted conversation should be included
  });

  it("should filter conversations by updatedSince", async () => {
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

    // Add user to space so they can create conversations
    const addMembersRes = await space.addMembers(adminAuth, {
      userIds: [user.sId],
    });
    if (!addMembersRes.isOk()) {
      throw new Error("Failed to add user to space");
    }

    const agent = await AgentConfigurationFactory.createTestAgent(adminAuth, {
      name: "Test Agent",
    });

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    const sixDaysAgo = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000);

    const convo1 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agent.sId,
      requestedSpaceIds: [space.id],
      spaceId: space.id,
      messagesCreatedAt: [sixDaysAgo],
    });
    const convo2 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agent.sId,
      requestedSpaceIds: [space.id],
      spaceId: space.id,
      messagesCreatedAt: [fourDaysAgo],
    });
    const convo3 = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agent.sId,
      requestedSpaceIds: [space.id],
      spaceId: space.id,
      messagesCreatedAt: [twoDaysAgo],
    });

    // Set updatedAt using raw SQL

    await frontSequelize.query(
      `UPDATE conversations SET "updatedAt" = :updatedAt WHERE id = :id`,
      {
        replacements: {
          updatedAt: sixDaysAgo.toISOString(),
          id: convo1.id,
        },
      }
    );

    await frontSequelize.query(
      `UPDATE conversations SET "updatedAt" = :updatedAt WHERE id = :id`,
      {
        replacements: {
          updatedAt: fourDaysAgo.toISOString(),
          id: convo2.id,
        },
      }
    );

    await frontSequelize.query(
      `UPDATE conversations SET "updatedAt" = :updatedAt WHERE id = :id`,
      {
        replacements: {
          updatedAt: twoDaysAgo.toISOString(),
          id: convo3.id,
        },
      }
    );

    // Filter for conversations updated after 5 days ago
    const fiveDaysAgoMs = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000
    ).getTime();
    const response = await getConversations(workspace, space.sId, key, {
      updatedSince: fiveDaysAgoMs.toString(),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    const conversationIds = data.conversations.map((c: any) => c.sId);
    expect(conversationIds).toContain(convo2.sId); // Updated 4 days ago
    expect(conversationIds).toContain(convo3.sId); // Updated 2 days ago
    expect(conversationIds).not.toContain(convo1.sId); // Updated 6 days ago (excluded)
  });

  it("should return empty array for space with no conversations", async () => {
    const { workspace, key } = await createPublicApiMockRequest({
      systemKey: true,
    });

    const space = await SpaceFactory.regular(workspace);
    const response = await getConversations(workspace, space.sId, key);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.conversations).toBeDefined();
    expect(Array.isArray(data.conversations)).toBe(true);
    expect(data.conversations.length).toBe(0);
  });
});
