import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockExecuteWithLock,
  mockGetSandboxImage,
  mockGetSandboxProvider,
  mockProviderCreate,
  mockProviderDestroy,
  mockRevokeAllExecTokensForSandbox,
} = vi.hoisted(() => ({
  mockExecuteWithLock: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockGetSandboxProvider: vi.fn(),
  mockProviderCreate: vi.fn(),
  mockProviderDestroy: vi.fn(),
  mockRevokeAllExecTokensForSandbox: vi.fn(),
}));

vi.mock("@app/lib/api/sandbox", () => ({
  getSandboxProvider: mockGetSandboxProvider,
}));

vi.mock("@app/lib/api/sandbox/access_tokens", () => ({
  revokeAllExecTokensForSandbox: mockRevokeAllExecTokensForSandbox,
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/lock", () => ({
  executeWithLock: mockExecuteWithLock,
  executeWithLockResult: mockExecuteWithLock,
}));

import { deleteFrameV2Package } from "@app/lib/api/frames/delete";
import { FileResource } from "@app/lib/resources/file_resource";
import { FrameResource } from "@app/lib/resources/frame_resource";
import {
  FrameGoneError,
  FrameSandboxAdapter,
} from "@app/lib/resources/frame_sandbox_adapter";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameV2ContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { Err, Ok } from "@app/types/shared/result";

function createDeferred() {
  let resolvePromise: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  if (!resolvePromise) {
    throw new Error("Deferred promise resolver was not initialized.");
  }

  return { promise, resolve: resolvePromise };
}

