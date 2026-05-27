import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { listHandler } from "@app/lib/api/actions/servers/files/tools/list";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import { frameContentType, frameSlideshowContentType } from "@app/types/files";
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

function makeStorageFile(
  name: string,
  contentType = "text/plain",
  size = 1024
) {
  return {
    name,
    metadata: {
      contentType,
      size: String(size),
      updated: new Date().toISOString(),
    },
  };
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

describe("listHandler", () => {
  let getAllFilesByPrefixMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getAllFilesByPrefixMock = vi
      .fn()
      .mockResolvedValue({ files: [], pageFetchCount: 1 });

    vi.mocked(getPrivateUploadBucket).mockReturnValue({
      getAllFilesByPrefix: getAllFilesByPrefixMock,
    } as unknown as ReturnType<typeof getPrivateUploadBucket>);
  });

  it("defaults to the conversation mount", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await listHandler({}, makeExtra(auth, conversation));

    expect(result.isOk()).toBe(true);
    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `w/${workspaceId}/conversations/${conversation.sId}/files/`,
      })
    );
  });

  it("lists the conversation mount when scope is explicit", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await listHandler(
      { scope: "conversation" },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `w/${workspaceId}/conversations/${conversation.sId}/files/`,
      })
    );
  });

  it("lists the project mount when scope=project in a project conversation", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const result = await listHandler(
      { scope: "project" },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `w/${workspaceId}/pods/${projectId}/files/`,
      })
    );
  });

  it("returns canonical scoped paths in the listing output", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const prefix = `w/${workspaceId}/conversations/${conversation.sId}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [makeStorageFile(`${prefix}report.pdf`, "application/pdf", 8192)],
      pageFetchCount: 1,
    });

    const result = await listHandler({}, makeExtra(auth, conversation));

    assert(result.isOk());
    const text = result.value[0];
    assert(text.type === "text");
    expect(text.text).toContain(`conversation-${conversation.sId}/report.pdf`);
  });

  it("shows [id: ...] suffix for interactive content types when fileId is set", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const prefix = `w/${workspaceId}/conversations/${conversation.sId}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [
        makeStorageFile(`${prefix}chart.html`, frameContentType, 2048),
        makeStorageFile(
          `${prefix}slides.html`,
          frameSlideshowContentType,
          4096
        ),
        makeStorageFile(`${prefix}report.pdf`, "application/pdf", 8192),
      ],
      pageFetchCount: 1,
    });

    const result = await listHandler({}, makeExtra(auth, conversation));

    assert(result.isOk());
    const text = result.value[0];
    assert(text.type === "text");

    // fileId is null until the DB migration (the backend always returns null for now).
    // Verify the interactive files are listed but without an ID suffix.
    expect(text.text).toContain("chart.html");
    expect(text.text).toContain("slides.html");
    expect(text.text).toContain("report.pdf");
    expect(text.text).not.toContain("[id:");
  });

  it("returns Err when scope=project in a non-project conversation", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await listHandler(
      { scope: "project" },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("project conversations");
    }
    expect(getAllFilesByPrefixMock).not.toHaveBeenCalled();
  });
});
