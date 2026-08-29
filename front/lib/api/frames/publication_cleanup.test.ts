import { cleanupRetiredFramePublication } from "@app/lib/api/frames/publication_cleanup";
import type { Authenticator } from "@app/lib/auth";
import { distributedLock, distributedUnlock } from "@app/lib/lock";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionInvocationModel } from "@app/lib/resources/storage/models/sandbox_function";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { getFramePublicationBasePath } from "@app/types/api/frame_storage";
import { frameV2ContentType } from "@app/types/files";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    distributedLock: vi.fn(),
    distributedUnlock: vi.fn(),
  };
});

const retiredPublicationId = "retired-publication";

async function setup({
  activePublicationId = "active-publication",
}: {
  activePublicationId?: string;
} = {}): Promise<{
  auth: Authenticator;
  frame: FileResource;
  sandboxFunction: SandboxFunctionResource;
}> {
  const { authenticator: auth } = await createResourceTest({ role: "admin" });
  const frame = await FileFactory.create(auth, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 0,
    status: "ready",
    useCase: "project_context",
    useCaseMetadata: { activePublicationId },
  });
  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      auth,
      {
        frame,
        publicationId: retiredPublicationId,
        functions: [
          {
            name: "list-tasks",
            description: "List tasks.",
            executionMode: "durable",
            defaultStake: "low",
            bundleCode: "export async function run() {}",
            userIdentity: "workspace_user_required",
            inputSchema: { type: "object" },
            outputSchema: { type: "object" },
          },
        ],
      },
      transaction
    )
  );
  const [sandboxFunction] =
    await SandboxFunctionResource.listByFramePublication(auth, {
      frame,
      publicationId: retiredPublicationId,
    });
  if (!sandboxFunction) {
    throw new Error("Expected retired Frame function.");
  }

  return { auth, frame, sandboxFunction };
}

beforeEach(() => {
  vi.mocked(distributedLock).mockResolvedValue("test-frame-publish-lock");
  vi.mocked(distributedUnlock).mockResolvedValue(undefined);
  fileStorageMock.reset();
});

describe("cleanupRetiredFramePublication", () => {
  it("deletes retired artifacts and unreferenced function rows", async () => {
    const { auth, frame } = await setup();
    const deletedPrefixes: string[] = [];
    fileStorageMock.setOnDeleteByPrefix((prefix) =>
      deletedPrefixes.push(prefix)
    );

    await expect(
      cleanupRetiredFramePublication(auth, {
        frameId: frame.sId,
        publicationId: retiredPublicationId,
      })
    ).resolves.toBe(true);

    expect(deletedPrefixes).toEqual([
      getFramePublicationBasePath({
        workspaceId: auth.getNonNullableWorkspace().sId,
        frameId: frame.sId,
        publicationId: retiredPublicationId,
      }),
    ]);
    await expect(
      SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: retiredPublicationId,
      })
    ).resolves.toEqual([]);
  });

  it("retains a publication while an invocation is running", async () => {
    const { auth, frame, sandboxFunction } = await setup();
    await SandboxFunctionInvocationModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      sandboxFunctionId: sandboxFunction.id,
      userId: null,
      origin: "delegated",
      status: "created",
      gcsPath: "sandbox-functions/invocations/running.json",
    });
    const deletedPrefixes: string[] = [];
    fileStorageMock.setOnDeleteByPrefix((prefix) =>
      deletedPrefixes.push(prefix)
    );

    await expect(
      cleanupRetiredFramePublication(auth, {
        frameId: frame.sId,
        publicationId: retiredPublicationId,
      })
    ).resolves.toBe(false);

    expect(deletedPrefixes).toEqual([]);
    await expect(
      SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: retiredPublicationId,
      })
    ).resolves.toHaveLength(1);
  });

  it("cleans artifacts but retains function rows referenced by history", async () => {
    const { auth, frame, sandboxFunction } = await setup();
    await SandboxFunctionInvocationModel.create({
      workspaceId: auth.getNonNullableWorkspace().id,
      sandboxFunctionId: sandboxFunction.id,
      userId: null,
      origin: "delegated",
      status: "succeeded",
      gcsPath: "sandbox-functions/invocations/succeeded.json",
    });

    await expect(
      cleanupRetiredFramePublication(auth, {
        frameId: frame.sId,
        publicationId: retiredPublicationId,
      })
    ).resolves.toBe(true);

    await expect(
      SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: retiredPublicationId,
      })
    ).resolves.toHaveLength(1);
  });

  it("never deletes an active publication", async () => {
    const { auth, frame } = await setup({
      activePublicationId: retiredPublicationId,
    });
    const deletedPrefixes: string[] = [];
    fileStorageMock.setOnDeleteByPrefix((prefix) =>
      deletedPrefixes.push(prefix)
    );

    await expect(
      cleanupRetiredFramePublication(auth, {
        frameId: frame.sId,
        publicationId: retiredPublicationId,
      })
    ).resolves.toBe(true);

    expect(deletedPrefixes).toEqual([]);
    await expect(
      SandboxFunctionResource.listByFramePublication(auth, {
        frame,
        publicationId: retiredPublicationId,
      })
    ).resolves.toHaveLength(1);
  });
});
