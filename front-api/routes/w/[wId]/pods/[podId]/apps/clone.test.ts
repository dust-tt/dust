import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { reconcileDatabaseFromPodPath } from "@app/lib/api/sandbox_functions/dsbx_db";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
  distributedLock: vi.fn(async () => "lock-value"),
  distributedUnlock: vi.fn(async () => undefined),
}));

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensurePodSandboxReady: vi.fn(),
}));

// The two leaves that need a live sandbox. Mocked so the test exercises the orchestration — what gets
// copied, published and reconciled, and with which paths — rather than a real bundle and DDL run.
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
  });
}

/** A source app with one function source and one database schema file, no Frame. */
function taskListFiles(workspaceId: string, podId: string) {
  return [
    gcsObject(workspaceId, podId, "TaskList/"),
    gcsObject(workspaceId, podId, "TaskList/functions/add-task.ts"),
    gcsObject(workspaceId, podId, "TaskList/databases/tasks.db.ts"),
  ];
}

async function clone(
  workspaceId: string,
  podId: string,
  prefix: string,
  name: string
) {
  return honoApp.request(
    `/api/w/${workspaceId}/pods/${podId}/apps/${prefix}/clone`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }
  );
}

describe("POST /api/w/:wId/pods/:podId/apps/:prefix/clone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
  });

  it("copies the app and publishes its functions under the new prefix", async () => {
    const { workspace, pod, auth } = await setupPod();
    mockSandboxLeaves();
    fileStorageMock.setFilesByPrefix(() =>
      taskListFiles(workspace.sId, pod.sId)
    );
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });
    fileStorageMock.setSubdirectoryNames(() => ["tasklist__tasks.db"]);

    const res = await clone(workspace.sId, pod.sId, "tasklist", "Task List");

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.app.prefix).toBe("task-list");
    expect(body.app.name).toBe("Task List");
    // Published from the COPY's folder, so publish derives the copy's prefix.
    expect(body.app.publishedFunctionSlugs).toEqual(["task-list__add-task"]);
    expect(body.app.reconciledDatabaseNames).toEqual(["tasks"]);
    expect(body.app.skipped).toEqual([]);

    // The source app keeps its own function; the copy did not move or replace it.
    const slugs = (await SandboxFunctionResource.listBySpace(auth, pod)).map(
      (fn) => fn.slug
    );
    expect(slugs.sort()).toEqual(["task-list__add-task", "tasklist__add-task"]);

    // The database schema reconciled is the COPY's file, not the original's.
    expect(vi.mocked(reconcileDatabaseFromPodPath)).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        database: "tasks",
        path: `pod-${pod.sId}/Task List/databases/tasks.db.ts`,
      })
    );
  });

  it("rejects a name that collides with an existing app's prefix", async () => {
    const { workspace, pod, auth } = await setupPod();
    mockSandboxLeaves();
    fileStorageMock.setFilesByPrefix(() =>
      taskListFiles(workspace.sId, pod.sId)
    );
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });

    // `TaskList` normalizes to the source's own prefix, which would make the copy share its
    // published slugs and databases.
    const res = await clone(workspace.sId, pod.sId, "tasklist", "TaskList");

    expect(res.status).toBe(409);
  });

  it("rejects a name with nothing to derive a prefix from", async () => {
    const { workspace, pod, auth } = await setupPod();
    fileStorageMock.setFilesByPrefix(() =>
      taskListFiles(workspace.sId, pod.sId)
    );
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });

    const res = await clone(workspace.sId, pod.sId, "tasklist", "---");

    expect(res.status).toBe(400);
  });

  it("returns 404 for an app the Pod does not have", async () => {
    const { workspace, pod } = await setupPod();

    const res = await clone(workspace.sId, pod.sId, "nosuchapp", "Copy");

    expect(res.status).toBe(404);
  });

  it("refuses to clone artifacts published outside an app folder", async () => {
    const { workspace, pod, auth } = await setupPod();
    await publishFunction(auth, pod, {
      slug: "orphan",
      fileName: "orphan.ts",
    });

    // A prefix-less function belongs to no app, so an empty path segment addresses nothing.
    const res = await clone(workspace.sId, pod.sId, "", "Copy");

    expect([400, 404]).toContain(res.status);
  });
});
