// esbuild (used to discover the Frame's import graph) requires a real node environment.
// @vitest-environment node
import type { DustFileSystem } from "@app/lib/api/file_system";
import { writeCanonicalFileContent } from "@app/lib/api/files/file_system_ops";
import { migrateFrameToV2 } from "@app/lib/api/frames/migrate_to_v2";
import { createMockMountFs } from "@app/lib/api/frames/migrate_to_v2/mock_mount.test_utils";
import { registerFrameV2FromSourceUsingFileSystem } from "@app/lib/api/frames/register_from_source";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import {
  FRAME_DEFAULT_UI_ENTRY_POINT,
  FRAME_MANIFEST_FILE,
  FRAME_MANIFEST_VERSION,
} from "@app/types/api/frame_manifest";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { frameContentType } from "@app/types/files";
import { getConversationFilesBasePath } from "@app/types/mount_path";
import { Ok } from "@app/types/shared/result";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_TIMEOUT_MS = 30000;
const PACKAGE_WRITE_CONCURRENCY = 4;

const FRAME_NAME = "Sales";
const PUBLICATION_ID = "pub_parity";

const ENTRY_SOURCE = `import { title } from "./helpers";

export default function Dashboard() {
  return <h1>{title}</h1>;
}
`;
const HELPER_SOURCE = `export const title = "Sales";\n`;

/** The manifest a migration derives from `Sales.tsx`, byte for byte. */
const MANIFEST_CONTENT = `${JSON.stringify(
  {
    version: FRAME_MANIFEST_VERSION,
    description: "",
    uiEntryPoint: FRAME_DEFAULT_UI_ENTRY_POINT,
  },
  null,
  2
)}\n`;

/**
 * The only columns the two paths may disagree on; every other one joins the comparison.
 * `version` is among them because a migrated Frame carries the revisions it already had as v1,
 * where a created one starts at zero.
 */
const OWN_HISTORY_COLUMNS = [
  "id",
  "sId",
  "userId",
  "createdAt",
  "updatedAt",
  "version",
];

const CONVERSATION_PLACEHOLDER = "<conversationId>";

beforeEach(() => {
  vi.restoreAllMocks();
  fileStorageMock.reset();
});

type FrameMount = {
  contentTypes: Map<string, string>;
  conversationId: string;
  dustFs: DustFileSystem;
  files: Map<string, string>;
  /** GCS mount path the scope maps to, trailing slash included. */
  mountBase: string;
  /** Scope root of the mount: `conversation-<cId>`. */
  scope: string;
};

async function createMount(
  auth: Authenticator,
  workspaceId: string
): Promise<FrameMount> {
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: GLOBAL_AGENTS_SID.DUST,
    messagesCreatedAt: [],
  });

  const contentTypes = new Map<string, string>();
  const files = new Map<string, string>();
  const scope = `conversation-${conversation.sId}`;
  const mountBase = getConversationFilesBasePath({
    workspaceId: workspaceId,
    conversationId: conversation.sId,
  });

  return {
    contentTypes,
    conversationId: conversation.sId,
    dustFs: createMockMountFs(files, { scope, mountBase, contentTypes }),
    files,
    mountBase,
    scope,
  };
}

/** Stands in for the publication both paths run, which is the same code for either. */
async function publishAs(frame: FileResource) {
  await frame.setActiveFramePublication({
    publicationId: PUBLICATION_ID,
    description: "",
  });

  return new Ok(undefined);
}

/** Create a package the way an agent does: canonical writes, then register the manifest. */
async function createFrameV2(
  auth: Authenticator,
  mount: FrameMount
): Promise<FileResource> {
  const packageFiles = [
    [FRAME_DEFAULT_UI_ENTRY_POINT, ENTRY_SOURCE],
    ["helpers.tsx", HELPER_SOURCE],
    [FRAME_MANIFEST_FILE, MANIFEST_CONTENT],
  ];

  const writeErrors = await concurrentExecutor(
    packageFiles,
    async ([relPath, content]) => {
      const written = await writeCanonicalFileContent(
        auth,
        mount.dustFs,
        `${mount.scope}/${FRAME_NAME}/${relPath}`,
        Buffer.from(content)
      );

      return written.isErr() ? `${relPath}: ${written.error.message}` : null;
    },
    { concurrency: PACKAGE_WRITE_CONCURRENCY }
  );
  assert(
    writeErrors.every((error) => error === null),
    `the package must be writable: ${writeErrors.join(", ")}`
  );

  const registered = await registerFrameV2FromSourceUsingFileSystem(auth, {
    dustFs: mount.dustFs,
    manifestPath: `${mount.scope}/${FRAME_NAME}/${FRAME_MANIFEST_FILE}`,
  });
  assert(registered.isOk(), "registering the manifest must create a Frame");

  await publishAs(registered.value.frame);

  return registered.value.frame;
}

