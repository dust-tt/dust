// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib).
// This directive makes them available in the test environment.

import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { reconcileDatabaseFromPodPath } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import {
  PublishFrameError,
  publishFrame,
} from "@app/lib/api/viz/publish_frame";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { PodAppManifest } from "@app/types/api/pod_app_archive";
import { MAX_POD_APP_ARCHIVE_SIZE_BYTES } from "@app/types/api/pod_app_archive";
import { MAX_POD_APP_NAME_LENGTH } from "@app/types/api/pod_apps";
import { DEFAULT_SANDBOX_FUNCTION_STAKE } from "@app/types/api/sandbox_functions";
import { frameContentType, sandboxFunctionContentType } from "@app/types/files";
import type { PodFrameTab } from "@app/types/pod_frame_tab";
import {
  DEFAULT_POD_FRAME_TAB_ICON,
  MAX_POD_FRAME_TABS,
} from "@app/types/pod_frame_tab";
import { Err, Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import AdmZip from "adm-zip";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
  distributedLock: vi.fn(async () => "lock-value"),
  distributedUnlock: vi.fn(async () => undefined),
}));

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensurePodSandboxReady: vi.fn(),
}));

vi.mock(
  "@app/lib/api/sandbox_functions/build_on_sandbox",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/sandbox_functions/build_on_sandbox")
      >();

    return { ...actual, buildSandboxFunctionOnSandbox: vi.fn() };
  }
);

vi.mock("@app/lib/api/sandbox_functions/dsbx_db", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/dsbx_db")
    >();

  return { ...actual, reconcileDatabaseFromPodPath: vi.fn() };
});

// Publishing a Frame runs the real esbuild bundler over mount reads; mocked so the test exercises
// the import orchestration rather than the bundler.
vi.mock("@app/lib/api/viz/publish_frame", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/viz/publish_frame")>();

  return { ...actual, publishFrame: vi.fn() };
});

const EMPTY_SCHEMA = { type: "object", properties: {} } as const;

function mockSandboxLeaves() {
  vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
    new Ok({
      bundleCode: "export default {};",
      userIdentity: "optional",
      inputSchema: EMPTY_SCHEMA,
      outputSchema: EMPTY_SCHEMA,
    })
  );
  vi.mocked(reconcileDatabaseFromPodPath).mockImplementation(
    async (_auth, { database }) =>
      new Ok({ database, created: true, statements: [] })
  );
  vi.mocked(publishFrame).mockResolvedValue(new Ok({ warnings: [] }));
  // Frame creation reads its own just-written content back (for the authorized-file-access
  // allowlist) before `publishFrame` (mocked above) ever runs. The GCS mock's `createReadStream`
  // only serves content configured here; without it, the read stream never ends.
  fileStorageMock.setFileContent(() => taskListFiles()["TaskList.tsx"] ?? null);
}

async function setupPod() {
  const { workspace, user, auth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace, user.id);

  await FeatureFlagFactory.basic(auth, "sandbox_functions");
  await FeatureFlagFactory.basic(auth, "pod_applications");
  const sandbox = await SandboxResource.makeNew(auth, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  vi.mocked(ensurePodSandboxReady).mockResolvedValue(
    new Ok({ sandbox, freshlyCreated: false })
  );

  return { workspace, user, auth, pod, sandbox };
}

function gcsObject(
  workspaceId: string,
  podId: string,
  relPath: string,
  contentType = "text/plain"
) {
  return {
    name: `w/${workspaceId}/pods/${podId}/files/${relPath}`,
    metadata: {
      contentType,
      size: "100",
      updated: new Date().toISOString(),
    },
  };
}

async function publishFunction(
  auth: Authenticator,
  pod: SpaceResource,
  { slug, fileName }: { slug: string; fileName: string }
) {
  const file = await FileFactory.create(auth, null, {
    contentType: sandboxFunctionContentType,
    fileName,
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: pod.sId },
  });

  return SandboxFunctionResource.makeNew(auth, {
    space: pod,
    file,
    slug,
    description: `Function ${slug}.`,
    inputSchema: EMPTY_SCHEMA,
    outputSchema: EMPTY_SCHEMA,
    executionMode: "fast",
  });
}

