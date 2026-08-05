import { unpublishSandboxFunction } from "@app/lib/api/sandbox_functions/unpublish_sandbox_function";
import { getPrivateUploadBucket } from "@app/lib/file_storage";
import { LockAcquisitionTimeoutError } from "@app/lib/lock";
import { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionInvocationModel } from "@app/lib/resources/storage/models/sandbox_function";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

const executeWithLockMock = vi.hoisted(() =>
  vi.fn(async (_lockName: string, callback: () => Promise<unknown>) =>
    callback()
  )
);

vi.mock("@app/lib/lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/lock")>();
  return { ...actual, executeWithLock: executeWithLockMock };
});

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

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
});

describe("unpublishSandboxFunction", () => {
  it("hard-deletes one pod function and its history while preserving its source and other pods", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const otherPod = await SpaceFactory.project(workspace);
    const bundle = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "greet.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });
    await bundle.uploadContent(authenticator, "export default {};");
    const sandboxFunction = await SandboxFunctionResource.makeNew(
      authenticator,
      {
        space: pod,
        file: bundle,
        slug: "greet",
        description: "Greet someone.",
        inputSchema,
        outputSchema,
      }
    );
    const invocation = await SandboxFunctionInvocationResource.makeNew(
      authenticator,
      { sandboxFunction, input: { name: "Ada" } }
    );

    const otherBundle = await FileFactory.create(authenticator, null, {
      contentType: sandboxFunctionContentType,
      fileName: "greet.ts",
      fileSize: 100,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: otherPod.sId },
    });
    const otherFunction = await SandboxFunctionResource.makeNew(authenticator, {
      space: otherPod,
      file: otherBundle,
      slug: "greet",
      description: "Greet from another pod.",
      inputSchema,
      outputSchema,
    });

    const sourcePath = `w/${workspace.sId}/pods/${pod.sId}/files/greet.ts`;
    await getPrivateUploadBucket().uploadRawContentToBucket({
      content: "export const source = true;",
      contentType: "text/plain",
      filePath: sourcePath,
    });
    expect(fileStorageMock.getObject(invocation.gcsPath)).toBeDefined();

    const result = await unpublishSandboxFunction(authenticator, {
      space: pod,
      slug: "greet",
    });

    expect(result.isOk()).toBe(true);
    expect(result.isOk() ? result.value : null).toEqual({ slug: "greet" });
    expect(executeWithLockMock).toHaveBeenNthCalledWith(
      1,
      `sandbox_function:mutation:${workspace.sId}:${pod.sId}:greet`,
      expect.any(Function),
      30_000,
      { lockTtlMs: 300_000 }
    );
    expect(executeWithLockMock).toHaveBeenNthCalledWith(
      2,
      `sandbox_function:publish:${sandboxFunction.sId}`,
      expect.any(Function),
      30_000,
      { lockTtlMs: 300_000 }
    );
    await expect(
      SandboxFunctionResource.fetchById(authenticator, sandboxFunction.sId)
    ).resolves.toBeNull();
    await expect(
      FileResource.fetchById(authenticator, bundle.sId)
    ).resolves.toBeNull();
    await expect(
      SandboxFunctionInvocationModel.findOne({
        where: { id: invocation.id, workspaceId: workspace.id },
      })
    ).resolves.toBeNull();
    expect(fileStorageMock.getObject(invocation.gcsPath)).toBeUndefined();
    expect(fileStorageMock.getObject(sourcePath)).toBe(
      "export const source = true;"
    );
    await expect(
      SandboxFunctionResource.fetchById(authenticator, otherFunction.sId)
    ).resolves.toMatchObject({ id: otherFunction.id });
  });

  it("returns not_found when the slug is not published in the pod", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);

    const result = await unpublishSandboxFunction(authenticator, {
      space: pod,
      slug: "missing",
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error.code : null).toBe("not_found");
  });

  it("returns a retryable conflict when the mutation lock times out", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    executeWithLockMock.mockRejectedValueOnce(
      new LockAcquisitionTimeoutError("sandbox_function:mutation:test")
    );

    const result = await unpublishSandboxFunction(authenticator, {
      space: pod,
      slug: "greet",
    });

    expect(result.isErr()).toBe(true);
    expect(result.isErr() ? result.error.code : null).toBe("publish_conflict");
  });
});
