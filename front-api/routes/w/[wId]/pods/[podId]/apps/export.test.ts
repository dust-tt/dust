// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib).
// This directive makes them available in the test environment.

import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { PodAppManifest } from "@app/types/api/pod_app_archive";
import {
  MAX_POD_APP_ARCHIVE_UNCOMPRESSED_BYTES,
  PodAppManifestSchema,
} from "@app/types/api/pod_app_archive";
import { frameContentType, sandboxFunctionContentType } from "@app/types/files";
import { DEFAULT_POD_FRAME_TAB_ICON } from "@app/types/pod_frame_tab";
import { honoApp } from "@front-api/app";
import AdmZip from "adm-zip";
import { beforeEach, describe, expect, it, vi } from "vitest";

const EMPTY_SCHEMA = { type: "object", properties: {} } as const;

async function setupPod() {
  const { workspace, user, auth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace, user.id);

  return { workspace, user, auth, pod };
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

function taskListFiles(workspaceId: string, podId: string) {
  return [
    gcsObject(workspaceId, podId, "TaskList/"),
    gcsObject(workspaceId, podId, "TaskList/functions/add-task.ts"),
    gcsObject(workspaceId, podId, "TaskList/databases/tasks.db.ts"),
    gcsObject(workspaceId, podId, "TaskList/TaskList.tsx", frameContentType),
  ];
}

/**
 * Creates the Frame's FileResource, published (a bundle root is set) and pinned as a nav tab, so
 * `exportPodApp`'s Frame branch (fetch by id, read "original" content, capture wasPublished +
 * pinnedTab) has something real to export.
 */
async function publishAndPinFrame(
  auth: Authenticator,
  pod: SpaceResource,
  { workspaceId, fileName }: { workspaceId: string; fileName: string }
) {
  const framePath = `pod-${pod.sId}/TaskList/${fileName}`;

  await FileFactory.create(auth, null, {
    contentType: frameContentType,
    fileName,
    fileSize: 100,
    status: "ready",
    useCase: "project_context",
    useCaseMetadata: {
      spaceId: pod.sId,
      // Any truthy value marks the Frame published, per `FileResource.isPublishedFrame()`.
      frameBundleRootPath: `pod-${pod.sId}/TaskList`,
    },
    mountFilePath: `w/${workspaceId}/pods/${pod.sId}/files/TaskList/${fileName}`,
  });

  await ProjectMetadataResource.makeNew(auth, pod, {
    description: null,
    frameTabs: [
      { path: framePath, title: "Tasks", icon: DEFAULT_POD_FRAME_TAB_ICON },
    ],
    tabsOrder: [framePath],
  });
}

async function exportApp(workspaceId: string, podId: string, prefix: string) {
  return honoApp.request(
    `/api/w/${workspaceId}/pods/${podId}/apps/${prefix}/export`,
    { method: "GET" }
  );
}

describe("GET /api/w/:wId/pods/:podId/apps/:prefix/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
  });

  it("streams a zip holding the app's files, a published pinned Frame, and a valid manifest", async () => {
    const { workspace, pod, auth } = await setupPod();
    fileStorageMock.setFilesByPrefix(() =>
      taskListFiles(workspace.sId, pod.sId)
    );
    fileStorageMock.setFileContent((filePath) => {
      if (filePath.endsWith("functions/add-task.ts")) {
        return "export async function main() {}";
      }
      if (filePath.endsWith("databases/tasks.db.ts")) {
        return "export const tasks = {};";
      }
      // The Frame's "original" content is read from its FileResource's fileId-keyed storage path
      // (`files/w/<wId>/<fileId>/original`), not its mount path, so it can't be matched by name
      // like the two files above; it's the only other content read in this test.
      return "export default function App() { return null; }";
    });
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });
    fileStorageMock.setSubdirectoryNames(() => ["tasklist__tasks.db"]);
    await publishAndPinFrame(auth, pod, {
      workspaceId: workspace.sId,
      fileName: "TaskList.tsx",
    });

    const res = await exportApp(workspace.sId, pod.sId, "tasklist");

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toBe(
      'attachment; filename="tasklist.podapp.zip"'
    );

    const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));
    const entryNames = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory)
      .map((entry) => entry.entryName)
      .sort();
    expect(entryNames).toEqual([
      "files/TaskList.tsx",
      "files/databases/tasks.db.ts",
      "files/functions/add-task.ts",
      "manifest.json",
    ]);

    const manifestEntry = zip.getEntry("manifest.json");
    expect(manifestEntry).not.toBeNull();
    const parsed = PodAppManifestSchema.safeParse(
      JSON.parse(manifestEntry!.getData().toString("utf-8"))
    );
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      throw new Error("manifest failed schema validation");
    }
    const manifest: PodAppManifest = parsed.data;
    expect(manifest.name).toBe("TaskList");
    expect(manifest.functions).toEqual([
      {
        name: "add-task",
        description: "Function tasklist__add-task.",
        executionMode: "fast",
      },
    ]);
    expect(manifest.databases).toEqual([{ name: "tasks" }]);
    expect(manifest.frames).toEqual([
      {
        fileName: "TaskList.tsx",
        contentType: frameContentType,
        wasPublished: true,
        pinnedTab: { title: "Tasks", icon: DEFAULT_POD_FRAME_TAB_ICON },
      },
    ]);
    // The Frame is read through its FileResource, not as a plain file: no entry for it here.
    expect(manifest.files.map((f) => f.path).sort()).toEqual([
      "databases/tasks.db.ts",
      "functions/add-task.ts",
    ]);

    expect(
      zip.getEntry("files/functions/add-task.ts")!.getData().toString("utf-8")
    ).toBe("export async function main() {}");
    expect(
      zip.getEntry("files/TaskList.tsx")!.getData().toString("utf-8")
    ).toBe("export default function App() { return null; }");
  });

  it("returns 404 for an app the Pod does not have", async () => {
    const { workspace, pod } = await setupPod();

    const res = await exportApp(workspace.sId, pod.sId, "nosuchapp");

    expect(res.status).toBe(404);
  });

  it("refuses to export colliding app folders", async () => {
    const { workspace, pod } = await setupPod();
    // "Task List" and "Task-List" both normalize to the "task-list" prefix (see
    // `listPodApps`'s docstring), so they cannot be packaged faithfully.
    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "Task List/functions/a.ts"),
      gcsObject(workspace.sId, pod.sId, "Task-List/functions/b.ts"),
    ]);

    const res = await exportApp(workspace.sId, pod.sId, "task-list");

    expect(res.status).toBe(400);
  });

  it("refuses to export an app whose files exceed the uncompressed-size limit", async () => {
    const { workspace, pod } = await setupPod();
    // A single oversized entry is enough: the guard sums listed sizes before reading any bytes,
    // so this never has to actually buffer a huge zip.
    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "TaskList/"),
      {
        name: `w/${workspace.sId}/pods/${pod.sId}/files/TaskList/functions/huge.ts`,
        metadata: {
          contentType: "text/plain",
          size: String(MAX_POD_APP_ARCHIVE_UNCOMPRESSED_BYTES + 1),
          updated: new Date().toISOString(),
        },
      },
    ]);

    const res = await exportApp(workspace.sId, pod.sId, "tasklist");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.message).toMatch(/too large/i);
  });
});
