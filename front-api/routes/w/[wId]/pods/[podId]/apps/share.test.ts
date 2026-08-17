import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { PodAppShareResource } from "@app/lib/resources/pod_app_share_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(async (_lockName: string, fn: () => unknown) => fn()),
}));

vi.mock("@app/lib/api/sandbox/lifecycle", () => ({
  ensurePodSandboxReady: vi.fn(),
}));

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
  });
}

function shareUrl(workspaceId: string, podId: string, prefix: string) {
  return `/api/w/${workspaceId}/pods/${podId}/apps/${prefix}/share`;
}

async function share(
  workspaceId: string,
  podId: string,
  prefix: string,
  body: { name?: string; description: string }
) {
  return honoApp.request(shareUrl(workspaceId, podId, prefix), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/w/:wId/pods/:podId/apps/:prefix/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
  });

  it("shares the app and surfaces it on the apps listing", async () => {
    const { workspace, pod, auth } = await setupPod();
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });
    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "TaskList/"),
      gcsObject(workspace.sId, pod.sId, "TaskList/functions/add-task.ts"),
    ]);

    const res = await share(workspace.sId, pod.sId, "tasklist", {
      name: "Task List",
      description: "Task management tools.",
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.share).toEqual({
      appPrefix: "tasklist",
      toolsetName: "Task List",
      description: "Task management tools.",
    });

    const listRes = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps`
    );
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(listBody.apps).toHaveLength(1);
    expect(listBody.apps[0].share).toEqual({
      appPrefix: "tasklist",
      toolsetName: "Task List",
      description: "Task management tools.",
    });
  });

  it("rejects a duplicate share with 409", async () => {
    const { workspace, pod, auth } = await setupPod();
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });

    const first = await share(workspace.sId, pod.sId, "tasklist", {
      description: "Task management tools.",
    });
    expect(first.status).toBe(201);

    const second = await share(workspace.sId, pod.sId, "tasklist", {
      description: "Task management tools.",
    });
    expect(second.status).toBe(409);
  });

  it("rejects an app with no published functions with 400", async () => {
    const { workspace, pod } = await setupPod();

    const res = await share(workspace.sId, pod.sId, "tasklist", {
      description: "Task management tools.",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a workspace member who is not a pod editor with 404", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "user",
    });
    const editor = await UserFactory.basic();
    const pod = await SpaceFactory.project(workspace, editor.id);
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });

    const res = await share(workspace.sId, pod.sId, "tasklist", {
      description: "Task management tools.",
    });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/w/:wId/pods/:podId/apps/:prefix/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
  });

  it("updates the description", async () => {
    const { workspace, pod, auth } = await setupPod();
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });
    const created = await share(workspace.sId, pod.sId, "tasklist", {
      description: "Task management tools.",
    });
    expect(created.status).toBe(201);

    const res = await honoApp.request(
      shareUrl(workspace.sId, pod.sId, "tasklist"),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Better description." }),
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.share.description).toBe("Better description.");

    const shareRow = await PodAppShareResource.fetchByPodAndAppPrefix(
      auth,
      pod,
      "tasklist"
    );
    expect(shareRow?.description).toBe("Better description.");
  });

  it("404s when the app is not shared", async () => {
    const { workspace, pod } = await setupPod();

    const res = await honoApp.request(
      shareUrl(workspace.sId, pod.sId, "tasklist"),
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "Whatever." }),
      }
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/w/:wId/pods/:podId/apps/:prefix/share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
  });

  it("revokes the share and soft-deletes the toolset views", async () => {
    const { workspace, pod, auth } = await setupPod();
    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });
    const created = await share(workspace.sId, pod.sId, "tasklist", {
      description: "Task management tools.",
    });
    expect(created.status).toBe(201);
    const shareRow = await PodAppShareResource.fetchByPodAndAppPrefix(
      auth,
      pod,
      "tasklist"
    );
    assert(shareRow, "Expected a share row");

    const res = await honoApp.request(
      shareUrl(workspace.sId, pod.sId, "tasklist"),
      { method: "DELETE" }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });

    expect(
      await PodAppShareResource.fetchByPodAndAppPrefix(auth, pod, "tasklist")
    ).toBeNull();

    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    expect(
      await MCPServerViewResource.listByMCPServer(
        adminAuth,
        shareRow.internalMCPServerId
      )
    ).toEqual([]);
  });

  it("404s when the app is not shared", async () => {
    const { workspace, pod } = await setupPod();

    const res = await honoApp.request(
      shareUrl(workspace.sId, pod.sId, "tasklist"),
      { method: "DELETE" }
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/w/:wId/pods/:podId/apps/:prefix with an active share", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fileStorageMock.reset();
  });

  it("revokes the share when the app is deleted", async () => {
    const { workspace, pod, auth } = await setupPod();
    const sandbox = await SandboxResource.makeNew(auth, {
      providerId: "test-provider-id",
      status: "running",
      baseImage: "dust-base",
      version: "0.0.0-test",
    });
    vi.mocked(ensurePodSandboxReady).mockResolvedValue(
      new Ok({ sandbox, freshlyCreated: false })
    );
    vi.spyOn(sandbox, "execRoot").mockResolvedValue(
      new Ok({ exitCode: 0, stdout: "", stderr: "" })
    );
    vi.spyOn(sandbox, "exec").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: `${JSON.stringify({ ok: true })}\n`,
        stderr: "",
      })
    );

    await publishFunction(auth, pod, {
      slug: "tasklist__add-task",
      fileName: "add-task.ts",
    });
    fileStorageMock.setFilesByPrefix(() => [
      gcsObject(workspace.sId, pod.sId, "TaskList/"),
      gcsObject(workspace.sId, pod.sId, "TaskList/functions/add-task.ts"),
    ]);
    fileStorageMock.setSubdirectoryNames(() => []);

    const created = await share(workspace.sId, pod.sId, "tasklist", {
      description: "Task management tools.",
    });
    expect(created.status).toBe(201);

    const res = await honoApp.request(
      `/api/w/${workspace.sId}/pods/${pod.sId}/apps/tasklist`,
      { method: "DELETE" }
    );

    expect(res.status).toBe(200);
    expect(
      await PodAppShareResource.fetchByPodAndAppPrefix(auth, pod, "tasklist")
    ).toBeNull();
  });
});
