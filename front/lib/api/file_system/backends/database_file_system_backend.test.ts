import { randomUUID } from "node:crypto";
import { text } from "node:stream/consumers";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import { DATABASE_FILE_SYSTEM_POD_PREFIX } from "@app/lib/api/file_system/storage_mode";
import { enrichListWithFileResourceIds } from "@app/lib/api/files/file_system_ops";
import { Authenticator } from "@app/lib/auth";
import { FileSystemMutationResource } from "@app/lib/resources/file_system_mutation_resource";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameContentType } from "@app/types/files";
import assert from "assert";
import { describe, expect, it } from "vitest";

async function databaseFileSystem() {
  const { user, workspace } = await createResourceTest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace, user.id, {
    name: `${DATABASE_FILE_SYSTEM_POD_PREFIX}Backend test`,
  });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  const agent = await AgentConfigurationFactory.createTestAgent(auth);
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: agent.sId,
    messagesCreatedAt: [],
    spaceId: pod.id,
  });
  const result = await DustFileSystem.forConversation(auth, conversation);
  assert(result.isOk());
  const scope = new FileSystemScope(
    result.value.getMounts().flatMap((mount) =>
      mount.kind === "user"
        ? []
        : [
            {
              kind: mount.kind,
              id: mount.id,
              name: mount.scopedPrefix,
              permissions: mount.permissions,
            },
          ]
    )
  );
  const roots = await FileSystemNodeResource.ensureRoots(auth, scope);
  const conversationRoot = roots.find(
    (root) => root.rootKind === "conversation"
  );
  const podRoot = roots.find((root) => root.rootKind === "pod");
  assert(conversationRoot && podRoot);
  return {
    auth,
    conversation,
    dustFileSystem: result.value,
    pod,
    scope,
    conversationRoot,
    podRoot,
  };
}

