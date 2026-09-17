import { refreshSearchUsageWorkflow } from "@app/temporal/es_indexation/workflows";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSearchUsageWorkspacesActivity: vi.fn(),
  refreshWorkspaceSearchUsageActivity: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  defineSignal: (name: string) => ({ name }),
  proxyActivities: () => mocks,
}));

describe("refreshSearchUsageWorkflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listSearchUsageWorkspacesActivity.mockResolvedValue([]);
    mocks.refreshWorkspaceSearchUsageActivity.mockResolvedValue(undefined);
  });

  it("starts from the first workspace and refreshes every page without input", async () => {
    mocks.listSearchUsageWorkspacesActivity
      .mockResolvedValueOnce([
        { workspaceModelId: 4, workspaceId: "workspace-4" },
        { workspaceModelId: 12, workspaceId: "workspace-12" },
      ])
      .mockResolvedValueOnce([
        { workspaceModelId: 23, workspaceId: "workspace-23" },
      ]);

    await refreshSearchUsageWorkflow();

    expect(mocks.listSearchUsageWorkspacesActivity.mock.calls).toEqual([
      [0],
      [12],
      [23],
    ]);
    expect(mocks.refreshWorkspaceSearchUsageActivity.mock.calls).toEqual([
      [{ workspaceId: "workspace-4" }],
      [{ workspaceId: "workspace-12" }],
      [{ workspaceId: "workspace-23" }],
    ]);
  });

  it("finishes without refreshing when there are no workspaces", async () => {
    await refreshSearchUsageWorkflow();

    expect(
      mocks.listSearchUsageWorkspacesActivity
    ).toHaveBeenCalledExactlyOnceWith(0);
    expect(mocks.refreshWorkspaceSearchUsageActivity).not.toHaveBeenCalled();
  });

  it("does not advance the cursor when a workspace refresh fails", async () => {
    mocks.listSearchUsageWorkspacesActivity.mockResolvedValueOnce([
      { workspaceModelId: 4, workspaceId: "workspace-4" },
    ]);
    const error = new Error("Usage refresh failed");
    mocks.refreshWorkspaceSearchUsageActivity.mockRejectedValueOnce(error);

    await expect(refreshSearchUsageWorkflow()).rejects.toBe(error);

    expect(
      mocks.listSearchUsageWorkspacesActivity
    ).toHaveBeenCalledExactlyOnceWith(0);
  });
});
