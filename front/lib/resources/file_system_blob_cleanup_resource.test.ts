import { randomUUID } from "node:crypto";
import { applyFileSystemOperation } from "@app/lib/api/file_system/namespace";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type {
  FileSystemContentUploadType,
  FileSystemNodeType,
} from "@app/lib/api/file_system/namespace_types";
import { FileSystemBlobCleanupResource } from "@app/lib/resources/file_system_blob_cleanup_resource";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { describe, expect, it } from "vitest";

describe("FileSystemBlobCleanupResource", () => {
  it("keeps abandoned uploads queued and removes committed uploads", async () => {
    fileStorageMock.setFileMetadata(() => ({
      size: "7",
      contentType: "text/plain",
      contentEncoding: "identity",
    }));
    const { authenticator } = await createResourceTest({ role: "admin" });
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
      { operation: "initialize" }
    );
    if (initializedRes.isErr() || !initializedRes.value.roots?.[0]) {
      throw new Error("Failed to initialize the filesystem root.");
    }

    const preparedFiles: Array<{
      node: FileSystemNodeType;
      upload: FileSystemContentUploadType;
    }> = [];
    for (const name of ["abandoned.txt", "committed.txt"]) {
      const createdRes = await applyFileSystemOperation(authenticator, scope, {
        operation: "create",
        requestId: randomUUID(),
        parentId: initializedRes.value.roots[0].id,
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
        expectedSizeBytes: 7,
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

    const abandonedNode = await FileSystemNodeResource.fetchById(
      authenticator,
      scope,
      preparedFiles[0].node.id
    );
    const committedNode = await FileSystemNodeResource.fetchById(
      authenticator,
      scope,
      preparedFiles[1].node.id
    );
    if (!abandonedNode || !committedNode) {
      throw new Error("Failed to fetch prepared filesystem files.");
    }

    expect(
      await FileSystemBlobCleanupResource.fetchForBlob(
        authenticator,
        abandonedNode,
        { blobId: preparedFiles[0].upload.blobId }
      )
    ).not.toBeNull();

    const committedRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "commitContentUpload",
      nodeId: committedNode.id,
      expectedBlobId: null,
      blobId: preparedFiles[1].upload.blobId,
      expectedSizeBytes: preparedFiles[1].upload.expectedSizeBytes,
      contentType: preparedFiles[1].upload.contentType,
    });
    expect(committedRes.isOk()).toBe(true);
    expect(
      await FileSystemBlobCleanupResource.fetchForBlob(
        authenticator,
        committedNode,
        { blobId: preparedFiles[1].upload.blobId }
      )
    ).toBeNull();
  });
});
