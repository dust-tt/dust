import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { describe, expect, it, vi } from "vitest";

import handler from "./edit-text";

vi.mock("@app/lib/api/files/client_executable", () => ({
  editClientExecutableFile: vi.fn().mockResolvedValue({
    isErr: () => false,
    value: { fileResource: {}, replacementCount: 1, warnings: [] },
  }),
}));

describe("POST /api/w/[wId]/files/[fileId]/edit-text", () => {
  it("should return 404 when file does not exist", async () => {
    const { req, res } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    req.query = { ...req.query, fileId: "non-existent-file" };
    req.body = { oldText: "Hello", newText: "World" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 400 when file is not an interactive content file", async () => {
    const { req, res, auth, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "text/plain",
      fileName: "doc.txt",
      fileSize: 100,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = { ...req.query, fileId: file.sId };
    req.body = { oldText: "Hello", newText: "World" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only Frame files support inline text editing.",
      },
    });
  });

  it("should return 400 when oldText is missing", async () => {
    const { req, res, auth, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/vnd.dust.frame",
      fileName: "frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = { ...req.query, fileId: file.sId };
    req.body = { newText: "World" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(400);
  });

  it("should return 404 for a conversation frame when user cannot access the conversation space", async () => {
    const { req, res, auth, user, workspace } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    // Create a restricted space the user is not a member of, then pin
    // the conversation to it via a direct DB update (bypasses createConversation auth).
    const restrictedSpace = await SpaceFactory.regular(workspace);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
      requestedSpaceIds: [restrictedSpace.id],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/vnd.dust.frame",
      fileName: "frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = { ...req.query, fileId: file.sId };
    req.body = { oldText: "Hello", newText: "World" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 404 when conversation file references a non-existent conversation", async () => {
    const { req, res, auth, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/vnd.dust.frame",
      fileName: "frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: "non-existent-conversation" },
    });

    req.query = { ...req.query, fileId: file.sId };
    req.body = { oldText: "Hello", newText: "World" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
  });

  it("should succeed for a conversation frame file", async () => {
    const { req, res, auth, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/vnd.dust.frame",
      fileName: "frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = { ...req.query, fileId: file.sId };
    req.body = { oldText: "Hello", newText: "World" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("should return 404 for frames not linked to a conversation or space", async () => {
    const { req, res, auth, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/vnd.dust.frame",
      fileName: "frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "avatar",
    });

    req.query = { ...req.query, fileId: file.sId };
    req.body = { oldText: "Hello", newText: "World" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should succeed for a space frame file the user can access", async () => {
    const { req, res, auth, user, workspace } =
      await createPrivateApiMockRequest({
        method: "POST",
        role: "user",
      });

    const space = await SpaceFactory.regular(workspace);
    const memberGroup = space.groups.find((g) => g.kind === "regular");
    await memberGroup?.dangerouslyAddMembers(auth, { users: [user.toJSON()] });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/vnd.dust.frame",
      fileName: "frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { spaceId: space.sId },
    });

    req.query = { ...req.query, fileId: file.sId };
    req.body = { oldText: "Hello", newText: "World" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual({ success: true });
  });

  it("should return 404 for a space frame when user cannot access the space", async () => {
    const { req, res, auth, user } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const otherUser = await UserFactory.basic();
    // Create a space owned by another user — current user is not a member.
    const space = await SpaceFactory.regular(auth.getNonNullableWorkspace());
    const memberGroup = space.groups.find((g) => g.kind === "regular");
    await memberGroup?.dangerouslyAddMembers(auth, {
      users: [otherUser.toJSON()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/vnd.dust.frame",
      fileName: "frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { spaceId: space.sId },
    });

    req.query = { ...req.query, fileId: file.sId };
    req.body = { oldText: "Hello", newText: "World" };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(404);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "file_not_found",
        message: "File not found.",
      },
    });
  });

  it("should return 405 for unsupported methods", async () => {
    const { req, res, auth, user } = await createPrivateApiMockRequest({
      method: "GET",
      role: "user",
    });

    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [new Date()],
    });

    const file = await FileFactory.create(auth, user, {
      contentType: "application/vnd.dust.frame",
      fileName: "frame.tsx",
      fileSize: 1024,
      status: "ready",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });

    req.query = { ...req.query, fileId: file.sId };

    await handler(req, res);

    expect(res._getStatusCode()).toBe(405);
    expect(res._getJSONData()).toEqual({
      error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  });
});
