import { generateSandboxFileSystemToken } from "@app/lib/api/sandbox/access_tokens";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFileSystemMutationModel } from "@app/lib/resources/storage/models/sandbox_file_system_mutation";
import { setupProjectConversation } from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { createSandboxTokenTestContext } from "@app/tests/utils/SandboxTokenFactory";
import { frameContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it } from "vitest";

process.env.DUST_SANDBOX_JWT_SECRET ??= "test-sandbox-jwt-secret";

function mutationRequest(
  workspaceId: string,
  token: string,
  body: Record<string, unknown>
) {
  return honoApp.request(
    `/api/v1/w/${workspaceId}/sandbox/filesystem/mutations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/v1/w/:wId/sandbox/filesystem/mutations", () => {
  beforeEach(() => {
    fileStorageMock.reset();
    fileStorageMock.setFileExists(() => false);
  });

  it("applies and persists a scoped filesystem mutation", async () => {
    const { auth, workspace, conversation, sandbox } =
      await createSandboxTokenTestContext();
    const token = await generateSandboxFileSystemToken(auth, {
      sandbox,
      mounts: [{ kind: "conversation", id: conversation.sId }],
    });
    const idempotencyKey = crypto.randomUUID();
    const body = {
      idempotencyKey,
      operation: "mkdir",
      mount: { kind: "conversation", id: conversation.sId },
      path: "generated",
    };

    const response = await mutationRequest(workspace.sId, token, body);

    const responseBody = await response.json();
    expect(response.status, JSON.stringify(responseBody)).toBe(200);
    expect(responseBody).toEqual({ success: true });
    expect(
      fileStorageMock.saveFileCalls.some(
        ({ filePath }) =>
          filePath ===
          `w/${workspace.sId}/conversations/${conversation.sId}/files/generated/`
      )
    ).toBe(true);
    const persisted = await SandboxFileSystemMutationModel.findOne({
      where: { workspaceId: workspace.id, idempotencyKey },
    });
    expect(persisted?.status).toBe("completed");

    const replay = await mutationRequest(workspace.sId, token, body);
    expect(replay.status).toBe(200);
    expect(
      fileStorageMock.saveFileCalls.filter(
        ({ filePath }) =>
          filePath ===
          `w/${workspace.sId}/conversations/${conversation.sId}/files/generated/`
      )
    ).toHaveLength(1);
  });

  it("rejects a mount outside the filesystem token scope", async () => {
    const { auth, workspace, conversation, sandbox } =
      await createSandboxTokenTestContext();
    const token = await generateSandboxFileSystemToken(auth, {
      sandbox,
      mounts: [{ kind: "conversation", id: conversation.sId }],
    });

    const response = await mutationRequest(workspace.sId, token, {
      idempotencyKey: crypto.randomUUID(),
      operation: "unlink",
      mount: { kind: "conversation", id: "another-conversation" },
      path: "frame.tsx",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toContain(
      "outside token scope"
    );
  });

  it("keeps the previous same-mount rename request compatible", async () => {
    const { auth, workspace, conversation, sandbox } =
      await createSandboxTokenTestContext();
    const sourceMountPath = `w/${workspace.sId}/conversations/${conversation.sId}/files/source.txt`;
    fileStorageMock.setFileExists((filePath) => filePath === sourceMountPath);
    const token = await generateSandboxFileSystemToken(auth, {
      sandbox,
      mounts: [{ kind: "conversation", id: conversation.sId }],
    });

    const response = await mutationRequest(workspace.sId, token, {
      idempotencyKey: crypto.randomUUID(),
      operation: "rename",
      mount: { kind: "conversation", id: conversation.sId },
      path: "source.txt",
      destinationPath: "destination.txt",
    });

    expect(response.status).toBe(200);
  });

  it("preserves frame identity when renaming from a conversation into its pod", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspace = auth.getNonNullableWorkspace();
    const sandbox = await SandboxFactory.create(auth, conversation.toJSON());
    const sourceMountPath = `w/${workspace.sId}/conversations/${conversation.sId}/files/frame.tsx`;
    const destinationMountPath = `w/${workspace.sId}/pods/${projectId}/files/frame.tsx`;
    fileStorageMock.setFileExists((filePath) => filePath === sourceMountPath);
    const frame = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: frameContentType,
      fileName: "frame.tsx",
      fileSize: 42,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
    });
    await frame.updateMount({
      destFileName: "frame.tsx",
      destMountFilePath: sourceMountPath,
      destUseCase: "tool_output",
      destUseCaseMetadata: { conversationId: conversation.sId },
    });
    const token = await generateSandboxFileSystemToken(auth, {
      sandbox,
      mounts: [
        { kind: "conversation", id: conversation.sId },
        { kind: "pod", id: projectId },
      ],
    });

    const response = await mutationRequest(workspace.sId, token, {
      idempotencyKey: crypto.randomUUID(),
      operation: "rename",
      mount: { kind: "conversation", id: conversation.sId },
      path: "frame.tsx",
      destinationMount: { kind: "pod", id: projectId },
      destinationPath: "frame.tsx",
    });

    const responseBody = await response.json();
    expect(response.status, JSON.stringify(responseBody)).toBe(200);
    const movedFrame = await FileResource.fetchById(auth, frame.sId);
    expect(movedFrame?.sId).toBe(frame.sId);
    expect(movedFrame?.mountFilePath).toBe(destinationMountPath);
    expect(movedFrame?.useCase).toBe("project_context");
    expect(movedFrame?.useCaseMetadata).toMatchObject({
      spaceId: projectId,
    });
  });

  it("rejects a cross-mount rename when its destination is outside token scope", async () => {
    const { auth, workspace, conversation, sandbox } =
      await createSandboxTokenTestContext();
    const token = await generateSandboxFileSystemToken(auth, {
      sandbox,
      mounts: [{ kind: "conversation", id: conversation.sId }],
    });

    const response = await mutationRequest(workspace.sId, token, {
      idempotencyKey: crypto.randomUUID(),
      operation: "rename",
      mount: { kind: "conversation", id: conversation.sId },
      path: "frame.tsx",
      destinationMount: { kind: "pod", id: "another-pod" },
      destinationPath: "frame.tsx",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.message).toContain(
      "outside token scope"
    );
  });
});
