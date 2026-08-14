import { randomUUID } from "node:crypto";
import { applyFileSystemOperation } from "@app/lib/api/file_system/namespace";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type { FileSystemNodeType } from "@app/lib/api/file_system/namespace_types";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { describe, expect, it } from "vitest";

function readableScope(conversationId: string, podId?: string) {
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

function readOnlyScope(conversationId: string) {
  return new FileSystemScope([
    {
      kind: "conversation",
      id: conversationId,
      name: `conversation-${conversationId}`,
      permissions: { canRead: true, canWrite: false },
    },
  ]);
}

function requireNode(node: FileSystemNodeType | undefined): FileSystemNodeType {
  if (!node) {
    throw new Error("Missing filesystem node.");
  }
  return node;
}

describe("filesystem namespace reads", () => {
  it("initializes stable conversation and Pod roots", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const scope = readableScope(
      `conversation-${randomUUID()}`,
      `pod-${randomUUID()}`
    );

    const first = await applyFileSystemOperation(authenticator, scope, {
      operation: "initialize",
    });
    const second = await applyFileSystemOperation(authenticator, scope, {
      operation: "initialize",
    });

    expect(first.isOk()).toBe(true);
    expect(second.isOk()).toBe(true);
    if (first.isErr() || second.isErr()) {
      return;
    }
    expect(first.value.roots).toHaveLength(2);
    expect(second.value.roots?.map((root) => root.id)).toEqual(
      first.value.roots?.map((root) => root.id)
    );
    expect(first.value.roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "directory",
          rootKind: "conversation",
        }),
        expect.objectContaining({ kind: "directory", rootKind: "pod" }),
      ])
    );
  });

  it("reads an initialized root", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const scope = readableScope(`conversation-${randomUUID()}`);
    const initialized = await applyFileSystemOperation(authenticator, scope, {
      operation: "initialize",
    });
    if (initialized.isErr()) {
      throw initialized.error;
    }
    const root = requireNode(initialized.value.roots?.[0]);

    const attributes = await applyFileSystemOperation(authenticator, scope, {
      operation: "getAttr",
      nodeId: root.id,
    });
    const directory = await applyFileSystemOperation(authenticator, scope, {
      operation: "readDir",
      nodeId: root.id,
      afterName: null,
      limit: 32,
    });
    const missing = await applyFileSystemOperation(authenticator, scope, {
      operation: "lookup",
      parentId: root.id,
      name: "missing.txt",
    });

    expect(attributes.isOk() && attributes.value.node).toEqual(root);
    expect(directory.isOk() && directory.value).toEqual({
      nodes: [],
      nextAfterName: null,
    });
    expect(missing.isOk() && missing.value.node).toBeNull();
  });

  it("does not read a node outside the selected roots", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const firstScope = readableScope(`conversation-${randomUUID()}`);
    const secondScope = readableScope(`conversation-${randomUUID()}`);
    const initialized = await applyFileSystemOperation(
      authenticator,
      firstScope,
      { operation: "initialize" }
    );
    if (initialized.isErr()) {
      throw initialized.error;
    }
    const root = requireNode(initialized.value.roots?.[0]);

    const result = await applyFileSystemOperation(authenticator, secondScope, {
      operation: "getAttr",
      nodeId: root.id,
    });

    expect(result.isErr() && result.error.code).toBe("not_found");
  });
});

