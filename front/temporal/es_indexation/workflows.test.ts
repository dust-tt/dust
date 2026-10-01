import {
  indexAgentSearchWorkflow,
  indexSkillSearchWorkflow,
  refreshSearchUsageWorkflow,
  refreshWorkspaceSearchUsageWorkflow,
  reindexCodeDefinedSearchWorkflow,
} from "@app/temporal/es_indexation/workflows";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  indexAgentSearchActivity: vi.fn(),
  indexSkillSearchActivity: vi.fn(),
  setHandler: vi.fn(),
  sleep: vi.fn(),
  listWorkspaceIdsActivity: vi.fn(),
  refreshWorkspaceSearchUsageActivity: vi.fn(),
  reindexCodeDefinedSkillsActivity: vi.fn(),
  reindexGlobalAgentsActivity: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  defineSignal: (name: string) => ({ name }),
  proxyActivities: () => mocks,
  setHandler: mocks.setHandler,
  sleep: mocks.sleep,
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

// The deletion signal must cause another activity after an older indexing activity completes.
it.each([
  {
    workflow: () =>
      indexSkillSearchWorkflow({
        workspaceId: "workspace-1",
        skillId: "skill-1",
      }),
    activity: mocks.indexSkillSearchActivity,
    target: { workspaceId: "workspace-1", skillId: "skill-1" },
  },
  {
    workflow: () =>
      indexAgentSearchWorkflow({
        workspaceId: "workspace-1",
        agentId: "agent-1",
      }),
    activity: mocks.indexAgentSearchActivity,
    target: { workspaceId: "workspace-1", agentId: "agent-1" },
  },
])("processes a signal received during an indexing activity", async ({
  workflow,
  activity,
  target,
}) => {
  vi.resetAllMocks();
  let signal = async () => {};
  mocks.setHandler.mockImplementation((_definition, handler) => {
    signal = handler;
    // signalWithStart delivers the initial signal when the handler is installed.
    void signal();
  });
  mocks.sleep.mockResolvedValue(undefined);
  const events: string[] = [];
  activity
    .mockImplementationOnce(async () => {
      events.push("older write started");
      await signal();
      events.push("older write finished");
    })
    .mockImplementationOnce(async () => {
      events.push("missing-resource cleanup");
    });

  await workflow();

  expect(events).toEqual([
    "older write started",
    "older write finished",
    "missing-resource cleanup",
  ]);
  expect(activity).toHaveBeenCalledTimes(2);
  expect(activity).toHaveBeenLastCalledWith(target);
});
