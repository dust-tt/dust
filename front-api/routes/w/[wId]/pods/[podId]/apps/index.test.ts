import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameContentType, sandboxFunctionContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
}));

const EMPTY_SCHEMA = { type: "object", properties: {} } as const;

async function setupPod() {
  const { workspace, user, auth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace, user.id);

  return { workspace, user, auth, pod };
}

/**
 * A GCS object as the pod file-system backend sees it. The backend lists recursively, so folder
 * placeholders (names ending in `/`) are what make a directory exist.
 */
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
  authenticator: Authenticator,
  pod: SpaceResource,
  { slug, fileName }: { slug: string; fileName: string }
) {
  const file = await FileFactory.create(authenticator, null, {
    contentType: sandboxFunctionContentType,
    fileName,
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: pod.sId },
  });

  return SandboxFunctionResource.makeNew(authenticator, {
    space: pod,
    file,
    slug,
    description: `Function ${slug}.`,
    inputSchema: EMPTY_SCHEMA,
    outputSchema: EMPTY_SCHEMA,
  });
}

describe("GET /api/w/:wId/pods/:podId/apps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
  });

  it("returns an empty list for a Pod with no app", async () => {
    const { workspace, pod } = await setupPod();

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps).toEqual([]);
  });

  it("lists an app with its Frame, functions and databases joined on the app prefix", async () => {
    const { workspace, pod, auth } = await setupPod();

    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "TaskList/"),
      gcsObject(workspace.sId, pod.sId, "TaskList/functions/"),
      gcsObject(
        workspace.sId,
        pod.sId,
        "TaskList/TaskList.tsx",
        frameContentType
      ),
      gcsObject(workspace.sId, pod.sId, "TaskList/functions/add-task.ts"),
    ]);
    fileStorageMock.setSubdirectoryNames(() => ["tasklist__tasks.db"]);

    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps).toHaveLength(1);

    const [app] = body.apps;
    expect(app.prefix).toBe("tasklist");
    expect(app.name).toBe("TaskList");
    expect(app.folderPath).toBe(`pod-${pod.sId}/TaskList`);
    // The app is the surrounding context, so names show bare while the addressable full
    // slug/on-disk name is still carried on the wire.
    expect(app.functions).toEqual([
      expect.objectContaining({
        slug: "tasklist__add-task",
        name: "add-task",
      }),
    ]);
    expect(app.databases).toEqual([
      { name: "tasks", onDiskName: "tasklist__tasks" },
    ]);
    expect(app.frames).toHaveLength(1);
    expect(app.frames[0].fileName).toBe("TaskList.tsx");
    expect(app.fileCount).toBe(2);
  });

  it("attributes a database created before app namespacing via its schema file", async () => {
    const { workspace, pod } = await setupPod();

    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "ProductManager/"),
      gcsObject(
        workspace.sId,
        pod.sId,
        "ProductManager/databases/products.db.ts"
      ),
    ]);
    // Bare filename, so the name alone cannot say which app owns it.
    fileStorageMock.setSubdirectoryNames(() => ["products.db"]);

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps).toHaveLength(1);
    expect(body.apps[0].prefix).toBe("productmanager");
    expect(body.apps[0].databases).toEqual([
      { name: "products", onDiskName: "products" },
    ]);
  });

  it("leaves an unprefixed database no app declares in the unfiled app", async () => {
    const { workspace, pod } = await setupPod();

    fileStorageMock.setSubdirectoryNames(() => ["orphaned.db"]);

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps).toHaveLength(1);
    expect(body.apps[0].prefix).toBe("");
    expect(body.apps[0].databases).toEqual([
      { name: "orphaned", onDiskName: "orphaned" },
    ]);
  });

  it("ignores a pod-root folder that is not app-shaped", async () => {
    const { workspace, pod } = await setupPod();

    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "Documents/"),
      gcsObject(workspace.sId, pod.sId, "Documents/notes.md"),
    ]);

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps).toEqual([]);
  });

  it("collects artifacts published from the Pod root into the unfiled app", async () => {
    const { workspace, pod, auth } = await setupPod();

    await publishFunction(auth, pod, {
      slug: "orphan",
      fileName: "orphan.ts",
    });

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps).toHaveLength(1);
    expect(body.apps[0].prefix).toBe("");
    expect(body.apps[0].name).toBeNull();
    expect(
      body.apps[0].functions.map((fn: { slug: string }) => fn.slug)
    ).toEqual(["orphan"]);
  });

  it("reports folders that normalize onto the same app prefix as one colliding app", async () => {
    const { workspace, pod, auth } = await setupPod();

    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "Task List/"),
      gcsObject(workspace.sId, pod.sId, "Task List/functions/"),
      gcsObject(workspace.sId, pod.sId, "Task-List/"),
      gcsObject(workspace.sId, pod.sId, "Task-List/functions/"),
    ]);

    await publishFunction(auth, pod, {
      slug: "task-list__add-task",
      fileName: "add-task.ts",
    });

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps).toHaveLength(1);
    expect(body.apps[0].prefix).toBe("task-list");
    expect(body.apps[0].collidingFolderNames.sort()).toEqual([
      "Task List",
      "Task-List",
    ]);
  });

  it("still lists an app whose folder is gone but whose functions are published", async () => {
    const { workspace, pod, auth } = await setupPod();

    await publishFunction(auth, pod, {
      slug: "ghostapp__list",
      fileName: "list.ts",
    });

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apps).toHaveLength(1);
    expect(body.apps[0].prefix).toBe("ghostapp");
    expect(body.apps[0].folderPath).toBeNull();
  });
});
