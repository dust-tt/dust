import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionMCPActionResource } from "@app/lib/resources/sandbox_function_mcp_action_resource";
import type { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { SandboxFunctionInvocationModel } from "@app/lib/resources/storage/models/sandbox_function";
import { FRAME_FUNCTION_INVOCATION_RETENTION_MS } from "@app/temporal/data_retention/config";
import { createTestFrameFunction } from "@app/tests/utils/FrameFunctionFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MCPServerViewFactory } from "@app/tests/utils/MCPServerViewFactory";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { RemoteMCPServerFactory } from "@app/tests/utils/RemoteMCPServerFactory";
import { SandboxFunctionMCPActionFactory } from "@app/tests/utils/SandboxFunctionMCPActionFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { ModelId } from "@app/types/shared/model_id";
import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { purgeExpiredFrameFunctionInvocationsActivity } from "./activities";

vi.mock("@temporalio/activity", () => ({
  heartbeat: vi.fn(),
}));

const RETENTION_DAYS = FRAME_FUNCTION_INVOCATION_RETENTION_MS / ONE_DAY_MS;

async function setupFrameFunction() {
  const { authenticator, workspace, globalSpace } = await createResourceTest({
    role: "admin",
  });
  const podSpace = await SpaceFactory.project(workspace);
  const { sandboxFunction } = await createTestFrameFunction(authenticator, {
    space: podSpace,
  });

  return { authenticator, globalSpace, sandboxFunction, workspace };
}

// Retention keys off `createdAt`, which `makeNew` sets to now. Tests own the age of their rows,
// and no Resource API exposes it.
async function createInvocation(
  auth: Authenticator,
  sandboxFunction: SandboxFunctionResource,
  daysAgo: number
): Promise<SandboxFunctionInvocationResource> {
  const invocation = await SandboxFunctionInvocationResource.makeNew(auth, {
    sandboxFunction,
    input: { message: "hello" },
  });
  await SandboxFunctionInvocationModel.update(
    { createdAt: new Date(Date.now() - daysAgo * ONE_DAY_MS) },
    {
      where: { id: invocation.id, workspaceId: invocation.workspaceId },
      silent: true,
    }
  );

  return invocation;
}

// The workspace-isolation hook rejects an unscoped query, so callers that span workspaces ask
// one workspace at a time.
async function fetchInvocationModelIds(
  workspaceModelId: ModelId
): Promise<ModelId[]> {
  const rows = await SandboxFunctionInvocationModel.findAll({
    attributes: ["id"],
    where: { workspaceId: workspaceModelId },
    order: [["id", "ASC"]],
  });

  return rows.map((row) => row.id);
}

describe("purgeExpiredFrameFunctionInvocationsActivity", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("deletes invocations past the retention window and keeps recent ones", async () => {
    const { authenticator, sandboxFunction, workspace } =
      await setupFrameFunction();
    const expired = await createInvocation(
      authenticator,
      sandboxFunction,
      RETENTION_DAYS + 1
    );
    const recent = await createInvocation(
      authenticator,
      sandboxFunction,
      RETENTION_DAYS - 1
    );

    const result = await purgeExpiredFrameFunctionInvocationsActivity({
      afterModelId: null,
    });

    expect(result.deletedInvocationCount).toBe(1);
    expect(result.nextAfterModelId).toBeNull();
    expect(await fetchInvocationModelIds(workspace.id)).toEqual([recent.id]);
    expect(fileStorageMock.getObject(expired.gcsPath)).toBeUndefined();
    expect(fileStorageMock.getObject(recent.gcsPath)).toBeDefined();
  });

  it("deletes the MCP actions of an expired invocation", async () => {
    const { authenticator, globalSpace, sandboxFunction, workspace } =
      await setupFrameFunction();
    const expired = await createInvocation(
      authenticator,
      sandboxFunction,
      RETENTION_DAYS + 1
    );
    const server = await RemoteMCPServerFactory.create(workspace);
    const mcpServerView = await MCPServerViewFactory.create(
      workspace,
      server.sId,
      globalSpace
    );
    const action = await SandboxFunctionMCPActionFactory.create(authenticator, {
      invocation: expired,
      mcpServerView,
    });

    const result = await purgeExpiredFrameFunctionInvocationsActivity({
      afterModelId: null,
    });

    expect(result.deletedMCPActionCount).toBe(1);
    expect(
      await SandboxFunctionMCPActionResource.fetchById(
        authenticator,
        action.sId
      )
    ).toBeNull();
    expect(await fetchInvocationModelIds(workspace.id)).toEqual([]);
  });

  it("deletes nothing when every invocation is within the retention window", async () => {
    const { authenticator, sandboxFunction, workspace } =
      await setupFrameFunction();
    const recent = await createInvocation(
      authenticator,
      sandboxFunction,
      RETENTION_DAYS - 1
    );

    const result = await purgeExpiredFrameFunctionInvocationsActivity({
      afterModelId: null,
    });

    expect(result.deletedInvocationCount).toBe(0);
    expect(result.nextAfterModelId).toBeNull();
    expect(await fetchInvocationModelIds(workspace.id)).toEqual([recent.id]);
  });
});

