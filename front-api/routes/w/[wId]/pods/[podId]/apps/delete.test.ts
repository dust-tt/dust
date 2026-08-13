import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import type { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameContentType, sandboxFunctionContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
}));

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensurePodSandboxReady: vi.fn(),
}));

const EMPTY_SCHEMA = { type: "object", properties: {} } as const;

/** Records every root command front runs on the sandbox (the litestream restart), answering ok. */
function mockSandboxExecRoot(sandbox: SandboxResource): string[] {
  const commands: string[] = [];
  vi.spyOn(sandbox, "execRoot").mockImplementation(async (_auth, command) => {
    commands.push(command.command);
    return new Ok({ exitCode: 0, stdout: "", stderr: "" });
  });
  return commands;
}

/** Records every command front runs on the sandbox, answering db execs with an ok envelope. */
function mockSandboxExec(sandbox: SandboxResource): string[] {
  const commands: string[] = [];
  vi.spyOn(sandbox, "exec").mockImplementation(async (_auth, command) => {
    commands.push(command);
    return new Ok({
      exitCode: 0,
      stdout: `${JSON.stringify({ ok: true })}\n`,
      stderr: "",
    });
  });
  return commands;
}

async function setupPod() {
  const { workspace, user, auth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  const pod = await SpaceFactory.project(workspace, user.id);
  const sandbox = await SandboxResource.makeNew(auth, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  vi.mocked(ensurePodSandboxReady).mockResolvedValue(
    new Ok({ sandbox, freshlyCreated: false })
  );
  const rootCommands = mockSandboxExecRoot(sandbox);

  return { workspace, user, auth, pod, sandbox, rootCommands };
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

describe("DELETE /api/w/:wId/pods/:podId/apps/:prefix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
  });

  it("unpublishes the app's functions and reports what it removed", async () => {
    const { workspace, pod, auth, sandbox } = await setupPod();
    const commands = mockSandboxExec(sandbox);

    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "TaskList/"),
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
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/tasklist`,
      { method: "DELETE" }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.app.prefix).toBe("tasklist");
    expect(body.app.deletedFunctionSlugs).toEqual(["tasklist__add-task"]);
    expect(body.app.deletedDatabaseNames).toEqual(["tasklist__tasks"]);
    expect(body.app.deletedFolderNames).toEqual(["TaskList"]);

    // The published function row is gone, so nothing can invoke the app any more.
    const remaining = await SandboxFunctionResource.listBySpace(auth, pod);
    expect(remaining).toHaveLength(0);

    // The live database file and both SQLite sidecars are removed, addressed by on-disk name under
    // the databases dir. Paths are shell-escaped, hence matching on the bare path text.
    const removeCommand = commands.find((command) =>
      command.includes("/bin/rm -f --")
    );
    expect(removeCommand).toBeDefined();
    expect(removeCommand).toContain("/pod-state/databases/tasklist__tasks.db");
    expect(removeCommand).toContain(
      "/pod-state/databases/tasklist__tasks.db-wal"
    );
    expect(removeCommand).toContain(
      "/pod-state/databases/tasklist__tasks.db-shm"
    );
  });

  it("deletes the live database, restarts litestream, then wipes the replica", async () => {
    const { workspace, pod, sandbox } = await setupPod();

    const order: string[] = [];
    vi.spyOn(sandbox, "exec").mockImplementation(async (_auth, command) => {
      if (command.includes("/bin/rm -f --")) {
        order.push("live");
      }
      return new Ok({
        exitCode: 0,
        stdout: `${JSON.stringify({ ok: true })}\n`,
        stderr: "",
      });
    });
    vi.spyOn(sandbox, "execRoot").mockImplementation(async (_auth, command) => {
      if (command.command.includes("systemctl restart litestream")) {
        order.push("restart");
      }
      return new Ok({ exitCode: 0, stdout: "", stderr: "" });
    });

    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "TaskList/"),
      gcsObject(workspace.sId, pod.sId, "TaskList/databases/tasks.db.ts"),
    ]);
    fileStorageMock.setSubdirectoryNames(() => ["tasklist__tasks.db"]);
    fileStorageMock.setOnDeleteByPrefix((prefix) => {
      if (prefix.includes("tasklist__tasks.db/")) {
        order.push("replica");
      }
    });

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/tasklist`,
      { method: "DELETE" }
    );

    expect(res.status).toBe(200);
    // A live litestream re-replicates a database it can still see, and removing the files does not
    // make it let go — only the restart does. This whole order is load-bearing.
    expect(order).toEqual(["live", "restart", "replica"]);
  });

  it("does not wipe the replica when the litestream restart fails", async () => {
    const { workspace, pod, sandbox } = await setupPod();
    mockSandboxExec(sandbox);

    vi.spyOn(sandbox, "execRoot").mockResolvedValue(
      new Ok({ exitCode: 1, stdout: "", stderr: "Job for litestream failed." })
    );

    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "TaskList/"),
      gcsObject(workspace.sId, pod.sId, "TaskList/databases/tasks.db.ts"),
    ]);
    fileStorageMock.setSubdirectoryNames(() => ["tasklist__tasks.db"]);
    const wipedPrefixes: string[] = [];
    fileStorageMock.setOnDeleteByPrefix((prefix) => {
      wipedPrefixes.push(prefix);
    });

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/tasklist`,
      { method: "DELETE" }
    );

    // A daemon still holding the deleted database would recreate the prefix right after the wipe,
    // and the pod's next cold start would restore the database from it. Better to fail and be retried.
    expect(res.status).toBe(500);
    expect(
      wipedPrefixes.filter((prefix) => prefix.includes("tasklist__tasks.db/"))
    ).toEqual([]);
  });

  it("fails when the replica survives, rather than reporting a delete that would come back", async () => {
    const { workspace, pod, sandbox } = await setupPod();
    mockSandboxExec(sandbox);

    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "TaskList/"),
      gcsObject(workspace.sId, pod.sId, "TaskList/databases/tasks.db.ts"),
    ]);
    // The replica listing keeps reporting the database even after the prefix delete, which is what a
    // silently-failed wipe looks like — the pod's next cold start would restore it.
    fileStorageMock.setSubdirectoryNames(() => ["tasklist__tasks.db"]);
    fileStorageMock.setIgnoreDeleteByPrefixInListings(true);

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/tasklist`,
      { method: "DELETE" }
    );

    expect(res.status).toBe(500);
  });

  it("returns 404 for an app the Pod does not have", async () => {
    const { workspace, pod } = await setupPod();

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/nosuchapp`,
      { method: "DELETE" }
    );

    expect(res.status).toBe(404);
  });

  it("stays denied to a workspace member outside the pod when app sharing is enabled", async () => {
    // App sharing grants function invocation only — never write access such as app deletion.
    const { workspace, auth, pod } = await setupPod();
    await ProjectMetadataResource.makeNew(auth, pod, {
      description: null,
      appSharingEnabled: true,
    });

    // Authenticate subsequent requests as a workspace user who is not in the pod.
    await createPrivateApiMockRequest({ role: "user", workspace });

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/tasklist`,
      { method: "DELETE" }
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error.type).toBe("space_not_found");
  });

  it("refuses to delete artifacts published outside an app folder", async () => {
    const { workspace, pod, auth } = await setupPod();
    await publishFunction(auth, pod, {
      slug: "orphan",
      fileName: "orphan.ts",
    });

    // A prefix-less function belongs to no app, so there is nothing to address: an empty path segment
    // must not be mistaken for a deletable app.
    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/`,
      { method: "DELETE" }
    );

    expect(res.status).toBe(404);

    // And the function survives.
    const remaining = await SandboxFunctionResource.listBySpace(auth, pod);
    expect(remaining).toHaveLength(1);
  });

  it("rejects a prefix that is not app-prefix shaped", async () => {
    const { workspace, pod } = await setupPod();

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/${encodeURIComponent("../secrets")}`,
      { method: "DELETE" }
    );

    expect([400, 404]).toContain(res.status);
  });
});