describe("filesystem namespace creation", () => {
  it("creates empty directories and files with stable node identities", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const conversationId = `conversation-${randomUUID()}`;
    const scope = readableScope(conversationId);
    const initialized = await applyFileSystemOperation(authenticator, scope, {
      operation: "initialize",
    });
    if (initialized.isErr()) {
      throw initialized.error;
    }
    const root = requireNode(initialized.value.roots?.[0]);

    const directory = await applyFileSystemOperation(authenticator, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: root.id,
      name: "src",
      kind: "directory",
      mode: 0o755,
    });
    if (directory.isErr()) {
      throw directory.error;
    }
    const directoryNode = requireNode(directory.value.node ?? undefined);

    const file = await applyFileSystemOperation(authenticator, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: directoryNode.id,
      name: "index.ts",
      kind: "file",
      mode: 0o644,
    });
    if (file.isErr()) {
      throw file.error;
    }
    const fileNode = requireNode(file.value.node ?? undefined);

    expect(directoryNode).toEqual(
      expect.objectContaining({
        parentId: root.id,
        rootKind: "conversation",
        rootId: conversationId,
        name: "src",
        kind: "directory",
        mode: 0o755,
      })
    );
    expect(fileNode).toEqual(
      expect.objectContaining({
        parentId: directoryNode.id,
        rootKind: "conversation",
        rootId: conversationId,
        name: "index.ts",
        kind: "file",
        mode: 0o644,
        size: 0,
        blobId: null,
        contentRevision: 0,
      })
    );

    const lookup = await applyFileSystemOperation(authenticator, scope, {
      operation: "lookup",
      parentId: directoryNode.id,
      name: "index.ts",
    });
    expect(lookup.isOk() && lookup.value.node?.id).toBe(fileNode.id);
  });

  it("returns the same node when a create request is retried", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const scope = readableScope(`conversation-${randomUUID()}`);
    const initialized = await applyFileSystemOperation(authenticator, scope, {
      operation: "initialize",
    });
    if (initialized.isErr()) {
      throw initialized.error;
    }
    const root = requireNode(initialized.value.roots?.[0]);
    const request = {
      operation: "create" as const,
      requestId: randomUUID(),
      parentId: root.id,
      name: "retry.txt",
      kind: "file" as const,
      mode: 0o644,
    };

    const first = await applyFileSystemOperation(authenticator, scope, request);
    const retry = await applyFileSystemOperation(authenticator, scope, request);
    const directory = await applyFileSystemOperation(authenticator, scope, {
      operation: "readDir",
      nodeId: root.id,
      afterName: null,
      limit: 32,
    });

    expect(first.isOk() && first.value.node?.id).toBeDefined();
    expect(retry.isOk() && retry.value.node?.id).toBe(
      first.isOk() ? first.value.node?.id : undefined
    );
    expect(
      directory.isOk() &&
        directory.value.nodes?.filter((node) => node.name === request.name)
    ).toHaveLength(1);
  });

  it("does not replace an existing name", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const scope = readableScope(`conversation-${randomUUID()}`);
    const initialized = await applyFileSystemOperation(authenticator, scope, {
      operation: "initialize",
    });
    if (initialized.isErr()) {
      throw initialized.error;
    }
    const root = requireNode(initialized.value.roots?.[0]);

    const first = await applyFileSystemOperation(authenticator, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: root.id,
      name: "existing",
      kind: "file",
      mode: 0o644,
    });
    const conflict = await applyFileSystemOperation(authenticator, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: root.id,
      name: "existing",
      kind: "directory",
      mode: 0o755,
    });

    expect(first.isOk()).toBe(true);
    expect(conflict.isErr() && conflict.error.code).toBe("already_exists");
  });

  it("requires a writable directory and a valid name", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const conversationId = `conversation-${randomUUID()}`;
    const scope = readableScope(conversationId);
    const initialized = await applyFileSystemOperation(authenticator, scope, {
      operation: "initialize",
    });
    if (initialized.isErr()) {
      throw initialized.error;
    }
    const root = requireNode(initialized.value.roots?.[0]);

    const writeDenied = await applyFileSystemOperation(
      authenticator,
      readOnlyScope(conversationId),
      {
        operation: "create",
        requestId: randomUUID(),
        parentId: root.id,
        name: "blocked.txt",
        kind: "file",
        mode: 0o644,
      }
    );
    const invalidName = await applyFileSystemOperation(authenticator, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: root.id,
      name: "nested/file.txt",
      kind: "file",
      mode: 0o644,
    });
    const file = await applyFileSystemOperation(authenticator, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: root.id,
      name: "parent.txt",
      kind: "file",
      mode: 0o644,
    });
    if (file.isErr()) {
      throw file.error;
    }
    const fileNode = requireNode(file.value.node ?? undefined);
    const fileAsParent = await applyFileSystemOperation(authenticator, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: fileNode.id,
      name: "child.txt",
      kind: "file",
      mode: 0o644,
    });

    expect(writeDenied.isErr() && writeDenied.error.code).toBe("unauthorized");
    expect(invalidName.isErr() && invalidName.error.code).toBe(
      "invalid_operation"
    );
    expect(fileAsParent.isErr() && fileAsParent.error.code).toBe("not_found");
  });
});
