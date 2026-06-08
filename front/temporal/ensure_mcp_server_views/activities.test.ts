import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import {
  ensureMCPServerViewsForWorkspaceBatchActivity,
  getAffectedMCPServerViewsWorkspaceBatchActivity,
} from "@app/temporal/ensure_mcp_server_views/activities";
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

describe("ensure MCP server views activities", () => {
  it("finds a workspace missing views and skips one that has them", async () => {
    const missingWorkspace = await WorkspaceFactory.basic();
    const missingAuth = await Authenticator.internalAdminForWorkspace(
      missingWorkspace.sId
    );
    await SpaceFactory.defaults(missingAuth);

    const healthyWorkspace = await WorkspaceFactory.basic();
    const healthyAuth = await Authenticator.internalAdminForWorkspace(
      healthyWorkspace.sId
    );
    await SpaceFactory.defaults(healthyAuth);
    await MCPServerViewResource.ensureAllAutoToolsAreCreated(healthyAuth);

    const result = await getAffectedMCPServerViewsWorkspaceBatchActivity({
      lastProcessedWorkspaceModelId:
        Math.min(missingWorkspace.id, healthyWorkspace.id) - 1,
      batchSize: 10,
    });

    const affectedWorkspaceIds = new Set(
      result.affectedWorkspaces.map((workspace) => workspace.workspaceId)
    );
    expect(affectedWorkspaceIds.has(missingWorkspace.sId)).toBe(true);
    expect(affectedWorkspaceIds.has(healthyWorkspace.sId)).toBe(false);
  });

  it("creates views idempotently in a batch", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await SpaceFactory.defaults(auth);

    const firstRun = await ensureMCPServerViewsForWorkspaceBatchActivity({
      workspaces: [
        {
          workspaceId: workspace.sId,
          workspaceModelId: workspace.id,
        },
      ],
      concurrency: 1,
    });

    expect(firstRun.processedWorkspacesCount).toBe(1);
    expect(firstRun.failures).toEqual([]);
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
      workspaces: [
        {
          workspaceId: workspace.sId,
          workspaceModelId: workspace.id,
        },
      ],
      concurrency: 1,
    });

    expect(secondRun.processedWorkspacesCount).toBe(1);
    expect(secondRun.failures).toEqual([]);
    expect(secondRun.createdViewsCount).toBe(0);
  });
});
