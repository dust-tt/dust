import { randomUUID } from "node:crypto";
import { applyFileSystemOperation } from "@app/lib/api/file_system/namespace";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import type { FileSystemNodeType } from "@app/lib/api/file_system/namespace_types";
import { FILE_SYSTEM_CONTENT_MAX_BYTES } from "@app/lib/api/file_system/namespace_types";
import type { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { beforeEach, describe, expect, it } from "vitest";

beforeEach(() => {
  fileStorageMock.setFileMetadata(() => ({
    size: "14",
    contentType: "text/plain",
    contentEncoding: "identity",
  }));
});

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

async function createEmptyFile(
  auth: Authenticator,
  scope: FileSystemScope,
  name: string
): Promise<FileSystemNodeType> {
  const initializedRes = await applyFileSystemOperation(auth, scope, {
    operation: "initialize",
  });
  if (initializedRes.isErr()) {
    throw initializedRes.error;
  }
  const root = requireNode(initializedRes.value.roots?.[0]);
  const createdRes = await applyFileSystemOperation(auth, scope, {
    operation: "create",
    requestId: randomUUID(),
    parentId: root.id,
    name,
    kind: "file",
    mode: 0o644,
  });
  if (createdRes.isErr()) {
    throw createdRes.error;
  }

  return requireNode(createdRes.value.node ?? undefined);
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

describe("filesystem content", () => {
  it("commits one immutable blob and returns it for reads", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const scope = readableScope(`conversation-${randomUUID()}`);
    const file = await createEmptyFile(authenticator, scope, "notes.txt");

    const emptyContentRes = await applyFileSystemOperation(
      authenticator,
      scope,
      { operation: "getContent", nodeId: file.id }
    );
    expect(emptyContentRes.isOk() && emptyContentRes.value.content).toEqual({
      blobId: null,
      downloadUrl: null,
      size: 0,
      contentType: null,
    });

    const preparedRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "prepareContentUpload",
      nodeId: file.id,
      expectedBlobId: null,
      expectedSizeBytes: 14,
      contentType: "application/octet-stream",
    });
    if (preparedRes.isErr() || !preparedRes.value.upload) {
      throw new Error("Failed to prepare filesystem content.");
    }
    const upload = preparedRes.value.upload;
    const objectPath = `w/${workspace.sId}/filesystem/blobs/${file.id}/${upload.blobId}`;
    expect(upload).toEqual({
      blobId: expect.any(String),
      uploadUrl: "https://signed-upload-url.test",
      contentType: "text/plain",
      expectedSizeBytes: 14,
      headers: {
        "content-encoding": "identity",
        "content-length": "14",
        "content-type": "text/plain",
        "x-goog-if-generation-match": "0",
      },
    });
    expect(fileStorageMock.signedUploadUrlCalls).toContainEqual({
      filePath: objectPath,
      options: {
        contentType: "text/plain",
        expirationDelayMs: expect.any(Number),
        extensionHeaders: {
          "content-encoding": "identity",
          "content-length": "14",
          "x-goog-if-generation-match": "0",
        },
      },
    });

    const commitRequest = {
      operation: "commitContentUpload" as const,
      nodeId: file.id,
      expectedBlobId: null,
      blobId: upload.blobId,
      expectedSizeBytes: upload.expectedSizeBytes,
      contentType: upload.contentType,
    };
    const committedRes = await applyFileSystemOperation(
      authenticator,
      scope,
      commitRequest
    );
    fileStorageMock.setFileMetadata(() => {
      throw Object.assign(new Error("Storage unavailable"), { code: 503 });
    });
    const retriedRes = await applyFileSystemOperation(
      authenticator,
      scope,
      commitRequest
    );

    expect(committedRes.isOk() && committedRes.value.node).toMatchObject({
      id: file.id,
      blobId: upload.blobId,
      size: 14,
      contentType: "text/plain",
      contentRevision: 1,
    });
    expect(retriedRes.isOk() && retriedRes.value.node).toMatchObject({
      blobId: upload.blobId,
      contentRevision: 1,
    });
    expect(fileStorageMock.metadataCalls).toHaveLength(1);

    const contentRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "getContent",
      nodeId: file.id,
    });
    expect(contentRes.isOk() && contentRes.value.content).toEqual({
      blobId: upload.blobId,
      downloadUrl: "https://signed-url.test",
      size: 14,
      contentType: "text/plain",
    });
    expect(fileStorageMock.signedUrlCalls).toContainEqual({
      filePath: objectPath,
      options: { expirationDelayMs: expect.any(Number) },
    });
  });

  it("rejects an upload when another content version commits first", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const scope = readableScope(`conversation-${randomUUID()}`);
    const file = await createEmptyFile(authenticator, scope, "race.txt");

    const firstPrepareRes = await applyFileSystemOperation(
      authenticator,
      scope,
      {
        operation: "prepareContentUpload",
        nodeId: file.id,
        expectedBlobId: null,
        expectedSizeBytes: 14,
        contentType: "text/plain",
      }
    );
    const secondPrepareRes = await applyFileSystemOperation(
      authenticator,
      scope,
      {
        operation: "prepareContentUpload",
        nodeId: file.id,
        expectedBlobId: null,
        expectedSizeBytes: 14,
        contentType: "text/plain",
      }
    );
    if (
      firstPrepareRes.isErr() ||
      secondPrepareRes.isErr() ||
      !firstPrepareRes.value.upload ||
      !secondPrepareRes.value.upload
    ) {
      throw new Error("Failed to prepare concurrent uploads.");
    }

    const committedRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "commitContentUpload",
      nodeId: file.id,
      expectedBlobId: null,
      blobId: firstPrepareRes.value.upload.blobId,
      expectedSizeBytes: firstPrepareRes.value.upload.expectedSizeBytes,
      contentType: firstPrepareRes.value.upload.contentType,
    });
    const staleCommitRes = await applyFileSystemOperation(
      authenticator,
      scope,
      {
        operation: "commitContentUpload",
        nodeId: file.id,
        expectedBlobId: null,
        blobId: secondPrepareRes.value.upload.blobId,
        expectedSizeBytes: secondPrepareRes.value.upload.expectedSizeBytes,
        contentType: secondPrepareRes.value.upload.contentType,
      }
    );

    expect(committedRes.isOk()).toBe(true);
    expect(staleCommitRes.isErr() && staleCommitRes.error.code).toBe("stale");
  });

  it("normalizes MIME types and rejects files above the size limit", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const scope = readableScope(`conversation-${randomUUID()}`);
    const file = await createEmptyFile(authenticator, scope, "content.unknown");

    const normalizedRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "prepareContentUpload",
      nodeId: file.id,
      expectedBlobId: null,
      expectedSizeBytes: 0,
      contentType: "TEXT/HTML; charset=utf-8",
    });
    const oversizedRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "prepareContentUpload",
      nodeId: file.id,
      expectedBlobId: null,
      expectedSizeBytes: FILE_SYSTEM_CONTENT_MAX_BYTES + 1,
      contentType: "text/plain",
    });

    expect(normalizedRes.isOk() && normalizedRes.value.upload).toMatchObject({
      contentType: "text/html",
      expectedSizeBytes: 0,
    });
    expect(oversizedRes.isErr() && oversizedRes.error.code).toBe(
      "invalid_operation"
    );
  });

  it("rejects storage metadata that would change the served bytes", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const scope = readableScope(`conversation-${randomUUID()}`);
    const file = await createEmptyFile(authenticator, scope, "encoded.txt");
    const preparedRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "prepareContentUpload",
      nodeId: file.id,
      expectedBlobId: null,
      expectedSizeBytes: 14,
      contentType: "text/plain",
    });
    if (preparedRes.isErr() || !preparedRes.value.upload) {
      throw new Error("Failed to prepare encoded content.");
    }
    fileStorageMock.setFileMetadata(() => ({
      size: "14",
      contentType: "text/plain",
      contentEncoding: "gzip",
    }));

    const committedRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "commitContentUpload",
      nodeId: file.id,
      expectedBlobId: null,
      blobId: preparedRes.value.upload.blobId,
      expectedSizeBytes: preparedRes.value.upload.expectedSizeBytes,
      contentType: preparedRes.value.upload.contentType,
    });

    expect(committedRes.isErr() && committedRes.error.code).toBe(
      "invalid_operation"
    );
  });

  it("maps missing uploads but lets storage outages remain retryable", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const scope = readableScope(`conversation-${randomUUID()}`);
    const file = await createEmptyFile(authenticator, scope, "retry.txt");
    const preparedRes = await applyFileSystemOperation(authenticator, scope, {
      operation: "prepareContentUpload",
      nodeId: file.id,
      expectedBlobId: null,
      expectedSizeBytes: 14,
      contentType: "text/plain",
    });
    if (preparedRes.isErr() || !preparedRes.value.upload) {
      throw new Error("Failed to prepare retryable content.");
    }
    const commitRequest = {
      operation: "commitContentUpload" as const,
      nodeId: file.id,
      expectedBlobId: null,
      blobId: preparedRes.value.upload.blobId,
      expectedSizeBytes: preparedRes.value.upload.expectedSizeBytes,
      contentType: preparedRes.value.upload.contentType,
    };

    fileStorageMock.setFileMetadata(() => {
      throw Object.assign(new Error("Object not found"), { code: 404 });
    });
    const missingRes = await applyFileSystemOperation(
      authenticator,
      scope,
      commitRequest
    );
    fileStorageMock.setFileMetadata(() => {
      throw Object.assign(new Error("Storage unavailable"), { code: 503 });
    });

    expect(missingRes.isErr() && missingRes.error.code).toBe("not_found");
    await expect(
      applyFileSystemOperation(authenticator, scope, commitRequest)
    ).rejects.toThrow("Storage unavailable");
  });

  it("requires a file in a writable root", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const conversationId = `conversation-${randomUUID()}`;
    const writableScope = readableScope(conversationId);
    const file = await createEmptyFile(
      authenticator,
      writableScope,
      "readonly.txt"
    );
    const initializedRes = await applyFileSystemOperation(
      authenticator,
      writableScope,
      { operation: "initialize" }
    );
    if (initializedRes.isErr()) {
      throw initializedRes.error;
    }
    const root = requireNode(initializedRes.value.roots?.[0]);

    const writeDeniedRes = await applyFileSystemOperation(
      authenticator,
      readOnlyScope(conversationId),
      {
        operation: "prepareContentUpload",
        nodeId: file.id,
        expectedBlobId: null,
        expectedSizeBytes: 14,
        contentType: "text/plain",
      }
    );
    const directoryContentRes = await applyFileSystemOperation(
      authenticator,
      writableScope,
      { operation: "getContent", nodeId: root.id }
    );

    expect(writeDeniedRes.isErr() && writeDeniedRes.error.code).toBe(
      "unauthorized"
    );
    expect(directoryContentRes.isErr() && directoryContentRes.error.code).toBe(
      "invalid_operation"
    );
  });
});
