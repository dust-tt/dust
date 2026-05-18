import {
  copyConversationGCSMount,
  copyMountFile,
  createGCSMountFile,
  type GCSMountFileEntry,
  getConversationFileMountSignedUrl,
  listGCSMountFiles,
} from "@app/lib/api/files/gcs_mount/files";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    getFilesMock.mockResolvedValue([
      { name: `${sourcePrefix}report.pdf` },
      { name: `${sourcePrefix}.tool_outputs/chart.png` },
      { name: `${sourcePrefix}data/foo.csv` },
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
    getFilesMock.mockResolvedValue([{ name: `${sourcePrefix}report.pdf` }]);
    copyFileMock.mockRejectedValue(new Error("GCS copy unavailable"));

    const result = await copyConversationGCSMount(auth, { source, dest });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("GCS copy unavailable");
    }
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
