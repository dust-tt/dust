import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { ensureMCPServerViewsForWorkspaceBatchActivity } from "@app/temporal/ensure_mcp_server_views/activities";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { describe, expect, it, vi } from "vitest";

vi.mock("@temporalio/activity", () => ({
  Context: {
    current: vi.fn(() => ({
      heartbeat: vi.fn(),
    })),
  },
}));

describe("ensureMCPServerViewsForWorkspaceBatchActivity", () => {
  it("fetches and processes workspaces after the checkpoint without returning workspace data", async () => {
    const checkpointWorkspace = await WorkspaceFactory.basic();
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    const result = await ensureMCPServerViewsForWorkspaceBatchActivity({
      lastProcessedWorkspaceModelId: checkpointWorkspace.id,
      batchSize: 1,
      concurrency: 1,
    });

    expect(result).toMatchObject({
      scannedWorkspacesCount: 1,
      processedWorkspacesCount: 1,
      failuresCount: 0,
      failureSamples: [],
      lastScannedWorkspaceModelId: workspace.id,
      hasMore: true,
    });
    expect(result.createdViewsCount).toBeGreaterThan(0);
    expect(result).not.toHaveProperty("workspaces");
  });

  it("creates views idempotently in a batch", async () => {
    const checkpointWorkspace = await WorkspaceFactory.basic();
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    const firstRun = await ensureMCPServerViewsForWorkspaceBatchActivity({
      lastProcessedWorkspaceModelId: checkpointWorkspace.id,
      batchSize: 1,
      concurrency: 1,
    });

    expect(firstRun.processedWorkspacesCount).toBe(1);
    expect(firstRun.failuresCount).toBe(0);
    expect(firstRun.failureSamples).toEqual([]);
    expect(firstRun.createdViewsCount).toBeGreaterThan(0);

    const commonUtilitiesServerId = autoInternalMCPServerNameToSId({
      name: "common_utilities",
      workspaceId: workspace.id,
    });
    await expect(
      MCPServerViewResource.getMCPServerViewForSystemSpace(
        auth,
        commonUtilitiesServerId
      )
    ).resolves.not.toBeNull();
    await expect(
      MCPServerViewResource.getMCPServerViewForGlobalSpace(
        auth,
        commonUtilitiesServerId
      )
    ).resolves.not.toBeNull();

    const secondRun = await ensureMCPServerViewsForWorkspaceBatchActivity({
      lastProcessedWorkspaceModelId: checkpointWorkspace.id,
      batchSize: 1,
      concurrency: 1,
    });

    expect(secondRun.processedWorkspacesCount).toBe(1);
    expect(secondRun.failuresCount).toBe(0);
    expect(secondRun.failureSamples).toEqual([]);
    expect(secondRun.createdViewsCount).toBe(0);
  });
});
