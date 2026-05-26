import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createPublicApiMockRequest } from "@app/tests/utils/generic_public_api_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetFileContentType, mockCreateReadStream } = vi.hoisted(() => ({
  mockGetFileContentType: vi.fn(),
  mockCreateReadStream: vi.fn(),
}));

async function setup() {
  const { workspace, key } = await createPublicApiMockRequest();
  const user = await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "builder" });
  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const conversation = await ConversationFactory.create(userAuth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });
  return { workspace, key, conversation };
}

function getFile(
  workspace: { sId: string },
  key: { secret: string },
  cId: string,
  relSegments: string[]
) {
  // Encode the joined path so that ".." segments survive URL normalization.
  const joined = relSegments.join("/");
  const encoded = encodeURIComponent(joined);
  return honoApp.request(
    `/api/v1/w/${workspace.sId}/assistant/conversations/${cId}/files/${encoded}`,
    {
      headers: { authorization: `Bearer ${key.secret}` },
    }
  );
}

describe("GET /api/v1/w/:wId/assistant/conversations/:cId/files/:rel", () => {
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

  it("should stream a file for a valid conversation-scoped path", async () => {
    const { workspace, key, conversation } = await setup();

    const response = await getFile(workspace, key, conversation.sId, [
      "conversation",
      "chart.png",
    ]);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
  });

  it("should stream a nested scoped file path", async () => {
    const { workspace, key, conversation } = await setup();

    const response = await getFile(workspace, key, conversation.sId, [
      "conversation",
      "results",
      "report.csv",
    ]);

    expect(response.status).toBe(200);
    expect(mockGetFileContentType).toHaveBeenCalledWith(
      expect.stringContaining("results/report.csv")
    );
  });

  it("should resolve to the conversation-scoped GCS path (without the scope prefix)", async () => {
    const { workspace, key, conversation } = await setup();

    await getFile(workspace, key, conversation.sId, [
      "conversation",
      "chart.png",
    ]);
    expect(mockGetFileContentType).toHaveBeenCalledWith(
      `w/${workspace.sId}/conversations/${conversation.sId}/files/chart.png`
    );
  });

  it("should return 404 when GCS file does not exist", async () => {
    mockGetFileContentType.mockResolvedValue(new Err(new Error("not found")));
    const { workspace, key, conversation } = await setup();

    const response = await getFile(workspace, key, conversation.sId, [
      "conversation",
      "missing.png",
    ]);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { type: "file_not_found", message: "File not found." },
    });
  });

  it("should reject path traversal attempts", async () => {
    const { workspace, key, conversation } = await setup();

    const response = await getFile(workspace, key, conversation.sId, [
      "conversation",
      "..",
      "..",
      "etc",
      "passwd",
    ]);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: {
        type: "workspace_auth_error",
        message: "Access denied: path is outside conversation scope.",
      },
    });
  });

  it("should return 404 when conversation is not found", async () => {
    const { workspace, key } = await setup();

    const response = await getFile(workspace, key, "non-existent", [
      "conversation",
      "chart.png",
    ]);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  });

  it("should reject a bare relative path with no scope prefix", async () => {
    const { workspace, key, conversation } = await setup();
    const response = await getFile(workspace, key, conversation.sId, [
      "chart.png",
    ]);
    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("should reject a non-conversation scope prefix", async () => {
    const { workspace, key, conversation } = await setup();
    const response = await getFile(workspace, key, conversation.sId, [
      "project",
      "chart.png",
    ]);
    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});
