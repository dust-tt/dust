import {
  createGCSMountFile,
  type GCSMountFileEntry,
  getConversationFileMountSignedUrl,
} from "@app/lib/api/files/gcs_mount/files";
import type { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage", () => ({
  getPrivateUploadBucket: vi.fn(),
}));

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

    const entry = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId },
      { relativeFilePath: "notes.txt", content, contentType: "text/plain" }
    );

    expect(entry).toMatchObject<Partial<GCSMountFileEntry>>({
      fileName: "notes.txt",
      path: `conversation/notes.txt`,
      sizeBytes: content.length,
      contentType: "text/plain",
      fileId: null,
      thumbnailUrl: null,
    });
    expect(entry.lastModifiedMs).toBeGreaterThan(0);
  });

  it("sets thumbnailUrl for image content types", async () => {
    const entry = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId },
      {
        relativeFilePath: "photo.png",
        content: Buffer.from("png data"),
        contentType: "image/png",
      }
    );

    expect(entry.thumbnailUrl).toBe(
      `https://dust.tt/api/w/${workspaceId}/assistant/conversations/${conversationId}/files/thumbnail?filePath=${encodeURIComponent("conversation/photo.png")}`
    );
  });

  it("leaves thumbnailUrl null for non-image content types", async () => {
    const entry = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId },
      {
        relativeFilePath: "data.csv",
        content: Buffer.from("a,b"),
        contentType: "text/csv",
      }
    );

    expect(entry.thumbnailUrl).toBeNull();
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
