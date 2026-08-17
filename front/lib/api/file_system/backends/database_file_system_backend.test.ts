import { randomUUID } from "node:crypto";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { FileSystemScope } from "@app/lib/api/file_system/namespace_scope";
import { DATABASE_FILE_SYSTEM_POD_PREFIX } from "@app/lib/api/file_system/storage_mode";
import { Authenticator } from "@app/lib/auth";
import { FileSystemMutationResource } from "@app/lib/resources/file_system_mutation_resource";
import { FileSystemNodeResource } from "@app/lib/resources/file_system_node_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
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
