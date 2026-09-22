// esbuild (used to discover the Frame's import graph) requires a real node environment.
// @vitest-environment node
import { fetchLinkedFileResource } from "@app/lib/api/files/file_system_ops";
import type { MigrateFrameToV2Params } from "@app/lib/api/frames/migrate_to_v2";
import { migrateFrameToV2 } from "@app/lib/api/frames/migrate_to_v2";
import { mockMount } from "@app/lib/api/frames/migrate_to_v2/mock_mount.test_utils";
import { Authenticator } from "@app/lib/auth";
import { FileResource } from "@app/lib/resources/file_resource";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { FRAME_MANIFEST_FILE } from "@app/types/api/frame_manifest";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  frameContentType,
  frameSlideshowContentType,
  frameV2ContentType,
} from "@app/types/files";
import {
  getConversationFilesBasePath,
  getPodFilesBasePath,
} from "@app/types/mount_path";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_TIMEOUT_MS = 30000;

const ENTRY_SOURCE = `import { title } from "./helpers";

export default function Dashboard() {
  return <h1>{title}</h1>;
}
`;
const HELPER_SOURCE = `export const title = "Sales";\n`;
const BROKEN_SOURCE = `export default function Broken( {\n`;

beforeEach(() => {
  vi.restoreAllMocks();
  fileStorageMock.reset();
});

/**
 * Where the legacy Frame sits when the migration runs:
 * - `conversation`: created by an agent in a standard conversation.
 * - `pod`: created by an agent in a Pod conversation, so straight into the Pod mount.
 * - `moved-to-pod`: created in a conversation, then moved into the Pod mount, which rewrites the
 *   row's use case and metadata to the Pod's.
 */
type FramePlacement = "conversation" | "pod" | "moved-to-pod";

/** The content types FileFactory accepts, so an unsupported fixture fails to compile. */
type FrameFixtureContentType = Parameters<
  typeof FileFactory.create
>[2]["contentType"];

/** The migration needs both: v2 Frames enabled, and legacy ones allowed to upgrade. */
const MIGRATION_FLAGS = ["frames_v2", "frames_v2_migration"] as const;

async function setup({
  contentType = frameContentType,
  entryFolder = "",
  entrySource = ENTRY_SOURCE,
  placement = "conversation",
  flags = MIGRATION_FLAGS,
}: {
  contentType?: FrameFixtureContentType;
  /** Folder the entry and its imports sit in, relative to the mount scope root. */
  entryFolder?: string;
  entrySource?: string;
  placement?: FramePlacement;
  flags?: readonly WhitelistableFeature[];
} = {}) {
  const { authenticator, globalGroup, user, workspace } =
    await createResourceTest({
      role: "admin",
    });
  for (const flag of flags) {
    await FeatureFlagFactory.basic(authenticator, flag);
  }

  const isInPod = placement !== "conversation";
  let space: SpaceResource | null = null;
  let auth = authenticator;
  if (isInPod) {
    space = await SpaceFactory.project(workspace);
    // A Pod's members come from its groups, and the authenticator resolves them once.
    await SpaceFactory.attachGroup(space, globalGroup, "project_editor");
    const podAuth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    assert(podAuth, "the Pod member authenticator must build");
    auth = podAuth;
  }

  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [],
    ...(placement === "pod" && space ? { spaceId: space.id } : {}),
  });
  const conversationMountBase = getConversationFilesBasePath({
    workspaceId: workspace.sId,
    conversationId: conversation.sId,
  });

  const podMountBase = space
    ? getPodFilesBasePath({ workspaceId: workspace.sId, podId: space.sId })
    : null;
  const scope =
    space && isInPod ? `pod-${space.sId}` : `conversation-${conversation.sId}`;
  const mountBase =
    podMountBase && isInPod ? podMountBase : conversationMountBase;
  const folderPrefix = entryFolder ? `${entryFolder}/` : "";
  const entryScopedPath = `${scope}/${folderPrefix}Sales.tsx`;

  // A moved Frame was created in the conversation, so it starts there and the move repoints it.
  const startsInConversation = placement !== "pod";
  const frame = await FileFactory.create(auth, null, {
    contentType,
    fileName: "Sales.tsx",
    fileSize: entrySource.length,
    status: "ready",
    useCase: startsInConversation ? "conversation" : "project_context",
    useCaseMetadata:
      startsInConversation || !space
        ? { conversationId: conversation.sId }
        : { spaceId: space.sId },
    mountFilePath: startsInConversation
      ? `${conversationMountBase}${folderPrefix}Sales.tsx`
      : `${mountBase}${folderPrefix}Sales.tsx`,
  });

  if (placement === "moved-to-pod") {
    assert(space, "a moved Frame needs a Pod to move into");
    await frame.updateMount({
      destFileName: "Sales.tsx",
      destMountFilePath: `${mountBase}${folderPrefix}Sales.tsx`,
      destUseCase: "project_context",
      destUseCaseMetadata: { spaceId: space.sId },
    });
  }

  const { contentTypes, fakeFs, files } = mockMount(
    new Map([
      [entryScopedPath, entrySource],
      [`${scope}/${folderPrefix}helpers.tsx`, HELPER_SOURCE],
      [`${scope}/unrelated.csv`, "a,b\n1,2\n"],
    ]),
    {
      scope,
      mountBase,
      // The entry is stored as the Frame itself, which is what the migration has to undo.
      contentTypes: new Map([[entryScopedPath, contentType]]),
    }
  );

  return {
    auth,
    contentTypes,
    conversation,
    entryScopedPath,
    fakeFs,
    files,
    frame,
    mountBase,
    scope,
    space,
  };
}

