import {
  copyConversationGCSMount,
  copyMountFile,
  deleteGCSMountFile,
  getConversationFileMountSignedUrl,
  getGCSPathFromScopedPath,
  getScopedPathFromGCSPath,
  renameGCSMountDirectory,
  renameGCSMountFile,
} from "@app/lib/api/files/gcs_mount/files";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("getConversationFileMountSignedUrl", () => {
  let auth: Authenticator;
  let conversationId: string;
  let workspaceId: string;
  let getSignedUrlMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getSignedUrlMock = vi
      .fn()
      .mockResolvedValue("https://signed.example.com/photo.png");
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(),
      getSignedUrl: getSignedUrlMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator, conversationsSpace } = await createResourceTest({});
    auth = authenticator;
    workspaceId = auth.getNonNullableWorkspace().sId;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });
    conversationId = conversation.sId;
  });

  it("returns Ok with the signed URL for a valid path", async () => {
    const gcsPath = `w/${workspaceId}/conversations/${conversationId}/files/photo.png`;

    const result = await getConversationFileMountSignedUrl(
      auth,
      { useCase: "conversation", conversationId },
      gcsPath
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("https://signed.example.com/photo.png");
    }
    expect(getSignedUrlMock).toHaveBeenCalledWith(gcsPath);
  });

  it("returns Err without calling GCS when path belongs to a different conversation", async () => {
    const gcsPath = `w/${workspaceId}/conversations/other-conversation-id/files/photo.png`;

    const result = await getConversationFileMountSignedUrl(
      auth,
      { useCase: "conversation", conversationId },
      gcsPath
    );

    expect(result.isErr()).toBe(true);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("returns Err without calling GCS when path belongs to a different workspace", async () => {
    const gcsPath = `w/other-workspace/conversations/${conversationId}/files/photo.png`;

    const result = await getConversationFileMountSignedUrl(
      auth,
      { useCase: "conversation", conversationId },
      gcsPath
    );

    expect(result.isErr()).toBe(true);
    expect(getSignedUrlMock).not.toHaveBeenCalled();
  });

  it("returns Err when GCS signing fails", async () => {
    getSignedUrlMock.mockRejectedValue(new Error("GCS unavailable"));
    const gcsPath = `w/${workspaceId}/conversations/${conversationId}/files/photo.png`;

    const result = await getConversationFileMountSignedUrl(
      auth,
      { useCase: "conversation", conversationId },
      gcsPath
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("GCS unavailable");
    }
  });
});

