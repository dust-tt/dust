// @vitest-environment node: adm-zip requires Node builtins (Buffer, zlib).
// This directive makes them available in the test environment.

import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { PodAppManifest } from "@app/types/api/pod_app_archive";
import { PodAppManifestSchema } from "@app/types/api/pod_app_archive";
import { sandboxFunctionContentType } from "@app/types/files";
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
  ];
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

  it("streams a zip holding the app's files and a valid manifest", async () => {
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
      return null;
    });
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });
    fileStorageMock.setSubdirectoryNames(() => ["tasklist__tasks.db"]);

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
    const manifest: PodAppManifest = parsed.success
      ? parsed.data
      : (undefined as never);
    expect(manifest.name).toBe("TaskList");
    expect(manifest.functions).toEqual([
      {
        name: "add-task",
        description: "Function tasklist__add-task.",
        executionMode: "fast",
      },
    ]);
    expect(manifest.databases).toEqual([{ name: "tasks" }]);
    expect(manifest.frames).toEqual([]);
    expect(manifest.files.map((f) => f.path).sort()).toEqual([
      "databases/tasks.db.ts",
      "functions/add-task.ts",
    ]);

    expect(
      zip.getEntry("files/functions/add-task.ts")!.getData().toString("utf-8")
    ).toBe("export async function main() {}");
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
});
