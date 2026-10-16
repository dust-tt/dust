import { makeFrameDraftLive } from "@app/lib/api/frames/make_live";
import type { FramePublicationFunctionArtifact } from "@app/lib/api/frames/publication_storage";
import { publishFramePublication } from "@app/lib/api/frames/publication_storage";
import { seedFramePublicationFunctionsArchive } from "@app/lib/api/frames/seed_functions_archive";
import type { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { makeTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import {
  FRAME_MANIFEST_FILE,
  FrameManifestSchema,
} from "@app/types/api/frame_manifest";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/frames/seed_functions_archive", () => ({
  seedFramePublicationFunctionsArchive: vi.fn().mockResolvedValue(undefined),
}));

async function setupFrame(): Promise<{
  frame: FileResource;
  auth: Authenticator;
}> {
  const { authenticator, workspace } = await createResourceTest({});
  await FeatureFlagFactory.basic(authenticator, "frames_v2_drafts");
  const conversation = await ConversationFactory.create(authenticator, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [new Date()],
  });
  const frame = await FileFactory.create(authenticator, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 0,
    status: "created",
    useCase: "conversation",
    useCaseMetadata: { conversationId: conversation.sId },
    mountFilePath: `${getConversationFilesBasePath({
      workspaceId: workspace.sId,
      conversationId: conversation.sId,
    })}Frame/${FRAME_MANIFEST_FILE}`,
  });

  return { auth: authenticator, frame };
}

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

const sourceFilesWithFunction = [
  ...sourceFiles,
  {
    relativePath: "functions/add_task.ts",
    content: Buffer.from("export async function run() {}"),
    contentType: "text/typescript" as const,
  },
];

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

const CODE_A = "export default function A() {}";
const CODE_B = "export default function B() {}";
const CODE_C = "export default function C() {}";

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

async function metadataOf(auth: Authenticator, frame: FileResource) {
  return (await FileResource.fetchById(auth, frame.sId))?.useCaseMetadata;
}

afterEach(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.mocked(seedFramePublicationFunctionsArchive).mockResolvedValue(undefined);
  fileStorageMock.reset();
});

describe("makeFrameDraftLive", () => {
  it("makes the draft live and clears it", async () => {
    const { auth, frame } = await setupFrame();
    await publishBundle(auth, frame, CODE_A, "live");
    const draftId = await publishBundle(auth, frame, CODE_B, "draft");

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    expect(result.isOk() && result.value).toEqual({ publicationId: draftId });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(draftId);
    expect(metadata?.draftPublicationId).toBeUndefined();
  });

  it("refuses a draft id that is no longer the pending draft", async () => {
    const { auth, frame } = await setupFrame();
    const liveId = await publishBundle(auth, frame, CODE_A, "live");
    const staleDraftId = await publishBundle(auth, frame, CODE_B, "draft");
    const pendingDraftId = await publishBundle(auth, frame, CODE_C, "draft");

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: staleDraftId,
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "draft_conflict" });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.draftPublicationId).toBe(pendingDraftId);
  });

  it("refuses when there is no pending draft", async () => {
    const { auth, frame } = await setupFrame();
    const liveId = await publishBundle(auth, frame, CODE_A, "live");

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: "anything",
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "no_draft" });
    expect((await metadataOf(auth, frame))?.activePublicationId).toBe(liveId);
  });

  it("refuses a caller who cannot write the Frame", async () => {
    const { auth, frame } = await makeTestFrameFunction();
    const draftId = "draft-publication-1";
    await frame.setDraftFramePublication({ publicationId: draftId });

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "unauthorized" });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe("publication-1");
    expect(metadata?.draftPublicationId).toBe(draftId);
  });

  it("fails on the function sharing check like a publish would", async () => {
    const { auth, frame } = await setupFrame();
    await FeatureFlagFactory.basic(auth, "frames_v2");
    await FeatureFlagFactory.basic(auth, "frames_v2_functions");
    const liveId = await publishBundle(auth, frame, CODE_A, "live");
    const published = await publishFramePublication(auth, {
      frame,
      functionArtifacts,
      manifest: manifestWithFunction,
      sourceFiles: sourceFilesWithFunction,
      uiBundleCode: CODE_B,
      mode: "draft",
    });
    assert(published.isOk(), "draft publish succeeds");
    const draftId = published.value.publicationId;
    await frame.setShareScope(auth, "public");

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "sharing_conflict" });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.draftPublicationId).toBe(draftId);
  });
});
