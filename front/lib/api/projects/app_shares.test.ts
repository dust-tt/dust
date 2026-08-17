import {
  sharePodApp,
  unsharePodApp,
  updatePodAppShare,
} from "@app/lib/api/projects/app_shares";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { PodAppShareResource } from "@app/lib/resources/pod_app_share_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(
    async (_lockName: string, callback: () => Promise<unknown>) => callback()
  ),
}));

const EMPTY_SCHEMA: JSONSchema = { type: "object", properties: {} };

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

async function setup() {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  const pod = await SpaceFactory.project(workspace, user.id);
  // Rebuild the authenticator after pod creation so it carries the editor group membership.
  const editorAuth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  assert(editorAuth, "Expected an authenticator for the pod editor");

  const adminAuth = await Authenticator.internalAdminForWorkspace(
    workspace.sId
  );

  const publishFunction = async (pod: SpaceResource, slug: string) => {
    const file = await FileFactory.create(editorAuth, null, {
      contentType: sandboxFunctionContentType,
      fileName: `${slug}.ts`,
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });
    return SandboxFunctionResource.makeNew(editorAuth, {
      space: pod,
      file,
      slug,
      description: `Function ${slug}.`,
      inputSchema: EMPTY_SCHEMA,
      outputSchema: EMPTY_SCHEMA,
    });
  };

  return { workspace, pod, editorAuth, adminAuth, publishFunction };
}

describe("sharePodApp", () => {
  it("creates the share row and the system + global views", async () => {
    const { pod, editorAuth, adminAuth, publishFunction } = await setup();
    await publishFunction(pod, "tasklist__add-task");

    const result = await sharePodApp(editorAuth, pod, {
      prefix: "tasklist",
      name: "Task List",
      description: "Task management tools.",
    });

    assert(result.isOk(), "Expected sharePodApp to succeed");
    expect(result.value).toEqual({
      appName: "tasklist",
      toolsetName: "Task List",
      description: "Task management tools.",
    });

    const share = await PodAppShareResource.fetchByPodAndAppName(
      editorAuth,
      pod,
      "tasklist"
    );
    assert(share, "Expected a share row");
    expect(share.toolsetName).toBe("Task List");

    const views = await MCPServerViewResource.listByMCPServer(
      adminAuth,
      share.internalMCPServerId
    );
    expect(views.map((view) => view.space.kind).sort()).toEqual([
      "global",
      "system",
    ]);
    for (const view of views) {
      expect(view.name).toBe("Task List");
      expect(view.description).toBe("Task management tools.");
    }
  });

  it("rejects an app with no published functions", async () => {
    const { pod, editorAuth } = await setup();

    const result = await sharePodApp(editorAuth, pod, {
      prefix: "tasklist",
      description: "Task management tools.",
    });

    assert(result.isErr(), "Expected sharePodApp to fail");
    expect(result.error.code).toBe("no_functions");
  });

  it("rejects sharing the same app twice", async () => {
    const { pod, editorAuth, publishFunction } = await setup();
    await publishFunction(pod, "tasklist__add-task");

    const first = await sharePodApp(editorAuth, pod, {
      prefix: "tasklist",
      description: "Task management tools.",
    });
    expect(first.isOk()).toBe(true);

    const second = await sharePodApp(editorAuth, pod, {
      prefix: "tasklist",
      description: "Task management tools.",
    });
    assert(second.isErr(), "Expected the second share to fail");
    expect(second.error.code).toBe("already_shared");
  });

  it("rejects a toolset name already used in the workspace", async () => {
    const { workspace, pod, editorAuth, publishFunction } = await setup();
    await publishFunction(pod, "tasklist__add-task");

    const otherPod = await SpaceFactory.project(
      workspace,
      editorAuth.getNonNullableUser().id
    );
    const otherEditorAuth = await Authenticator.fromUserIdAndWorkspaceId(
      editorAuth.getNonNullableUser().sId,
      workspace.sId
    );
    assert(otherEditorAuth, "Expected an authenticator");
    await publishFunction(otherPod, "notes__list");

    const first = await sharePodApp(editorAuth, pod, {
      prefix: "tasklist",
      name: "Shared Tools",
      description: "Task management tools.",
    });
    expect(first.isOk()).toBe(true);

    const second = await sharePodApp(otherEditorAuth, otherPod, {
      prefix: "notes",
      name: "Shared Tools",
      description: "Note tools.",
    });
    assert(second.isErr(), "Expected the name conflict to fail");
    expect(second.error.code).toBe("name_taken");
  });
});

describe("unsharePodApp", () => {
  it("soft-deletes the share row and both views", async () => {
    const { pod, editorAuth, adminAuth, publishFunction } = await setup();
    await publishFunction(pod, "tasklist__add-task");
    const shared = await sharePodApp(editorAuth, pod, {
      prefix: "tasklist",
      description: "Task management tools.",
    });
    expect(shared.isOk()).toBe(true);
    const share = await PodAppShareResource.fetchByPodAndAppName(
      editorAuth,
      pod,
      "tasklist"
    );
    assert(share, "Expected a share row");

    const result = await unsharePodApp(editorAuth, pod, "tasklist");
    expect(result.isOk()).toBe(true);

    expect(
      await PodAppShareResource.fetchByPodAndAppName(
        editorAuth,
        pod,
        "tasklist"
      )
    ).toBeNull();
    expect(
      await MCPServerViewResource.listByMCPServer(
        adminAuth,
        share.internalMCPServerId
      )
    ).toEqual([]);
  });

  it("reports an unshared app", async () => {
    const { pod, editorAuth } = await setup();

    const result = await unsharePodApp(editorAuth, pod, "tasklist");
    assert(result.isErr(), "Expected unshare to fail");
    expect(result.error.code).toBe("not_shared");
  });
});

describe("updatePodAppShare", () => {
  it("updates the name and description on the row and both views", async () => {
    const { pod, editorAuth, adminAuth, publishFunction } = await setup();
    await publishFunction(pod, "tasklist__add-task");
    const shared = await sharePodApp(editorAuth, pod, {
      prefix: "tasklist",
      name: "Task List",
      description: "Task management tools.",
    });
    expect(shared.isOk()).toBe(true);

    const result = await updatePodAppShare(editorAuth, pod, "tasklist", {
      name: "Better Tasks",
      description: "Improved.",
    });
    assert(result.isOk(), "Expected update to succeed");
    expect(result.value).toEqual({
      appName: "tasklist",
      toolsetName: "Better Tasks",
      description: "Improved.",
    });

    const share = await PodAppShareResource.fetchByPodAndAppName(
      editorAuth,
      pod,
      "tasklist"
    );
    assert(share, "Expected a share row");
    const views = await MCPServerViewResource.listByMCPServer(
      adminAuth,
      share.internalMCPServerId
    );
    expect(views).toHaveLength(2);
    for (const view of views) {
      expect(view.name).toBe("Better Tasks");
      expect(view.description).toBe("Improved.");
    }
  });

  it("keeping the same name is not a conflict", async () => {
    const { pod, editorAuth, publishFunction } = await setup();
    await publishFunction(pod, "tasklist__add-task");
    const shared = await sharePodApp(editorAuth, pod, {
      prefix: "tasklist",
      name: "Task List",
      description: "Task management tools.",
    });
    expect(shared.isOk()).toBe(true);

    const result = await updatePodAppShare(editorAuth, pod, "tasklist", {
      name: "Task List",
      description: "Same name, new description.",
    });
    expect(result.isOk()).toBe(true);
  });
});
