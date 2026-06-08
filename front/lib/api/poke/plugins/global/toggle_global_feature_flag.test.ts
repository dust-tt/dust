import { toggleGlobalFeatureFlagPlugin } from "@app/lib/api/poke/plugins/global/toggle_global_feature_flag";
import { Authenticator } from "@app/lib/auth";
import { GlobalFeatureFlagResource } from "@app/lib/resources/global_feature_flag_resource";
import { launchEnsureMCPServerViewsWorkflow } from "@app/temporal/ensure_mcp_server_views/client";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Ok } from "@app/types/shared/result";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/ensure_mcp_server_views/client", () => ({
  launchEnsureMCPServerViewsWorkflow: vi.fn(),
}));

describe("toggleGlobalFeatureFlagPlugin.execute", () => {
  beforeEach(async () => {
    vi.mocked(launchEnsureMCPServerViewsWorkflow).mockReset();
    vi.mocked(launchEnsureMCPServerViewsWorkflow).mockResolvedValue(
      new Ok({ workflowId: "ensure-mcp-server-views", outcome: "started" })
    );
    await GlobalFeatureFlagResource.setRolloutPercentage("sandbox_tools", 0);
  });

  afterEach(async () => {
    await GlobalFeatureFlagResource.setRolloutPercentage("sandbox_tools", 0);
  });

  it("starts the MCP server view backfill workflow on rollout increase", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await GlobalFeatureFlagResource.setRolloutPercentage("sandbox_tools", 10);

    const result = await toggleGlobalFeatureFlagPlugin.execute(auth, null, {
      feature: ["sandbox_tools"],
      rolloutPercentage: 20,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      throw result.error;
    }

    expect(launchEnsureMCPServerViewsWorkflow).toHaveBeenCalledTimes(1);
    expect(launchEnsureMCPServerViewsWorkflow).toHaveBeenCalledWith({
      triggeringFeature: "sandbox_tools",
      previousRolloutPercentage: 10,
      rolloutPercentage: 20,
    });
    expect(result.value.value).toContain(
      "MCP server view backfill workflow started"
    );
  });

  it("reports when the backfill workflow is already running on rollout increase", async () => {
    vi.mocked(launchEnsureMCPServerViewsWorkflow).mockResolvedValueOnce(
      new Ok({
        workflowId: "ensure-mcp-server-views",
        outcome: "already_running",
      })
    );
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await GlobalFeatureFlagResource.setRolloutPercentage("sandbox_tools", 10);

    const result = await toggleGlobalFeatureFlagPlugin.execute(auth, null, {
      feature: ["sandbox_tools"],
      rolloutPercentage: 20,
    });

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      throw result.error;
    }

    expect(launchEnsureMCPServerViewsWorkflow).toHaveBeenCalledTimes(1);
    expect(result.value.value).toContain(
      "MCP server view backfill workflow is already running"
    );
  });

  it("does not start the backfill workflow when removing a global rollout", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await GlobalFeatureFlagResource.setRolloutPercentage("sandbox_tools", 20);

    const result = await toggleGlobalFeatureFlagPlugin.execute(auth, null, {
      feature: ["sandbox_tools"],
      rolloutPercentage: 0,
    });

    expect(result.isOk()).toBe(true);
    expect(launchEnsureMCPServerViewsWorkflow).not.toHaveBeenCalled();
  });

  it("does not start the backfill workflow on rollout decrease", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await GlobalFeatureFlagResource.setRolloutPercentage("sandbox_tools", 20);

    const result = await toggleGlobalFeatureFlagPlugin.execute(auth, null, {
      feature: ["sandbox_tools"],
      rolloutPercentage: 10,
    });

    expect(result.isOk()).toBe(true);
    expect(launchEnsureMCPServerViewsWorkflow).not.toHaveBeenCalled();
  });
});
