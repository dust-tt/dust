import { deleteHandler } from "@app/lib/api/actions/servers/files/tools/delete";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage/config", () => ({
  default: { getGcsPrivateUploadsBucket: vi.fn(() => "test-bucket") },
}));
vi.mock("@app/lib/api/config", () => ({
  default: { getApiBaseUrl: vi.fn(() => "https://dust.tt") },
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
      file: vi.fn(() => ({ exists: existsMock })),
      delete: deleteMock,
      getAllFilesByPrefix: getAllFilesByPrefixMock,
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