describe("DatabaseFileSystemBackend", () => {
  it("writes and reads immutable GCS content through a database node", async () => {
    const { conversation, dustFileSystem } = await databaseFileSystem();
    const path = `conversation-${conversation.sId}/report.txt`;
    fileStorageMock.setFileMetadata(() => ({
      size: "5",
      contentType: "text/plain",
      contentEncoding: "identity",
    }));

    const written = await dustFileSystem.write(path, "hello", "text/plain");

    expect(written.isOk()).toBe(true);
    expect(fileStorageMock.saveFileCalls).toHaveLength(1);
    const [saved] = fileStorageMock.saveFileCalls;
    assert(saved);
    fileStorageMock.setFileContent((filePath) =>
      filePath === saved.filePath ? "hello" : null
    );
    const read = await dustFileSystem.read(path);
    assert(read.isOk() && read.value);
    expect(await text(read.value)).toBe("hello");
    expect(await dustFileSystem.stat(path)).toEqual(
      expect.objectContaining({
        value: { contentType: "text/plain", sizeBytes: 5 },
      })
    );
  });

  it("returns the id of the node a write or mkdir touched", async () => {
    const { auth, conversation, dustFileSystem, pod, scope } =
      await databaseFileSystem();
    fileStorageMock.setFileMetadata(() => ({
      size: "5",
      contentType: "text/plain",
      contentEncoding: "identity",
    }));

    const directory = await dustFileSystem.mkdir(
      `conversation-${conversation.sId}/reports`
    );
    assert(directory.isOk());
    expect(directory.value.entry).toMatchObject({
      isDirectory: true,
      fileName: "reports",
    });
    expect(directory.value.nodeId).not.toBeNull();

    const written = await dustFileSystem.write(
      `conversation-${conversation.sId}/reports/report.txt`,
      "hello",
      "text/plain"
    );
    assert(written.isOk());
    const { nodeId } = written.value;
    assert(nodeId !== null);

    // Overwriting reports the node that already carries the name, not a new one.
    const overwritten = await dustFileSystem.write(
      `conversation-${conversation.sId}/reports/report.txt`,
      "world",
      "text/plain"
    );
    assert(overwritten.isOk());
    expect(overwritten.value.nodeId).toBe(nodeId);

    // The id is what a caller may hold onto: it still names the same file
    // after a move, which a path would not.
    const moved = await dustFileSystem.move({
      src: `conversation-${conversation.sId}/reports/report.txt`,
      dest: `pod-${pod.sId}/report.txt`,
    });
    assert(moved.isOk());
    const node = await FileSystemNodeResource.fetchById(auth, scope, nodeId);
    expect(node).toMatchObject({
      id: nodeId,
      rootKind: "pod",
      rootId: pod.sId,
      name: "report.txt",
    });
  });

  it("resolves a stored node id to wherever the file lives now", async () => {
    const { conversation, dustFileSystem, pod } = await databaseFileSystem();
    fileStorageMock.setFileMetadata(() => ({
      size: "5",
      contentType: "text/plain",
      contentEncoding: "identity",
    }));
    const written = await dustFileSystem.write(
      `conversation-${conversation.sId}/report.txt`,
      "hello",
      "text/plain"
    );
    assert(written.isOk() && written.value.nodeId !== null);
    const { nodeId } = written.value;

    // This is what a feature stores, and what it holds after the file moves.
    expect(
      await dustFileSystem.nodeIdForPath(
        `conversation-${conversation.sId}/report.txt`
      )
    ).toEqual(expect.objectContaining({ value: nodeId }));

    const moved = await dustFileSystem.move({
      src: `conversation-${conversation.sId}/report.txt`,
      dest: `pod-${pod.sId}/moved.txt`,
    });
    assert(moved.isOk());

    const current = await dustFileSystem.pathForNodeId(nodeId);
    expect(current).toEqual(
      expect.objectContaining({ value: `pod-${pod.sId}/moved.txt` })
    );
  });

  it("refuses to delete a node while a file is still bound to it", async () => {
    const { auth, conversation, dustFileSystem } = await databaseFileSystem();
    fileStorageMock.setFileMetadata(() => ({
      size: "5",
      contentType: "text/plain",
      contentEncoding: "identity",
    }));
    const path = `conversation-${conversation.sId}/report.txt`;
    const written = await dustFileSystem.write(path, "hello", "text/plain");
    assert(written.isOk() && written.value.nodeId !== null);
    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "text/plain",
      fileName: "report.txt",
      fileSize: 5,
      // Not "ready": deleting a ready file also clears its stored content, which
      // this test has no reason to exercise.
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });
    await file.bindToFileSystemNode(written.value.nodeId);

    const blocked = await dustFileSystem.delete(path);

    assert(blocked.isErr());
  });

  it("enriches a database file entry from its node id", async () => {
    const { auth, conversation, dustFileSystem } = await databaseFileSystem();
    fileStorageMock.setFileMetadata(() => ({
      size: "5",
      contentType: "text/typescript",
      contentEncoding: "identity",
    }));
    const path = `conversation-${conversation.sId}/Frame.tsx`;
    const written = await dustFileSystem.write(
      path,
      "hello",
      "text/typescript"
    );
    assert(written.isOk() && written.value.nodeId !== null);
    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: frameContentType,
      fileName: "Frame.tsx",
      fileSize: 5,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });
    await file.bindToFileSystemNode(written.value.nodeId);

    const listed = await dustFileSystem.list(
      `conversation-${conversation.sId}`
    );
    assert(listed.isOk());
    const enriched = await enrichListWithFileResourceIds(
      auth,
      dustFileSystem,
      listed.value
    );

    expect(enriched).toContainEqual(
      expect.objectContaining({
        path,
        fileSystemNodeId: written.value.nodeId,
        fileId: file.sId,
        contentType: frameContentType,
      })
    );
  });

  it("deletes a node once the file bound to it is gone", async () => {
    const { auth, conversation, dustFileSystem } = await databaseFileSystem();
    fileStorageMock.setFileMetadata(() => ({
      size: "5",
      contentType: "text/plain",
      contentEncoding: "identity",
    }));
    const path = `conversation-${conversation.sId}/report.txt`;
    const written = await dustFileSystem.write(path, "hello", "text/plain");
    assert(written.isOk() && written.value.nodeId !== null);
    const file = await FileFactory.create(auth, auth.getNonNullableUser(), {
      contentType: "text/plain",
      fileName: "report.txt",
      fileSize: 5,
      status: "created",
      useCase: "conversation",
      useCaseMetadata: { conversationId: conversation.sId },
    });
    await file.bindToFileSystemNode(written.value.nodeId);

    const deleted = await file.delete(auth);
    assert(deleted.isOk());

    expect((await dustFileSystem.delete(path)).isOk()).toBe(true);
  });

  it("reports not_found for a path with nothing on it", async () => {
    const { conversation, dustFileSystem } = await databaseFileSystem();

    const missing = await dustFileSystem.nodeIdForPath(
      `conversation-${conversation.sId}/absent.txt`
    );

    assert(missing.isErr());
    expect(missing.error.code).toBe("not_found");
  });

  it("preserves the inode while moving a file from a conversation to its Pod", async () => {
    const { auth, conversation, dustFileSystem, pod, scope, conversationRoot } =
      await databaseFileSystem();
    const created = await FileSystemMutationResource.createNode(auth, scope, {
      operation: "create",
      requestId: randomUUID(),
      parentId: conversationRoot.id,
      name: "report.txt",
      kind: "file",
      mode: 0o644,
    });
    assert(created.isOk());

    const moved = await dustFileSystem.move({
      src: `conversation-${conversation.sId}/report.txt`,
      dest: `pod-${pod.sId}/report.txt`,
    });

    expect(moved).toEqual(
      expect.objectContaining({
        value: { sourceDeletionFailed: false },
      })
    );
    const node = await FileSystemNodeResource.fetchById(
      auth,
      scope,
      created.value.id
    );
    expect(node).toMatchObject({
      id: created.value.id,
      rootKind: "pod",
      rootId: pod.sId,
      name: "report.txt",
    });
    const entries = await dustFileSystem.list(`pod-${pod.sId}`);
    expect(entries.isOk() && entries.value).toEqual([
      expect.objectContaining({
        fileName: "report.txt",
        path: `pod-${pod.sId}/report.txt`,
      }),
    ]);
  });

  it("removes a directory tree from the inode namespace", async () => {
    const { conversation, dustFileSystem } = await databaseFileSystem();
    const root = `conversation-${conversation.sId}`;
    expect((await dustFileSystem.mkdir(`${root}/folder`)).isOk()).toBe(true);
    expect((await dustFileSystem.mkdir(`${root}/folder/nested`)).isOk()).toBe(
      true
    );

    const removed = await dustFileSystem.delete(`${root}/folder`);

    expect(removed.isOk()).toBe(true);
    expect(await dustFileSystem.exists(`${root}/folder`)).toEqual(
      expect.objectContaining({ value: false })
    );
  });
});
