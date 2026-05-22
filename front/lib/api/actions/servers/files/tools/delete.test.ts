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
import { describe, expect, it, vi } from "vitest";

function makeExtra(
  auth: Authenticator,
  conversation: ConversationType
): ToolHandlerExtra {
  const agentLoopContext = {
    runContext: { conversation },
  } as unknown as AgentLoopContextType;
  return { auth, agentLoopContext } as unknown as ToolHandlerExtra;
}

async function setupProjectConversation(
  role: "admin" | "user" = "admin"
): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
}> {
  const { authenticator: auth, workspace } = await createResourceTest({ role });
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

  return {
    auth: projectAuth,
    conversation,
  };
}

describe("deleteHandler", () => {
  it("dual-deletes from the pods/ mirror when deleting from a project mount", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const projectId = conversation.spaceId;
    assert(projectId, "Expected project conversation to have a spaceId");

    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const existsMock = vi.fn().mockResolvedValue([true]);
    const mockBucket = {
      file: vi.fn(() => ({ exists: existsMock })),
      delete: deleteMock,
    };
    vi.mocked(getPrivateUploadBucket).mockReturnValue(
      mockBucket as unknown as ReturnType<typeof getPrivateUploadBucket>
    );

    const result = await deleteHandler(
      { path: "project/report.pdf" },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());

    const projectPath = `w/${workspaceId}/projects/${projectId}/files/report.pdf`;
    const podsPath = `w/${workspaceId}/pods/${projectId}/files/report.pdf`;

    expect(deleteMock).toHaveBeenCalledTimes(2);
    expect(deleteMock).toHaveBeenNthCalledWith(1, projectPath, {
      ignoreNotFound: true,
    });
    expect(deleteMock).toHaveBeenNthCalledWith(2, podsPath, {
      ignoreNotFound: true,
    });
  });

  it("does not delete from pods/ when deleting from a conversation mount", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const deleteMock = vi.fn().mockResolvedValue(undefined);
    const existsMock = vi.fn().mockResolvedValue([true]);
    const mockBucket = {
      file: vi.fn(() => ({ exists: existsMock })),
      delete: deleteMock,
    };
    vi.mocked(getPrivateUploadBucket).mockReturnValue(
      mockBucket as unknown as ReturnType<typeof getPrivateUploadBucket>
    );

    const result = await deleteHandler(
      { path: "conversation/report.pdf" },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(deleteMock).toHaveBeenCalledTimes(1);
  });

  it("returns Err when the file does not exist", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const existsMock = vi.fn().mockResolvedValue([false]);
    const mockBucket = {
      file: vi.fn(() => ({ exists: existsMock })),
      delete: vi.fn(),
    };
    vi.mocked(getPrivateUploadBucket).mockReturnValue(
      mockBucket as unknown as ReturnType<typeof getPrivateUploadBucket>
    );

    const result = await deleteHandler(
      { path: "project/missing.pdf" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("File not found");
  });
});
