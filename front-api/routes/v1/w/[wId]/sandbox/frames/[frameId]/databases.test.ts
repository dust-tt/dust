import { ensureFrameSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import {
  listDatabasesOnReadySandbox,
  queryDatabaseOnReadySandbox,
} from "@app/lib/api/sandbox_functions/dsbx_db";
import { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import {
  createPersistedFrameFunctionInvocationTokenTestContext,
  createSandboxTokenTestContext,
} from "@app/tests/utils/SandboxTokenFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(import("@app/lib/api/sandbox/lifecycle"), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ensureFrameSandboxReady: vi.fn() };
});

vi.mock(
  import("@app/lib/api/sandbox_functions/dsbx_db"),
  async (importOriginal) => {
    const actual = await importOriginal();
    return {
      ...actual,
      listDatabasesOnReadySandbox: vi.fn(),
      queryDatabaseOnReadySandbox: vi.fn(),
    };
  }
);

async function makeConversationFrame({
  auth,
  workspaceId,
  conversationId,
  directory = "Status",
}: {
  auth: Authenticator;
  workspaceId: string;
  conversationId: string;
  directory?: string;
}): Promise<FileResource> {
  return FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 100,
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: { conversationId },
    mountFilePath: `${getConversationFilesBasePath({
      workspaceId,
      conversationId,
    })}${directory}/${FRAME_MANIFEST_FILE}`,
  });
}

function frameDatabasesUrl(workspaceId: string, frameId: string): string {
  return `/api/v1/w/${workspaceId}/sandbox/frames/${frameId}/databases`;
}

