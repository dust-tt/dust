import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { FileSystemStorageMode } from "@app/lib/api/file_system/storage_mode";
import { DATABASE_FILE_SYSTEM_POD_PREFIX } from "@app/lib/api/file_system/storage_mode";
import {
  moveCanonicalFile,
  renameCanonicalFile,
} from "@app/lib/api/files/file_system_ops";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { DustFileSystemError, SCOPED_PREFIX_POD } from "@app/types/file_system";
import { Err } from "@app/types/shared/result";
import assert from "assert";
import { UniqueConstraintError } from "sequelize";
import { afterEach, describe, expect, it, vi } from "vitest";

const STORAGE_MODES: FileSystemStorageMode[] = ["gcs", "database"];

async function setup(storageMode: FileSystemStorageMode) {
  const { user, workspace } = await createResourceTest({ role: "admin" });
  const pod = await SpaceFactory.project(workspace, user.id, {
    name:
      storageMode === "database"
        ? `${DATABASE_FILE_SYSTEM_POD_PREFIX}Ops test`
        : "Ops test",
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
  const fsRes = await DustFileSystem.forConversation(auth, conversation);
  assert(fsRes.isOk());
  const dustFs = fsRes.value;

  if (storageMode === "gcs") {
    // Existence follows the in-memory object store, which copyFile/delete keep up to date.
    fileStorageMock.setFileExists(
      (filePath) => fileStorageMock.getObject(filePath) !== undefined
    );
  } else {
    fileStorageMock.setFileMetadata(() => ({
      size: "7",
      contentType: "text/plain",
      contentEncoding: "identity",
    }));
  }

  const mountPath = (scopedPath: string) => {
    const gcsPath = dustFs.toMountFilePath(scopedPath);
    assert(gcsPath, `No mount path for ${scopedPath}`);
    return gcsPath;
  };

  const createFile = async (scopedPath: string) => {
    if (storageMode === "gcs") {
      fileStorageMock.setObject(mountPath(scopedPath), "content");
      return;
    }
    const written = await dustFs.write(scopedPath, "content", "text/plain");
    assert(written.isOk(), written.isErr() ? written.error.message : "");
  };

  const createDirectory = async (scopedPath: string) => {
    // GCS has no directories; the database namespace needs the parent node.
    if (storageMode === "database") {
      const created = await dustFs.mkdir(scopedPath);
      assert(created.isOk(), created.isErr() ? created.error.message : "");
    }
  };

  const linkFile = async (scopedPath: string) => {
    const fileName = scopedPath.split("/").pop() ?? scopedPath;
    const isPod = scopedPath.startsWith(SCOPED_PREFIX_POD);
    return FileFactory.create(auth, null, {
      contentType: "text/plain",
      fileName,
      fileSize: 7,
      status: "ready",
      useCase: isPod ? "project_context" : "tool_output",
      useCaseMetadata: isPod
        ? { spaceId: pod.sId }
        : { conversationId: conversation.sId },
      mountFilePath: mountPath(scopedPath),
    });
  };

  const exists = async (scopedPath: string) => {
    const result = await dustFs.exists(scopedPath);
    assert(result.isOk(), result.isErr() ? result.error.message : "");
    return result.value;
  };

  const owners = (scopedPath: string) =>
    FileResource.fetchByMountFilePaths(auth, [mountPath(scopedPath)]);

  const refetch = async (file: FileResource) => {
    const fresh = await FileResource.fetchById(auth, file.sId);
    assert(fresh);
    return fresh;
  };

  return {
    auth,
    conversation,
    pod,
    dustFs,
    conversationRoot: `conversation-${conversation.sId}`,
    podRoot: `${SCOPED_PREFIX_POD}${pod.sId}`,
    mountPath,
    createFile,
    createDirectory,
    linkFile,
    exists,
    owners,
    refetch,
  };
}

describe.each(STORAGE_MODES)("file_system_ops (%s backend)", (storageMode) => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("renameCanonicalFile", () => {
    it("renames onto an empty destination and syncs the linked FileResource", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/report.txt`;
      const dest = `${t.conversationRoot}/summary.txt`;
      await t.createFile(src);
      const linked = await t.linkFile(src);

      const result = await renameCanonicalFile(
        t.auth,
        t.dustFs,
        src,
        "summary.txt"
      );

      assert(result.isOk(), result.isErr() ? result.error.message : "");
      expect(result.value.dest).toBe(dest);
      expect(await t.exists(src)).toBe(false);
      expect(await t.exists(dest)).toBe(true);
      const fresh = await t.refetch(linked);
      expect(fresh.mountFilePath).toBe(t.mountPath(dest));
      expect(fresh.fileName).toBe("summary.txt");
      expect(await t.owners(src)).toHaveLength(0);
      expect((await t.owners(dest)).map((f) => f.id)).toEqual([linked.id]);
    });

    it("is a no-op when the file name is unchanged", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/report.txt`;
      await t.createFile(src);
      const linked = await t.linkFile(src);

      const result = await renameCanonicalFile(
        t.auth,
        t.dustFs,
        src,
        "report.txt"
      );

      assert(result.isOk());
      expect(result.value).toEqual({ dest: src, sourceDeletionFailed: false });
      expect(await t.exists(src)).toBe(true);
      expect((await t.refetch(linked)).mountFilePath).toBe(t.mountPath(src));
    });

    it("rejects a rename onto a path owned by another FileResource without mutating anything", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/draft.txt`;
      const dest = `${t.conversationRoot}/final.txt`;
      await t.createFile(src);
      const linked = await t.linkFile(src);
      // The destination row survived a removal done outside this layer: no file system entry.
      const occupant = await t.linkFile(dest);

      const result = await renameCanonicalFile(
        t.auth,
        t.dustFs,
        src,
        "final.txt"
      );

      assert(result.isErr());
      expect(result.error.code).toBe("already_exists");
      expect(result.error.message).toContain(dest);
      expect(await t.exists(src)).toBe(true);
      expect(await t.exists(dest)).toBe(false);
      expect((await t.refetch(linked)).mountFilePath).toBe(t.mountPath(src));
      expect((await t.owners(dest)).map((f) => f.id)).toEqual([occupant.id]);
    });

    it("rejects a rename onto a path owned by another FileResource even without a linked source", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/draft.txt`;
      const dest = `${t.conversationRoot}/final.txt`;
      await t.createFile(src);
      const occupant = await t.linkFile(dest);

      const result = await renameCanonicalFile(
        t.auth,
        t.dustFs,
        src,
        "final.txt"
      );

      assert(result.isErr());
      expect(result.error.code).toBe("already_exists");
      expect(await t.exists(src)).toBe(true);
      expect(await t.exists(dest)).toBe(false);
      expect((await t.owners(dest)).map((f) => f.id)).toEqual([occupant.id]);
    });
  });

  describe("moveCanonicalFile", () => {
    it("moves onto an empty destination in another directory and syncs the linked FileResource", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/report.txt`;
      const dest = `${t.conversationRoot}/archive/report.txt`;
      await t.createDirectory(`${t.conversationRoot}/archive`);
      await t.createFile(src);
      const linked = await t.linkFile(src);

      const result = await moveCanonicalFile(t.auth, t.dustFs, src, dest);

      assert(result.isOk(), result.isErr() ? result.error.message : "");
      expect(await t.exists(src)).toBe(false);
      expect(await t.exists(dest)).toBe(true);
      expect((await t.refetch(linked)).mountFilePath).toBe(t.mountPath(dest));
      expect(await t.owners(src)).toHaveLength(0);
    });

    it("moves across roots and updates the FileResource use case", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/report.txt`;
      const dest = `${t.podRoot}/report.txt`;
      await t.createFile(src);
      const linked = await t.linkFile(src);

      const result = await moveCanonicalFile(t.auth, t.dustFs, src, dest);

      assert(result.isOk(), result.isErr() ? result.error.message : "");
      expect(await t.exists(dest)).toBe(true);
      const fresh = await t.refetch(linked);
      expect(fresh.mountFilePath).toBe(t.mountPath(dest));
      expect(fresh.useCase).toBe("project_context");
      expect(fresh.useCaseMetadata).toEqual({ spaceId: t.pod.sId });
    });

    it("moves a file that has no linked FileResource", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/scratch.txt`;
      const dest = `${t.conversationRoot}/kept.txt`;
      await t.createFile(src);

      const result = await moveCanonicalFile(t.auth, t.dustFs, src, dest);

      assert(result.isOk(), result.isErr() ? result.error.message : "");
      expect(await t.exists(src)).toBe(false);
      expect(await t.exists(dest)).toBe(true);
      expect(await t.owners(dest)).toHaveLength(0);
    });

    it("rejects a move onto an occupied destination in the same directory", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/a.txt`;
      const dest = `${t.conversationRoot}/b.txt`;
      await t.createFile(src);
      const linked = await t.linkFile(src);
      const occupant = await t.linkFile(dest);

      const result = await moveCanonicalFile(t.auth, t.dustFs, src, dest);

      assert(result.isErr());
      expect(result.error.code).toBe("already_exists");
      expect(result.error.message).toContain(dest);
      expect(await t.exists(src)).toBe(true);
      expect(await t.exists(dest)).toBe(false);
      expect((await t.refetch(linked)).mountFilePath).toBe(t.mountPath(src));
      expect((await t.owners(dest)).map((f) => f.id)).toEqual([occupant.id]);
    });

    it("rejects a move onto an occupied destination across directories", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/a.txt`;
      const dest = `${t.podRoot}/archive/a.txt`;
      await t.createDirectory(`${t.podRoot}/archive`);
      await t.createFile(src);
      const linked = await t.linkFile(src);
      const occupant = await t.linkFile(dest);

      const result = await moveCanonicalFile(t.auth, t.dustFs, src, dest);

      assert(result.isErr());
      expect(result.error.code).toBe("already_exists");
      expect(await t.exists(src)).toBe(true);
      expect(await t.exists(dest)).toBe(false);
      const fresh = await t.refetch(linked);
      expect(fresh.mountFilePath).toBe(t.mountPath(src));
      expect(fresh.useCase).toBe("tool_output");
      expect((await t.owners(dest)).map((f) => f.id)).toEqual([occupant.id]);
    });

    it("rejects a move when the destination exists in the file system", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/a.txt`;
      const dest = `${t.conversationRoot}/b.txt`;
      await t.createFile(src);
      await t.createFile(dest);
      const linked = await t.linkFile(src);

      const result = await moveCanonicalFile(t.auth, t.dustFs, src, dest);

      assert(result.isErr());
      expect(result.error.code).toBe("already_exists");
      expect(await t.exists(src)).toBe(true);
      expect((await t.refetch(linked)).mountFilePath).toBe(t.mountPath(src));
    });

    it("restores the source and reports a conflict when the destination is claimed after the preflight", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/a.txt`;
      const dest = `${t.conversationRoot}/b.txt`;
      await t.createFile(src);
      const linked = await t.linkFile(src);
      // Tests run inside one rolled-back transaction, so a real unique violation would abort it.
      // Simulate the index rejecting a destination claimed between the preflight and the update.
      vi.spyOn(FileResource.prototype, "updateMount").mockRejectedValueOnce(
        new UniqueConstraintError({ message: "duplicate key value" })
      );

      const result = await moveCanonicalFile(t.auth, t.dustFs, src, dest);

      assert(result.isErr());
      expect(result.error.code).toBe("already_exists");
      expect(result.error.message).toContain(dest);
      expect(await t.exists(src)).toBe(true);
      expect(await t.exists(dest)).toBe(false);
      expect((await t.refetch(linked)).mountFilePath).toBe(t.mountPath(src));
      expect(await t.owners(dest)).toHaveLength(0);
    });

    it("restores the source and fails when the FileResource update fails after the move", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/a.txt`;
      const dest = `${t.conversationRoot}/b.txt`;
      await t.createFile(src);
      const linked = await t.linkFile(src);
      vi.spyOn(FileResource.prototype, "updateMount").mockRejectedValueOnce(
        new Error("database unavailable")
      );

      const result = await moveCanonicalFile(t.auth, t.dustFs, src, dest);

      assert(result.isErr());
      expect(result.error.code).toBe("internal");
      expect(await t.exists(src)).toBe(true);
      expect(await t.exists(dest)).toBe(false);
      expect((await t.refetch(linked)).mountFilePath).toBe(t.mountPath(src));
      expect(await t.owners(dest)).toHaveLength(0);
    });

    it("fails without reporting success when the move cannot be reverted", async () => {
      const t = await setup(storageMode);
      const src = `${t.conversationRoot}/a.txt`;
      const dest = `${t.conversationRoot}/b.txt`;
      await t.createFile(src);
      const linked = await t.linkFile(src);
      vi.spyOn(FileResource.prototype, "updateMount").mockRejectedValueOnce(
        new UniqueConstraintError({ message: "duplicate key value" })
      );
      const realMove = t.dustFs.move.bind(t.dustFs);
      let calls = 0;
      vi.spyOn(t.dustFs, "move").mockImplementation(async (args) => {
        calls += 1;
        if (calls === 2) {
          return new Err(
            new DustFileSystemError("internal", "storage unavailable")
          );
        }
        return realMove(args);
      });

      const result = await moveCanonicalFile(t.auth, t.dustFs, src, dest);

      assert(result.isErr());
      expect(result.error.code).toBe("internal");
      expect(result.error.message).toContain("could not be reverted");
      expect((await t.refetch(linked)).mountFilePath).toBe(t.mountPath(src));
    });
  });
});
