import { randomUUID } from "node:crypto";
import { applyFileSystemOperation } from "@app/lib/api/file_system/namespace";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type { FileSystemNode } from "@app/lib/api/file_system/namespace_types";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

function writableScope(conversationId: string, podId?: string) {
  return new FileSystemScope([
    {
      kind: "conversation",
      id: conversationId,
      name: `conversation-${conversationId}`,
      permissions: { canRead: true, canWrite: true },
    },
    ...(podId
      ? [
          {
            kind: "pod" as const,
            id: podId,
            name: `pod-${podId}`,
            permissions: { canRead: true, canWrite: true },
          },
        ]
      : []),
  ]);
}

function requireNode(node: FileSystemNode | null | undefined): FileSystemNode {
  if (!node) {
    throw new Error("Missing filesystem node.");
  }
  return node;
}

describe("database filesystem namespace", () => {
  it("replays namespace changes and preserves POSIX inode identity", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversationId = `conv-${randomUUID()}`;
    const podId = `pod-${randomUUID()}`;
    const scope = writableScope(conversationId, podId);
    const initialized = await applyFileSystemOperation(auth, scope, {
      operation: "initialize",
    });
    if (initialized.isErr()) {
      throw initialized.error;
    }
    const conversationRoot = requireNode(
      initialized.value.roots?.find((root) => root.rootKind === "conversation")
    );
    const podRoot = requireNode(
      initialized.value.roots?.find((root) => root.rootKind === "pod")
    );

    const createRequestId = randomUUID();
    const created = await applyFileSystemOperation(auth, scope, {
      operation: "create",
      requestId: createRequestId,
      parentId: conversationRoot.id,
      name: "Frame.tsx",
      kind: "file",
      mode: 0o644,
    });
    if (created.isErr()) {
      throw created.error;
    }
    const createdNode = requireNode(created.value.node);
    const createRetry = await applyFileSystemOperation(auth, scope, {
      operation: "create",
      requestId: createRequestId,
      parentId: conversationRoot.id,
      name: "Frame.tsx",
      kind: "file",
      mode: 0o644,
    });
    expect(createRetry.isOk() && createRetry.value.node?.id).toBe(
      createdNode.id
    );

    const renameRequestId = randomUUID();
    const moved = await applyFileSystemOperation(auth, scope, {
      operation: "rename",
      requestId: renameRequestId,
      parentId: conversationRoot.id,
      name: "Frame.tsx",
      newParentId: podRoot.id,
      newName: "Frame.tsx",
    });
    expect(moved.isOk() && moved.value.node).toMatchObject({
      id: createdNode.id,
      rootKind: "pod",
      rootId: podId,
    });
    const moveRetry = await applyFileSystemOperation(auth, scope, {
      operation: "rename",
      requestId: renameRequestId,
      parentId: conversationRoot.id,
      name: "Frame.tsx",
      newParentId: podRoot.id,
      newName: "Frame.tsx",
    });
    expect(moveRetry).toEqual(moved);

    // Atomic editor saves rename a temporary inode over the old inode, just
    // like a local filesystem. The new inode becomes the visible file.
    const temporary = await applyFileSystemOperation(auth, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: podRoot.id,
      name: ".Frame.tsx.tmp",
      kind: "file",
      mode: 0o644,
    });
    if (temporary.isErr()) {
      throw temporary.error;
    }
    const temporaryNode = requireNode(temporary.value.node);
    const saved = await applyFileSystemOperation(auth, scope, {
      operation: "rename",
      requestId: randomUUID(),
      parentId: podRoot.id,
      name: ".Frame.tsx.tmp",
      newParentId: podRoot.id,
      newName: "Frame.tsx",
    });
    expect(saved.isOk() && saved.value).toMatchObject({
      node: { id: temporaryNode.id, name: "Frame.tsx" },
      removedNodeId: createdNode.id,
    });

    const removeRequestId = randomUUID();
    const removed = await applyFileSystemOperation(auth, scope, {
      operation: "remove",
      requestId: removeRequestId,
      parentId: podRoot.id,
      name: "Frame.tsx",
    });
    expect(removed.isOk() && removed.value).toEqual({
      removedNodeId: temporaryNode.id,
      removedFileResourceId: null,
    });
    const removeRetry = await applyFileSystemOperation(auth, scope, {
      operation: "remove",
      requestId: removeRequestId,
      parentId: podRoot.id,
      name: "Frame.tsx",
    });
    expect(removeRetry).toEqual(removed);
  });

  it("rejects deleting a non-empty directory", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversationId = `conv-${randomUUID()}`;
    const scope = writableScope(conversationId);
    const initialized = await applyFileSystemOperation(auth, scope, {
      operation: "initialize",
    });
    if (initialized.isErr()) {
      throw initialized.error;
    }
    const root = requireNode(initialized.value.roots?.[0]);
    const directory = await applyFileSystemOperation(auth, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: root.id,
      name: "directory",
      kind: "directory",
      mode: 0o755,
    });
    if (directory.isErr()) {
      throw directory.error;
    }
    const directoryNode = requireNode(directory.value.node);
    await applyFileSystemOperation(auth, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: directoryNode.id,
      name: "child.txt",
      kind: "file",
      mode: 0o644,
    });
    const removed = await applyFileSystemOperation(auth, scope, {
      operation: "remove",
      requestId: randomUUID(),
      parentId: root.id,
      name: "directory",
    });
    expect(removed.isErr() && removed.error.code).toBe("not_empty");
  });

  it("moves a non-empty directory across roots without changing inode IDs", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const conversationId = `conv-${randomUUID()}`;
    const podId = `pod-${randomUUID()}`;
    const scope = writableScope(conversationId, podId);
    const initialized = await applyFileSystemOperation(auth, scope, {
      operation: "initialize",
    });
    if (initialized.isErr()) {
      throw initialized.error;
    }
    const conversationRoot = requireNode(
      initialized.value.roots?.find((root) => root.rootKind === "conversation")
    );
    const podRoot = requireNode(
      initialized.value.roots?.find((root) => root.rootKind === "pod")
    );
    const project = await applyFileSystemOperation(auth, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: conversationRoot.id,
      name: "project",
      kind: "directory",
      mode: 0o755,
    });
    if (project.isErr()) {
      throw project.error;
    }
    const projectNode = requireNode(project.value.node);
    const nested = await applyFileSystemOperation(auth, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: projectNode.id,
      name: "nested",
      kind: "directory",
      mode: 0o755,
    });
    if (nested.isErr()) {
      throw nested.error;
    }
    const nestedNode = requireNode(nested.value.node);
    const child = await applyFileSystemOperation(auth, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: nestedNode.id,
      name: "child.txt",
      kind: "file",
      mode: 0o644,
    });
    if (child.isErr()) {
      throw child.error;
    }
    const childNode = requireNode(child.value.node);

    const moved = await applyFileSystemOperation(auth, scope, {
      operation: "rename",
      requestId: randomUUID(),
      parentId: conversationRoot.id,
      name: "project",
      newParentId: podRoot.id,
      newName: "project",
    });
    expect(moved.isOk() && moved.value.node).toMatchObject({
      id: projectNode.id,
      rootKind: "pod",
      rootId: podId,
    });
    const movedChild = await applyFileSystemOperation(auth, scope, {
      operation: "getAttr",
      nodeId: childNode.id,
    });
    expect(movedChild.isOk() && movedChild.value.node).toMatchObject({
      id: childNode.id,
      rootKind: "pod",
      rootId: podId,
    });

    const cycle = await applyFileSystemOperation(auth, scope, {
      operation: "rename",
      requestId: randomUUID(),
      parentId: podRoot.id,
      name: "project",
      newParentId: nestedNode.id,
      newName: "project",
    });
    expect(cycle.isErr() && cycle.error.code).toBe("invalid_operation");
  });
});