function buildArchive(
  manifest: PodAppManifest,
  files: Record<string, string>
): Buffer {
  const zip = new AdmZip();
  zip.addFile("manifest.json", Buffer.from(JSON.stringify(manifest), "utf-8"));
  for (const [relPath, content] of Object.entries(files)) {
    zip.addFile(`files/${relPath}`, Buffer.from(content, "utf-8"));
  }
  return zip.toBuffer();
}

function taskListManifest(): PodAppManifest {
  return {
    formatVersion: 1,
    name: "TaskList",
    exportedAt: "2026-08-14T00:00:00.000Z",
    files: [
      { path: "functions/add-task.ts", contentType: "text/plain" },
      { path: "databases/tasks.db.ts", contentType: "text/plain" },
    ],
    frames: [
      {
        fileName: "TaskList.tsx",
        contentType: frameContentType,
        wasPublished: true,
      },
    ],
    functions: [
      { name: "add-task", description: "Add a task.", executionMode: "fast" },
    ],
    databases: [{ name: "tasks" }],
  };
}

function taskListFiles(): Record<string, string> {
  return {
    "TaskList.tsx": "export default function App() { return null; }",
    "functions/add-task.ts": "export async function main() {}",
    "databases/tasks.db.ts": "export const tasks = {};",
  };
}

/** `taskListManifest()` with its Frame recorded as pinned at export time. */
function taskListManifestWithPinnedTab(): PodAppManifest {
  const manifest = taskListManifest();
  return {
    ...manifest,
    frames: manifest.frames.map((frame) => ({
      ...frame,
      pinnedTab: { title: "Tasks", icon: DEFAULT_POD_FRAME_TAB_ICON },
    })),
  };
}

async function importApp(
  workspaceId: string,
  podId: string,
  archive: Buffer,
  name?: string
) {
  const body = new FormData();
  body.append(
    "file",
    new File([new Uint8Array(archive)], "app.podapp.zip", {
      type: "application/zip",
    })
  );
  if (name !== undefined) {
    body.append("name", name);
  }

  return honoApp.request(`/api/w/${workspaceId}/pods/${podId}/apps/import`, {
    method: "POST",
    body,
  });
}

