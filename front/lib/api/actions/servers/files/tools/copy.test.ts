import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { copyHandler } from "@app/lib/api/actions/servers/files/tools/copy";
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

describe("copyHandler", () => {
  it("copies a file from conversation to Pod mount", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await copyHandler(
      { source: "conversation/report.pdf", dest: "pod/report.pdf" },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      return;
    }
    expect(result.value).toEqual([
      {
        type: "text",
        text: "Copied `conversation/report.pdf` to `pod/report.pdf`.",
      },
    ]);
  });

  it("copies a file from Pod to conversation mount", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await copyHandler(
      { source: "pod/spec.md", dest: "conversation/spec.md" },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
  });

  it("returns Err when the source file does not exist", async () => {
    const { auth, conversation } = await setupProjectConversation();

    // Override the bucket so getMetadata rejects (simulates a missing GCS object).
    const mockBucket = {
      file: vi.fn(() => ({
        getMetadata: vi.fn().mockRejectedValue(new Error("Not Found")),
        copy: vi.fn().mockResolvedValue(undefined),
      })),
    };
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce(
      mockBucket as unknown as ReturnType<typeof getPrivateUploadBucket>
    );

    const result = await copyHandler(
      { source: "conversation/missing.pdf", dest: "pod/missing.pdf" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("Source file not found");
  });

  it("returns Err when the source is a frame file", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const mockBucket = {
      file: vi.fn(() => ({
        getMetadata: vi
          .fn()
          .mockResolvedValue([
            { contentType: "application/vnd.dust.frame", size: "100" },
          ]),
        copy: vi.fn().mockResolvedValue(undefined),
      })),
    };
    vi.mocked(getPrivateUploadBucket).mockReturnValueOnce(
      mockBucket as unknown as ReturnType<typeof getPrivateUploadBucket>
    );

    const result = await copyHandler(
      {
        source: "conversation/interactive.html",
        dest: "project/interactive.html",
      },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("files__move");
  });

  it("returns Err when source and dest resolve to the same GCS path", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await copyHandler(
      { source: "conversation/x.md", dest: "conversation/x.md" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("same path");
  });

  it("returns Err for an invalid source scope prefix", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const result = await copyHandler(
      { source: "other/foo.md", dest: "pod/foo.md" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
  });

  it("returns Err for a Pod path in a non-Pod conversation", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await copyHandler(
      { source: "conversation/x.md", dest: "pod/x.md" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("Pod conversations");
  });

  it("dual-writes to the pods/ mirror when copying to a project mount", async () => {
    const { auth, conversation } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;
    const projectId = conversation.spaceId;
    assert(projectId, "Expected project conversation to have a spaceId");

    const copyFileMock = vi.fn().mockResolvedValue(undefined);
    const getMetadataMock = vi
      .fn()
      .mockResolvedValue([{ contentType: "application/pdf", size: "100" }]);
    const mockBucket = {
      file: vi.fn(() => ({ getMetadata: getMetadataMock })),
      copyFile: copyFileMock,
    };
    vi.mocked(getPrivateUploadBucket).mockReturnValue(
      mockBucket as unknown as ReturnType<typeof getPrivateUploadBucket>
    );

    const result = await copyHandler(
      { source: "conversation/report.pdf", dest: "project/report.pdf" },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());

    const sourcePath = `w/${workspaceId}/conversations/${conversation.sId}/files/report.pdf`;
    const destProjectPath = `w/${workspaceId}/projects/${projectId}/files/report.pdf`;
    const destPodsPath = `w/${workspaceId}/pods/${projectId}/files/report.pdf`;

    expect(copyFileMock).toHaveBeenCalledTimes(2);
    expect(copyFileMock).toHaveBeenNthCalledWith(
      1,
      sourcePath,
      destProjectPath
    );
    expect(copyFileMock).toHaveBeenNthCalledWith(2, sourcePath, destPodsPath);
  });

  it("does not write to pods/ when copying to a conversation mount", async () => {
    const { auth, conversation } = await setupProjectConversation();

    const copyFileMock = vi.fn().mockResolvedValue(undefined);
    const getMetadataMock = vi
      .fn()
      .mockResolvedValue([{ contentType: "application/pdf", size: "100" }]);
    const mockBucket = {
      file: vi.fn(() => ({ getMetadata: getMetadataMock })),
      copyFile: copyFileMock,
    };
    vi.mocked(getPrivateUploadBucket).mockReturnValue(
      mockBucket as unknown as ReturnType<typeof getPrivateUploadBucket>
    );

    const result = await copyHandler(
      { source: "project/spec.md", dest: "conversation/spec.md" },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    expect(copyFileMock).toHaveBeenCalledTimes(1);
  });
});