type MigrateArgs = MigrateFrameToV2Params<undefined>;

function migrate(
  auth: Authenticator,
  args: Omit<MigrateArgs, "publish"> & Partial<Pick<MigrateArgs, "publish">>
) {
  return migrateFrameToV2(auth, {
    publish: async () => new Ok(undefined),
    ...args,
  });
}

describe("migrateFrameToV2", () => {
  it(
    "converts a flat v1 Frame into a package folder with a manifest",
    async () => {
      const { auth, entryScopedPath, fakeFs, files, frame, scope } =
        await setup();

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "migration must succeed");
      assert(result.value, "migration must return the migrated Frame");

      expect(files.get(`${scope}/Sales/${FRAME_MANIFEST_FILE}`)).toContain(
        '"uiEntryPoint": "index.tsx"'
      );
      expect(files.get(`${scope}/Sales/index.tsx`)).toBe(ENTRY_SOURCE);
      expect(files.get(`${scope}/Sales/helpers.tsx`)).toBe(HELPER_SOURCE);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "stores every package file as text instead of as the Frame",
    async () => {
      const { auth, contentTypes, entryScopedPath, fakeFs, frame, scope } =
        await setup();

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "migration must succeed");

      expect(contentTypes.get(`${scope}/Sales/index.tsx`)).toBe("text/plain");
      expect(contentTypes.get(`${scope}/Sales/${FRAME_MANIFEST_FILE}`)).toBe(
        "text/plain"
      );
    },
    TEST_TIMEOUT_MS
  );

  it(
    "sizes the row to the manifest it now points at",
    async () => {
      const { auth, entryScopedPath, fakeFs, files, frame, scope } =
        await setup();

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk() && result.value, "migration must succeed");

      const manifest = files.get(`${scope}/Sales/${FRAME_MANIFEST_FILE}`);
      assert(manifest, "the migration must have written a manifest");
      expect(result.value.frame.fileSize).toBe(Buffer.byteLength(manifest));
    },
    TEST_TIMEOUT_MS
  );

  it(
    "anchors a Frame already in its own folder without moving its sources",
    async () => {
      const {
        auth,
        contentTypes,
        entryScopedPath,
        fakeFs,
        files,
        frame,
        scope,
      } = await setup({ entryFolder: "Sales" });

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk() && result.value, "migration must succeed");

      expect(files.get(`${scope}/Sales/${FRAME_MANIFEST_FILE}`)).toContain(
        '"uiEntryPoint": "Sales.tsx"'
      );
      expect(files.get(entryScopedPath)).toBe(ENTRY_SOURCE);
      expect(files.has(`${scope}/Sales/index.tsx`)).toBe(false);
      expect(contentTypes.get(entryScopedPath)).toBe("text/plain");
    },
    TEST_TIMEOUT_MS
  );

  it(
    "leaves files outside the Frame's import graph alone",
    async () => {
      const { auth, entryScopedPath, fakeFs, files, frame, scope } =
        await setup();

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "migration must succeed");

      expect(files.has(`${scope}/Sales/unrelated.csv`)).toBe(false);
      expect(files.get(`${scope}/unrelated.csv`)).toBe("a,b\n1,2\n");
    },
    TEST_TIMEOUT_MS
  );

  it(
    "keeps the Frame's identity so share links and message references survive",
    async () => {
      const { auth, entryScopedPath, fakeFs, frame, mountBase } = await setup();
      const originalFrameId = frame.sId;

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk() && result.value, "migration must succeed");

      expect(result.value.frame.sId).toBe(originalFrameId);
      expect(result.value.frame.contentType).toBe(frameV2ContentType);
      expect(result.value.frame.fileName).toBe(FRAME_MANIFEST_FILE);
      expect(result.value.frame.mountFilePath).toBe(
        `${mountBase}Sales/${FRAME_MANIFEST_FILE}`
      );

      const reloaded = await FileResource.fetchById(auth, originalFrameId);
      assert(reloaded, "the Frame row must still exist under the same sId");
      expect(reloaded.isFrameV2).toBe(true);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "removes the original sources only once the publication succeeded",
    async () => {
      const { auth, entryScopedPath, fakeFs, files, frame, scope } =
        await setup();

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "migration must succeed");

      expect(files.has(entryScopedPath)).toBe(false);
      expect(files.has(`${scope}/helpers.tsx`)).toBe(false);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "leaves a working v1 Frame behind when the publication fails",
    async () => {
      const { auth, entryScopedPath, fakeFs, files, frame } = await setup();
      const originalFrameId = frame.sId;

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
        publish: async () => new Err(new Error("bundle rejected")),
      });
      assert(result.isOk(), "a failed publication must not fail the caller");
      expect(result.value).toBeNull();

      const reloaded = await FileResource.fetchById(auth, originalFrameId);
      assert(reloaded, "the Frame row must still exist");
      expect(reloaded.contentType).toBe(frameContentType);
      expect(reloaded.isFrameV2).toBe(false);
      expect(files.get(entryScopedPath)).toBe(ENTRY_SOURCE);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "declines a Frame whose source does not build",
    async () => {
      const { auth, entryScopedPath, fakeFs, frame, scope } = await setup({
        entrySource: BROKEN_SOURCE,
      });

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "an unbuildable Frame must not fail the caller");
      expect(result.value).toBeNull();

      const reloaded = await FileResource.fetchById(auth, frame.sId);
      assert(reloaded, "the Frame row must still exist");
      expect(reloaded.contentType).toBe(frameContentType);
      expect(fileStorageMock.getObject(`${scope}/Sales/manifest.json`)).toBe(
        undefined
      );
    },
    TEST_TIMEOUT_MS
  );

  it.each([
    { missing: "frames_v2", flags: ["frames_v2_migration"] },
    { missing: "frames_v2_migration", flags: ["frames_v2"] },
  ] as const)(
    "declines when the workspace is missing $missing",
    async ({ flags }) => {
      const { auth, entryScopedPath, fakeFs, files, frame, scope } =
        await setup({ flags });

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "a disabled workspace must not fail the caller");
      expect(result.value).toBeNull();
      expect(files.has(`${scope}/Sales/${FRAME_MANIFEST_FILE}`)).toBe(false);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "keeps the Frame on v1 when the publisher throws instead of failing",
    async () => {
      const {
        auth,
        contentTypes,
        entryScopedPath,
        fakeFs,
        files,
        frame,
        scope,
      } = await setup();
      const originalFrameId = frame.sId;

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
        // What a Frame publisher answering 404 does: throw, not return `Err`.
        publish: async () => {
          throw new Error("platform returned 404");
        },
      });
      assert(result.isOk(), "a throwing publisher must not fail the caller");
      expect(result.value).toBeNull();

      const reloaded = await FileResource.fetchById(auth, originalFrameId);
      assert(reloaded, "the Frame row must still exist");
      expect(reloaded.contentType).toBe(frameContentType);
      expect(reloaded.isFrameV2).toBe(false);

      // The v1 sources are untouched and the half-written package is gone.
      expect(files.get(entryScopedPath)).toBe(ENTRY_SOURCE);
      expect(files.has(`${scope}/Sales/${FRAME_MANIFEST_FILE}`)).toBe(false);
      expect(files.has(`${scope}/Sales/index.tsx`)).toBe(false);
      expect(contentTypes.get(entryScopedPath)).toBe(frameContentType);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "keeps the Frame on v1 when laying the package out throws",
    async () => {
      const { auth, entryScopedPath, fakeFs, files, frame, scope } =
        await setup();
      vi.spyOn(fakeFs, "write").mockRejectedValue(new Error("storage is down"));

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "a throwing write must not fail the caller");
      expect(result.value).toBeNull();

      const reloaded = await FileResource.fetchById(auth, frame.sId);
      assert(reloaded, "the Frame row must still exist");
      expect(reloaded.contentType).toBe(frameContentType);
      expect(files.get(entryScopedPath)).toBe(ENTRY_SOURCE);
      expect(files.has(`${scope}/Sales/${FRAME_MANIFEST_FILE}`)).toBe(false);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "keeps the Frame on v1 when planning throws",
    async () => {
      const { auth, entryScopedPath, fakeFs, frame } = await setup();
      vi.spyOn(fakeFs, "list").mockRejectedValue(new Error("listing is down"));

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "a throwing plan must not fail the caller");
      expect(result.value).toBeNull();

      const reloaded = await FileResource.fetchById(auth, frame.sId);
      assert(reloaded, "the Frame row must still exist");
      expect(reloaded.contentType).toBe(frameContentType);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "reports a migrated Frame even when the cleanup throws",
    async () => {
      const { auth, entryScopedPath, fakeFs, files, frame, scope } =
        await setup();
      vi.spyOn(fakeFs, "delete").mockRejectedValue(new Error("delete is down"));

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "cleanup must not fail a completed migration");
      assert(result.value, "the Frame migrated, so it must be reported");

      expect(result.value.frame.contentType).toBe(frameV2ContentType);
      expect(files.get(`${scope}/Sales/${FRAME_MANIFEST_FILE}`)).toContain(
        '"uiEntryPoint": "index.tsx"'
      );
    },
    TEST_TIMEOUT_MS
  );

  it(
    "declines a Frame that is already v2",
    async () => {
      const { auth, entryScopedPath, fakeFs, frame } = await setup({
        contentType: frameV2ContentType,
      });

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk(), "an already-migrated Frame must not fail");
      expect(result.value).toBeNull();
    },
    TEST_TIMEOUT_MS
  );
});

