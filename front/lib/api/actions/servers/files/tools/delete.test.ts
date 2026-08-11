import { deleteHandler } from "@app/lib/api/actions/servers/files/tools/delete";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { FileResource } from "@app/lib/resources/file_resource";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { frameContentType } from "@app/types/files";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage/config", () => ({
  default: { getGcsPrivateUploadsBucket: vi.fn(() => "test-bucket") },
}));
vi.mock("@app/lib/api/config", () => ({
  default: {
    getApiBaseUrl: vi.fn(() => "https://dust.tt"),
    getAppUrl: vi.fn(() => "https://dust.tt"),
  },
}));

describe("deleteHandler", () => {
  let deleteMock: ReturnType<typeof vi.fn>;
  let existsMock: ReturnType<typeof vi.fn>;
  let getAllFilesByPrefixMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    deleteMock = vi.fn().mockResolvedValue(undefined);
    existsMock = vi.fn().mockResolvedValue([true]);
    getAllFilesByPrefixMock = vi
      .fn()
      .mockResolvedValue({ files: [], pageFetchCount: 1 });

    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      file: vi.fn(() => ({
        exists: existsMock,
        delete: vi.fn().mockResolvedValue(undefined),
      })),
      delete: deleteMock,
      getAllFilesByPrefix: getAllFilesByPrefixMock,
      copyFile: vi.fn().mockResolvedValue(undefined),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("deletes a file from a pod mount at the correct storage path", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const result = await deleteHandler(
      { path: `pod-${projectId}/report.pdf` },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(deleteMock).toHaveBeenCalledWith(
      `w/${workspaceId}/pods/${projectId}/files/report.pdf`,
      { ignoreNotFound: false }
    );
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("deletes a file from a conversation mount at the correct storage path", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const conversationId = conversation.sId;

    const result = await deleteHandler(
      { path: `conversation-${conversationId}/report.pdf` },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(deleteMock).toHaveBeenCalledWith(
      `w/${workspaceId}/conversations/${conversationId}/files/report.pdf`,
      { ignoreNotFound: false }
    );
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("returns Err(not_found) when the file does not exist", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const conversationId = conversation.sId;

    existsMock.mockResolvedValue([false]);
    getAllFilesByPrefixMock.mockResolvedValue({ files: [], pageFetchCount: 1 });

    const result = await deleteHandler(
      { path: `conversation-${conversationId}/missing.pdf` },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("not found");
    }
  });

  it("deletes the FileResource and its share record along with a published frame's bytes", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const conversationId = conversation.sId;

    const frame = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "app.tsx",
      fileSize: 100,
      status: "ready",
      useCase: "tool_output",
      useCaseMetadata: { conversationId },
    });
    // markAsReady gives every interactive-content file a share token, so an orphaned row here
    // would mean a live share URL for a file the user deleted.
    const shareInfo = await frame.getShareInfo();
    assert(shareInfo);
    const shareToken = shareInfo.shareUrl.split("/").pop();
    assert(shareToken);

    const result = await deleteHandler(
      { path: `conversation-${conversationId}/app.tsx` },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(await FileResource.fetchById(auth, frame.sId)).toBeNull();
    expect((await FileResource.fetchByShareToken(shareToken)).isErr()).toBe(
      true
    );
  });

  it("returns Err(legacy_path) for a legacy path and instructs the agent to re-list", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await deleteHandler(
      { path: "project/report.pdf" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("outdated format");
      expect(result.error.message).toContain("files__list");
    }
  });
});
