import { createConversation } from "@app/lib/api/assistant/conversation";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
}));

const { mockGetFileContentType, mockCreateReadStream } = vi.hoisted(() => ({
  mockGetFileContentType: vi.fn(),
  mockCreateReadStream: vi.fn(),
}));

async function setup() {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  const conversation = await createConversation(auth, {
    title: null,
    visibility: "unlisted",
    spaceId: null,
  });
  return { workspace, auth, conversation };
}

function getFile(
  workspace: { sId: string },
  cId: string,
  relSegments: string[]
) {
  // Encode the joined path so that ".." segments survive URL normalization.
  const joined = relSegments.join("/");
  const encoded = encodeURIComponent(joined);
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/files/${encoded}`
  );
}

function postMove(
  workspace: { sId: string },
  cId: string,
  relSegments: string[],
  body: Record<string, unknown>
) {
  const joined = relSegments.join("/");
  const encoded = encodeURIComponent(joined);
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/files/${encoded}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("GET /api/w/:wId/assistant/conversations/:cId/files/:rel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileContentType.mockResolvedValue(new Ok("image/png"));
    mockCreateReadStream.mockReturnValue(
      Object.assign(new PassThrough(), {
        pipe: vi.fn(),
      })
    );
    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getFileContentType: mockGetFileContentType,
      file: vi.fn(() => ({ createReadStream: mockCreateReadStream })),
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should stream a file for a valid path", async () => {
    const { workspace, conversation } = await setup();

    const response = await getFile(workspace, conversation.sId, [
      "conversation",
      "chart.png",
    ]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  it("should stream a nested file path", async () => {
    const { workspace, conversation } = await setup();

    const response = await getFile(workspace, conversation.sId, [
      "conversation",
      "results",
      "report.csv",
    ]);

    expect(response.status).toBe(200);
    expect(mockGetFileContentType).toHaveBeenCalledWith(
      expect.stringContaining("results/report.csv")
    );
  });

  it("should return 404 when GCS file does not exist", async () => {
    mockGetFileContentType.mockResolvedValue(new Err(new Error("not found")));
    const { workspace, conversation } = await setup();

    const response = await getFile(workspace, conversation.sId, [
      "conversation",
      "missing.png",
    ]);

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toEqual({
      type: "file_not_found",
      message: "File not found.",
    });
  });

  it("should reject path traversal attempts", async () => {
    const { workspace, conversation } = await setup();

    const response = await getFile(workspace, conversation.sId, [
      "conversation",
      "..",
      "..",
      "etc",
      "passwd",
    ]);

    expect(response.status).toBe(403);
    const data = await response.json();
    expect(data.error).toEqual({
      type: "workspace_auth_error",
      message: "Access denied: path is outside conversation scope.",
    });
  });

  it("should use conversation-scoped GCS path", async () => {
    const { workspace, conversation } = await setup();

    await getFile(workspace, conversation.sId, ["conversation", "chart.png"]);

    expect(mockGetFileContentType).toHaveBeenCalledWith(
      `w/${workspace.sId}/conversations/${conversation.sId}/files/chart.png`
    );
  });
});

describe("POST /api/w/:wId/assistant/conversations/:cId/files/:rel (move)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should move a file within the conversation mount", async () => {
    const mountFileOps = await import("@app/lib/api/files/mount_file_ops");
    vi.spyOn(mountFileOps, "moveMountFileWithinScope").mockResolvedValue(
      new Ok(undefined)
    );
    const { workspace, conversation } = await setup();

    const response = await postMove(
      workspace,
      conversation.sId,
      ["reports", "chart.png"],
      { destRelativeFilePath: "archive/chart.png" }
    );

    expect(response.status).toBe(200);
    expect(mountFileOps.moveMountFileWithinScope).toHaveBeenCalledWith(
      expect.anything(),
      { useCase: "conversation", conversationId: conversation.sId },
      {
        sourcePath: "reports/chart.png",
        destRelativeFilePath: "archive/chart.png",
      }
    );
  });
});
