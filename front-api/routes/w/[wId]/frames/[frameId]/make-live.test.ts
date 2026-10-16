import type { FramePublicationFunctionArtifact } from "@app/lib/api/frames/publication_storage";
import { publishFramePublication } from "@app/lib/api/frames/publication_storage";
import { seedFramePublicationFunctionsArchive } from "@app/lib/api/frames/seed_functions_archive";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  executeWithLockResult,
  LockAcquisitionTimeoutError,
} from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import {
  FRAME_MANIFEST_FILE,
  FrameManifestSchema,
} from "@app/types/api/frame_manifest";
import { frameContentType, frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { Err } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/frames/seed_functions_archive", () => ({
  seedFramePublicationFunctionsArchive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/lock", async (importActual) => {
  const actual = await importActual<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLockResult: vi.fn(actual.executeWithLockResult),
  };
});

const manifest = FrameManifestSchema.parse({
  version: 1,
  description: "Track tasks.",
});

const manifestWithFunction = FrameManifestSchema.parse({
  version: 1,
  description: "Track tasks.",
  functions: [
    {
      name: "add-task",
      description: "Add a task.",
      entryPoint: "functions/add_task.ts",
    },
  ],
});

const functionArtifacts = [
  {
    name: "add-task",
    bundleCode: "export async function run() {}",
    userIdentity: "workspace_user_required",
    inputSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
    },
    outputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
] satisfies FramePublicationFunctionArtifact[];

const sourceFiles = [
  {
    relativePath: "index.tsx",
    content: Buffer.from("export default function App() {}"),
    contentType: "text/typescript" as const,
  },
  {
    relativePath: "data.json",
    content: Buffer.from("{}"),
    contentType: "application/json" as const,
  },
];

async function publishBundle(
  auth: Authenticator,
  frame: FileResource,
  code: string,
  mode: "live" | "draft"
): Promise<string> {
  const published = await publishFramePublication(auth, {
    frame,
    functionArtifacts: [],
    manifest,
    sourceFiles,
    uiBundleCode: code,
    mode,
  });
  assert(published.isOk(), "publish succeeds");
  return published.value.publicationId;
}

async function publishFunctionDraft(
  auth: Authenticator,
  frame: FileResource
): Promise<string> {
  const published = await publishFramePublication(auth, {
    frame,
    functionArtifacts,
    manifest: manifestWithFunction,
    sourceFiles: [
      ...sourceFiles,
      {
        relativePath: "functions/add_task.ts",
        content: Buffer.from("export async function run() {}"),
        contentType: "text/typescript" as const,
      },
    ],
    uiBundleCode: "export default function B() {}",
    mode: "draft",
  });
  assert(published.isOk(), "draft publish succeeds");
  expect(published.value.status).toBe("draft");
  return published.value.publicationId;
}

async function metadataOf(auth: Authenticator, frame: FileResource) {
  return (await FileResource.fetchById(auth, frame.sId))?.useCaseMetadata;
}

async function setupAuthoredFrame() {
  const { auth, workspace } = await createPrivateApiMockRequest({
    role: "admin",
  });
  await FeatureFlagFactory.basic(auth, "frames_v2");
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "test-agent",
    messagesCreatedAt: [],
  });
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 10,
    status: "created",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}Admin/${FRAME_MANIFEST_FILE}`,
  });
  return { auth, workspace, frame };
}

function postMakeLive(workspaceId: string, frameId: string, body: unknown) {
  return honoApp.request(`/api/w/${workspaceId}/frames/${frameId}/make-live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.mocked(seedFramePublicationFunctionsArchive).mockResolvedValue(undefined);
  fileStorageMock.reset();
});