describe("copyConversationGCSMount", () => {
  let auth: Authenticator;
  let source: ConversationResource;
  let dest: ConversationResource;
  let workspaceId: string;
  let getFilesMock: ReturnType<typeof vi.fn>;
  let copyFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getFilesMock = vi.fn().mockResolvedValue([]);
    copyFileMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getFiles: getFilesMock,
      copyFile: copyFileMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator, conversationsSpace } = await createResourceTest({});
    auth = authenticator;
    workspaceId = auth.getNonNullableWorkspace().sId;

    const agentConfig = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
      description: "Test Agent",
    });
    const sourceConv = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });
    const destConv = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [],
      spaceId: conversationsSpace.id,
    });

    const sourceRes = await ConversationResource.fetchById(
      auth,
      sourceConv.sId
    );
    const destRes = await ConversationResource.fetchById(auth, destConv.sId);
    assert(sourceRes !== null);
    assert(destRes !== null);
    source = sourceRes;
    dest = destRes;
  });

  it("copies every file under the source prefix to the dest prefix", async () => {
    const sourcePrefix = `w/${workspaceId}/conversations/${source.sId}/files/`;
    const destPrefix = `w/${workspaceId}/conversations/${dest.sId}/files/`;
    const past = "2020-01-01T00:00:00.000Z";
    getFilesMock.mockResolvedValue([
      { name: `${sourcePrefix}report.pdf`, metadata: { updated: past } },
      {
        name: `${sourcePrefix}.tool_outputs/chart.png`,
        metadata: { updated: past },
      },
      { name: `${sourcePrefix}data/foo.csv`, metadata: { updated: past } },
    ]);

    const result = await copyConversationGCSMount(auth, { source, dest });

    assert(result.isOk());
    expect(result.value.copiedCount).toBe(3);
    expect(getFilesMock).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: sourcePrefix })
    );
    expect(copyFileMock).toHaveBeenCalledTimes(3);
    expect(copyFileMock).toHaveBeenCalledWith(
      `${sourcePrefix}report.pdf`,
      `${destPrefix}report.pdf`
    );
    expect(copyFileMock).toHaveBeenCalledWith(
      `${sourcePrefix}.tool_outputs/chart.png`,
      `${destPrefix}.tool_outputs/chart.png`
    );
    expect(copyFileMock).toHaveBeenCalledWith(
      `${sourcePrefix}data/foo.csv`,
      `${destPrefix}data/foo.csv`
    );
  });

  it("returns Ok with copiedCount 0 when source prefix is empty", async () => {
    const result = await copyConversationGCSMount(auth, { source, dest });

    assert(result.isOk());
    expect(result.value.copiedCount).toBe(0);
    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it("no-ops when source and dest are the same conversation", async () => {
    const result = await copyConversationGCSMount(auth, {
      source,
      dest: source,
    });

    assert(result.isOk());
    expect(result.value.copiedCount).toBe(0);
    expect(getFilesMock).not.toHaveBeenCalled();
    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it("returns Err when GCS listing fails", async () => {
    getFilesMock.mockRejectedValue(new Error("GCS list unavailable"));

    const result = await copyConversationGCSMount(auth, { source, dest });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("GCS list unavailable");
    }
    expect(copyFileMock).not.toHaveBeenCalled();
  });

  it("returns Err when a copy fails", async () => {
    const sourcePrefix = `w/${workspaceId}/conversations/${source.sId}/files/`;
    getFilesMock.mockResolvedValue([
      {
        name: `${sourcePrefix}report.pdf`,
        metadata: { updated: "2020-01-01T00:00:00.000Z" },
      },
    ]);
    copyFileMock.mockRejectedValue(new Error("GCS copy unavailable"));

    const result = await copyConversationGCSMount(auth, { source, dest });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("GCS copy unavailable");
    }
  });

  describe("slow path (sourceTimestampMs)", () => {
    let getSortedFileVersionsMock: ReturnType<typeof vi.fn>;
    const forkMs = new Date("2025-06-01T12:00:00.000Z").getTime();
    const beforeFork = "2025-06-01T11:59:00.000Z";
    const afterFork = "2025-06-01T12:01:00.000Z";

    beforeEach(() => {
      getSortedFileVersionsMock = vi.fn().mockResolvedValue(new Ok([]));
      vi.mocked(getPrivateUploadBucket).mockReturnValue({
        getFiles: getFilesMock,
        copyFile: copyFileMock,
        getSortedFileVersions: getSortedFileVersionsMock,
      } as unknown as ReturnType<typeof getPrivateUploadBucket>);
    });

    it("copies files predating the fork directly without fetching version history", async () => {
      const sourcePrefix = `w/${workspaceId}/conversations/${source.sId}/files/`;
      const destPrefix = `w/${workspaceId}/conversations/${dest.sId}/files/`;
      getFilesMock.mockResolvedValue([
        { name: `${sourcePrefix}old.txt`, metadata: { updated: beforeFork } },
      ]);

      const result = await copyConversationGCSMount(auth, {
        source,
        dest,
        sourceTimestampMs: forkMs,
      });

      assert(result.isOk());
      expect(result.value.copiedCount).toBe(1);
      expect(getSortedFileVersionsMock).not.toHaveBeenCalled();
      expect(copyFileMock).toHaveBeenCalledOnce();
      expect(copyFileMock).toHaveBeenCalledWith(
        `${sourcePrefix}old.txt`,
        `${destPrefix}old.txt`
      );
    });

    it("fetches version history and copies the pre-fork generation for files written after the fork", async () => {
      const sourcePrefix = `w/${workspaceId}/conversations/${source.sId}/files/`;
      const destPrefix = `w/${workspaceId}/conversations/${dest.sId}/files/`;
      const filePath = `${sourcePrefix}modified.txt`;
      getFilesMock.mockResolvedValue([
        { name: filePath, metadata: { updated: afterFork } },
      ]);
      getSortedFileVersionsMock.mockResolvedValue(
        new Ok([
          {
            name: filePath,
            metadata: { updated: afterFork, generation: "456" },
          },
          {
            name: filePath,
            metadata: { updated: beforeFork, generation: "123" },
          },
        ])
      );

      const result = await copyConversationGCSMount(auth, {
        source,
        dest,
        sourceTimestampMs: forkMs,
      });

      assert(result.isOk());
      expect(result.value.copiedCount).toBe(1);
      expect(getSortedFileVersionsMock).toHaveBeenCalledOnce();
      expect(getSortedFileVersionsMock).toHaveBeenCalledWith({ filePath });
      expect(copyFileMock).toHaveBeenCalledWith(
        filePath,
        `${destPrefix}modified.txt`,
        undefined,
        { sourceGeneration: "123" }
      );
    });

    it("skips a file written after the fork when no pre-fork version exists", async () => {
      const sourcePrefix = `w/${workspaceId}/conversations/${source.sId}/files/`;
      const filePath = `${sourcePrefix}new-file.txt`;
      getFilesMock.mockResolvedValue([
        { name: filePath, metadata: { updated: afterFork } },
      ]);
      getSortedFileVersionsMock.mockResolvedValue(
        new Ok([
          {
            name: filePath,
            metadata: { updated: afterFork, generation: "456" },
          },
        ])
      );

      const result = await copyConversationGCSMount(auth, {
        source,
        dest,
        sourceTimestampMs: forkMs,
      });

      assert(result.isOk());
      expect(result.value.copiedCount).toBe(0);
      expect(copyFileMock).not.toHaveBeenCalled();
    });

    it("handles a mix of unchanged, version-filtered, and skipped files", async () => {
      const sourcePrefix = `w/${workspaceId}/conversations/${source.sId}/files/`;
      const destPrefix = `w/${workspaceId}/conversations/${dest.sId}/files/`;
      const oldPath = `${sourcePrefix}old.txt`;
      const modifiedPath = `${sourcePrefix}modified.txt`;
      const newPath = `${sourcePrefix}new.txt`;

      getFilesMock.mockResolvedValue([
        { name: oldPath, metadata: { updated: beforeFork } },
        { name: modifiedPath, metadata: { updated: afterFork } },
        { name: newPath, metadata: { updated: afterFork } },
      ]);
      getSortedFileVersionsMock.mockImplementation(
        ({ filePath }: { filePath: string }) => {
          if (filePath === modifiedPath) {
            return Promise.resolve(
              new Ok([
                {
                  name: modifiedPath,
                  metadata: { updated: afterFork, generation: "200" },
                },
                {
                  name: modifiedPath,
                  metadata: { updated: beforeFork, generation: "100" },
                },
              ])
            );
          }
          return Promise.resolve(
            new Ok([
              {
                name: newPath,
                metadata: { updated: afterFork, generation: "300" },
              },
            ])
          );
        }
      );

      const result = await copyConversationGCSMount(auth, {
        source,
        dest,
        sourceTimestampMs: forkMs,
      });

      assert(result.isOk());
      expect(result.value.copiedCount).toBe(2);
      expect(getSortedFileVersionsMock).toHaveBeenCalledTimes(2);
      expect(copyFileMock).toHaveBeenCalledTimes(2);
      expect(copyFileMock).toHaveBeenCalledWith(
        oldPath,
        `${destPrefix}old.txt`
      );
      expect(copyFileMock).toHaveBeenCalledWith(
        modifiedPath,
        `${destPrefix}modified.txt`,
        undefined,
        { sourceGeneration: "100" }
      );
    });
  });
});

