import {
  createGCSMountFile,
  type GCSMountFileEntry,
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
      { fileName: "report.txt", content, contentType: "text/plain" }
    );

    expect(saveMock).toHaveBeenCalledWith(content, { contentType: "text/plain" });
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
      { fileName: "notes.txt", content, contentType: "text/plain" }
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
      { fileName: "photo.png", content: Buffer.from("png data"), contentType: "image/png" }
    );

    expect(entry.thumbnailUrl).toBe(
      `https://dust.tt/api/w/${workspaceId}/assistant/conversations/${conversationId}/files/thumbnail?filePath=${encodeURIComponent("photo.png")}`
    );
  });

  it("leaves thumbnailUrl null for non-image content types", async () => {
    const entry = await createGCSMountFile(
      auth,
      { useCase: "conversation", conversationId },
      { fileName: "data.csv", content: Buffer.from("a,b"), contentType: "text/csv" }
    );

    expect(entry.thumbnailUrl).toBeNull();
  });
});
