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
