import { storeFramePublication } from "@app/lib/api/frames/publication_storage";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { purgeStaleFramePublicationsActivity } from "@app/temporal/data_retention/activities";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import {
  FRAME_MANIFEST_FILE,
  FrameManifestSchema,
} from "@app/types/api/frame_manifest";
import {
  getFramePublicationDescriptorPath,
  getFramePublicationsBasePath,
} from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import { getPodFilesBasePath } from "@app/types/mount_path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/activity", () => ({
  heartbeat: vi.fn(),
}));

const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

const manifest = FrameManifestSchema.parse({
  version: 1,
  name: "Task List",
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
    relativePath: "functions/add_task.ts",
    content: Buffer.from("export async function run() {}"),
    contentType: "text/typescript" as const,
  },
];

const functionArtifacts = [
  {
    name: "add-task",
    bundleCode: "export async function run() {}",
    userIdentity: "optional" as const,
    inputSchema: { type: "object" as const },
    outputSchema: { type: "object" as const },
  },
];

// Every frame's publications listing, keyed by prefix: the mock exposes one global resolver and
// this suite sweeps frames from several workspaces at once.
const publicationIdsByPrefix = new Map<string, string[]>();

async function setupFrameWithStalePublication(): Promise<{
  auth: Authenticator;
  frame: FileResource;
  stalePublicationId: string;
}> {
  const { authenticator, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const frame = await FileFactory.create(authenticator, null, {
    contentType: frameV2ContentType,
    fileName: FRAME_MANIFEST_FILE,
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
    mountFilePath: `${getPodFilesBasePath({
      workspaceId: workspace.sId,
      podId: space.sId,
    })}Frame/${FRAME_MANIFEST_FILE}`,
  });

  const stalePublicationId = await storePublication(authenticator, frame, 30);
  const activePublicationId = await storePublication(authenticator, frame, 30);
  await frame.setActiveFramePublication({
    publicationId: activePublicationId,
    name: "Task List",
    description: "Track tasks.",
  });

  publicationIdsByPrefix.set(
    getFramePublicationsBasePath({
      workspaceId: workspace.sId,
      frameId: frame.sId,
    }),
    [stalePublicationId, activePublicationId]
  );

  return { auth: authenticator, frame, stalePublicationId };
}

async function storePublication(
  auth: Authenticator,
  frame: FileResource,
  publishedDaysAgo: number
): Promise<string> {
  const stored = await storeFramePublication(auth, {
    frame,
    functionArtifacts,
    manifest,
    sourceFiles,
    uiBundleCode: "export default function App() {}",
  });
  if (stored.isErr()) {
    throw stored.error;
  }
  const { publicationId } = stored.value;

  const descriptorPath = getFramePublicationDescriptorPath({
    workspaceId: auth.getNonNullableWorkspace().sId,
    frameId: frame.sId,
    publicationId,
  });
  const descriptor = JSON.parse(
    fileStorageMock.getObject(descriptorPath) ?? "{}"
  );
  fileStorageMock.setObject(
    descriptorPath,
    JSON.stringify({
      ...descriptor,
      publishedAt: new Date(
        Date.now() - publishedDaysAgo * ONE_DAY_MS
      ).toISOString(),
    })
  );

  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      auth,
      {
        frame,
        publicationId,
        functions: [
          {
            name: "add-task",
            description: "Add a task.",
            userIdentity: "optional",
            executionMode: "durable",
            defaultStake: "low",
            bundleCode: "export async function run() {}",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
          },
        ],
      },
      transaction
    )
  );

  return publicationId;
}

describe("purgeStaleFramePublicationsActivity", () => {
  beforeEach(() => {
    fileStorageMock.reset();
    publicationIdsByPrefix.clear();
    fileStorageMock.setSubdirectoryNames(
      (prefix) => publicationIdsByPrefix.get(prefix) ?? null
    );
  });

  it("purges superseded publications of frames from every workspace", async () => {
    const first = await setupFrameWithStalePublication();
    const second = await setupFrameWithStalePublication();

    const result = await purgeStaleFramePublicationsActivity({
      afterModelId: null,
    });

    expect(result.scannedFrameCount).toBe(2);
    expect(result.deletedPublicationCount).toBe(2);
    expect(result.deletedFunctionCount).toBe(2);
    expect(result.keptPublicationCount).toBe(2);
    // Fewer frames than one batch holds: nothing left to resume from.
    expect(result.nextAfterModelId).toBeNull();

    for (const { auth, frame, stalePublicationId } of [first, second]) {
      expect(
        await SandboxFunctionResource.listByFramePublication(auth, {
          frame,
          publicationId: stalePublicationId,
        })
      ).toEqual([]);
    }
  });

  it("resumes after the frames of a previous batch", async () => {
    const { frame } = await setupFrameWithStalePublication();

    const result = await purgeStaleFramePublicationsActivity({
      afterModelId: frame.id,
    });

    expect(result.scannedFrameCount).toBe(0);
    expect(result.deletedPublicationCount).toBe(0);
    expect(result.nextAfterModelId).toBeNull();
  });
});
