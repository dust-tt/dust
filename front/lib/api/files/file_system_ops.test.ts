import { createConversation } from "@app/lib/api/assistant/conversation";
import { DustFileSystem } from "@app/lib/api/file_system";
import {
  moveCanonicalFile,
  reconcileCanonicalFileResourcesAfterMove,
} from "@app/lib/api/files/file_system_ops";
import { FileResource } from "@app/lib/resources/file_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { frameContentType } from "@app/types/files";
import { describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
}));

describe("reconcileCanonicalFileResourcesAfterMove", () => {
  it("moves all descendants without matching a sibling prefix", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const conversation = await createConversation(auth, {
      title: null,
      visibility: "unlisted",
      spaceId: null,
    });
    const scopedRoot = `conversation-${conversation.sId}`;
    const mountRoot = `w/${workspace.sId}/conversations/${conversation.sId}/files`;
    const dustFsResult = await DustFileSystem.fromScopedPath(
      auth,
      `${scopedRoot}/frames`
    );
    if (dustFsResult.isErr()) {
      throw dustFsResult.error;
    }

    const createLinkedFile = async (relativePath: string) => {
      const fileName = relativePath.split("/").pop() ?? relativePath;
      const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
        contentType: frameContentType,
        fileName,
        fileSize: 42,
        status: "ready",
        useCase: "tool_output",
      });
      await file.updateMount({
        destFileName: fileName,
        destMountFilePath: `${mountRoot}/${relativePath}`,
        destUseCase: "tool_output",
        destUseCaseMetadata: { conversationId: conversation.sId },
      });
      return file;
    };

    const direct = await createLinkedFile("frames/direct.tsx");
    const nested = await createLinkedFile("frames/nested/child.tsx");
    const sibling = await createLinkedFile("frames-other/untouched.tsx");

    await reconcileCanonicalFileResourcesAfterMove(
      auth,
      dustFsResult.value,
      `${scopedRoot}/frames`,
      `${scopedRoot}/archive`
    );

    const [movedDirect, movedNested, untouchedSibling] = await Promise.all([
      FileResource.fetchById(auth, direct.sId),
      FileResource.fetchById(auth, nested.sId),
      FileResource.fetchById(auth, sibling.sId),
    ]);
    expect(movedDirect?.mountFilePath).toBe(`${mountRoot}/archive/direct.tsx`);
    expect(movedNested?.mountFilePath).toBe(
      `${mountRoot}/archive/nested/child.tsx`
    );
    expect(untouchedSibling?.mountFilePath).toBe(
      `${mountRoot}/frames-other/untouched.tsx`
    );
  });

  it("preserves a frame identity when an editor temporary file replaces it", async () => {
    fileStorageMock.setFileContent(() => "export default 1;");
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const conversation = await createConversation(auth, {
      title: null,
      visibility: "unlisted",
      spaceId: null,
    });
    const scopedRoot = `conversation-${conversation.sId}`;
    const dustFsResult = await DustFileSystem.fromScopedPath(
      auth,
      `${scopedRoot}/.frame.tsx.tmp`
    );
    if (dustFsResult.isErr()) {
      throw dustFsResult.error;
    }
    const frame = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: frameContentType,
      fileName: "frame.tsx",
      fileSize: 42,
      status: "ready",
      useCase: "tool_output",
    });
    await frame.updateMount({
      destFileName: "frame.tsx",
      destMountFilePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/frame.tsx`,
      destUseCase: "tool_output",
      destUseCaseMetadata: { conversationId: conversation.sId },
    });

    const result = await moveCanonicalFile(
      auth,
      dustFsResult.value,
      `${scopedRoot}/.frame.tsx.tmp`,
      `${scopedRoot}/frame.tsx`,
      { overwrite: true }
    );

    expect(result.isOk()).toBe(true);
    const updatedFrame = await FileResource.fetchById(auth, frame.sId);
    expect(updatedFrame?.sId).toBe(frame.sId);
    expect(updatedFrame?.mountFilePath).toBe(
      `w/${workspace.sId}/conversations/${conversation.sId}/files/frame.tsx`
    );
    expect(updatedFrame?.version).toBe(frame.version + 1);
  });

  it("finds published frames from a changed dependency path", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const conversation = await createConversation(auth, {
      title: null,
      visibility: "unlisted",
      spaceId: null,
    });
    const scopedRoot = `conversation-${conversation.sId}/dashboard`;
    const frame = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: frameContentType,
      fileName: "frame.tsx",
      fileSize: 42,
      status: "ready",
      useCase: "tool_output",
    });
    await frame.updateMount({
      destFileName: "frame.tsx",
      destMountFilePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/dashboard/frame.tsx`,
      destUseCase: "tool_output",
      destUseCaseMetadata: {
        conversationId: conversation.sId,
        frameBundleRootPath: scopedRoot,
        frameEntryRelPath: "frame.tsx",
      },
    });

    const affected = await FileResource.fetchPublishedFramesForScopedPath(
      auth,
      `${scopedRoot}/components/chart.tsx`
    );
    const unrelated = await FileResource.fetchPublishedFramesForScopedPath(
      auth,
      `conversation-${conversation.sId}/dashboard-other/chart.tsx`
    );

    expect(affected.map((candidate) => candidate.sId)).toContain(frame.sId);
    expect(unrelated.map((candidate) => candidate.sId)).not.toContain(
      frame.sId
    );
  });
});
