import { publishFramePublication } from "@app/lib/api/frames/publication_storage";
import { seedFramePublicationFunctionsArchive } from "@app/lib/api/frames/seed_functions_archive";
import type { Authenticator } from "@app/lib/auth";
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
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/frames/seed_functions_archive", () => ({
  seedFramePublicationFunctionsArchive: vi.fn().mockResolvedValue(undefined),
}));

const manifest = FrameManifestSchema.parse({
  version: 1,
  description: "Track tasks.",
});

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

  it("returns 404 when the Frame has no pending draft", async () => {
    const { auth, workspace, frame } = await setupAuthoredFrame();
    await publishBundle(auth, frame, "export default function A() {}", "live");

    const response = await postMakeLive(workspace.sId, frame.sId, {
      draftPublicationId: "anything",
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "file_not_found" },
    });
  });

  it("returns 403 to a caller who cannot edit the Frame", async () => {
    const { frame, workspace } = await makeTestFrameFunction();
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
  });

  it("returns 400 when draftPublicationId is missing", async () => {
    const { workspace, frame } = await setupAuthoredFrame();

    const response = await postMakeLive(workspace.sId, frame.sId, {});

    expect(response.status).toBe(400);
  });
});
