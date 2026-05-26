import { GCSMountDirectoryAlreadyExistsError } from "@app/lib/api/files/gcs_mount/errors";
import {
  copyConversationGCSMount,
  copyMountFile,
  createGCSMountDirectory,
  createGCSMountFile,
  deleteGCSMountFile,
  type GCSMountFileEntry,
  getConversationFileMountSignedUrl,
  getGCSPathFromScopedPath,
  getScopedPathFromGCSPath,
  listGCSMountFiles,
  renameGCSMountDirectory,
  renameGCSMountFile,
} from "@app/lib/api/files/gcs_mount/files";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getApiBaseUrl: vi.fn(() => "https://dust.tt"),
  },
}));

describe("createGCSMountFile", () => {
  let auth: Authenticator;
  let conversationId: string;
  let workspaceId: string;
  let saveMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    saveMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ save: saveMock })),
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

  it("writes to the correct GCS path", async () => {
    const content = Buffer.from("hello");

    await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId },
      { relativeFilePath: "report.txt", content, contentType: "text/plain" }
    );

    expect(saveMock).toHaveBeenCalledWith(content, {
      contentType: "text/plain",
    });
    const bucket = vi.mocked(getPrivateUploadBucket)();
    expect(bucket.file).toHaveBeenCalledWith(
      `w/${workspaceId}/conversations/${conversationId}/files/report.txt`
    );
  });

  it("returns a correctly shaped GCSMountFileEntry", async () => {
    const content = Buffer.from("hello world");

    const entryRes = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId },
      { relativeFilePath: "notes.txt", content, contentType: "text/plain" }
    );

    assert(entryRes.isOk());
    expect(entryRes.value).toMatchObject<Partial<GCSMountFileEntry>>({
      fileName: "notes.txt",
      path: `conversation/notes.txt`,
      sizeBytes: content.length,
      contentType: "text/plain",
      fileId: null,
      thumbnailUrl: null,
    });
    expect(entryRes.value.lastModifiedMs).toBeGreaterThan(0);
  });

  it("sets thumbnailUrl for image content types", async () => {
    const entryRes = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId },
      {
        relativeFilePath: "photo.png",
        content: Buffer.from("png data"),
        contentType: "image/png",
      }
    );

    assert(entryRes.isOk());
    expect(entryRes.value.thumbnailUrl).toBe(
      `https://dust.tt/api/w/${workspaceId}/assistant/conversations/${conversationId}/files/thumbnail?filePath=${encodeURIComponent("conversation/photo.png")}`
    );
  });

  it("leaves thumbnailUrl null for non-image content types", async () => {
    const entryRes = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId },
      {
        relativeFilePath: "data.csv",
        content: Buffer.from("a,b"),
        contentType: "text/csv",
      }
    );

    assert(entryRes.isOk());
    expect(entryRes.value.thumbnailUrl).toBeNull();
  });

  it("dual-writes to the pods/ mirror for project use-case", async () => {
    const content = Buffer.from("hello");

    await createGCSMountFile(
      auth,
      { useCase: "project", projectId: "proj123" },
      { relativeFilePath: "report.txt", content, contentType: "text/plain" }
    );

    const bucket = vi.mocked(getPrivateUploadBucket)();
    expect(bucket.file).toHaveBeenCalledWith(
      `w/${workspaceId}/projects/proj123/files/report.txt`
    );
    expect(bucket.file).toHaveBeenCalledWith(
      `w/${workspaceId}/pods/proj123/files/report.txt`
    );
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock).toHaveBeenNthCalledWith(1, content, {
      contentType: "text/plain",
    });
    expect(saveMock).toHaveBeenNthCalledWith(2, content, {
      contentType: "text/plain",
    });
  });

  it("does not write to pods/ for conversation use-case", async () => {
    await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId },
      {
        relativeFilePath: "report.txt",
        content: Buffer.from("hello"),
        contentType: "text/plain",
      }
    );

    const bucket = vi.mocked(getPrivateUploadBucket)();
    expect(bucket.file).toHaveBeenCalledTimes(1);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