describe("POST /api/w/:wId/frames/:frameId/make-live", () => {
  it("makes the pending draft live", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    await publishBundle(auth, frame, "export default function A() {}", "live");
    const draftId = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: draftId,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ publicationId: draftId });
    const metadata = (await FileResource.fetchById(auth, frame.sId))
      ?.useCaseMetadata;
    expect(metadata?.activePublicationId).toBe(draftId);
    expect(metadata?.draftPublicationId).toBeUndefined();
  });

  it("returns 409 when the draft id is stale", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    await publishBundle(auth, frame, "export default function A() {}", "live");
    const staleDraftId = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );
    await publishBundle(auth, frame, "export default function C() {}", "draft");

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: staleDraftId,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "frame_draft_conflict" },
    });
  });

  it("returns 200 again when the draft is already live", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    await publishBundle(auth, frame, "export default function A() {}", "live");
    const draftId = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );

    const first = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: draftId,
    });
    const second = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: draftId,
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toEqual({ publicationId: draftId });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(draftId);
    expect(metadata?.draftPublicationId).toBeUndefined();
  });

  it("returns 409 when the Frame has no pending draft", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    const liveId = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "live"
    );

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: "anything",
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "frame_draft_conflict" },
    });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.draftPublicationId).toBeUndefined();
  });

  it("returns 404 when the Frame is deleted before the locks are taken", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    await publishBundle(auth, frame, "export default function A() {}", "live");
    const draftId = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );
    vi.spyOn(FileResource.prototype, "fetchFreshFrameV2").mockResolvedValue(
      null
    );

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: draftId,
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "file_not_found" },
    });
  });

  it("returns 409 frame_draft_conflict when the Frame lock times out and keeps both pointers", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    const liveId = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "live"
    );
    const draftId = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );
    vi.mocked(executeWithLockResult).mockImplementationOnce(
      async (lockName) => new Err(new LockAcquisitionTimeoutError(lockName))
    );

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: draftId,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "frame_draft_conflict" },
    });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.draftPublicationId).toBe(draftId);
  });

  it("returns 500 when the pending draft's publication is missing", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    const liveId = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "live"
    );
    const fresh = await frame.fetchFreshFrameV2(auth);
    assert(fresh, "Frame exists");
    await fresh.setDraftFramePublication({
      publicationId: "missing-draft-publication",
    });
    fileStorageMock.setFetchFileContentNotFound((path) =>
      path.includes("missing-draft-publication")
    );

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: "missing-draft-publication",
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "internal_server_error" },
    });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.draftPublicationId).toBe("missing-draft-publication");
  });

  it("returns 400 frame_make_live_failed when Frame functions were turned off and keeps both pointers", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    await FeatureFlagFactory.basic(auth, "frames_v2_functions");
    const liveId = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "live"
    );
    const draftId = await publishFunctionDraft(auth, frame);
    await FeatureFlagFactory.disable(auth, "frames_v2_functions");

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: draftId,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "frame_make_live_failed" },
    });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.draftPublicationId).toBe(draftId);
  });

  it("returns 403 to a caller who cannot edit the Frame", async () => {
    const { auth, frame, workspace } = await makeTestFrameFunction();
    await frame.setDraftFramePublication({
      publicationId: "draft-publication-1",
    });

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: "draft-publication-1",
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "file_read_only" },
    });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe("publication-1");
    expect(metadata?.draftPublicationId).toBe("draft-publication-1");
  });

  it("returns 400 when draftPublicationId is missing", async () => {
    const { workspace, frame } = await setupAuthoredFrame();

    const response = await postMakeLive(workspace.sId, frame.sId, {});

    expect(response.status).toBe(400);
  });

  it("returns 404 when the file is not a Frames v2 file", async () => {
    const { auth, workspace } = await setupAuthoredFrame();
    const legacy = await FileFactory.create(auth, null, {
      contentType: frameContentType,
      fileName: "legacy.tsx",
      fileSize: 10,
      status: "ready",
      useCase: "conversation",
    });

    const response = await postMakeLive(workspace.sId, legacy.sId, {
      draftPublicationId: "anything",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "file_not_found" },
    });
  });

  it("returns 403 frame_sharing_not_allowed on a function sharing conflict and keeps both pointers", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    await FeatureFlagFactory.basic(auth, "frames_v2_functions");
    const liveId = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "live"
    );
    const draftId = await publishFunctionDraft(auth, frame);
    await frame.setShareScope(auth, "public");

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: draftId,
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "frame_sharing_not_allowed" },
    });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.draftPublicationId).toBe(draftId);
  });

  it("returns 400 frame_files_unverifiable when the share allowlist fails and keeps both pointers", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    const liveId = await publishBundle(
      auth,
      frame,
      "export default function A() {}",
      "live"
    );
    const draftId = await publishBundle(
      auth,
      frame,
      "export default function B() {}",
      "draft"
    );
    vi.spyOn(
      FileResource.prototype,
      "computeAuthorizedFileAccess"
    ).mockResolvedValue(
      new Err(new DustError("frame_user_required", "Simulated failure."))
    );

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: draftId,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "frame_files_unverifiable" },
    });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.draftPublicationId).toBe(draftId);
  });
});
