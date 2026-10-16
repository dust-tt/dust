import { makeFrameDraftLive } from "@app/lib/api/frames/make_live";
import { canWriteFrameV2Source } from "@app/lib/api/frames/permissions";
import type { FramePublicationFunctionArtifact } from "@app/lib/api/frames/publication_storage";
import { publishFramePublication } from "@app/lib/api/frames/publication_storage";
import { seedFramePublicationFunctionsArchive } from "@app/lib/api/frames/seed_functions_archive";
import { computeFrameContentHash } from "@app/lib/api/viz/authorized_file_access_policy";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import {
  enablePublicFrameFunctions,
  makeTestFrameFunction,
} from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { UserFactory } from "@app/tests/utils/UserFactory";
import {
  FRAME_MANIFEST_FILE,
  FrameManifestSchema,
} from "@app/types/api/frame_manifest";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameV2ContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/frames/seed_functions_archive", () => ({
  seedFramePublicationFunctionsArchive: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/frames/permissions", async (importActual) => {
  const actual =
    await importActual<typeof import("@app/lib/api/frames/permissions")>();
  return {
    ...actual,
    canWriteFrameV2Source: vi.fn(actual.canWriteFrameV2Source),
  };
});

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

const manifestWithFastFunction = FrameManifestSchema.parse({
  version: 1,
  description: "Track tasks.",
  functions: [
    {
      name: "add-task",
      description: "Add a task.",
      entryPoint: "functions/add_task.ts",
      executionMode: "fast",
    },
  ],
});

const publicFunctionArtifacts = functionArtifacts.map((artifact) => ({
  ...artifact,
  userIdentity: "public" as const,
}));

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

