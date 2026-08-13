import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { Authenticator } from "@app/lib/auth";
import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import { createHash } from "crypto";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

vi.mock("@app/lib/lock", () => ({
  executeWithLock: async (
    _lockName: string,
    callback: () => Promise<unknown>
  ) => callback(),
}));

const inputSchema: JSONSchema = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: { greeting: { type: "string" } },
  required: ["greeting"],
};

// The publisher must be a pod member so DustFileSystem.forPod grants read access, matching the
// write gate the MCP tool enforces in production.
async function setupPod(): Promise<{
  workspace: LightWorkspaceType;
  space: SpaceResource;
  auth: Authenticator;
}> {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  const space = await SpaceFactory.project(workspace, user.id);
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  assert(auth);

  return { workspace, space, auth };
}

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

describe("publishSandboxFunction", () => {
  it("publishes a new function with one bundle file under the dedicated prefix", async () => {
    const { workspace, space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "export default {};",
        userIdentity: "interactive_workspace_user_required",
        inputSchema,
        outputSchema,
      })
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    const fn = result.value;
    expect(fn.slug).toBe("greeter__greet");
    expect(fn.description).toBe("Greet someone.");
    expect(fn.userIdentity).toBe("interactive_workspace_user_required");
    expect(fn.bundleSha256).toBe(
      createHash("sha256").update("export default {};", "utf8").digest("hex")
    );
    expect(fn.inputSchema).toEqual(inputSchema);
    expect(fn.outputSchema).toEqual(outputSchema);

    expect(buildSandboxFunctionOnSandbox).toHaveBeenCalledWith(auth, {
      space,
      srcSandboxPath: `/files/pod-${space.sId}/Greeter/functions/greet.ts`,
    });

    // The source stays on the mount, so the bundle is the only FileResource.
    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files).toHaveLength(1);
    const bundle = files[0];
    expect(bundle.id).toBe(fn.fileId);
    expect(bundle.contentType).toBe(sandboxFunctionContentType);
    expect(bundle.useCase).toBe("project_context");
    expect(bundle.fileName).toBe("greeter__greet.ts");
    expect(bundle.useCaseMetadata?.spaceId).toBe(space.sId);
    expect(bundle.mountFilePath).toBe(
      `w/${workspace.sId}/pods/${space.sId}/sandbox-functions/greeter__greet.ts`
    );

    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed.map(({ id }) => id)).toEqual([fn.id]);
  });

  it("refuses a workspace member outside the pod even when app sharing is enabled", async () => {
    // App sharing grants function invocation only — publishing stays pod-member territory.
    const { workspace, space, auth } = await setupPod();
    await ProjectMetadataResource.makeNew(auth, space, {
      description: null,
      appSharingEnabled: true,
    });
    const outsider = await UserFactory.basic();
    await MembershipFactory.associate(workspace, outsider, { role: "user" });
    const outsiderAuth = await Authenticator.fromUserIdAndWorkspaceId(
      outsider.sId,
      workspace.sId
    );

    const result = await publishSandboxFunction(outsiderAuth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
    });

    expect(result.isErr()).toBe(true);
    expect(buildSandboxFunctionOnSandbox).not.toHaveBeenCalled();
  });

  it("publishes as durable unless the caller asks for fast", async () => {
    const { space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "export default {};",
        userIdentity: "optional",
        inputSchema,
        outputSchema,
      })
    );

    const durable = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
    });
    expect(durable.isOk()).toBe(true);
    if (durable.isErr()) {
      return;
    }
    expect(durable.value.executionMode).toBe("durable");

    const fast = await publishSandboxFunction(auth, {
      space,
      slug: "read-state",
      description: "Read pod state.",
      path: `pod-${space.sId}/Greeter/functions/read-state.ts`,
      executionMode: "fast",
    });
    expect(fast.isOk()).toBe(true);
    if (fast.isErr()) {
      return;
    }
    expect(fast.value.executionMode).toBe("fast");
  });

  it("returns a re-publish that does not restate the execution mode to the default", async () => {
    const { space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "export default {};",
        userIdentity: "optional",
        inputSchema,
        outputSchema,
      })
    );

    const created = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
      executionMode: "fast",
    });
    expect(created.isOk()).toBe(true);

    // A publish that added a tool call and forgot to restate the mode must not stay fast.
    const republished = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone, again.",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
    });
    expect(republished.isOk()).toBe(true);
    if (republished.isErr()) {
      return;
    }
    expect(republished.value.executionMode).toBe("durable");

    const restated = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone, again.",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
      executionMode: "fast",
    });
    expect(restated.isOk()).toBe(true);
    if (restated.isErr()) {
      return;
    }
    expect(restated.value.executionMode).toBe("fast");
  });

  it("overwrites the bundle in place on re-publish, keeping one row and the same file", async () => {
    const { workspace, space, auth } = await setupPod();

    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "v1",
        userIdentity: "workspace_user_required",
        inputSchema,
        outputSchema,
      })
    );
    const first = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "v1",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
    });
    expect(first.isOk()).toBe(true);
    if (first.isErr()) {
      return;
    }
    const firstFileId = first.value.fileId;
    const [firstBundle] = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    const firstVersion = firstBundle.version;

    const newOutputSchema: JSONSchema = {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    };
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "v2",
        userIdentity: "optional",
        inputSchema,
        outputSchema: newOutputSchema,
      })
    );
    const second = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "v2",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
    });
    expect(second.isOk()).toBe(true);
    if (second.isErr()) {
      return;
    }

    expect(second.value.id).toBe(first.value.id);
    expect(second.value.description).toBe("v2");
    expect(second.value.userIdentity).toBe("optional");
    // The hash follows the bundle: a republish must restamp it, or warm servers holding the old
    // import would keep matching and serve stale code.
    expect(second.value.bundleSha256).toBe(
      createHash("sha256").update("v2", "utf8").digest("hex")
    );
    expect(second.value.outputSchema).toEqual(newOutputSchema);
    // The bundle file is reused in place, not replaced: same row, canonical mount path retained, and
    // its version bumped by the re-upload.
    expect(second.value.fileId).toBe(firstFileId);

    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed).toHaveLength(1);
    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files.map((file) => file.id)).toEqual([firstFileId]);
    expect(files[0].mountFilePath).toBe(
      `w/${workspace.sId}/pods/${space.sId}/sandbox-functions/greeter__greet.ts`
    );
    expect(files[0].version).toBeGreaterThan(firstVersion ?? 0);
  });

  it("keeps two apps that publish the same name as separate functions", async () => {
    const { workspace, space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "export default {};",
        userIdentity: "optional",
        inputSchema,
        outputSchema,
      })
    );

    const taskList = await publishSandboxFunction(auth, {
      space,
      slug: "refresh",
      description: "Refresh the task list.",
      path: `pod-${space.sId}/TaskList/functions/refresh.ts`,
    });
    const inbox = await publishSandboxFunction(auth, {
      space,
      slug: "refresh",
      description: "Refresh the inbox.",
      path: `pod-${space.sId}/Inbox/functions/refresh.ts`,
    });

    expect(taskList.isOk()).toBe(true);
    expect(inbox.isOk()).toBe(true);
    if (taskList.isErr() || inbox.isErr()) {
      return;
    }

    // The second publish must not have replaced the first: two rows, two slugs, two bundles.
    expect(taskList.value.slug).toBe("tasklist__refresh");
    expect(inbox.value.slug).toBe("inbox__refresh");
    expect(inbox.value.id).not.toBe(taskList.value.id);
    expect(taskList.value.description).toBe("Refresh the task list.");
    expect(inbox.value.description).toBe("Refresh the inbox.");

    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed).toHaveLength(2);

    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files.map((file) => file.mountFilePath).sort()).toEqual([
      `w/${workspace.sId}/pods/${space.sId}/sandbox-functions/inbox__refresh.ts`,
      `w/${workspace.sId}/pods/${space.sId}/sandbox-functions/tasklist__refresh.ts`,
    ]);
  });

  it("publishes a source at the pod root under its bare name", async () => {
    const { workspace, space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "export default {};",
        userIdentity: "optional",
        inputSchema,
        outputSchema,
      })
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/greet.ts`,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.slug).toBe("greet");

    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files[0].mountFilePath).toBe(
      `w/${workspace.sId}/pods/${space.sId}/sandbox-functions/greet.ts`
    );
  });

  it("rejects a path that escapes the pod mount", async () => {
    const { space, auth } = await setupPod();

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/../escape.ts`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("invalid_path");
    expect(buildSandboxFunctionOnSandbox).not.toHaveBeenCalled();
  });

  it("surfaces a sandbox_unavailable build failure", async () => {
    const { workspace, space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("sandbox_unavailable", "sandbox down"))
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("sandbox_unavailable");

    // No file is created when the build never succeeds.
    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files).toHaveLength(0);
  });

  it("passes a build failure through and creates no file", async () => {
    const { workspace, space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("build_failed", "boom"))
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/Greeter/functions/greet.ts`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("build_failed");

    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files).toHaveLength(0);
    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed).toHaveLength(0);
  });
});