describe("createGCSMountDirectory", () => {
  let auth: Authenticator;
  let conversationId: string;
  let workspaceId: string;
  let saveMock: ReturnType<typeof vi.fn>;
  let existsMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    existsMock = vi.fn().mockResolvedValue([false]);
    saveMock = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({ save: saveMock, exists: existsMock })),
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

  it("writes a trailing-slash placeholder to the correct GCS path", async () => {
    const entryRes = await createGCSMountDirectory(
      auth,
      { useCase: "conversation", conversationId },
      { relativeDirPath: "reports/q1" }
    );

    assert(entryRes.isOk());
    expect(entryRes.value).toMatchObject({
      isDirectory: true,
      fileName: "q1",
      path: "conversation/reports/q1",
      sizeBytes: 0,
    });
    const bucket = vi.mocked(getPrivateUploadBucket)();
    expect(bucket.file).toHaveBeenCalledWith(
      `w/${workspaceId}/conversations/${conversationId}/files/reports/q1/`
    );
    expect(saveMock).toHaveBeenCalledWith(Buffer.alloc(0), {
      contentType: "application/x-directory",
    });
  });

  it("returns Err when the folder already exists", async () => {
    existsMock.mockResolvedValue([true]);

    const entryRes = await createGCSMountDirectory(
      auth,
      { useCase: "conversation", conversationId },
      { relativeDirPath: "reports" }
    );

    expect(entryRes.isErr()).toBe(true);
    if (entryRes.isErr()) {
      expect(entryRes.error).toBeInstanceOf(
        GCSMountDirectoryAlreadyExistsError
      );
    }
    expect(saveMock).not.toHaveBeenCalled();
  });

  it("dual-writes the placeholder on the pods/ mirror for project use-case", async () => {
    const entryRes = await createGCSMountDirectory(
      auth,
      { useCase: "project", projectId: "proj123" },
      { relativeDirPath: "reports/q1" }
    );

    assert(entryRes.isOk());
    const bucket = vi.mocked(getPrivateUploadBucket)();
    expect(bucket.file).toHaveBeenCalledWith(
      `w/${workspaceId}/projects/proj123/files/reports/q1/`
    );
    expect(bucket.file).toHaveBeenCalledWith(
      `w/${workspaceId}/pods/proj123/files/reports/q1/`
    );
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock).toHaveBeenNthCalledWith(1, Buffer.alloc(0), {
      contentType: "application/x-directory",
    });
    expect(saveMock).toHaveBeenNthCalledWith(2, Buffer.alloc(0), {
      contentType: "application/x-directory",
    });
  });

  it("does not write to pods/ for conversation use-case", async () => {
    const entryRes = await createGCSMountDirectory(
      auth,
      { useCase: "conversation", conversationId },
      { relativeDirPath: "reports/q1" }
    );

    assert(entryRes.isOk());
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

describe("listGCSMountFiles", () => {
  let auth: Authenticator;
  let conversationId: string;
  let workspaceId: string;
  let getAllFilesByPrefixMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getAllFilesByPrefixMock = vi.fn();
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: getAllFilesByPrefixMock,
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

  function gcsFile({
    name,
    contentType = "text/plain",
    size = 100,
  }: {
    name: string;
    contentType?: string;
    size?: number;
  }) {
    return {
      name,
      metadata: {
        contentType,
        size: String(size),
        updated: new Date().toISOString(),
      },
    };
  }

  it("excludes *.processed.<ext> siblings by default", async () => {
    const prefix = `w/${workspaceId}/conversations/${conversationId}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        gcsFile({
          name: `${prefix}report.pdf`,
          contentType: "application/pdf",
        }),
        gcsFile({ name: `${prefix}report.processed.txt` }),
        gcsFile({ name: `${prefix}photo.jpg`, contentType: "image/jpeg" }),
        gcsFile({
          name: `${prefix}photo.processed.jpg`,
          contentType: "image/jpeg",
        }),
      ],
      pageFetchCount: 1,
    });

    const entries = await listGCSMountFiles(auth, {
      useCase: "conversation",
      conversationId,
    });

    const paths = entries.filter((e) => !e.isDirectory).map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "conversation/report.pdf",
        "conversation/photo.jpg",
      ])
    );
    expect(paths).not.toEqual(
      expect.arrayContaining([
        "conversation/report.processed.txt",
        "conversation/photo.processed.jpg",
      ])
    );
  });

  it("includes *.processed.<ext> siblings when includeProcessed is true", async () => {
    const prefix = `w/${workspaceId}/conversations/${conversationId}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        gcsFile({
          name: `${prefix}report.pdf`,
          contentType: "application/pdf",
        }),
        gcsFile({ name: `${prefix}report.processed.txt` }),
      ],
      pageFetchCount: 1,
    });

    const entries = await listGCSMountFiles(
      auth,
      { useCase: "conversation", conversationId },
      { includeProcessed: true }
    );

    const paths = entries.filter((e) => !e.isDirectory).map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "conversation/report.pdf",
        "conversation/report.processed.txt",
      ])
    );
  });

  it("logs a warning when GCS listing used more than one page", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const prefix = `w/${workspaceId}/conversations/${conversationId}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [gcsFile({ name: `${prefix}report.pdf` })],
      pageFetchCount: 2,
    });

    await listGCSMountFiles(auth, {
      useCase: "conversation",
      conversationId,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId,
        prefix,
        pageFetchCount: 2,
        objectCount: 1,
      }),
      "GCS mount file listing required multiple list requests; prefix has many objects."
    );
    warnSpy.mockRestore();
  });
});

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

  it("mirrors the destination write on pods/ when dest is a project", async () => {
    const result = await copyMountFile(auth, {
      source: {
        scope: { useCase: "conversation", conversationId: "src-conv" },
        relativeFilePath: "report.pdf",
      },
      dest: {
        scope: { useCase: "project", projectId: "proj123" },
        relativeFilePath: "report.pdf",
      },
    });

    assert(result.isOk());
    const sourcePath = `w/${workspaceId}/conversations/src-conv/files/report.pdf`;
    const destProjectPath = `w/${workspaceId}/projects/proj123/files/report.pdf`;
    const destPodsPath = `w/${workspaceId}/pods/proj123/files/report.pdf`;

    expect(copyFileMock).toHaveBeenCalledTimes(2);
    expect(copyFileMock).toHaveBeenNthCalledWith(
      1,
      sourcePath,
      destProjectPath
    );
    expect(copyFileMock).toHaveBeenNthCalledWith(2, sourcePath, destPodsPath);
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
      { useCase: "project", projectId: "proj123" },
      { relativeFilePath: "report.pdf", newFileName: "final.pdf" }
    );

    const prefix = `w/${workspaceId}/projects/proj123/files/`;
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
      { useCase: "project", projectId: "proj123" },
      { relativeFilePath: "reports/q1.csv", newFileName: "q1-final.csv" }
    );

    const prefix = `w/${workspaceId}/projects/proj123/files/`;
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
      { useCase: "project", projectId: "proj123" },
      { relativeFilePath: "report.pdf", newFileName: "final.pdf" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("copy failed");
    }
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("mirrors rename on pods/ for project use-case using the new canonical as source", async () => {
    await renameGCSMountFile(
      auth,
      { useCase: "project", projectId: "proj123" },
      { relativeFilePath: "report.pdf", newFileName: "final.pdf" }
    );

    const projectPrefix = `w/${workspaceId}/projects/proj123/files/`;
    const podsPrefix = `w/${workspaceId}/pods/proj123/files/`;

    expect(copyFileMock).toHaveBeenCalledTimes(2);
    expect(copyFileMock).toHaveBeenNthCalledWith(
      1,
      `${projectPrefix}report.pdf`,
      `${projectPrefix}final.pdf`
    );
    // Pods mirror copies from the NEW canonical (not from an old pods/ source,
    // which may not exist for files predating the dual-write).
    expect(copyFileMock).toHaveBeenNthCalledWith(
      2,
      `${projectPrefix}final.pdf`,
      `${podsPrefix}final.pdf`
    );

    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenNthCalledWith(1, `${projectPrefix}report.pdf`);
    expect(deleteMock).toHaveBeenNthCalledWith(2, `${podsPrefix}report.pdf`, {
      ignoreNotFound: true,
    });
  });

  it("does not mirror rename on pods/ for conversation use-case", async () => {
    const result = await renameGCSMountFile(
      auth,
      { useCase: "conversation", conversationId: "conv-rename" },
      { relativeFilePath: "report.pdf", newFileName: "final.pdf" }
    );

    expect(result.isOk()).toBe(true);
    expect(copyFileMock).toHaveBeenCalledTimes(1);
    expect(deleteMock).toHaveBeenCalledTimes(1);
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

    const prefix = `w/${workspaceId}/projects/proj123/files/`;
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
      { useCase: "project", projectId: "proj123" },
      { relativeDirPath: "archive", newFolderName: "backup" }
    );

    const prefix = `w/${workspaceId}/projects/proj123/files/`;
    const podsPrefix = `w/${workspaceId}/pods/proj123/files/`;

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.newRelativeDirPath).toBe("backup");
    }
    expect(copyFileMock).toHaveBeenCalledWith(
      `${prefix}archive/`,
      `${prefix}backup/`
    );
    expect(copyFileMock).toHaveBeenCalledWith(
      `${prefix}archive/report.pdf`,
      `${prefix}backup/report.pdf`
    );
    expect(deleteByPrefixMock).toHaveBeenCalledWith(`${prefix}archive/`);
    expect(deleteByPrefixMock).toHaveBeenCalledWith(`${podsPrefix}archive/`);
    expect(copyFileMock).toHaveBeenCalledWith(
      `${prefix}backup/report.pdf`,
      `${podsPrefix}backup/report.pdf`
    );
  });

  it("returns Err when the destination folder already exists", async () => {
    dirExistsMock.mockResolvedValue([true]);

    const result = await renameGCSMountDirectory(
      auth,
      { useCase: "project", projectId: "proj123" },
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
      { useCase: "project", projectId: "proj123" },
      { relativeFilePath: "archive/old.pdf" }
    );

    const prefix = `w/${workspaceId}/projects/proj123/files/`;
    expect(result.isOk()).toBe(true);
    expect(deleteMock).toHaveBeenCalledWith(`${prefix}archive/old.pdf`, {
      ignoreNotFound: true,
    });
  });

  it("returns Err when bucket.delete throws", async () => {
    deleteMock.mockRejectedValue(new Error("delete failed"));

    const result = await deleteGCSMountFile(
      auth,
      { useCase: "project", projectId: "proj123" },
      { relativeFilePath: "file.pdf" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("delete failed");
    }
  });

  it("mirrors delete on pods/ for project use-case", async () => {
    await deleteGCSMountFile(
      auth,
      { useCase: "project", projectId: "proj123" },
      { relativeFilePath: "archive/old.pdf" }
    );

    const projectPath = `w/${workspaceId}/projects/proj123/files/archive/old.pdf`;
    const podsPath = `w/${workspaceId}/pods/proj123/files/archive/old.pdf`;

    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenNthCalledWith(1, projectPath, {
      ignoreNotFound: true,
    });
    expect(deleteMock).toHaveBeenNthCalledWith(2, podsPath, {
      ignoreNotFound: true,
    });
  });

  it("does not mirror delete on pods/ for conversation use-case", async () => {
    await deleteGCSMountFile(
      auth,
      { useCase: "conversation", conversationId: "conv-del" },
      { relativeFilePath: "old.pdf" }
    );

    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("deletes a directory placeholder and its contents by prefix", async () => {
    dirExistsMock.mockImplementation((path: string) => {
      return Promise.resolve([path.endsWith("/")]);
    });

    const result = await deleteGCSMountFile(
      auth,
      { useCase: "project", projectId: "proj123" },
      { relativeFilePath: "archive" }
    );

    const prefix = `w/${workspaceId}/projects/proj123/files/`;
    const podsPrefix = `w/${workspaceId}/pods/proj123/files/`;

    expect(result.isOk()).toBe(true);
    expect(deleteByPrefixMock).toHaveBeenCalledWith(`${prefix}archive/`);
    expect(deleteByPrefixMock).toHaveBeenCalledWith(`${podsPrefix}archive/`);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe("scoped path ↔ GCS path", () => {
  const prefix = "w/ws1/projects/proj1/files/";

  it("getScopedPathFromGCSPath is the inverse of getGCSPathFromScopedPath", () => {
    const scopedPath = "project/reports/report_fil_abc.pdf";
    const gcsPath = getGCSPathFromScopedPath({
      prefix,
      scopedPath,
      useCase: "project",
    });
    expect(gcsPath).toBe(`${prefix}reports/report_fil_abc.pdf`);

    expect(
      getScopedPathFromGCSPath({
        prefix,
        gcsPath: gcsPath!,
        useCase: "project",
      })
    ).toBe(scopedPath);
  });

  it("getScopedPathFromGCSPath returns null when the path is outside the prefix", () => {
    expect(
      getScopedPathFromGCSPath({
        prefix,
        gcsPath: "w/ws1/projects/other/files/file.txt",
        useCase: "project",
      })
    ).toBeNull();
  });
});