function requestFrameDatabases({
  workspaceId,
  frameId,
  token,
  query,
}: {
  workspaceId: string;
  frameId: string;
  token: string;
  query?: { database: string; sql: string };
}) {
  return honoApp.request(frameDatabasesUrl(workspaceId, frameId), {
    method: query ? "POST" : "GET",
    headers: {
      authorization: `Bearer ${token}`,
      ...(query ? { "content-type": "application/json" } : {}),
    },
    body: query ? JSON.stringify(query) : undefined,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("conversation sandbox Frame database access", () => {
  it("lists databases for a Frame whose source the caller can write", async () => {
    const context = await createSandboxTokenTestContext();
    await FeatureFlagFactory.basic(context.auth, "frames_v2");
    const frame = await makeConversationFrame({
      auth: context.auth,
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    });
    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({
        sandbox: context.sandbox,
        freshlyCreated: false,
        scope: { spaceId: null },
      })
    );
    vi.mocked(listDatabasesOnReadySandbox).mockResolvedValue(
      new Ok([{ name: "tasks", sizeBytes: 8192 }])
    );

    const response = await requestFrameDatabases({
      workspaceId: context.workspace.sId,
      frameId: frame.sId,
      token: context.token,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [{ name: "tasks", sizeBytes: 8192 }],
    });
    expect(ensureFrameSandboxReady).toHaveBeenCalledWith(
      expect.any(Authenticator),
      frame
    );
    expect(listDatabasesOnReadySandbox).toHaveBeenCalledWith(
      expect.any(Authenticator),
      context.sandbox
    );
  });

  it("runs data-changing SQL for an authorized Frame", async () => {
    const context = await createSandboxTokenTestContext();
    await FeatureFlagFactory.basic(context.auth, "frames_v2");
    const frame = await makeConversationFrame({
      auth: context.auth,
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    });
    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({
        sandbox: context.sandbox,
        freshlyCreated: false,
        scope: { spaceId: null },
      })
    );
    vi.mocked(queryDatabaseOnReadySandbox).mockResolvedValue(
      new Ok({
        columns: [],
        rows: [],
        rowCount: 0,
        changes: 3,
        resultsFile: null,
        note: null,
      })
    );

    const response = await requestFrameDatabases({
      workspaceId: context.workspace.sId,
      frameId: frame.sId,
      token: context.token,
      query: {
        database: "tasks",
        sql: "UPDATE tasks SET done = 1 WHERE owner = 'me'",
      },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      columns: [],
      rows: [],
      rowCount: 0,
      changes: 3,
      resultsFile: null,
      note: null,
    });
    expect(ensureFrameSandboxReady).toHaveBeenCalledWith(
      expect.any(Authenticator),
      frame
    );
    expect(queryDatabaseOnReadySandbox).toHaveBeenCalledWith(
      expect.any(Authenticator),
      {
        sandbox: context.sandbox,
        database: "tasks",
        sql: "UPDATE tasks SET done = 1 WHERE owner = 'me'",
      }
    );
  });

  it("lets a userless conversation token reach its own conversation's Frame", async () => {
    const context = await createSandboxTokenTestContext({
      userlessToken: true,
    });
    await FeatureFlagFactory.basic(context.auth, "frames_v2");
    const frame = await makeConversationFrame({
      auth: context.auth,
      workspaceId: context.workspace.sId,
      conversationId: context.conversation.sId,
    });
    vi.mocked(ensureFrameSandboxReady).mockResolvedValue(
      new Ok({
        sandbox: context.sandbox,
        freshlyCreated: false,
        scope: { spaceId: null },
      })
    );
    vi.mocked(listDatabasesOnReadySandbox).mockResolvedValue(new Ok([]));

    const response = await requestFrameDatabases({
      workspaceId: context.workspace.sId,
      frameId: frame.sId,
      token: context.token,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ items: [] });
  });

  it("denies a same-workspace Frame whose source the caller cannot write", async () => {
    const context = await createSandboxTokenTestContext();
    await FeatureFlagFactory.basic(context.auth, "frames_v2");
    const metadataResult = await WorkspaceResource.updateMetadata(
      context.workspace.id,
      { privateConversationUrlsByDefault: true }
    );
    expect(metadataResult.isOk()).toBe(true);
    const otherUser = await UserFactory.basic();
    await MembershipFactory.associate(context.workspace, otherUser, {
      role: "user",
    });
    const otherAuth = await Authenticator.fromUserIdAndWorkspaceId(
      otherUser.sId,
      context.workspace.sId
    );
    const otherConversation = await ConversationFactory.create(otherAuth, {
      agentConfigurationId: context.agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
    const frame = await makeConversationFrame({
      auth: otherAuth,
      workspaceId: context.workspace.sId,
      conversationId: otherConversation.sId,
      directory: "Private",
    });

    const response = await requestFrameDatabases({
      workspaceId: context.workspace.sId,
      frameId: frame.sId,
      token: context.token,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "You do not have access to this Frame's databases." },
    });
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });

  it("does not resolve a Frame from another workspace", async () => {
    const context = await createSandboxTokenTestContext();
    await FeatureFlagFactory.basic(context.auth, "frames_v2");
    const { authenticator: otherAuth, workspace: otherWorkspace } =
      await createResourceTest({ role: "admin" });
    const otherConversation = await ConversationFactory.create(otherAuth, {
      agentConfigurationId: "test-agent",
      messagesCreatedAt: [],
    });
    const otherFrame = await makeConversationFrame({
      auth: otherAuth,
      workspaceId: otherWorkspace.sId,
      conversationId: otherConversation.sId,
    });

    const response = await requestFrameDatabases({
      workspaceId: context.workspace.sId,
      frameId: otherFrame.sId,
      token: context.token,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { message: "Frame not found." },
    });
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });

  it("rejects Frame function invocation tokens", async () => {
    const context =
      await createPersistedFrameFunctionInvocationTokenTestContext();

    const response = await requestFrameDatabases({
      workspaceId: context.workspace.sId,
      frameId: context.frame.sId,
      token: context.token,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: "This sandbox token cannot access this endpoint.",
      },
    });
    expect(ensureFrameSandboxReady).not.toHaveBeenCalled();
  });
});
