import { createConversation } from "@app/lib/api/assistant/conversation";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { Ok } from "@app/types/shared/result";
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

function download(
  workspace: { sId: string },
  cId: string,
  body: Record<string, unknown>
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/assistant/conversations/${cId}/files/download`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

describe("POST /api/w/:wId/assistant/conversations/:cId/files/download", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFileContentType.mockResolvedValue(new Ok("application/pdf"));
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

  it("should return 400 when filePath is missing", async () => {
    const { workspace, conversation } = await setup();

    const response = await download(workspace, conversation.sId, {});

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("should return 400 for a raw GCS path (not scoped)", async () => {
    const { workspace, conversation } = await setup();

    const response = await download(workspace, conversation.sId, {
      filePath: `w/${workspace.sId}/conversations/${conversation.sId}/files/report.pdf`,
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("should return 400 for an unknown scope prefix", async () => {
    const { workspace, conversation } = await setup();

    const response = await download(workspace, conversation.sId, {
      filePath: "project/report.pdf",
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("should return 403 for path traversal with '..'", async () => {
    const { workspace, conversation } = await setup();

    const response = await download(workspace, conversation.sId, {
      filePath: "conversation/../../../etc/passwd",
    });

    expect(response.status).toBe(403);
    expect((await response.json()).error.type).toBe("workspace_auth_error");
  });

  it("should succeed for a valid scoped file path", async () => {
    const { workspace, conversation } = await setup();

    const response = await download(workspace, conversation.sId, {
      filePath: "conversation/report.pdf",
    });

    expect(response.status).toBe(200);
    expect(mockGetFileContentType).toHaveBeenCalledWith(
      `w/${workspace.sId}/conversations/${conversation.sId}/files/report.pdf`
    );
    expect(mockCreateReadStream).toHaveBeenCalled();
  });

  it("should normalize special characters in file path", async () => {
    const { workspace, conversation } = await setup();

    const response = await download(workspace, conversation.sId, {
      filePath: "conversation/%%%report.pdf",
    });

    expect(response.status).toBe(200);
    expect(mockGetFileContentType).toHaveBeenCalledWith(
      `w/${workspace.sId}/conversations/${conversation.sId}/files/%%%report.pdf`
    );
  });
});
