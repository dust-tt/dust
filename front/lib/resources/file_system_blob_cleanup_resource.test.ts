import { randomUUID } from "node:crypto";
import { applyFileSystemOperation } from "@app/lib/api/file_system/namespace";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemContentUploadType,
  FileSystemNodeType,
} from "@app/lib/api/file_system/namespace_types";
import { FileSystemBlobCleanupResource } from "@app/lib/resources/file_system_blob_cleanup_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { afterEach, describe, expect, it, vi } from "vitest";

const { deleteBlob, getBlobMetadata } = vi.hoisted(() => ({
  deleteBlob: vi.fn(async () => undefined),
  getBlobMetadata: vi.fn(async (_path: string) => [
    { size: "7", contentType: "text/plain" },
  ]),
}));

vi.mock("@app/lib/file_storage", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/file_storage")>();
  return {
    ...original,
    getPrivateUploadBucket: () => ({
      delete: deleteBlob,
      file: (path: string) => ({
        getMetadata: () => getBlobMetadata(path),
      }),
      getSignedUploadUrl: vi.fn(async () => "https://upload.example.com"),
    }),
  };
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("FileSystemBlobCleanupResource", () => {
  it("deletes an abandoned upload but keeps a committed blob", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const conversationId = `conversation-${randomUUID()}`;
    const scope = new FileSystemScope([
      {
        kind: "conversation",
        id: conversationId,
        name: conversationId,
        permissions: { canRead: true, canWrite: true },
      },
    ]);
    const initializedRes = await applyFileSystemOperation(
      authenticator,
      scope,
      {
        operation: "initialize",
      }
    );
    if (initializedRes.isErr() || !initializedRes.value.roots?.[0]) {
      throw new Error("Failed to initialize the filesystem root.");
    }
    const root = initializedRes.value.roots[0];

    const preparedFiles: Array<{
      node: FileSystemNodeType;
      upload: FileSystemContentUploadType;
    }> = [];
    for (const name of ["abandoned.txt", "committed.txt"]) {
      const createdRes = await applyFileSystemOperation(authenticator, scope, {
        operation: "create",
        requestId: randomUUID(),
        parentId: root.id,
        name,
        kind: "file",
        mode: 0o644,
      });
      if (createdRes.isErr() || !createdRes.value.node) {
        throw new Error(`Failed to create ${name}.`);
      }
      const preparedRes = await applyFileSystemOperation(authenticator, scope, {
        operation: "prepareContentUpload",
        nodeId: createdRes.value.node.id,
        expectedBlobId: null,
        contentType: "text/plain",
      });
      if (preparedRes.isErr() || !preparedRes.value.upload) {
        throw new Error(`Failed to prepare ${name}.`);
      }
      preparedFiles.push({
        node: createdRes.value.node,
        upload: preparedRes.value.upload,
      });
    }

    const committedRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "commitContentUpload",
      nodeId: preparedFiles[1].node.id,
      expectedBlobId: null,
      blobId: preparedFiles[1].upload.blobId,
      contentType: preparedFiles[1].upload.contentType,
    });
    expect(committedRes.isOk()).toBe(true);

    vi.advanceTimersByTime(25 * 60 * 60 * 1_000);
    expect(
      await FileSystemBlobCleanupResource.dangerouslyListWorkspaceModelIdsWithDueCleanup()
    ).toContain(workspace.id);

    await FileSystemBlobCleanupResource.repairPending(authenticator);

    expect(deleteBlob).toHaveBeenCalledTimes(1);
    expect(deleteBlob).toHaveBeenCalledWith(
      `w/${workspace.sId}/filesystem/blobs/${preparedFiles[0].node.id}/${preparedFiles[0].upload.blobId}`,
      { ignoreNotFound: true }
    );
    expect(
      await FileSystemBlobCleanupResource.dangerouslyListWorkspaceModelIdsWithDueCleanup()
    ).not.toContain(workspace.id);
  });
});