describe("copyMountFile", () => {
  let auth: Authenticator;
  let workspaceId: string;
  let copyFileMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    copyFileMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      copyFile: copyFileMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator } = await createResourceTest({});
    auth = authenticator;
    workspaceId = auth.getNonNullableWorkspace().sId;
  });

  it("copies between mounts preserving the relative path", async () => {
    const result = await copyMountFile(auth, {
      source: {
        scope: { useCase: "conversation", conversationId: "parent" },
        relativeFilePath: "report.pdf",
      },
      dest: {
        scope: { useCase: "conversation", conversationId: "child" },
        relativeFilePath: "report.pdf",
      },
    });

    assert(result.isOk());
    expect(copyFileMock).toHaveBeenCalledTimes(1);
    expect(copyFileMock).toHaveBeenCalledWith(
      `w/${workspaceId}/conversations/parent/files/report.pdf`,
      `w/${workspaceId}/conversations/child/files/report.pdf`
    );
  });

  it("returns Err when the copy fails", async () => {
    copyFileMock.mockRejectedValue(new Error("GCS copy unavailable"));

    const result = await copyMountFile(auth, {
      source: {
        scope: { useCase: "conversation", conversationId: "parent" },
        relativeFilePath: "notes.md",
      },
      dest: {
        scope: { useCase: "conversation", conversationId: "child" },
        relativeFilePath: "notes.md",
      },
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("GCS copy unavailable");
    }
  });
});

