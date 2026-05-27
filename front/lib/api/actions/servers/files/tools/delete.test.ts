import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { deleteHandler } from "@app/lib/api/actions/servers/files/tools/delete";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage/config", () => ({
  default: { getGcsPrivateUploadsBucket: vi.fn(() => "test-bucket") },
}));
vi.mock("@app/lib/api/config", () => ({
  default: { getApiBaseUrl: vi.fn(() => "https://dust.tt") },
}));

function makeExtra(
  auth: Authenticator,
  conversation: ConversationType
): ToolHandlerExtra {
  const agentLoopContext = {
    runContext: { conversation },
  } as unknown as AgentLoopContextType;
  return { auth, agentLoopContext } as unknown as ToolHandlerExtra;
}

async function setupProjectConversation(): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
  projectId: string;
}> {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  const user = auth.getNonNullableUser();

  const space = await SpaceFactory.project(workspace, user.id);
  const addRes = await space.addMembers(auth, { userIds: [user.sId] });
  assert(addRes.isOk(), "Failed to add user to project space");

  const projectAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );

  const conversation = await createConversation(projectAuth, {
    title: "Test",
    visibility: "unlisted",
    spaceId: space.id,
  });

  return { auth: projectAuth, conversation, projectId: space.sId };
}

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

  it("deletes a file from a pod mount at the correct GCS path", async () => {
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

  it("deletes a file from a conversation mount at the correct GCS path", async () => {
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