describe("FrameSandboxAdapter", () => {
  const lockTails = new Map<string, Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    lockTails.clear();
    mockExecuteWithLock.mockImplementation(
      async (key: string, fn: () => Promise<unknown>) => {
        const previous = lockTails.get(key) ?? Promise.resolve();
        let release: (() => void) | undefined;
        const current = new Promise<void>((resolve) => {
          release = resolve;
        });
        const tail = previous.then(() => current);
        lockTails.set(key, tail);

        await previous;
        try {
          return await fn();
        } finally {
          release?.();
          if (lockTails.get(key) === tail) {
            lockTails.delete(key);
          }
        }
      }
    );
    mockGetSandboxImage.mockReturnValue(
      new Ok({
        toCreateConfig: () => ({
          imageId: { imageName: "test-image", tag: "0.0.1" },
          envVars: {},
          network: { egress: "restricted" },
          resources: { cpu: 1, memoryMB: 512 },
        }),
      })
    );
    mockProviderCreate.mockResolvedValue(
      new Ok({ providerId: "frame-provider" })
    );
    mockProviderDestroy.mockResolvedValue(new Ok(undefined));
    mockGetSandboxProvider.mockReturnValue({
      create: mockProviderCreate,
      destroy: mockProviderDestroy,
    });
    mockRevokeAllExecTokensForSandbox.mockResolvedValue(undefined);
  });

  it("owns one sandbox per stable Frame identity", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const podEnvResult = await SandboxEnvVarResource.makeNew(
      auth,
      { kind: "pod", pod },
      { name: "RUNTIME_TOKEN", value: "pod-value" }
    );
    expect(podEnvResult.isOk()).toBe(true);

    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 1,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });

    const first = await FrameSandboxAdapter.ensureSandboxActive(auth, frame);
    const second = await FrameSandboxAdapter.ensureSandboxActive(auth, frame);
    if (first.isErr()) {
      throw first.error;
    }
    if (second.isErr()) {
      throw second.error;
    }

    expect(first.value.scope).toEqual({ spaceId: pod.sId });
    expect(second.value.sandbox.id).toBe(first.value.sandbox.id);
    expect(mockProviderCreate).toHaveBeenCalledTimes(1);
    expect(mockProviderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        envVars: expect.objectContaining({
          DST_RUNTIME_TOKEN: "pod-value",
          FRAME_ID: frame.sId,
          WORKSPACE_ID: workspace.sId,
        }),
      }),
      { workspaceId: workspace.sId }
    );
    expect(mockProviderCreate.mock.calls[0]?.[0].envVars).not.toHaveProperty(
      "SPACE_ID"
    );
    expect(await FrameSandboxAdapter.fetchSandbox(auth, frame)).not.toBeNull();
  });

  it("deletes the owned sandbox before deleting the Frame", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 1,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });
    const sandboxResult = await FrameSandboxAdapter.ensureSandboxActive(
      auth,
      frame
    );
    if (sandboxResult.isErr()) {
      throw sandboxResult.error;
    }
    const sandboxModelId = sandboxResult.value.sandbox.id;
    const deletedPrefixes: string[] = [];
    fileStorageMock.setOnDeleteByPrefix((prefix) =>
      deletedPrefixes.push(prefix)
    );

    const failedDeleteResult = await deleteFrameV2Package(auth, {
      deleteSource: async () => new Err(new Error("source unavailable")),
      frame,
    });

    expect(failedDeleteResult.isErr()).toBe(true);
    expect(await FrameSandboxAdapter.fetchSandbox(auth, frame)).not.toBeNull();
    expect(await FileResource.fetchById(auth, frame.sId)).not.toBeNull();
    expect(mockProviderDestroy).not.toHaveBeenCalled();
    expect(deletedPrefixes).toEqual([]);

    const deleteResult = await deleteFrameV2Package(auth, {
      deleteSource: async () => new Ok(undefined),
      frame,
    });

    expect(
      deleteResult.isOk(),
      deleteResult.isErr() ? deleteResult.error.message : ""
    ).toBe(true);
    expect(mockProviderDestroy).toHaveBeenCalledWith("frame-provider", {
      workspaceId: workspace.sId,
    });
    expect(await FrameSandboxAdapter.fetchSandbox(auth, frame)).toBeNull();
    expect(
      await SandboxResource.fetchByModelIdForWorkspace(auth, sandboxModelId)
    ).toBeNull();
    expect(deletedPrefixes).toContain(
      `w/${workspace.sId}/frames/${frame.sId}/`
    );
  });

  it("keeps sandbox creation blocked until Frame deletion completes", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const frame = await FileFactory.create(auth, null, {
      contentType: frameV2ContentType,
      fileName: "manifest.json",
      fileSize: 1,
      status: "created",
      useCase: "project_context",
      useCaseMetadata: { spaceId: pod.sId },
    });
    const sandboxResult = await FrameSandboxAdapter.ensureSandboxActive(
      auth,
      frame
    );
    if (sandboxResult.isErr()) {
      throw sandboxResult.error;
    }
    await withTransaction((transaction) =>
      SandboxFunctionResource.createForFramePublication(
        auth,
        {
          frame,
          publicationId: "frame-delete-race",
          functions: [
            {
              name: "delete-task",
              description: "Delete a task.",
              userIdentity: "workspace_user_required",
              executionMode: "durable",
              defaultStake: "low",
              bundleCode: "export default async function run() {}",
              inputSchema: { type: "object" },
              outputSchema: { type: "object" },
            },
          ],
        },
        transaction
      )
    );

    const deletionReachedFunctionCleanup = createDeferred();
    const releaseFunctionCleanup = createDeferred();
    const deleteInvocations =
      SandboxFunctionInvocationResource.deleteAllForSandboxFunctionModelIds.bind(
        SandboxFunctionInvocationResource
      );
    const deleteInvocationsSpy = vi
      .spyOn(
        SandboxFunctionInvocationResource,
        "deleteAllForSandboxFunctionModelIds"
      )
      .mockImplementation(async (...args) => {
        deletionReachedFunctionCleanup.resolve();
        await releaseFunctionCleanup.promise;
        return deleteInvocations(...args);
      });

    try {
      mockExecuteWithLock.mockClear();
      const deletionPromise = deleteFrameV2Package(auth, {
        deleteSource: async () => new Ok(undefined),
        frame,
      });
      await deletionReachedFunctionCleanup.promise;
      expect(await FrameSandboxAdapter.fetchSandbox(auth, frame)).toBeNull();

      const ensurePromise = FrameSandboxAdapter.ensureSandboxActive(
        auth,
        frame
      );
      const lifecycleLockKey = `sandbox:lifecycle:${frame.sId}`;
      await vi.waitFor(() => {
        expect(
          mockExecuteWithLock.mock.calls.filter(
            ([key]) => key === lifecycleLockKey
          )
        ).toHaveLength(2);
      });
      expect(mockProviderCreate).toHaveBeenCalledTimes(1);

      releaseFunctionCleanup.resolve();
      const [deletionResult, ensureResult] = await Promise.all([
        deletionPromise,
        ensurePromise,
      ]);

      expect(
        deletionResult.isOk(),
        deletionResult.isErr() ? deletionResult.error.message : ""
      ).toBe(true);
      expect(ensureResult.isErr()).toBe(true);
      if (ensureResult.isErr()) {
        expect(ensureResult.error).toBeInstanceOf(FrameGoneError);
      }
      expect(await FileResource.fetchById(auth, frame.sId)).toBeNull();
      expect(await FrameSandboxAdapter.fetchSandbox(auth, frame)).toBeNull();
      expect(mockProviderCreate).toHaveBeenCalledTimes(1);
    } finally {
      releaseFunctionCleanup.resolve();
      deleteInvocationsSpy.mockRestore();
    }
  });

  it("deletes Frame sandboxes during a workspace scrub", async () => {
    const { authenticator: auth, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const frames = await Promise.all(
      ["first", "second"].map((name) =>
        FileFactory.create(auth, null, {
          contentType: frameV2ContentType,
          fileName: `${name}/manifest.json`,
          fileSize: 1,
          status: "created",
          useCase: "project_context",
          useCaseMetadata: { spaceId: pod.sId },
        })
      )
    );
    const sandboxModelIds: ModelId[] = [];
    const deletedPrefixes: string[] = [];
    fileStorageMock.setOnDeleteByPrefix((prefix) =>
      deletedPrefixes.push(prefix)
    );
    for (const frame of frames) {
      const sandboxResult = await FrameSandboxAdapter.ensureSandboxActive(
        auth,
        frame
      );
      if (sandboxResult.isErr()) {
        throw sandboxResult.error;
      }
      sandboxModelIds.push(sandboxResult.value.sandbox.id);
    }

    await FrameResource.deleteAllOwnedResourcesForWorkspace(auth);
    await FileResource.deleteAllForWorkspace(auth);

    expect(mockProviderDestroy).toHaveBeenCalledTimes(2);
    for (const frame of frames) {
      expect(await FrameSandboxAdapter.fetchSandbox(auth, frame)).toBeNull();
    }
    for (const sandboxModelId of sandboxModelIds) {
      expect(
        await SandboxResource.fetchByModelIdForWorkspace(auth, sandboxModelId)
      ).toBeNull();
    }
    expect(deletedPrefixes).toContain(`w/${workspace.sId}/frames/`);
  });
});