describe("SandboxFunctionInvocationResource.dangerouslyDeleteExpiredBatch", () => {
  beforeEach(() => {
    fileStorageMock.reset();
  });

  it("resumes from the returned cursor across batches", async () => {
    const { authenticator, sandboxFunction, workspace } =
      await setupFrameFunction();
    const first = await createInvocation(authenticator, sandboxFunction, 30);
    const second = await createInvocation(authenticator, sandboxFunction, 29);
    const third = await createInvocation(authenticator, sandboxFunction, 28);
    const cutoffDate = new Date(Date.now() - ONE_DAY_MS);

    const firstBatch =
      await SandboxFunctionInvocationResource.dangerouslyDeleteExpiredBatch({
        afterModelId: null,
        batchSize: 2,
        cutoffDate,
      });

    expect(firstBatch.deletedInvocationCount).toBe(2);
    expect(firstBatch.nextAfterModelId).toBe(second.id);
    expect(await fetchInvocationModelIds(workspace.id)).toEqual([third.id]);

    const secondBatch =
      await SandboxFunctionInvocationResource.dangerouslyDeleteExpiredBatch({
        afterModelId: firstBatch.nextAfterModelId,
        batchSize: 2,
        cutoffDate,
      });

    expect(secondBatch.deletedInvocationCount).toBe(1);
    expect(secondBatch.nextAfterModelId).toBeNull();
    expect(await fetchInvocationModelIds(workspace.id)).toEqual([]);
    expect(fileStorageMock.getObject(first.gcsPath)).toBeUndefined();
  });

  it("stops the sweep at the first row inside the retention window", async () => {
    const { authenticator, sandboxFunction, workspace } =
      await setupFrameFunction();
    const expired = await createInvocation(authenticator, sandboxFunction, 30);
    const recent = await createInvocation(authenticator, sandboxFunction, 0);
    const olderThanRecent = await createInvocation(
      authenticator,
      sandboxFunction,
      30
    );

    const batch =
      await SandboxFunctionInvocationResource.dangerouslyDeleteExpiredBatch({
        afterModelId: null,
        batchSize: 3,
        cutoffDate: new Date(Date.now() - ONE_DAY_MS),
      });

    expect(batch.deletedInvocationCount).toBe(2);
    expect(batch.scannedCount).toBe(3);
    expect(batch.nextAfterModelId).toBeNull();
    expect(await fetchInvocationModelIds(workspace.id)).toEqual([recent.id]);
    expect(fileStorageMock.getObject(expired.gcsPath)).toBeUndefined();
    expect(fileStorageMock.getObject(olderThanRecent.gcsPath)).toBeUndefined();
  });

  it("deletes expired invocations from every workspace in one batch", async () => {
    const first = await setupFrameFunction();
    const second = await setupFrameFunction();
    await createInvocation(first.authenticator, first.sandboxFunction, 30);
    await createInvocation(second.authenticator, second.sandboxFunction, 30);

    const batch =
      await SandboxFunctionInvocationResource.dangerouslyDeleteExpiredBatch({
        afterModelId: null,
        batchSize: 10,
        cutoffDate: new Date(Date.now() - ONE_DAY_MS),
      });

    expect(batch.deletedInvocationCount).toBe(2);
    expect(await fetchInvocationModelIds(first.workspace.id)).toEqual([]);
    expect(await fetchInvocationModelIds(second.workspace.id)).toEqual([]);
  });
});
