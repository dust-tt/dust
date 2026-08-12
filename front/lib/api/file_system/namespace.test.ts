import { randomUUID } from "node:crypto";
import type { FileSystemFileBinding } from "@app/lib/api/file_system/file_binding";
import { applyFileSystemOperation } from "@app/lib/api/file_system/namespace";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import { FileSystemNodeModel } from "@app/lib/resources/storage/models/file_system_node";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it, vi } from "vitest";

describe("database filesystem namespace", () => {
  it("keeps Frame identity through cross-root move, editor save, and delete", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversationId = `conv-${randomUUID()}`;
    const podId = `pod-${randomUUID()}`;
    const scope = new FileSystemScope([
      {
        kind: "conversation",
        id: conversationId,
        name: `conversation-${conversationId}`,
        permissions: { canRead: true, canWrite: true },
      },
      {
        kind: "pod",
        id: podId,
        name: `pod-${podId}`,
        permissions: { canRead: true, canWrite: true },
      },
    ]);
    const frame = await FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName: "Frame.tsx",
      fileSize: 0,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId },
    });
    const binding: FileSystemFileBinding = {
      resolveFileModelId: vi.fn(async (_auth, sId) =>
        sId === frame.sId ? frame.id : null
      ),
      deleteFile: vi.fn(async () => new Ok(undefined)),
      moveFile: vi.fn(async () => new Ok(undefined)),
    };

    const initialized = await applyFileSystemOperation(auth, scope, binding, {
      operation: "initialize",
    });
    if (initialized.isErr() || !initialized.value.roots) {
      throw initialized.isErr()
        ? initialized.error
        : new Error("Missing filesystem roots.");
    }
    const conversationRoot = initialized.value.roots.find(
      (root) => root.rootKind === "conversation"
    );
    const podRoot = initialized.value.roots.find(
      (root) => root.rootKind === "pod"
    );
    if (!conversationRoot || !podRoot) {
      throw new Error("Missing conversation or Pod root.");
    }

    const created = await applyFileSystemOperation(auth, scope, binding, {
      operation: "create",
      parentId: conversationRoot.id,
      name: "Frame.tsx",
      kind: "file",
      mode: 0o644,
    });
    if (created.isErr() || !created.value.node) {
      throw created.isErr()
        ? created.error
        : new Error("Missing created node.");
    }
    const attached = await applyFileSystemOperation(auth, scope, binding, {
      operation: "attachFileResource",
      nodeId: created.value.node.id,
      fileResourceId: frame.sId,
    });
    expect(attached.isOk() && attached.value.node?.fileResourceId).toBe(
      frame.sId
    );

    const requestId = randomUUID();
    const moved = await applyFileSystemOperation(auth, scope, binding, {
      operation: "rename",
      requestId,
      parentId: conversationRoot.id,
      name: "Frame.tsx",
      newParentId: podRoot.id,
      newName: "Frame.tsx",
    });
    if (moved.isErr() || !moved.value.node) {
      throw moved.isErr() ? moved.error : new Error("Missing moved node.");
    }
    expect(moved.value.node).toMatchObject({
      id: created.value.node.id,
      rootKind: "pod",
      rootId: podId,
      fileResourceId: frame.sId,
    });
    expect(binding.moveFile).toHaveBeenCalledWith(
      auth,
      frame.sId,
      expect.objectContaining({
        rootKind: "pod",
        rootId: podId,
        relativePath: "Frame.tsx",
      })
    );

    const retried = await applyFileSystemOperation(auth, scope, binding, {
      operation: "rename",
      requestId,
      parentId: conversationRoot.id,
      name: "Frame.tsx",
      newParentId: podRoot.id,
      newName: "Frame.tsx",
    });
    expect(retried.isOk() && retried.value.node?.id).toBe(
      created.value.node.id
    );

    const temporary = await applyFileSystemOperation(auth, scope, binding, {
      operation: "create",
      parentId: podRoot.id,
      name: ".Frame.tsx.tmp",
      kind: "file",
      mode: 0o644,
    });
    if (temporary.isErr() || !temporary.value.node) {
      throw temporary.isErr()
        ? temporary.error
        : new Error("Missing temporary node.");
    }
    const saved = await applyFileSystemOperation(auth, scope, binding, {
      operation: "rename",
      requestId: randomUUID(),
      parentId: podRoot.id,
      name: ".Frame.tsx.tmp",
      newParentId: podRoot.id,
      newName: "Frame.tsx",
    });
    expect(saved.isOk() && saved.value.node).toMatchObject({
      id: temporary.value.node.id,
      fileResourceId: frame.sId,
    });

    const removed = await applyFileSystemOperation(auth, scope, binding, {
      operation: "remove",
      requestId: randomUUID(),
      parentId: podRoot.id,
      name: "Frame.tsx",
    });
    expect(removed.isOk() && removed.value).toMatchObject({
      removedNodeId: temporary.value.node.id,
      removedFileResourceId: frame.sId,
    });
    expect(binding.deleteFile).toHaveBeenCalledWith(auth, frame.sId);
    expect(
      await FileSystemNodeModel.findOne({
        where: {
          id: temporary.value.node.id,
          workspaceId: auth.getNonNullableWorkspace().id,
        },
      })
    ).toBeNull();
  });

  it("rejects deleting a non-empty directory", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const rootId = `conv-${randomUUID()}`;
    const scope = new FileSystemScope([
      {
        kind: "conversation",
        id: rootId,
        name: `conversation-${rootId}`,
        permissions: { canRead: true, canWrite: true },
      },
    ]);
    const binding: FileSystemFileBinding = {
      resolveFileModelId: vi.fn(async () => null),
      deleteFile: vi.fn(async () => new Ok(undefined)),
      moveFile: vi.fn(async () => new Ok(undefined)),
    };
    const initialized = await applyFileSystemOperation(auth, scope, binding, {
      operation: "initialize",
    });
    const root = initialized.isOk() ? initialized.value.roots?.[0] : undefined;
    if (!root) {
      throw new Error("Missing root.");
    }
    const directory = await applyFileSystemOperation(auth, scope, binding, {
      operation: "create",
      parentId: root.id,
      name: "directory",
      kind: "directory",
      mode: 0o755,
    });
    const directoryNode = directory.isOk() ? directory.value.node : null;
    if (!directoryNode) {
      throw new Error("Missing directory.");
    }
    await applyFileSystemOperation(auth, scope, binding, {
      operation: "create",
      parentId: directoryNode.id,
      name: "child.txt",
      kind: "file",
      mode: 0o644,
    });
    const removed = await applyFileSystemOperation(auth, scope, binding, {
      operation: "remove",
      requestId: randomUUID(),
      parentId: root.id,
      name: "directory",
    });
    expect(removed.isErr() && removed.error.code).toBe("not_empty");
  });
});
