import {
  refreshSearchUsageWorkflow,
  refreshWorkspaceSearchUsageWorkflow,
  reindexCodeDefinedSearchWorkflow,
} from "@app/temporal/es_indexation/workflows";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listWorkspaceIdsActivity: vi.fn(),
  refreshWorkspaceSearchUsageActivity: vi.fn(),
  reindexCodeDefinedSkillsActivity: vi.fn(),
  reindexGlobalAgentsActivity: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  defineSignal: (name: string) => ({ name }),
  proxyActivities: () => mocks,
}));

describe("refreshSearchUsageWorkflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.listWorkspaceIdsActivity.mockResolvedValue([
      "workspace-1",
      "workspace-2",
    ]);
    mocks.refreshWorkspaceSearchUsageActivity.mockResolvedValue(undefined);
  });

  it("refreshes each workspace sequentially", async () => {
    const events: string[] = [];
    mocks.refreshWorkspaceSearchUsageActivity.mockImplementation(
      async ({ workspaceId }) => {
        events.push(`start:${workspaceId}`);
        await Promise.resolve();
        events.push(`end:${workspaceId}`);
      }
    );

    await refreshSearchUsageWorkflow();

    expect(mocks.listWorkspaceIdsActivity).toHaveBeenCalledExactlyOnceWith();
    expect(events).toEqual([
      "start:workspace-1",
      "end:workspace-1",
      "start:workspace-2",
      "end:workspace-2",
    ]);
  });

  it("does nothing when there are no workspaces", async () => {
    mocks.listWorkspaceIdsActivity.mockResolvedValue([]);

    await refreshSearchUsageWorkflow();

    expect(mocks.refreshWorkspaceSearchUsageActivity).not.toHaveBeenCalled();
  });

  it("stops when a workspace refresh fails", async () => {
    const error = new Error("Usage refresh failed");
    mocks.refreshWorkspaceSearchUsageActivity.mockRejectedValue(error);

    await expect(refreshSearchUsageWorkflow()).rejects.toBe(error);

    expect(
      mocks.refreshWorkspaceSearchUsageActivity
    ).toHaveBeenCalledExactlyOnceWith({ workspaceId: "workspace-1" });
  });

  it("refreshes a selected workspace", async () => {
    await refreshWorkspaceSearchUsageWorkflow({ workspaceId: "workspace-4" });

    expect(
      mocks.refreshWorkspaceSearchUsageActivity
    ).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "workspace-4",
    });
    expect(mocks.listWorkspaceIdsActivity).not.toHaveBeenCalled();
  });
});

describe("reindexCodeDefinedSearchWorkflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.reindexCodeDefinedSkillsActivity.mockResolvedValue(undefined);
    mocks.reindexGlobalAgentsActivity.mockResolvedValue(undefined);
  });

  it("reindexes code-defined skills and global agents", async () => {
    await reindexCodeDefinedSearchWorkflow();

    expect(
      mocks.reindexCodeDefinedSkillsActivity
    ).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.reindexGlobalAgentsActivity).toHaveBeenCalledExactlyOnceWith();
  });

  it("throws when a reindex fails", async () => {
    const error = new Error("Global agent indexing failed");
    mocks.reindexGlobalAgentsActivity.mockRejectedValue(error);

    await expect(reindexCodeDefinedSearchWorkflow()).rejects.toBe(error);
  });
});
