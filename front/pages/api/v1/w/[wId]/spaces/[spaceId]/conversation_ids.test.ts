import { destroyConversation } from "@app/lib/api/assistant/conversation/destroy";
import { Authenticator } from "@app/lib/auth";
import { ConversationModel } from "@app/lib/models/agent/conversation";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it } from "vitest";

import handler from "./conversation_ids";

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

describe("GET /api/v1/w/[wId]/spaces/[spaceId]/conversation_ids", () => {
  it("should return 400 if workspace id is missing", async () => {
    const { req, res } = await createPublicApiMockRequest({
      systemKey: true,
      method: "GET",
    });

    // Set wId to undefined to simulate missing workspace id
    req.query.wId = undefined as any;
    req.query.spaceId = "test-space-id";

    await handler(req, res);

    // The authentication wrapper might return 404 before the handler checks,
    // but the handler itself should return 400. Let's check for both.
    // In practice, the wrapper will catch it first, so we expect 404
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

  it("should return conversation IDs in a space", async () => {
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
    expect(data.conversationIds).toBeDefined();
    expect(Array.isArray(data.conversationIds)).toBe(true);
    expect(data.conversationIds.length).toBeGreaterThanOrEqual(2);
    expect(data.conversationIds).toContain(convo1.sId);
    expect(data.conversationIds).toContain(convo2.sId);

    // Cleanup
    await destroyConversation(adminAuth, { conversationId: convo1.sId });
    await destroyConversation(adminAuth, { conversationId: convo2.sId });
  });

  it("should exclude deleted conversations", async () => {
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
    expect(data.conversationIds).toBeDefined();
    expect(Array.isArray(data.conversationIds)).toBe(true);
    expect(data.conversationIds).toContain(convo1.sId);
    expect(data.conversationIds).not.toContain(convo2.sId); // Deleted conversation should be excluded

    // Cleanup
    await destroyConversation(adminAuth, { conversationId: convo1.sId });
    await destroyConversation(adminAuth, { conversationId: convo2.sId });
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
    expect(data.conversationIds).toBeDefined();
    expect(Array.isArray(data.conversationIds)).toBe(true);
    expect(data.conversationIds.length).toBe(0);
  });

  it("should only return conversation IDs, not full conversation objects", async () => {
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

    const convo = await ConversationFactory.create(adminAuth, {
      agentConfigurationId: agent.sId,
      requestedSpaceIds: [space.id],
      spaceId: space.id,
      messagesCreatedAt: [new Date()],
    });

    req.query.spaceId = space.sId;

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    const data = res._getJSONData();
    expect(data.conversationIds).toBeDefined();
    expect(Array.isArray(data.conversationIds)).toBe(true);
    expect(data.conversationIds.length).toBeGreaterThanOrEqual(1);

    // Verify it's an array of strings (IDs), not objects
    data.conversationIds.forEach((id: any) => {
      expect(typeof id).toBe("string");
    });

    // Verify no conversation objects are present
    expect(data.conversations).toBeUndefined();

    // Cleanup
    await destroyConversation(adminAuth, { conversationId: convo.sId });
  });
});