describe("renameGCSMountFile", () => {
  let auth: Authenticator;
  let workspaceId: string;
  let copyFileMock: ReturnType<typeof vi.fn>;
  let deleteMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    copyFileMock = vi.fn().mockResolvedValue(undefined);
    deleteMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      copyFile: copyFileMock,
      delete: deleteMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator } = await createResourceTest({});
    auth = authenticator;
    workspaceId = auth.getNonNullableWorkspace().sId;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("copies to the new path, deletes the old path, and returns the new GCS path", async () => {
    const result = await renameGCSMountFile(
      auth,
      { useCase: "pod", podId: "proj123" },
      { relativeFilePath: "report.pdf", newFileName: "final.pdf" }
    );

    const prefix = `w/${workspaceId}/pods/proj123/files/`;
    expect(result.isOk()).toBe(true);
    expect(copyFileMock).toHaveBeenCalledWith(
      `${prefix}report.pdf`,
      `${prefix}final.pdf`
    );
    expect(deleteMock).toHaveBeenCalledWith(`${prefix}report.pdf`);
    if (result.isOk()) {
      expect(result.value.newGcsPath).toBe(`${prefix}final.pdf`);
    }
  });

  it("preserves directory structure when renaming a nested file", async () => {
    await renameGCSMountFile(
      auth,
      { useCase: "pod", podId: "proj123" },
      { relativeFilePath: "reports/q1.csv", newFileName: "q1-final.csv" }
    );

    const prefix = `w/${workspaceId}/pods/proj123/files/`;
    expect(copyFileMock).toHaveBeenCalledWith(
      `${prefix}reports/q1.csv`,
      `${prefix}reports/q1-final.csv`
    );
    expect(deleteMock).toHaveBeenCalledWith(`${prefix}reports/q1.csv`);
  });

  it("returns Err when the GCS copy fails without deleting", async () => {
    copyFileMock.mockRejectedValue(new Error("copy failed"));

    const result = await renameGCSMountFile(
      auth,
      { useCase: "pod", podId: "proj123" },
      { relativeFilePath: "report.pdf", newFileName: "final.pdf" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("copy failed");
    }
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe("renameGCSMountDirectory", () => {
  let auth: Authenticator;
  let workspaceId: string;
  let copyFileMock: ReturnType<typeof vi.fn>;
  let deleteByPrefixMock: ReturnType<typeof vi.fn>;
  let dirExistsMock: ReturnType<typeof vi.fn>;
  let getAllFilesByPrefixMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    copyFileMock = vi.fn().mockResolvedValue(undefined);
    deleteByPrefixMock = vi.fn().mockResolvedValue(undefined);
    dirExistsMock = vi.fn().mockResolvedValue([false]);

    const { authenticator } = await createResourceTest({});
    auth = authenticator;
    workspaceId = auth.getNonNullableWorkspace().sId;

    const prefix = `w/${workspaceId}/pods/pod123/files/`;
    getAllFilesByPrefixMock = vi.fn().mockResolvedValue({
      files: [
        { name: `${prefix}archive/` },
        { name: `${prefix}archive/report.pdf` },
      ],
    });
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      copyFile: copyFileMock,
      deleteByPrefix: deleteByPrefixMock,
      file: vi.fn().mockReturnValue({ exists: dirExistsMock }),
      getAllFilesByPrefix: getAllFilesByPrefixMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("moves all objects under the folder prefix and deletes the old prefix", async () => {
    const result = await renameGCSMountDirectory(
      auth,
      { useCase: "pod", podId: "pod123" },
      { relativeDirPath: "archive", newFolderName: "backup" }
    );

    const podsPrefix = `w/${workspaceId}/pods/pod123/files/`;

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.newRelativeDirPath).toBe("backup");
    }
    // Each object is copied to its new path on the pods/ side.
    expect(copyFileMock).toHaveBeenCalledWith(
      `${podsPrefix}archive/`,
      `${podsPrefix}backup/`
    );
    expect(copyFileMock).toHaveBeenCalledWith(
      `${podsPrefix}archive/report.pdf`,
      `${podsPrefix}backup/report.pdf`
    );
    // The old prefix is deleted once, on the pods/ side.
    expect(deleteByPrefixMock).toHaveBeenCalledWith(`${podsPrefix}archive/`);
    expect(copyFileMock).toHaveBeenCalledTimes(2);
    expect(deleteByPrefixMock).toHaveBeenCalledTimes(1);
  });

  it("returns Err when the destination folder already exists", async () => {
    dirExistsMock.mockResolvedValue([true]);

    const result = await renameGCSMountDirectory(
      auth,
      { useCase: "pod", podId: "pod123" },
      { relativeDirPath: "archive", newFolderName: "backup" }
    );

    expect(result.isErr()).toBe(true);
    expect(copyFileMock).not.toHaveBeenCalled();
  });
});

describe("deleteGCSMountFile", () => {
  let auth: Authenticator;
  let workspaceId: string;
  let deleteMock: ReturnType<typeof vi.fn>;
  let deleteByPrefixMock: ReturnType<typeof vi.fn>;
  let dirExistsMock: ReturnType<
    typeof vi.fn<(path: string) => Promise<[boolean]>>
  >;
  let getAllFilesByPrefixMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    deleteMock = vi.fn().mockResolvedValue(undefined);
    deleteByPrefixMock = vi.fn().mockResolvedValue(undefined);
    dirExistsMock = vi.fn().mockResolvedValue([false]);
    getAllFilesByPrefixMock = vi.fn().mockResolvedValue({ files: [] });
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      delete: deleteMock,
      deleteByPrefix: deleteByPrefixMock,
      file: vi.fn((path: string) => ({ exists: () => dirExistsMock(path) })),
      getAllFilesByPrefix: getAllFilesByPrefixMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);

    const { authenticator } = await createResourceTest({});
    auth = authenticator;
    workspaceId = auth.getNonNullableWorkspace().sId;
  });

  it("calls bucket.delete with the correct GCS path and ignoreNotFound", async () => {
    const result = await deleteGCSMountFile(
      auth,
      { useCase: "pod", podId: "pod123" },
      { relativeFilePath: "archive/old.pdf" }
    );

    const prefix = `w/${workspaceId}/pods/pod123/files/`;
    expect(result.isOk()).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith(`${prefix}archive/old.pdf`, {
      ignoreNotFound: true,
    });
  });

  it("returns Err when bucket.delete throws", async () => {
    deleteMock.mockRejectedValue(new Error("delete failed"));

    const result = await deleteGCSMountFile(
      auth,
      { useCase: "pod", podId: "pod123" },
      { relativeFilePath: "file.pdf" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("delete failed");
    }
  });
});

describe("scoped path ↔ GCS path", () => {
  const prefix = "w/ws1/pods/pod123/files/";

  it("getScopedPathFromGCSPath is the inverse of getGCSPathFromScopedPath", () => {
    const scopedPath = "pod/reports/report_fil_abc.pdf";
    const gcsPath = getGCSPathFromScopedPath({
      prefix,
      scopedPath,
      useCase: "pod",
    });
    expect(gcsPath).toBe(`${prefix}reports/report_fil_abc.pdf`);

    expect(
      getScopedPathFromGCSPath({
        prefix,
        gcsPath: gcsPath!,
        useCase: "pod",
      })
    ).toBe(scopedPath);
  });

  it("getScopedPathFromGCSPath returns null when the path is outside the prefix", () => {
    expect(
      getScopedPathFromGCSPath({
        prefix,
        gcsPath: "w/ws1/projects/other/files/file.txt",
        useCase: "pod",
      })
    ).toBeNull();
  });
});
