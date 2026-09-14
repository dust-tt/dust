import { DustFileSystem } from "@app/lib/api/file_system";
import { moveCanonicalFile } from "@app/lib/api/files/file_system_ops";
import { FileResource } from "@app/lib/resources/file_resource";
import { setupProjectConversation } from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { frameContentType } from "@app/types/files";
import {
  getConversationFilePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import assert from "assert";
import { UniqueConstraintError } from "sequelize";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEST_PATH_OCCUPIED_MESSAGE =
  "A registered file already uses the destination path.";

describe("moveCanonicalFile", () => {
  beforeEach(() => {
    fileStorageMock.reset();
    vi.restoreAllMocks();
  });

  it("rejects a destination already owned by another FileResource without moving bytes", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const src = `conversation-${conversation.sId}/ProjectTracker.tsx`;
    const dest = `pod-${projectId}/ProjectTracker/ProjectTracker.tsx`;

    const source = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "ProjectTracker.tsx",
      fileSize: 128,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
      mountFilePath: getConversationFilePath({
        workspaceId,
        conversationId: conversation.sId,
        fileName: "ProjectTracker.tsx",
      }),
    });
    await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "ProjectTracker.tsx",
      fileSize: 128,
      status: "ready",
      useCase: "project_context",
      useCaseMetadata: { spaceId: projectId },
      mountFilePath: `${getPodFilesBasePath({
        workspaceId,
        podId: projectId,
      })}ProjectTracker/ProjectTracker.tsx`,
    });

    fileStorageMock.setFileExists((filePath) =>
      filePath.includes("/conversations/")
    );

    const fsResult = await DustFileSystem.forAgentLoop(auth, {
      conversation: conversation.toJSON(),
      scopedPaths: [src, dest],
    });
    assert(fsResult.isOk());
    const moveSpy = vi.spyOn(fsResult.value, "move");

    const result = await moveCanonicalFile(auth, fsResult.value, src, dest);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.code).toBe("already_exists");
    expect(result.error.message).toBe(DEST_PATH_OCCUPIED_MESSAGE);
    expect(moveSpy).not.toHaveBeenCalled();

    const reloaded = await FileResource.fetchById(auth, source.sId);
    expect(reloaded?.mountFilePath).toBe(source.mountFilePath);
    expect(reloaded?.useCase).toBe("tool_output");
  });

  it("keeps Frame metadata when remounting a conversation file into a Pod", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const src = `conversation-${conversation.sId}/ProjectTracker.tsx`;
    const dest = `pod-${projectId}/ProjectTracker/ProjectTracker.tsx`;
    const frameBundleRootPath = src;

    const source = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "ProjectTracker.tsx",
      fileSize: 128,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: {
        conversationId: conversation.sId,
        frameBundleRootPath,
        frameEntryRelPath: "ProjectTracker.tsx",
        sourceConversationId: conversation.sId,
      },
      mountFilePath: getConversationFilePath({
        workspaceId,
        conversationId: conversation.sId,
        fileName: "ProjectTracker.tsx",
      }),
    });

    fileStorageMock.setFileExists((filePath) =>
      filePath.includes("/conversations/")
    );

    const fsResult = await DustFileSystem.forAgentLoop(auth, {
      conversation: conversation.toJSON(),
      scopedPaths: [src, dest],
    });
    assert(fsResult.isOk());

    const result = await moveCanonicalFile(auth, fsResult.value, src, dest);
    assert(result.isOk(), result.isErr() ? result.error.message : undefined);

    const reloaded = await FileResource.fetchById(auth, source.sId);
    assert(reloaded);
    expect(reloaded.useCase).toBe("project_context");
    expect(reloaded.useCaseMetadata).toMatchObject({
      spaceId: projectId,
      frameBundleRootPath,
      frameEntryRelPath: "ProjectTracker.tsx",
      sourceConversationId: conversation.sId,
    });
    expect(reloaded.useCaseMetadata?.conversationId).toBeUndefined();
    expect(reloaded.mountFilePath).toBe(
      `${getPodFilesBasePath({
        workspaceId,
        podId: projectId,
      })}ProjectTracker/ProjectTracker.tsx`
    );
  });

  it("returns already_exists when updateMount hits a unique constraint", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const src = `conversation-${conversation.sId}/ProjectTracker.tsx`;
    const dest = `pod-${projectId}/ProjectTracker/ProjectTracker.tsx`;

    await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "ProjectTracker.tsx",
      fileSize: 128,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId: conversation.sId },
      mountFilePath: getConversationFilePath({
        workspaceId,
        conversationId: conversation.sId,
        fileName: "ProjectTracker.tsx",
      }),
    });

    fileStorageMock.setFileExists((filePath) =>
      filePath.includes("/conversations/")
    );
    vi.spyOn(FileResource.prototype, "updateMount").mockRejectedValueOnce(
      new UniqueConstraintError({})
    );

    const fsResult = await DustFileSystem.forAgentLoop(auth, {
      conversation: conversation.toJSON(),
      scopedPaths: [src, dest],
    });
    assert(fsResult.isOk());

    const result = await moveCanonicalFile(auth, fsResult.value, src, dest);

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.code).toBe("already_exists");
    expect(result.error.message).toBe(DEST_PATH_OCCUPIED_MESSAGE);
    expect(result.error.message).not.toBe("Validation error");
  });
});
