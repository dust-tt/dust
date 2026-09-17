import {
  refreshSearchUsageWorkflow,
  refreshWorkspaceSearchUsageWorkflow,
} from "@app/temporal/es_indexation/workflows";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  refreshSearchUsageActivity: vi.fn(),
  refreshWorkspaceSearchUsageActivity: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  defineSignal: (name: string) => ({ name }),
  proxyActivities: () => mocks,
}));

describe("refreshSearchUsageWorkflow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.refreshSearchUsageActivity.mockResolvedValue(undefined);
    mocks.refreshWorkspaceSearchUsageActivity.mockResolvedValue(undefined);
  });

  it("refreshes all workspaces through one activity", async () => {
    await refreshSearchUsageWorkflow();

    expect(mocks.refreshSearchUsageActivity).toHaveBeenCalledExactlyOnceWith();
    expect(mocks.refreshWorkspaceSearchUsageActivity).not.toHaveBeenCalled();
  });

  it("refreshes a selected workspace", async () => {
    await refreshWorkspaceSearchUsageWorkflow({ workspaceId: "workspace-4" });

    expect(
      mocks.refreshWorkspaceSearchUsageActivity
    ).toHaveBeenCalledExactlyOnceWith({
      workspaceId: "workspace-4",
    });
    expect(mocks.refreshSearchUsageActivity).not.toHaveBeenCalled();
  });
});