/** Lay out a legacy Frame the way the v1 publish path left it, then upgrade it. */
async function migrateFrameV2(
  auth: Authenticator,
  mount: FrameMount
): Promise<FileResource> {
  const entryScopedPath = `${mount.scope}/${FRAME_NAME}.tsx`;
  const helperScopedPath = `${mount.scope}/helpers.tsx`;
  mount.files.set(entryScopedPath, ENTRY_SOURCE);
  mount.files.set(helperScopedPath, HELPER_SOURCE);
  // The entry is stored as the Frame itself; the sources it imports are ordinary text.
  mount.contentTypes.set(entryScopedPath, frameContentType);
  mount.contentTypes.set(helperScopedPath, "text/plain");

  const frame = await FileFactory.create(auth, null, {
    contentType: frameContentType,
    fileName: `${FRAME_NAME}.tsx`,
    fileSize: Buffer.byteLength(ENTRY_SOURCE),
    status: "ready",
    useCase: "conversation",
    useCaseMetadata: { conversationId: mount.conversationId },
    mountFilePath: `${mount.mountBase}${FRAME_NAME}.tsx`,
  });
  // A legacy Frame that was ever published carries revisions; a created one starts at zero.
  await FileModel.update(
    { version: 1 },
    { where: { id: frame.id, workspaceId: frame.workspaceId } }
  );

  const migrated = await migrateFrameToV2(auth, {
    dustFs: mount.dustFs,
    entryScopedPath,
    frame,
    publish: publishAs,
  });
  assert(migrated.isOk() && migrated.value, "the legacy Frame must migrate");

  return migrated.value.frame;
}

/** Everything the mount holds for a Frame, keyed by path relative to the scope root. */
function packageSnapshot({ contentTypes, files, scope }: FrameMount) {
  return [...files.keys()]
    .filter((scopedPath) => scopedPath.startsWith(`${scope}/`))
    .sort()
    .map((scopedPath) => ({
      path: scopedPath.slice(scope.length + 1),
      content: files.get(scopedPath),
      contentType: contentTypes.get(scopedPath) ?? null,
    }));
}

async function rowSnapshot(
  frame: FileResource,
  { conversationId }: FrameMount
) {
  const row = await FileModel.findOne({
    where: { id: frame.id, workspaceId: frame.workspaceId },
  });
  assert(row, "the Frame row must exist");

  const columns = Object.fromEntries(
    Object.entries(row.get()).filter(
      ([column]) => !OWN_HISTORY_COLUMNS.includes(column)
    )
  );

  return JSON.parse(
    JSON.stringify(columns).replaceAll(conversationId, CONVERSATION_PLACEHOLDER)
  );
}

async function setup() {
  const { authenticator: auth, workspace } = await createResourceTest({
    role: "admin",
  });
  await FeatureFlagFactory.basic(auth, "frames_v2");
  await FeatureFlagFactory.basic(auth, "frames_v2_migration");

  const createdMount = await createMount(auth, workspace.sId);
  const migratedMount = await createMount(auth, workspace.sId);

  return {
    auth,
    created: {
      frame: await createFrameV2(auth, createdMount),
      mount: createdMount,
    },
    migrated: {
      frame: await migrateFrameV2(auth, migratedMount),
      mount: migratedMount,
    },
  };
}

describe("a migrated Frame and one created as v2 from the same sources", () => {
  it(
    "lay out the same package on the mount",
    async () => {
      const { created, migrated } = await setup();

      expect(packageSnapshot(migrated.mount)).toEqual(
        packageSnapshot(created.mount)
      );
    },
    TEST_TIMEOUT_MS
  );

  it(
    "carry the same row",
    async () => {
      const { created, migrated } = await setup();

      expect(await rowSnapshot(migrated.frame, migrated.mount)).toEqual(
        await rowSnapshot(created.frame, created.mount)
      );
    },
    TEST_TIMEOUT_MS
  );

  it(
    "are shared the same way",
    async () => {
      const { created, migrated } = await setup();

      const createdShare = await created.frame.getShareInfo();
      const migratedShare = await migrated.frame.getShareInfo();
      assert(createdShare, "a created Frame must be shareable");
      assert(migratedShare, "a migrated Frame must be shareable");

      expect(migratedShare.scope).toBe(createdShare.scope);
    },
    TEST_TIMEOUT_MS
  );
});
