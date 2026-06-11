import { ensureMCPServerViewsPlugin } from "@app/lib/api/poke/plugins/global/ensure_mcp_server_views";
import { Authenticator } from "@app/lib/auth";
import { launchEnsureMCPServerViewsWorkflow } from "@app/temporal/ensure_mcp_server_views/client";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/temporal/ensure_mcp_server_views/client", () => ({
  launchEnsureMCPServerViewsWorkflow: vi.fn(),
}));

describe("ensureMCPServerViewsPlugin.execute", () => {
  beforeEach(() => {
    vi.mocked(launchEnsureMCPServerViewsWorkflow).mockReset();
  });

  it("starts the workflow and reports the workflow id", async () => {
    vi.mocked(launchEnsureMCPServerViewsWorkflow).mockResolvedValueOnce(
      new Ok({ workflowId: "ensure-mcp-server-views", outcome: "started" })
    );
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await ensureMCPServerViewsPlugin.execute(auth, null, {});

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      throw result.error;
    }

    expect(launchEnsureMCPServerViewsWorkflow).toHaveBeenCalledTimes(1);
    expect(result.value.value).toContain(
      "MCP server view backfill workflow started (ensure-mcp-server-views)."
    );
  });

  it("reports when the workflow is already running", async () => {
    vi.mocked(launchEnsureMCPServerViewsWorkflow).mockResolvedValueOnce(
      new Ok({
        workflowId: "ensure-mcp-server-views",
        outcome: "already_running",
      })
    );
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await ensureMCPServerViewsPlugin.execute(auth, null, {});

    expect(result.isOk()).toBe(true);
    if (!result.isOk()) {
      throw result.error;
    }

    expect(result.value.value).toContain(
      "MCP server view backfill workflow is already running (ensure-mcp-server-views)."
    );
  });

  it("returns an error when the launch fails", async () => {
    vi.mocked(launchEnsureMCPServerViewsWorkflow).mockResolvedValueOnce(
      new Err(new Error("temporal unavailable"))
    );
    const workspace = await WorkspaceFactory.basic();
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);

    const result = await ensureMCPServerViewsPlugin.execute(auth, null, {});

    expect(result.isErr()).toBe(true);
    if (!result.isErr()) {
      throw new Error("Expected an error result.");
    }

    expect(result.error.message).toBe("temporal unavailable");
  });
});