describe("POST /api/w/:wId/pods/:podId/apps/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
  });

  it("imports an archive: writes files, publishes functions, reconciles databases, publishes the Frame", async () => {
    const { workspace, pod, auth } = await setupPod();
    mockSandboxLeaves();

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(taskListManifest(), taskListFiles())
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.app.prefix).toBe("tasklist");
    expect(body.app.name).toBe("TaskList");
    expect(body.app.publishedFunctionSlugs).toEqual(["tasklist__add-task"]);
    expect(body.app.reconciledDatabaseNames).toEqual(["tasks"]);
    expect(body.app.createdFrameNames).toEqual(["TaskList.tsx"]);
    expect(body.app.publishedFrameNames).toEqual(["TaskList.tsx"]);
    expect(body.app.warnings).toEqual([]);
    expect(body.app.skipped).toEqual([]);

    const slugs = (await SandboxFunctionResource.listBySpace(auth, pod)).map(
      (fn) => fn.slug
    );
    expect(slugs).toEqual(["tasklist__add-task"]);

    expect(vi.mocked(reconcileDatabaseFromPodPath)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        database: "tasks",
        path: `pod-${pod.sId}/TaskList/databases/tasks.db.ts`,
      })
    );
  });

  it("publishes with the default stake the manifest declares", async () => {
    const { workspace, pod, auth } = await setupPod();
    mockSandboxLeaves();

    const manifest = taskListManifest();
    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(
        {
          ...manifest,
          functions: manifest.functions.map((fn) => ({
            ...fn,
            defaultStake: "never_ask" as const,
          })),
        },
        taskListFiles()
      )
    );

    expect(res.status).toBe(201);
    const published = await SandboxFunctionResource.fetchBySpaceAndSlug(
      auth,
      pod,
      "tasklist__add-task"
    );
    expect(published?.defaultStake).toBe("never_ask");
  });

  // An archive exported before stakes existed carries no `defaultStake`, and still imports: the
  // field is optional at the same format version, so publish applies its own default.
  it("publishes with the default stake when the manifest predates the field", async () => {
    const { workspace, pod, auth } = await setupPod();
    mockSandboxLeaves();

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(taskListManifest(), taskListFiles())
    );

    expect(res.status).toBe(201);
    const published = await SandboxFunctionResource.fetchBySpaceAndSlug(
      auth,
      pod,
      "tasklist__add-task"
    );
    expect(published?.defaultStake).toBe(DEFAULT_SANDBOX_FUNCTION_STAKE);
  });

  it("imports under the overriding name, deriving the prefix from it", async () => {
    const { workspace, pod } = await setupPod();
    mockSandboxLeaves();

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(taskListManifest(), taskListFiles()),
      "My Tasks"
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.app.prefix).toBe("my-tasks");
    expect(body.app.publishedFunctionSlugs).toEqual(["my-tasks__add-task"]);
  });

  it("rejects a name override longer than MAX_POD_APP_NAME_LENGTH", async () => {
    const { workspace, pod } = await setupPod();
    mockSandboxLeaves();

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(taskListManifest(), taskListFiles()),
      "a".repeat(MAX_POD_APP_NAME_LENGTH + 1)
    );

    expect(res.status).toBe(400);
  });

  it("rejects a name colliding with an existing app's prefix", async () => {
    const { workspace, pod } = await setupPod();
    mockSandboxLeaves();
    fileStorageMock.setFilesByPrefix(() => [
      {
        name: `w/${workspace.sId}/pods/${pod.sId}/files/TaskList/functions/x.ts`,
        metadata: {
          contentType: "text/plain",
          size: "10",
          updated: new Date().toISOString(),
        },
      },
    ]);

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(taskListManifest(), taskListFiles())
    );

    expect(res.status).toBe(409);
  });

  it("rejects a zip with an entry escaping files/", async () => {
    const { workspace, pod } = await setupPod();
    const zip = new AdmZip();
    zip.addFile(
      "manifest.json",
      Buffer.from(JSON.stringify(taskListManifest()), "utf-8")
    );
    zip.addFile("files/../escape.ts", Buffer.from("boom", "utf-8"));

    const res = await importApp(workspace.sId, pod.sId, zip.toBuffer());

    expect(res.status).toBe(400);
  });

  it("rejects an unknown manifest format version", async () => {
    const { workspace, pod } = await setupPod();
    const manifest = { ...taskListManifest(), formatVersion: 99 };
    const zip = new AdmZip();
    zip.addFile(
      "manifest.json",
      Buffer.from(JSON.stringify(manifest), "utf-8")
    );

    const res = await importApp(workspace.sId, pod.sId, zip.toBuffer());

    expect(res.status).toBe(400);
  });

  it("records a function whose source is missing from the archive as skipped", async () => {
    const { workspace, pod } = await setupPod();
    mockSandboxLeaves();
    const files = taskListFiles();
    delete files["functions/add-task.ts"];
    const manifest = taskListManifest();
    manifest.files = manifest.files.filter(
      (f) => f.path !== "functions/add-task.ts"
    );

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(manifest, files)
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.app.publishedFunctionSlugs).toEqual([]);
    expect(body.app.skipped).toEqual(["function add-task"]);
  });

  it("reports a Frame publish failure as a warning without failing the import", async () => {
    const { workspace, pod } = await setupPod();
    mockSandboxLeaves();
    vi.mocked(publishFrame).mockResolvedValue(
      new Err(
        new PublishFrameError(
          "pod_function_not_found",
          "Unknown function 'oldpod__gone'."
        )
      )
    );

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(taskListManifest(), taskListFiles())
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.app.createdFrameNames).toEqual(["TaskList.tsx"]);
    expect(body.app.publishedFrameNames).toEqual([]);
    expect(body.app.warnings).toEqual([
      "Frame TaskList.tsx: Unknown function 'oldpod__gone'.",
    ]);
  });

  it("round-trips: an exported app imports into another pod", async () => {
    const { workspace, pod, auth, user } = await setupPod();
    mockSandboxLeaves();
    fileStorageMock.setFilesByPrefix((prefix) =>
      prefix.includes(pod.sId)
        ? [
            gcsObject(workspace.sId, pod.sId, "TaskList/"),
            gcsObject(workspace.sId, pod.sId, "TaskList/functions/add-task.ts"),
            gcsObject(workspace.sId, pod.sId, "TaskList/databases/tasks.db.ts"),
          ]
        : []
    );
    fileStorageMock.setFileContent((filePath) =>
      filePath.includes(pod.sId) && filePath.endsWith(".ts")
        ? "export const x = 1;"
        : null
    );
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });
    fileStorageMock.setSubdirectoryNames((prefix) =>
      prefix.includes(pod.sId) ? ["tasklist__tasks.db"] : []
    );

    const exportRes = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/tasklist/export`,
      { method: "GET" }
    );
    expect(exportRes.status).toBe(200);
    const archive = Buffer.from(await exportRes.arrayBuffer());

    const podB = await SpaceFactory.project(workspace, user.id);

    const importRes = await importApp(workspace.sId, podB.sId, archive);
    expect(importRes.status).toBe(201);
    const body = await importRes.json();
    expect(body.app.prefix).toBe("tasklist");
    expect(body.app.publishedFunctionSlugs).toEqual(["tasklist__add-task"]);
    expect(body.app.reconciledDatabaseNames).toEqual(["tasks"]);
  });

  it("rejects an oversized upload before it reaches the import logic", async () => {
    const { workspace, pod } = await setupPod();

    // Comfortably past MAX_POD_APP_ARCHIVE_SIZE_BYTES + the route's multipart framing allowance,
    // so the body-limit middleware rejects it regardless of exactly how much overhead multipart
    // framing adds.
    const oversized = Buffer.alloc(MAX_POD_APP_ARCHIVE_SIZE_BYTES + 200 * 1024);

    const res = await importApp(workspace.sId, pod.sId, oversized);

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.type).toBe("content_too_large");
  });

  it("returns 503 when the sandbox is unavailable", async () => {
    const { workspace, pod } = await setupPod();
    mockSandboxLeaves();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Err(
        new SandboxFunctionError("sandbox_unavailable", "Sandbox is not ready.")
      )
    );

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(taskListManifest(), taskListFiles())
    );

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.type).toBe("service_unavailable");
  });

  it("pins a Frame's tab when the manifest recorded one", async () => {
    const { workspace, pod, auth } = await setupPod();
    mockSandboxLeaves();
    await ProjectMetadataResource.makeNew(auth, pod, { description: null });

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(taskListManifestWithPinnedTab(), taskListFiles())
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    const expectedPath = `pod-${pod.sId}/TaskList/TaskList.tsx`;
    expect(body.app.pinnedTabPaths).toEqual([expectedPath]);
    expect(body.app.warnings).toEqual([]);

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
    expect(metadata?.frameTabs).toEqual([
      { path: expectedPath, title: "Tasks", icon: DEFAULT_POD_FRAME_TAB_ICON },
    ]);
    expect(metadata?.tabsOrder).toContain(expectedPath);
  });

  it("warns instead of pinning when the Pod is already at the frame-tab cap", async () => {
    const { workspace, pod, auth } = await setupPod();
    mockSandboxLeaves();
    const existingTabs: PodFrameTab[] = Array.from(
      { length: MAX_POD_FRAME_TABS },
      (_, i) => ({
        path: `existing-${i}`,
        title: `Existing ${i}`,
        icon: DEFAULT_POD_FRAME_TAB_ICON,
      })
    );
    await ProjectMetadataResource.makeNew(auth, pod, {
      description: null,
      frameTabs: existingTabs,
      tabsOrder: existingTabs.map((tab) => tab.path),
    });

    const res = await importApp(
      workspace.sId,
      pod.sId,
      buildArchive(taskListManifestWithPinnedTab(), taskListFiles())
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.app.pinnedTabPaths).toEqual([]);
    expect(body.app.warnings).toEqual([
      `Frame TaskList.tsx: not pinned as a tab (the Pod already has ${MAX_POD_FRAME_TABS}).`,
    ]);

    const metadata = await ProjectMetadataResource.fetchBySpace(auth, pod);
    expect(metadata?.frameTabs).toEqual(existingTabs);
  });
});
