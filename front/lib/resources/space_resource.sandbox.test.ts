import { describe, expect, it, vi } from "vitest";

const { mockExecuteWithLock, mockGetSandboxImage, mockGetSandboxProvider } =
  vi.hoisted(() => ({
    mockExecuteWithLock: vi.fn(),
    mockGetSandboxImage: vi.fn(),
    mockGetSandboxProvider: vi.fn(),
  }));

vi.mock("@app/lib/api/sandbox", () => ({
  getSandboxProvider: mockGetSandboxProvider,
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/lock", () => ({
  executeWithLock: mockExecuteWithLock,
}));

import { PodSandboxAdapter } from "@app/lib/resources/pod_sandbox_adapter";
import {
  SandboxModel,
  SandboxOwnerModel,
} from "@app/lib/resources/storage/models/sandbox";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { Ok } from "@app/types/shared/result";

describe("PodSandboxAdapter", () => {
  it("creates a sandbox and pod ownership row", async () => {
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
    mockGetSandboxProvider.mockReturnValue({
      create: vi.fn().mockResolvedValue(new Ok({ providerId: "provider-id" })),
    });
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);

    const result = await PodSandboxAdapter.ensureSandboxActive(
      authenticator,
      pod
    );

    expect(result.isOk()).toBe(true);
    const sandbox = result.isOk() ? result.value.sandbox : null;
    expect(sandbox).not.toBeNull();
    await expect(
      SandboxOwnerModel.count({
        where: {
          sandboxId: sandbox?.id,
          spaceId: pod.id,
          workspaceId: workspace.id,
        },
      })
    ).resolves.toBe(1);
  });

  it("deleteSandbox deletes the owner link and sandbox row", async () => {
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
    mockGetSandboxProvider.mockReturnValue({
      create: vi.fn().mockResolvedValue(new Ok({ providerId: "provider-id" })),
      destroy: vi.fn().mockResolvedValue(new Ok(undefined)),
    });
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const pod = await SpaceFactory.project(workspace);
    const createResult = await PodSandboxAdapter.ensureSandboxActive(
      authenticator,
      pod
    );
    if (createResult.isErr()) {
      throw createResult.error;
    }

    const deleteResult = await PodSandboxAdapter.deleteSandbox(
      authenticator,
      pod
    );

    expect(deleteResult.isOk()).toBe(true);
    const where = {
      sandboxId: createResult.value.sandbox.id,
      spaceId: pod.id,
      workspaceId: workspace.id,
    };
    await expect(SandboxOwnerModel.count({ where })).resolves.toBe(0);
    await expect(
      SandboxModel.count({
        where: {
          id: createResult.value.sandbox.id,
          workspaceId: workspace.id,
        },
      })
    ).resolves.toBe(0);
  });
});
