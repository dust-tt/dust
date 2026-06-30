import { ensurePodSandboxReady } from "@app/lib/api/sandbox/lifecycle";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

async function mockReadySandbox(auth: Authenticator): Promise<SandboxResource> {
  const sandbox = await SandboxResource.makeNew(auth, {
    providerId: "test-provider-id",
    status: "running",
    baseImage: "dust-base",
    version: "0.0.0-test",
  });
  vi.mocked(ensurePodSandboxReady).mockResolvedValue(
    new Ok({ sandbox, freshlyCreated: false })
  );

  return sandbox;
}

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

describe("publishSandboxFunction", () => {
  it("publishes a new function with one bundle file under the dedicated prefix", async () => {
    const { workspace, space, auth } = await setupPod();
    const sandbox = await mockReadySandbox(auth);
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({ bundleCode: "export default {};", inputSchema, outputSchema })
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
    const fn = result.value;
    expect(fn.slug).toBe("greet");
    expect(fn.description).toBe("Greet someone.");
    expect(fn.inputSchema).toEqual(inputSchema);
    expect(fn.outputSchema).toEqual(outputSchema);

    expect(buildSandboxFunctionOnSandbox).toHaveBeenCalledWith(auth, {
      sandbox,
      srcSandboxPath: `/files/pod-${space.sId}/greet.ts`,
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
    expect(bundle.fileName).toBe("greet.ts");
    expect(bundle.useCaseMetadata?.spaceId).toBe(space.sId);
    expect(bundle.mountFilePath).toBe(
      `w/${workspace.sId}/pods/${space.sId}/sandbox_functions/greet.ts`
    );

    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed.map(({ id }) => id)).toEqual([fn.id]);
  });

  it("overwrites the bundle in place on re-publish, keeping one row and the same file", async () => {
    const { workspace, space, auth } = await setupPod();
    await mockReadySandbox(auth);

    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({ bundleCode: "v1", inputSchema, outputSchema })
    );
    const first = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "v1",
      path: `pod-${space.sId}/greet.ts`,
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
      new Ok({ bundleCode: "v2", inputSchema, outputSchema: newOutputSchema })
    );
    const second = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "v2",
      path: `pod-${space.sId}/greet.ts`,
    });
    expect(second.isOk()).toBe(true);
    if (second.isErr()) {
      return;
    }

    expect(second.value.id).toBe(first.value.id);
    expect(second.value.description).toBe("v2");
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
      `w/${workspace.sId}/pods/${space.sId}/sandbox_functions/greet.ts`
    );
    expect(files[0].version).toBeGreaterThan(firstVersion ?? 0);
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
    expect(ensurePodSandboxReady).not.toHaveBeenCalled();
    expect(buildSandboxFunctionOnSandbox).not.toHaveBeenCalled();
  });

  it("maps a sandbox failure to sandbox_unavailable", async () => {
    const { space, auth } = await setupPod();
    vi.mocked(ensurePodSandboxReady).mockResolvedValue(
      new Err(new Error("sandbox down"))
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/greet.ts`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("sandbox_unavailable");
    expect(buildSandboxFunctionOnSandbox).not.toHaveBeenCalled();
  });

  it("passes a build failure through and creates no file", async () => {
    const { workspace, space, auth } = await setupPod();
    await mockReadySandbox(auth);
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("build_failed", "boom"))
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/greet.ts`,
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
