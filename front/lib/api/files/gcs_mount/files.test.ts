import {
  createGCSMountFile,
  type GCSMountFileEntry,
  getConversationFileMountSignedUrl,
  listGCSMountFiles,
} from "@app/lib/api/files/gcs_mount/files";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/config", () => ({
  default: {
    getClientFacingUrl: vi.fn(() => "https://dust.tt"),
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
  let getFilesMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    getFilesMock = vi.fn();
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getFiles: getFilesMock,
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
    getFilesMock.mockResolvedValue([
      gcsFile({ name: `${prefix}report.pdf`, contentType: "application/pdf" }),
      gcsFile({ name: `${prefix}report.processed.txt` }),
      gcsFile({ name: `${prefix}photo.jpg`, contentType: "image/jpeg" }),
      gcsFile({
        name: `${prefix}photo.processed.jpg`,
        contentType: "image/jpeg",
      }),
    ]);

    const entries = await listGCSMountFiles(auth, {
      useCase: "conversation",
      conversationId,
    });

    const paths = entries.filter((e) => !e.isDirectory).map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(["conversation/report.pdf", "conversation/photo.jpg"])
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
    getFilesMock.mockResolvedValue([
      gcsFile({ name: `${prefix}report.pdf`, contentType: "application/pdf" }),
      gcsFile({ name: `${prefix}report.processed.txt` }),
    ]);

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
