// Frame publishing runs esbuild, whose TextEncoder invariant requires Node rather than jsdom.
// @vitest-environment node

import { generateSandboxExecToken } from "@app/lib/api/sandbox/access_tokens";
import { AgentMCPActionResource } from "@app/lib/resources/agent_mcp_action_resource";
import { FileResource } from "@app/lib/resources/file_resource";
import { AgentMCPActionFactory } from "@app/tests/utils/AgentMCPActionFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import {
  createSandboxFunctionInvocationTokenTestContext,
  createSandboxTokenTestContext,
} from "@app/tests/utils/SandboxTokenFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLock: async <T>(_name: string, cb: () => Promise<T>) => cb(),
  };
});

const manifest = JSON.stringify({
  version: 1,
  name: "Status",
  description: "Show the current status.",
});
const uiSource = "export default function Status() { return <p>Ready</p>; }";

function postJson(path: string, token: string, body: unknown) {
  return honoApp.request(path, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function requestFramePublish(
  workspaceId: string,
  token: string,
  manifestPath: string,
  mode: "live" | "draft"
) {
  return postJson(`/api/v1/w/${workspaceId}/sandbox/frames/publish`, token, {
    manifestPath,
    mode,
  });
}

function requestMakeLive(
  workspaceId: string,
  token: string,
  frameId: string,
  body: unknown
) {
  return postJson(
    `/api/v1/w/${workspaceId}/sandbox/frames/${frameId}/make-live`,
    token,
    body
  );
}

// The shared token context signs a mock action that is never persisted. Attaching the Frame to its
// parent action needs a real one, so these tests sign a token for a persisted action.
async function setup() {
  const context = await createSandboxTokenTestContext();
  await FeatureFlagFactory.basic(context.auth, "frames_v2");
  await FeatureFlagFactory.basic(context.auth, "frames_v2_drafts");

  const { action: parentAction } = await AgentMCPActionFactory.create(
    context.auth,
    {
      workspace: context.workspace,
      conversationModelId: context.conversation.id,
      agentMessageModelId: context.agentMessage.agentMessageId,
      status: "running",
      functionCallName: "sandbox__bash",
      toolName: "bash",
      mcpServerName: "sandbox",
    }
  );
  const token = await generateSandboxExecToken(context.auth, {
    agentConfiguration: context.agentConfig,
    agentMessage: context.agentMessage,
    conversation: context.conversation,
    sandbox: context.sandbox,
    execId: `test-exec-${parentAction.sId}`,
    sandboxAction: parentAction.toJSON(),
  });

  const sourceDirectoryPath = `conversation-${context.conversation.sId}/Status`;
  const manifestPath = `${sourceDirectoryPath}/${FRAME_MANIFEST_FILE}`;
  const mountDirectoryPath = `${getConversationFilesBasePath({
    workspaceId: context.workspace.sId,
    conversationId: context.conversation.sId,
  })}Status`;
  const frame = await FileFactory.create(context.auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: Buffer.byteLength(manifest),
    status: "created",
    useCase: "conversation",
    useCaseMetadata: { conversationId: context.conversation.sId },
    mountFilePath: `${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`,
  });
  const sourceByPath = new Map([
    [`${mountDirectoryPath}/${FRAME_MANIFEST_FILE}`, manifest],
    [`${mountDirectoryPath}/index.tsx`, uiSource],
  ]);
  fileStorageMock.setFileContent((path) => sourceByPath.get(path) ?? null);
  fileStorageMock.setFilesByPrefix((prefix) =>
    prefix === `${mountDirectoryPath}/`
      ? [...sourceByPath.entries()].map(([name, content]) => ({
          name,
          metadata: {
            contentType: name.endsWith(".tsx")
              ? "text/typescript"
              : "application/json",
            size: String(Buffer.byteLength(content)),
          },
        }))
      : null
  );

  return {
    ...context,
    frame,
    manifestPath,
    mountDirectoryPath,
    parentAction,
    sourceByPath,
    token,
  };
}

// Publishes the Frame live, then a changed draft, and returns both publication ids.
async function publishLiveThenDraft(
  context: Awaited<ReturnType<typeof setup>>
) {
  const liveResponse = await requestFramePublish(
    context.workspace.sId,
    context.token,
    context.manifestPath,
    "live"
  );
  expect(liveResponse.status).toBe(200);
  const live = await liveResponse.json();

  context.sourceByPath.set(
    `${context.mountDirectoryPath}/index.tsx`,
    uiSource.replace("Ready", "Almost ready")
  );
  const draftResponse = await requestFramePublish(
    context.workspace.sId,
    context.token,
    context.manifestPath,
    "draft"
  );
  expect(draftResponse.status).toBe(200);
  const draft = await draftResponse.json();
  expect(draft.status).toBe("draft");

  return {
    livePublicationId: live.publicationId as string,
    draftPublicationId: draft.publicationId as string,
  };
}

async function listGeneratedFiles(context: Awaited<ReturnType<typeof setup>>) {
  const [enrichedParent] =
    await AgentMCPActionResource.enrichActionsWithOutputItems(context.auth, {
      actions: [context.parentAction],
      ignoreContent: false,
    });
  return enrichedParent.generatedFiles;
}

beforeEach(() => {
  fileStorageMock.reset();
});

describe("POST /api/v1/w/[wId]/sandbox/frames/[frameId]/make-live", () => {
  it("makes the pending draft live and attaches the Frame to the parent action", async () => {
    const context = await setup();
    const { draftPublicationId } = await publishLiveThenDraft(context);
    // Each publish attaches the Frame to the parent action; make-live must attach it once more.
    const generatedFilesBefore = await listGeneratedFiles(context);

    const response = await requestMakeLive(
      context.workspace.sId,
      context.token,
      context.frame.sId,
      { publicationId: draftPublicationId }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      frameId: context.frame.sId,
      publicationId: draftPublicationId,
      status: "live",
    });
    const frame = await FileResource.fetchById(context.auth, context.frame.sId);
    expect(frame?.useCaseMetadata?.activePublicationId).toBe(
      draftPublicationId
    );
    expect(frame?.useCaseMetadata?.draftPublicationId).toBeUndefined();

    const generatedFilesAfter = await listGeneratedFiles(context);
    expect(generatedFilesAfter).toHaveLength(generatedFilesBefore.length + 1);
    expect(generatedFilesAfter.at(-1)).toMatchObject({
      fileId: context.frame.sId,
      contentType: frameV2ContentType,
    });
  });

  it("returns 409 when the publication id is stale", async () => {
    const context = await setup();
    const { livePublicationId, draftPublicationId } =
      await publishLiveThenDraft(context);
    context.sourceByPath.set(
      `${context.mountDirectoryPath}/index.tsx`,
      uiSource.replace("Ready", "Newer")
    );
    const newerDraft = await requestFramePublish(
      context.workspace.sId,
      context.token,
      context.manifestPath,
      "draft"
    );
    expect(newerDraft.status).toBe(200);
    const { publicationId: newerDraftId } = await newerDraft.json();
    expect(newerDraftId).not.toBe(draftPublicationId);

    const response = await requestMakeLive(
      context.workspace.sId,
      context.token,
      context.frame.sId,
      { publicationId: draftPublicationId }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "frame_draft_conflict" },
    });
    const frame = await FileResource.fetchById(context.auth, context.frame.sId);
    expect(frame?.useCaseMetadata?.activePublicationId).toBe(livePublicationId);
    expect(frame?.useCaseMetadata?.draftPublicationId).toBe(newerDraftId);
  });

  it("returns 404 when the Frame has no pending draft", async () => {
    const context = await setup();
    const liveResponse = await requestFramePublish(
      context.workspace.sId,
      context.token,
      context.manifestPath,
      "live"
    );
    expect(liveResponse.status).toBe(200);

    const response = await requestMakeLive(
      context.workspace.sId,
      context.token,
      context.frame.sId,
      { publicationId: "anything" }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "file_not_found" },
    });
  });

  it("returns 404 for a Frame id that does not exist", async () => {
    const context = await setup();
    const response = await requestMakeLive(
      context.workspace.sId,
      context.token,
      "fil_doesnotexist",
      { publicationId: "anything" }
    );

    expect(response.status).toBe(404);
  });

  it("returns 400 for a malformed Frame id", async () => {
    const context = await setup();

    const response = await requestMakeLive(
      context.workspace.sId,
      context.token,
      "not-a-file-id",
      { publicationId: "anything" }
    );

    expect(response.status).toBe(400);
  });

  it("returns 400 when publicationId is missing", async () => {
    const context = await setup();

    const response = await requestMakeLive(
      context.workspace.sId,
      context.token,
      context.frame.sId,
      {}
    );

    expect(response.status).toBe(400);
  });

  it("returns 403 for a token that is not a sandbox exec token", async () => {
    const context = await createSandboxFunctionInvocationTokenTestContext();

    const response = await requestMakeLive(
      context.workspace.sId,
      context.token,
      "fil_anything",
      { publicationId: "anything" }
    );

    expect(response.status).toBe(403);
  });

  it("returns 403 without the frames_v2 flag", async () => {
    const context = await createSandboxTokenTestContext();

    const response = await requestMakeLive(
      context.workspace.sId,
      context.token,
      "fil_anything",
      { publicationId: "anything" }
    );

    expect(response.status).toBe(403);
  });
});