const FRAME_KINDS = [
  { kind: "dashboard", contentType: frameContentType },
  { kind: "slideshow", contentType: frameSlideshowContentType },
] as const;

const PLACEMENTS = [
  { origin: "a standard conversation", placement: "conversation" },
  { origin: "a conversation in a Pod", placement: "pod" },
  { origin: "a conversation, then moved to a Pod", placement: "moved-to-pod" },
] as const;

describe.each(FRAME_KINDS)("migrateFrameToV2 of a $kind", ({ contentType }) => {
  it.each(PLACEMENTS)(
    "migrates one created from $origin",
    async ({ placement }) => {
      const { auth, entryScopedPath, fakeFs, files, frame, mountBase, scope } =
        await setup({ contentType, placement });
      const originalFrameId = frame.sId;
      const originalMetadata = frame.useCaseMetadata;

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk() && result.value, "migration must succeed");

      expect(files.get(`${scope}/Sales/${FRAME_MANIFEST_FILE}`)).toContain(
        '"uiEntryPoint": "index.tsx"'
      );
      expect(files.get(`${scope}/Sales/index.tsx`)).toBe(ENTRY_SOURCE);
      expect(files.get(`${scope}/Sales/helpers.tsx`)).toBe(HELPER_SOURCE);
      expect(files.has(entryScopedPath)).toBe(false);

      expect(result.value.frame.sId).toBe(originalFrameId);
      expect(result.value.frame.contentType).toBe(frameV2ContentType);
      expect(result.value.frame.mountFilePath).toBe(
        `${mountBase}Sales/${FRAME_MANIFEST_FILE}`
      );
      // The Frame stays attached to whatever holds it, Pod or conversation.
      expect(result.value.frame.useCaseMetadata).toEqual(originalMetadata);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "keeps a Pod's pinned banner pointing at the Frame it was pinned to",
    async () => {
      const { auth, entryScopedPath, fakeFs, frame, scope, space } =
        await setup({ contentType, placement: "pod" });
      assert(space, "a Pod Frame needs a Pod");
      await ProjectMetadataResource.makeNew(auth, space, {
        pinnedFramePath: entryScopedPath,
      });

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk() && result.value, "migration must succeed");

      const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
      assert(metadata, "the Pod must still have metadata");
      expect(metadata.pinnedFramePath).toBe(
        `${scope}/Sales/${FRAME_MANIFEST_FILE}`
      );

      // The banner renders what the pinned path resolves to, so that has to be the Frame.
      const pinned = await fetchLinkedFileResource(
        auth,
        fakeFs,
        `${scope}/Sales/${FRAME_MANIFEST_FILE}`
      );
      expect(pinned?.sId).toBe(frame.sId);
      expect(
        await fetchLinkedFileResource(auth, fakeFs, entryScopedPath)
      ).toBeUndefined();
    },
    TEST_TIMEOUT_MS
  );

  it(
    "keeps a Pod's file tab pointing at the Frame it was added from",
    async () => {
      const { auth, entryScopedPath, fakeFs, frame, scope, space } =
        await setup({ contentType, placement: "pod" });
      assert(space, "a Pod Frame needs a Pod");
      await ProjectMetadataResource.makeNew(auth, space, {
        frameTabs: [
          { path: entryScopedPath, title: "Sales", icon: "ActionDocumentIcon" },
        ],
        tabsOrder: ["conversations", entryScopedPath, "files"],
      });

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk() && result.value, "migration must succeed");

      const manifestScopedPath = `${scope}/Sales/${FRAME_MANIFEST_FILE}`;
      const metadata = await ProjectMetadataResource.fetchBySpace(auth, space);
      assert(metadata, "the Pod must still have metadata");
      expect(metadata.frameTabs).toEqual([
        {
          path: manifestScopedPath,
          title: "Sales",
          icon: "ActionDocumentIcon",
        },
      ]);
      expect(metadata.tabsOrder).toContain(manifestScopedPath);

      const tabbed = await fetchLinkedFileResource(
        auth,
        fakeFs,
        manifestScopedPath
      );
      expect(tabbed?.sId).toBe(frame.sId);
    },
    TEST_TIMEOUT_MS
  );

  it(
    "keeps the Frame's share link after migration",
    async () => {
      const { auth, entryScopedPath, fakeFs, frame } = await setup({
        contentType,
      });
      await frame.setShareScope(auth, "public");
      const sharedBefore = await frame.getShareInfo();
      assert(sharedBefore, "the Frame must be shared before migrating");

      const result = await migrate(auth, {
        dustFs: fakeFs,
        frame,
        entryScopedPath,
      });
      assert(result.isOk() && result.value, "migration must succeed");

      // The share URL carries the share token, so an unchanged URL is an unbroken link.
      expect(await result.value.frame.getShareInfo()).toEqual(sharedBefore);
    },
    TEST_TIMEOUT_MS
  );
});
