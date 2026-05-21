import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { LightWorkspaceType } from "@app/types/user";
import { honoApp } from "@front-api/app";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/files/client_executable", () => ({
  editClientExecutableFile: vi.fn().mockResolvedValue({
    isErr: () => false,
    value: { fileResource: {}, replacementCount: 1, warnings: [] },
  }),
}));

function url(workspace: LightWorkspaceType, fileId: string) {
  return `/api/w/${workspace.sId}/files/${fileId}/edit-text`;
}

function postEdit(
  workspace: LightWorkspaceType,
  fileId: string,
  body: unknown
) {
  return honoApp.request(url(workspace, fileId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/files/:fileId/edit-text", () => {
  it("should return 404 when file does not exist", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const response = await postEdit(workspace, "non-existent-file", {
      oldText: "Hello",
      newText: "World",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("should return 400 when file is not an interactive content file", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
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

    const response = await postEdit(workspace, file.sId, {
      oldText: "Hello",
      newText: "World",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Only Frame files support inline text editing.",
      },
    });
  });

  it("should return 400 when oldText is missing", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
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

    const response = await postEdit(workspace, file.sId, { newText: "World" });

    expect(response.status).toBe(400);
  });

  it("should return 404 when conversation file references a non-existent conversation", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
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

    const response = await postEdit(workspace, file.sId, {
      oldText: "Hello",
      newText: "World",
    });

    expect(response.status).toBe(404);
  });

  it("should return 404 for a conversation frame when user cannot access the conversation space", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

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

    const response = await postEdit(workspace, file.sId, {
      oldText: "Hello",
      newText: "World",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("should succeed for a conversation frame file", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
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

    const response = await postEdit(workspace, file.sId, {
      oldText: "Hello",
      newText: "World",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("should return 404 for frames not linked to a conversation or space", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
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

    const response = await postEdit(workspace, file.sId, {
      oldText: "Hello",
      newText: "World",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("should succeed for a space frame file the user can access", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
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

    const response = await postEdit(workspace, file.sId, {
      oldText: "Hello",
      newText: "World",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
  });

  it("should return 404 for a space frame when user cannot access the space", async () => {
    const { auth, user, workspace } = await createPrivateApiMockRequest({
      method: "POST",
      role: "user",
    });

    const otherUser = await UserFactory.basic();
    const space = await SpaceFactory.regular(workspace);
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

    const response = await postEdit(workspace, file.sId, {
      oldText: "Hello",
      newText: "World",
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });
});
