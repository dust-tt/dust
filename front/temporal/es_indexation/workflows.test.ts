import {
  refreshSearchUsageWorkflow,
  refreshWorkspaceSearchUsageWorkflow,
} from "@app/temporal/es_indexation/workflows";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reindexCodeDefinedSkillsActivity: vi.fn(),
  listWorkspaceIdsActivity: vi.fn(),
  refreshWorkspaceSearchUsageActivity: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  defineSignal: (name: string) => ({ name }),
  proxyActivities: () => mocks,
}));

describe("refreshSearchUsageWorkflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.reindexCodeDefinedSkillsActivity.mockResolvedValue(undefined);
    mocks.listWorkspaceIdsActivity.mockResolvedValue([
      "workspace-1",
      "workspace-2",
    ]);
    mocks.refreshWorkspaceSearchUsageActivity.mockResolvedValue(undefined);
  });

  it("reindexes code-defined skills once before refreshing workspaces sequentially", async () => {
    const events: string[] = [];
    mocks.reindexCodeDefinedSkillsActivity.mockImplementation(async () => {
      events.push("code-defined");
    });
    mocks.refreshWorkspaceSearchUsageActivity.mockImplementation(
      async ({ workspaceId }) => {
        events.push(`start:${workspaceId}`);
        await Promise.resolve();
        events.push(`end:${workspaceId}`);
      }
    );

    await refreshSearchUsageWorkflow();

    expect(mocks.listWorkspaceIdsActivity).toHaveBeenCalledExactlyOnceWith();
    expect(
      mocks.reindexCodeDefinedSkillsActivity
    ).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.reindexCodeDefinedSkillsActivity).toHaveBeenCalledBefore(
      mocks.listWorkspaceIdsActivity
    );
    expect(events).toEqual([
      "code-defined",
      "start:workspace-1",
      "end:workspace-1",
      "start:workspace-2",
      "end:workspace-2",
    ]);
  });

  it("reindexes code-defined skills even when there are no workspaces", async () => {
    mocks.listWorkspaceIdsActivity.mockResolvedValue([]);

    await refreshSearchUsageWorkflow();

    expect(
      mocks.reindexCodeDefinedSkillsActivity
    ).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.refreshWorkspaceSearchUsageActivity).not.toHaveBeenCalled();
  });

  it("stops before listing workspaces if code-defined indexing fails", async () => {
    const error = new Error("Code-defined indexing failed");
    mocks.reindexCodeDefinedSkillsActivity.mockRejectedValue(error);

    await expect(refreshSearchUsageWorkflow()).rejects.toBe(error);

    expect(mocks.listWorkspaceIdsActivity).not.toHaveBeenCalled();
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
    expect(mocks.reindexCodeDefinedSkillsActivity).not.toHaveBeenCalled();
  });
});
