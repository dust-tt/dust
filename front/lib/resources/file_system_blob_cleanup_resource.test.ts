import { randomUUID } from "node:crypto";
import { applyFileSystemOperation } from "@app/lib/api/file_system/namespace";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import { FileSystemBlobCleanupResource } from "@app/lib/resources/file_system_blob_cleanup_resource";
import { FileSystemMutationResource } from "@app/lib/resources/file_system_mutation_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { afterEach, describe, expect, it, vi } from "vitest";

const { deleteBlob } = vi.hoisted(() => ({
  deleteBlob: vi.fn(async () => undefined),
}));

vi.mock("@app/lib/file_storage", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@app/lib/file_storage")>();
  return {
    ...original,
    getPrivateUploadBucket: () => ({ delete: deleteBlob }),
  };
});

describe("FileSystemBlobCleanupResource", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("discovers each due workspace and removes an abandoned blob", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const first = await createResourceTest({ role: "admin" });
    const second = await createResourceTest({ role: "admin" });
    const conversationId = `conversation-${randomUUID()}`;
    const scope = new FileSystemScope([
      {
        kind: "conversation",
        id: conversationId,
        name: conversationId,
        permissions: { canRead: true, canWrite: true },
      },
    ]);
    const initialized = await applyFileSystemOperation(
      first.authenticator,
      scope,
      { operation: "initialize" }
    );
    if (initialized.isErr() || !initialized.value.roots?.[0]) {
      throw new Error("Failed to initialize the test filesystem root.");
    }
    const created = await applyFileSystemOperation(first.authenticator, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: initialized.value.roots[0].id,
      name: "receipt.txt",
      kind: "file",
      mode: 0o644,
    });
    if (created.isErr()) {
      throw created.error;
    }
    await FileSystemBlobCleanupResource.registerUpload(first.authenticator, {
      nodeId: 101,
      blobId: "first-blob",
    });
    await FileSystemBlobCleanupResource.registerUpload(second.authenticator, {
      nodeId: 202,
      blobId: "second-blob",
    });
    vi.advanceTimersByTime(25 * 60 * 60 * 1_000);

    const dueWorkspaceModelIds =
      await FileSystemBlobCleanupResource.dangerouslyListWorkspaceModelIdsWithDueCleanup();
    expect(new Set(dueWorkspaceModelIds)).toEqual(
      new Set([first.workspace.id, second.workspace.id])
    );

    await FileSystemBlobCleanupResource.repairPending(first.authenticator);

    expect(deleteBlob).toHaveBeenCalledWith(
      `w/${first.workspace.sId}/filesystem/blobs/101/first-blob`,
      { ignoreNotFound: true }
    );
    expect(
      await FileSystemBlobCleanupResource.dangerouslyListWorkspaceModelIdsWithDueCleanup()
    ).toEqual([second.workspace.id]);

    vi.advanceTimersByTime(7 * 24 * 60 * 60 * 1_000);
    expect(
      await FileSystemMutationResource.dangerouslyListWorkspaceModelIdsWithExpiredReceipts()
    ).toContain(first.workspace.id);
    await FileSystemMutationResource.cleanupCompleted(first.authenticator);
    expect(
      await FileSystemMutationResource.dangerouslyListWorkspaceModelIdsWithExpiredReceipts()
    ).not.toContain(first.workspace.id);
  });
});
