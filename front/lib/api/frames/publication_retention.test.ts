import { purgeStaleFramePublications } from "@app/lib/api/frames/publication_retention";
import { storeFramePublication } from "@app/lib/api/frames/publication_storage";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
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
  getFramePublicationUiBundlePath,
} from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import { getPodFilesBasePath } from "@app/types/mount_path";
import { beforeEach, describe, expect, it } from "vitest";

const ONE_DAY_MS = 24 * 60 * 60 * 1_000;
const RETENTION_MS = 7 * ONE_DAY_MS;

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

async function setupFrame() {
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

  return { auth: authenticator, frame, workspaceId: workspace.sId };
}

/**
 * Store a publication the way publishing does, then move its recorded `publishedAt` back by
 * `publishedDaysAgo` — retention reads the age from the descriptor, and storing always stamps now.
 */
async function storePublication(
  auth: Authenticator,
  frame: FileResource,
  {
    publishedDaysAgo,
    withFunctionRows = true,
  }: { publishedDaysAgo: number; withFunctionRows?: boolean }
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

  const workspaceId = auth.getNonNullableWorkspace().sId;
  const descriptorPath = getFramePublicationDescriptorPath({
    workspaceId,
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

  if (withFunctionRows) {
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
  }

  return publicationId;
}

function listPublications(
  workspaceId: string,
  frame: FileResource,
  publicationIds: string[]
): void {
  const publicationsPrefix = getFramePublicationsBasePath({
    workspaceId,
    frameId: frame.sId,
  });
  fileStorageMock.setSubdirectoryNames((prefix) =>
    prefix === publicationsPrefix ? publicationIds : null
  );
}

describe("purgeStaleFramePublications", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("deletes a superseded publication past the retention window", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    const stale = await storePublication(auth, frame, { publishedDaysAgo: 30 });
    const active = await storePublication(auth, frame, {
      publishedDaysAgo: 30,
    });
    await frame.setActiveFramePublication({
      publicationId: active,
      name: "Task List",
      description: "Track tasks.",
    });
    listPublications(workspaceId, frame, [stale, active]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result.deletedPublicationCount).toBe(1);
    expect(result.deletedFunctionCount).toBe(1);
    expect(result.keptPublicationCount).toBe(1);
    expect(
      await SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: stale,
      })
    ).toEqual([]);
    expect(
      await SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: active,
      })
    ).toHaveLength(1);
    expect(
      fileStorageMock.getObject(
        getFramePublicationUiBundlePath({
          workspaceId,
          frameId: frame.sId,
          publicationId: stale,
        })
      )
    ).toBeUndefined();
    expect(
      fileStorageMock.getObject(
        getFramePublicationUiBundlePath({
          workspaceId,
          frameId: frame.sId,
          publicationId: active,
        })
      )
    ).toBeDefined();
  });

  it("keeps a superseded publication published inside the retention window", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    const recent = await storePublication(auth, frame, { publishedDaysAgo: 1 });
    const active = await storePublication(auth, frame, { publishedDaysAgo: 0 });
    await frame.setActiveFramePublication({
      publicationId: active,
      name: "Task List",
      description: "Track tasks.",
    });
    listPublications(workspaceId, frame, [recent, active]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result.deletedPublicationCount).toBe(0);
    expect(result.keptPublicationCount).toBe(2);
    expect(
      await SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: recent,
      })
    ).toHaveLength(1);
  });

  it("keeps a superseded publication whose functions still have invocations", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    const stale = await storePublication(auth, frame, { publishedDaysAgo: 30 });
    const active = await storePublication(auth, frame, {
      publishedDaysAgo: 30,
    });
    await frame.setActiveFramePublication({
      publicationId: active,
      name: "Task List",
      description: "Track tasks.",
    });
    const [sandboxFunction] =
      await SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: stale,
      });
    await SandboxFunctionInvocationResource.makeNew(auth, {
      sandboxFunction,
      input: { message: "hello" },
    });
    listPublications(workspaceId, frame, [stale, active]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result.deletedPublicationCount).toBe(0);
    expect(result.keptPublicationCount).toBe(2);
    expect(
      await SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: stale,
      })
    ).toHaveLength(1);
  });

  it("keeps the active publication however old it is", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    const active = await storePublication(auth, frame, {
      publishedDaysAgo: 365,
    });
    await frame.setActiveFramePublication({
      publicationId: active,
      name: "Task List",
      description: "Track tasks.",
    });
    listPublications(workspaceId, frame, [active]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result.deletedPublicationCount).toBe(0);
    expect(result.keptPublicationCount).toBe(1);
    expect(
      await SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: active,
      })
    ).toHaveLength(1);
  });

  it("reports, without deleting, a publication whose descriptor cannot be read", async () => {
    const { auth, frame, workspaceId } = await setupFrame();
    const stale = await storePublication(auth, frame, {
      publishedDaysAgo: 30,
      withFunctionRows: false,
    });
    const active = await storePublication(auth, frame, {
      publishedDaysAgo: 30,
    });
    await frame.setActiveFramePublication({
      publicationId: active,
      name: "Task List",
      description: "Track tasks.",
    });
    const staleDescriptorPath = getFramePublicationDescriptorPath({
      workspaceId,
      frameId: frame.sId,
      publicationId: stale,
    });
    // Stands in for a publish that wrote its bundles and never committed its descriptor.
    fileStorageMock.setObject(staleDescriptorPath, "");
    listPublications(workspaceId, frame, [stale, active]);

    const result = await purgeStaleFramePublications(auth, {
      frame,
      retentionMs: RETENTION_MS,
    });

    expect(result.unreadablePublicationCount).toBe(1);
    expect(result.deletedPublicationCount).toBe(0);
    expect(
      fileStorageMock.getObject(
        getFramePublicationUiBundlePath({
          workspaceId,
          frameId: frame.sId,
          publicationId: stale,
        })
      )
    ).toBeDefined();
  });
});
