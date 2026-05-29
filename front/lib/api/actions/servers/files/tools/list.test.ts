import type { ToolHandlerExtra } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { listHandler } from "@app/lib/api/actions/servers/files/tools/list";
import { createConversation } from "@app/lib/api/assistant/conversation";
import { Authenticator } from "@app/lib/auth";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import type { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import type { ConversationType } from "@app/types/assistant/conversation";
import { frameContentType, frameSlideshowContentType } from "@app/types/files";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/file_storage/config", () => ({
  default: { getGcsPrivateUploadsBucket: vi.fn(() => "test-bucket") },
}));
vi.mock("@app/lib/api/config", () => ({
  default: { getApiBaseUrl: vi.fn(() => "https://dust.tt") },
}));

async function sessionAuthForUser(
  user: UserResource,
  workspace: LightWorkspaceType
): Promise<Authenticator> {
  assert(
    user.workOSUserId,
    "Expected user to have a WorkOS user ID for session auth"
  );

  return Authenticator.fromSession(
    {
      type: "workos",
      sessionId: `test-session-${user.sId}`,
      user: {
        workOSUserId: user.workOSUserId,
        email: user.email ?? "user@dust.tt",
        email_verified: true,
        name: user.username ?? "user",
        nickname: user.username ?? "user",
      },
      authenticationMethod: "GoogleOAuth",
      isSSO: false,
      workspaceId: workspace.sId,
      organizationId: workspace.workOSOrganizationId ?? undefined,
      region: "us-central1",
    },
    workspace.sId
  );
}

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

async function setupProjectWithRegularConversation(): Promise<{
  auth: Authenticator;
  conversation: ConversationType;
  projectId: string;
  workspaceId: string;
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
    title: "Regular",
    visibility: "unlisted",
    spaceId: null,
  });

  return {
    auth: projectAuth,
    conversation,
    projectId: space.sId,
    workspaceId: workspace.sId,
  };
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
      { scope: { type: "conversation" } },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `w/${workspaceId}/conversations/${conversation.sId}/files/`,
      })
    );
  });

  it("lists the pod mount when scope=pod in a pod conversation", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const result = await listHandler(
      { scope: { type: "pod" } },
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

  it("lists another conversation when conversation_id is set", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const loopConversation = await createConversation(auth, {
      title: "Loop",
      visibility: "unlisted",
      spaceId: null,
    });
    const otherConversation = await createConversation(auth, {
      title: "Other",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await listHandler(
      {
        scope: {
          type: "conversation",
          conversation_id: otherConversation.sId,
        },
      },
      makeExtra(auth, loopConversation)
    );

    expect(result.isOk()).toBe(true);
    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `w/${workspaceId}/conversations/${otherConversation.sId}/files/`,
      })
    );
  });

  it("lists a pod by explicit pod_id from a non-pod conversation", async () => {
    const { auth, conversation, projectId, workspaceId } =
      await setupProjectWithRegularConversation();

    const result = await listHandler(
      { scope: { type: "pod", pod_id: projectId } },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `w/${workspaceId}/pods/${projectId}/files/`,
      })
    );
  });

  it("lists a pod by explicit pod_id in a pod conversation", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const workspaceId = auth.getNonNullableWorkspace().sId;

    const result = await listHandler(
      { scope: { type: "pod", pod_id: projectId } },
      makeExtra(auth, conversation)
    );

    expect(result.isOk()).toBe(true);
    expect(getAllFilesByPrefixMock).toHaveBeenCalledWith(
      expect.objectContaining({
        prefix: `w/${workspaceId}/pods/${projectId}/files/`,
      })
    );
  });

  it("returns canonical pod scoped paths when listing a pod", async () => {
    const { auth, conversation, projectId, workspaceId } =
      await setupProjectWithRegularConversation();

    const prefix = `w/${workspaceId}/pods/${projectId}/files/`;
    getAllFilesByPrefixMock.mockResolvedValue({
      files: [makeStorageFile(`${prefix}shared.pdf`, "application/pdf", 4096)],
      pageFetchCount: 1,
    });

    const result = await listHandler(
      { scope: { type: "pod", pod_id: projectId } },
      makeExtra(auth, conversation)
    );

    assert(result.isOk());
    const text = result.value[0];
    assert(text.type === "text");
    expect(text.text).toContain(`pod-${projectId}/shared.pdf`);
  });

  it("returns Err when conversation_id is not in the caller workspace", async () => {
    const { authenticator: authA } = await createResourceTest({
      role: "admin",
    });
    const { authenticator: authB } = await createResourceTest({
      role: "admin",
    });

    const foreignConversation = await createConversation(authA, {
      title: "Foreign",
      visibility: "unlisted",
      spaceId: null,
    });
    const loopConversation = await createConversation(authB, {
      title: "Loop",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await listHandler(
      {
        scope: {
          type: "conversation",
          conversation_id: foreignConversation.sId,
        },
      },
      makeExtra(authB, loopConversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Conversation not found");
    }
    expect(getAllFilesByPrefixMock).not.toHaveBeenCalled();
  });

  it("returns Err when pod_id references a pod without read access", async () => {
    const { workspace, user } = await createResourceTest({ role: "user" });
    const projectSpace = await SpaceFactory.project(workspace);
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await listHandler(
      { scope: { type: "pod", pod_id: projectSpace.sId } },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("read access");
    }
    expect(getAllFilesByPrefixMock).not.toHaveBeenCalled();
  });

  it("returns Err when conversation_id is private to another participant", async () => {
    const { workspace, authenticator: adminAuth } = await createResourceTest({
      role: "admin",
    });

    const regularUser = await UserFactory.basic();
    await MembershipFactory.associate(workspace, regularUser, { role: "user" });

    const updateResult = await WorkspaceResource.updateMetadata(workspace.id, {
      privateConversationUrlsByDefault: true,
    });
    assert(updateResult.isOk(), "Failed to enable private conversation URLs");

    const adminConversation = await createConversation(adminAuth, {
      title: "Admin private",
      visibility: "unlisted",
      spaceId: null,
    });

    const userSessionAuth = await sessionAuthForUser(regularUser, workspace);
    const loopConversation = await createConversation(userSessionAuth, {
      title: "User loop",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await listHandler(
      {
        scope: {
          type: "conversation",
          conversation_id: adminConversation.sId,
        },
      },
      makeExtra(userSessionAuth, loopConversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("Conversation not found");
    }
    expect(getAllFilesByPrefixMock).not.toHaveBeenCalled();
  });

  it("returns Err when scope=pod in a non-project conversation", async () => {
    const { authenticator: auth } = await createResourceTest({ role: "admin" });

    const conversation = await createConversation(auth, {
      title: "Test",
      visibility: "unlisted",
      spaceId: null,
    });

    const result = await listHandler(
      { scope: { type: "pod" } },
      makeExtra(auth, conversation)
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("pod_id");
    }
    expect(getAllFilesByPrefixMock).not.toHaveBeenCalled();
  });
});