async function publishFunctionDraft(
  auth: Authenticator,
  frame: FileResource,
  artifacts: FramePublicationFunctionArtifact[],
  functionManifest = manifestWithFunction
): Promise<string> {
  const published = await publishFramePublication(auth, {
    frame,
    functionArtifacts: artifacts,
    manifest: functionManifest,
    sourceFiles: sourceFilesWithFunction,
    uiBundleCode: CODE_B,
    mode: "draft",
  });
  assert(published.isOk(), "draft publish succeeds");
  expect(published.value.status).toBe("draft");
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
  it("makes the draft live, pointing both pointers at it", async () => {
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
    expect(metadata?.latestPublicationId).toBe(draftId);
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
    expect(metadata?.latestPublicationId).toBe(pendingDraftId);
  });

  it("succeeds when the draft is already live", async () => {
    const { auth, frame } = await setupFrame();
    await publishBundle(auth, frame, CODE_A, "live");
    const draftId = await publishBundle(auth, frame, CODE_B, "draft");

    const first = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });
    const second = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    expect(first.isOk() && first.value).toEqual({ publicationId: draftId });
    expect(second.isOk() && second.value).toEqual({ publicationId: draftId });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(draftId);
    expect(metadata?.latestPublicationId).toBe(draftId);
  });

  it("refuses when there is no pending draft", async () => {
    const { auth, frame } = await setupFrame();
    const liveId = await publishBundle(auth, frame, CODE_A, "live");

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: "anything",
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "draft_conflict" });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.latestPublicationId).toBe(liveId);
  });

  it("refuses when the Frame is deleted before the locks are taken", async () => {
    const { auth, frame } = await setupFrame();
    await publishBundle(auth, frame, CODE_A, "live");
    const draftId = await publishBundle(auth, frame, CODE_B, "draft");
    vi.spyOn(FileResource.prototype, "fetchFreshFrameV2").mockResolvedValue(
      null
    );

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "frame_not_found" });
  });

  it("re-checks write access on the Frame read under the locks", async () => {
    const { auth, frame } = await makeTestFrameFunction();
    const draftId = "draft-publication-1";
    await frame.setLatestFramePublication({ publicationId: draftId });
    // The caller passes the early check, then loses write access before the locks are taken.
    vi.mocked(canWriteFrameV2Source).mockResolvedValueOnce(true);

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "unauthorized" });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe("publication-1");
    expect(metadata?.latestPublicationId).toBe(draftId);
  });

  it("refuses a caller who cannot write the Frame", async () => {
    const { auth, frame } = await makeTestFrameFunction();
    const draftId = "draft-publication-1";
    await frame.setLatestFramePublication({ publicationId: draftId });

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "unauthorized" });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe("publication-1");
    expect(metadata?.latestPublicationId).toBe(draftId);
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
    expect(metadata?.latestPublicationId).toBe(draftId);
  });

  it("fails on the function feature check like a publish would", async () => {
    const { auth, frame } = await setupFrame();
    await FeatureFlagFactory.basic(auth, "frames_v2");
    await FeatureFlagFactory.basic(auth, "frames_v2_functions");
    const liveId = await publishBundle(auth, frame, CODE_A, "live");
    const draftId = await publishFunctionDraft(auth, frame, functionArtifacts);
    await FeatureFlagFactory.disable(auth, "frames_v2_functions");

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "invalid_manifest" });
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.latestPublicationId).toBe(draftId);
  });

  it("fails on the public function check like a publish would", async () => {
    const { auth, frame } = await setupFrame();
    await enablePublicFrameFunctions(auth);
    const liveId = await publishBundle(auth, frame, CODE_A, "live");
    const draftId = await publishFunctionDraft(
      auth,
      frame,
      publicFunctionArtifacts,
      manifestWithFastFunction
    );
    await FeatureFlagFactory.disable(auth, "frames_v2_public_functions");

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    assert(result.isErr(), "make live is refused");
    expect(result.error).toMatchObject({ code: "invalid_function_artifact" });
    expect(result.error.message).toContain(
      "public Frame functions are not enabled"
    );
    const metadata = await metadataOf(auth, frame);
    expect(metadata?.activePublicationId).toBe(liveId);
    expect(metadata?.latestPublicationId).toBe(draftId);
  });

  it("makes a draft with a public function live while public functions are enabled", async () => {
    const { auth, frame } = await setupFrame();
    await enablePublicFrameFunctions(auth);
    await publishBundle(auth, frame, CODE_A, "live");
    const draftId = await publishFunctionDraft(
      auth,
      frame,
      publicFunctionArtifacts,
      manifestWithFastFunction
    );

    const result = await makeFrameDraftLive(auth, {
      frame,
      draftPublicationId: draftId,
    });

    expect(result.isOk() && result.value).toEqual({ publicationId: draftId });
  });

  describe("share allowlist", () => {
    // A ref is needed for the active allowlist to have any rows to read back.
    function spyOnAllowlistComputation() {
      return vi
        .spyOn(FileResource.prototype, "computeAuthorizedFileAccess")
        .mockImplementation(
          async (callerAuth, { frameContent }) =>
            new Ok({
              generatedByUserId: callerAuth.getNonNullableUser().id,
              frameContentHash: computeFrameContentHash(frameContent),
              refs: [{ kind: "file_id", ref: "fil_ABCDEFGHIJ" }],
            })
        );
    }

    async function activeAllowlistOf(auth: Authenticator, frame: FileResource) {
      const reloaded = await FileResource.fetchById(auth, frame.sId);
      return reloaded?.getActiveAuthorizedFileAccessAllowlist();
    }

    it("reuses the draft's stored allowlist when its publisher makes it live", async () => {
      const { auth, frame } = await setupFrame();
      const compute = spyOnAllowlistComputation();
      await publishBundle(auth, frame, CODE_A, "live");
      const draftId = await publishBundle(auth, frame, CODE_B, "draft");
      compute.mockClear();

      const result = await makeFrameDraftLive(auth, {
        frame,
        draftPublicationId: draftId,
      });

      expect(result.isOk()).toBe(true);
      expect(compute).not.toHaveBeenCalled();
      expect((await activeAllowlistOf(auth, frame))?.frameContentHash).toBe(
        computeFrameContentHash(CODE_B)
      );
    });

    it("recomputes the allowlist when another editor makes the draft live", async () => {
      const { auth, frame } = await setupFrame();
      const compute = spyOnAllowlistComputation();
      await publishBundle(auth, frame, CODE_A, "live");
      const draftId = await publishBundle(auth, frame, CODE_B, "draft");
      const workspace = auth.getNonNullableWorkspace();
      const otherEditor = await UserFactory.basic();
      await MembershipFactory.associate(workspace, otherEditor, {
        role: "user",
      });
      const otherEditorAuth = await Authenticator.fromUserIdAndWorkspaceId(
        otherEditor.sId,
        workspace.sId
      );
      compute.mockClear();

      const result = await makeFrameDraftLive(otherEditorAuth, {
        frame,
        draftPublicationId: draftId,
      });

      expect(result.isOk()).toBe(true);
      expect(compute).toHaveBeenCalledTimes(1);
      const active = await activeAllowlistOf(auth, frame);
      expect(active?.generatedByUserId).toBe(otherEditor.id);
      expect(active?.frameContentHash).toBe(computeFrameContentHash(CODE_B));
    });
  });
});
