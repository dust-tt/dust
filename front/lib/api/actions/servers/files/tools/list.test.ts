import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { listHandler } from "@app/lib/api/actions/servers/files/tools/list";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import { frameContentType, frameSlideshowContentType } from "@app/types/files";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListGCSMountFiles } = vi.hoisted(() => ({
  mockListGCSMountFiles: vi.fn(),
}));

vi.mock("@app/lib/api/files/gcs_mount/files", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/files/gcs_mount/files")>();
  return {
    ...actual,
    listGCSMountFiles: mockListGCSMountFiles,
  };
});

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

describe("listHandler", () => {
  beforeEach(() => {
    mockListGCSMountFiles.mockReset();
    mockListGCSMountFiles.mockResolvedValue([]);
  });

  it("defaults to the conversation mount", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await listHandler({}, makeExtra(auth, conversation));

    expect(result.isOk()).toBe(true);
    expect(mockListGCSMountFiles).toHaveBeenCalledTimes(1);
    expect(mockListGCSMountFiles.mock.calls[0][1]).toEqual({
      useCase: "conversation",
      conversationId: conversation.sId,
    });
  });

  it("lists the conversation mount when scope is explicit", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

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
    expect(mockListGCSMountFiles.mock.calls[0][1]).toEqual({
      useCase: "conversation",
      conversationId: conversation.sId,
    });
  });

  it("lists the project mount when scope=project in a project conversation", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    const result = await listHandler(
      { scope: "project" },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    expect(mockListGCSMountFiles.mock.calls[0][1]).toEqual({
      useCase: "project",
      projectId: projectId,
    });
  });

  it("includes fil_ id in listing for frame and slideshow files but not for regular files", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    mockListGCSMountFiles.mockResolvedValue([
      {
        isDirectory: false,
        fileName: "chart.html",
        path: "conversation/chart.html",
        sizeBytes: 2048,
        lastModifiedMs: 0,
        contentType: frameContentType,
        fileId: "fil_frameabc123",
        thumbnailUrl: null,
      },
      {
        isDirectory: false,
        fileName: "slides.html",
        path: "conversation/slides.html",
        sizeBytes: 4096,
        lastModifiedMs: 0,
        contentType: frameSlideshowContentType,
        fileId: "fil_slidexyz789",
        thumbnailUrl: null,
      },
      {
        isDirectory: false,
        fileName: "report.pdf",
        path: "conversation/report.pdf",
        sizeBytes: 8192,
        lastModifiedMs: 0,
        contentType: "application/pdf",
        fileId: "fil_pdfdef456",
        thumbnailUrl: null,
      },
    ]);

    const result = await listHandler({}, makeExtra(auth, conversation));

    assert(result.isOk());
    const text = result.value[0];
    assert(text.type === "text");

    expect(text.text).toContain("[id: fil_frameabc123]");
    expect(text.text).toContain("[id: fil_slidexyz789]");
    expect(text.text).not.toContain("[id: fil_pdfdef456]");
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
    if (!result.isErr()) {
      return;
    }
    expect(result.error.message).toContain("project conversations");
    expect(mockListGCSMountFiles).not.toHaveBeenCalled();
  });
});
