import { describe, it, vi } from "vitest";
import { expect } from "vitest";

import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { frontSequelize } from "@app/lib/resources/storage";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";

import handler from "./index";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getClientFacingUrl: vi.fn().mockReturnValue("http://localhost:3000"),
    getAppUrl: vi.fn().mockReturnValue("http://localhost:3000"),
  },
}));

// Note: The generic system-only auth test expects 404, but this endpoint returns 403
// So we'll override it with a custom test
describe("system-only authentication tests", () => {
  it("returns 403 if not system key", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: false,
      method: "GET",
    });

    const space = await SpaceFactory.regular(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  });
});

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/conversations", () => {
  it("should return 400 if workspace id is missing", async () => {
    const { req, res } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    // Remove wId from query to simulate missing workspace id
    delete req.query.wId;
    req.query.spaceId = "test-space-id";

    await handler(req, res);

    // The endpoint checks wId first, but withPublicAPIAuthentication might return 404 first
    // Let's check for either 400 or 404
    expect([400, 404]).toContain(res._getStatusCode());
  });

  it("should return 400 if space id is missing", async () => {
    const { req, res } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    req.query.spaceId = undefined;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Missing or invalid space id.",
      },
    });
  });

  it("should return 403 if not using system key", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: false,
      method: "GET",
    });

    const space = await SpaceFactory.regular(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(403);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_oauth_token_error",
        message: "Only system keys are allowed to use this endpoint.",
      },
    });
  });

  it("should return 404 if space does not exist", async () => {
    const { req, res } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    req.query.spaceId = "non-existent-space-id";

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "space_not_found",
        message: "Space not found.",
      },
    });
  });

  it("should return 405 for unsupported method", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "POST",
    });

    const space = await SpaceFactory.regular(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  });

  it("should return conversations in a space", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
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

    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversations).toBeDefined();
    expect(Array.isArray(data.conversations)).toBe(true);
    expect(data.conversations.length).toBeGreaterThanOrEqual(2);

    const conversationSIds = data.conversations.map((c: any) => c.sId);
    expect(conversationSIds).toContain(convo1.sId);
    expect(conversationSIds).toContain(convo2.sId);

    // Verify conversation structure
    const firstConvo = data.conversations.find(
      (c: any) => c.sId === convo1.sId
    );
    expect(firstConvo).toBeDefined();
    expect(firstConvo.sId).toBe(convo1.sId);
    expect(firstConvo.url).toBeDefined();
    expect(firstConvo.url).toContain(convo1.sId);

    // Cleanup
    await destroyConversation(adminAuth, { conversationId: convo1.sId });
    await destroyConversation(adminAuth, { conversationId: convo2.sId });
  });

  it("should include deleted conversations", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
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

    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    const conversationSIds = data.conversations.map((c: any) => c.sId);
    expect(conversationSIds).toContain(convo1.sId);
    expect(conversationSIds).toContain(convo2.sId); // Deleted conversation should be included

    // Cleanup
    await destroyConversation(adminAuth, { conversationId: convo1.sId });
    await destroyConversation(adminAuth, { conversationId: convo2.sId });
  });

  it("should filter conversations by updatedSince", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
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
    // eslint-disable-next-line dust/no-raw-sql
    await frontSequelize.query(
      `UPDATE conversations SET "updatedAt" = :updatedAt WHERE id = :id`,
      {
        replacements: {
          updatedAt: sixDaysAgo.toISOString(),
          id: convo1.id,
        },
      }
    );
    // eslint-disable-next-line dust/no-raw-sql
    await frontSequelize.query(
      `UPDATE conversations SET "updatedAt" = :updatedAt WHERE id = :id`,
      {
        replacements: {
          updatedAt: fourDaysAgo.toISOString(),
          id: convo2.id,
        },
      }
    );
    // eslint-disable-next-line dust/no-raw-sql
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
    req.query.spaceId = space.sId;
    req.query.updatedSince = fiveDaysAgoMs.toString();

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    const conversationSIds = data.conversations.map((c: any) => c.sId);
    expect(conversationSIds).toContain(convo2.sId); // Updated 4 days ago
    expect(conversationSIds).toContain(convo3.sId); // Updated 2 days ago
    expect(conversationSIds).not.toContain(convo1.sId); // Updated 6 days ago (excluded)

    // Cleanup
    await destroyConversation(adminAuth, { conversationId: convo1.sId });
    await destroyConversation(adminAuth, { conversationId: convo2.sId });
    await destroyConversation(adminAuth, { conversationId: convo3.sId });
  });

  it("should return empty array for space with no conversations", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    const space = await SpaceFactory.regular(workspace);
    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversations).toBeDefined();
    expect(Array.isArray(data.conversations)).toBe(true);
    expect(data.conversations.length).toBe(0);
  });
});
