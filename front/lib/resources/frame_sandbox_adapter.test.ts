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
}));

import { FileResource } from "@app/lib/resources/file_resource";
import { FrameSandboxAdapter } from "@app/lib/resources/frame_sandbox_adapter";
import { SandboxEnvVarResource } from "@app/lib/resources/sandbox_env_var_resource";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameV2ContentType } from "@app/types/files";
import type { ModelId } from "@app/types/shared/model_id";
import { Ok } from "@app/types/shared/result";

describe("FrameSandboxAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
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

    const deleteResult = await frame.delete(auth);

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
  });
});
