import type {
  ReaperCursor,
  ReaperPhase,
  ReapSandboxPhaseActivityResult,
} from "@app/temporal/sandbox_reaper/activities";
import { BATCH_SIZE } from "@app/temporal/sandbox_reaper/config";
import {
  fileSystemCleanupWorkflow,
  sandboxReaperWorkflow,
} from "@app/temporal/sandbox_reaper/workflows";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCleanupFileSystemActivity,
  mockLogWarn,
  mockReapSandboxPhaseActivity,
} = vi.hoisted(() => ({
  mockCleanupFileSystemActivity: vi.fn(),
  mockLogWarn: vi.fn(),
  mockReapSandboxPhaseActivity: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  log: { warn: mockLogWarn },
  proxyActivities: () => ({
    cleanupFileSystemActivity: mockCleanupFileSystemActivity,
    reapSandboxPhaseActivity: mockReapSandboxPhaseActivity,
  }),
}));

describe("fileSystemCleanupWorkflow", () => {
  it("runs the independent blob cleanup activity", async () => {
    mockCleanupFileSystemActivity.mockResolvedValue(undefined);

    await fileSystemCleanupWorkflow();

    expect(mockCleanupFileSystemActivity).toHaveBeenCalledOnce();
  });
});

function makeResult(
  nextCursor: ReaperCursor | null
): ReapSandboxPhaseActivityResult {
  return {
    failedCount: 0,
    nextCursor,
    processedCount: nextCursor ? BATCH_SIZE : 0,
    skippedCount: 0,
    succeededCount: nextCursor ? BATCH_SIZE : 0,
  };
}

describe("sandboxReaperWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReapSandboxPhaseActivity.mockResolvedValue(makeResult(null));
  });

  it("rechecks capacity work between maintenance batches", async () => {
    const maintenanceCursor: ReaperCursor = {
      sandboxModelId: 10,
      timestampMs: 1_000,
    };
    const runningCursor: ReaperCursor = {
      sandboxModelId: 20,
      timestampMs: 2_000,
    };
    let runningCalls = 0;
    let killRequestedSleepingCalls = 0;

    mockReapSandboxPhaseActivity.mockImplementation(
      async ({
        phase,
      }: {
        cursor: ReaperCursor | null;
        phase: ReaperPhase;
      }) => {
        if (phase === "running") {
          runningCalls += 1;
          return makeResult(runningCalls === 3 ? runningCursor : null);
        }
        if (phase === "kill_requested_sleeping") {
          killRequestedSleepingCalls += 1;
          return makeResult(
            killRequestedSleepingCalls === 1 ? maintenanceCursor : null
          );
        }
        return makeResult(null);
      }
    );

    await sandboxReaperWorkflow();

    const capacityAndMaintenanceCalls = mockReapSandboxPhaseActivity.mock.calls
      .map(([input]) => input)
      .filter(
        ({ phase }) =>
          phase === "running" || phase === "kill_requested_sleeping"
      );
    expect(capacityAndMaintenanceCalls).toEqual([
      { cursor: null, phase: "running" },
      { cursor: null, phase: "running" },
      { cursor: null, phase: "kill_requested_sleeping" },
      { cursor: null, phase: "running" },
      { cursor: runningCursor, phase: "running" },
      { cursor: maintenanceCursor, phase: "kill_requested_sleeping" },
      { cursor: null, phase: "running" },
      { cursor: null, phase: "running" },
    ]);
  });

  it("stops maintenance when capacity work reaches its batch limit", async () => {
    const maintenanceCursor: ReaperCursor = {
      sandboxModelId: 30,
      timestampMs: 3_000,
    };
    const capacityCursor: ReaperCursor = {
      sandboxModelId: 40,
      timestampMs: 4_000,
    };
    let killRequestedSleepingCalls = 0;

    mockReapSandboxPhaseActivity.mockImplementation(
      async ({
        phase,
      }: {
        cursor: ReaperCursor | null;
        phase: ReaperPhase;
      }) => {
        if (phase === "kill_requested") {
          return makeResult(
            killRequestedSleepingCalls > 0 ? capacityCursor : null
          );
        }
        if (phase === "kill_requested_sleeping") {
          killRequestedSleepingCalls += 1;
          return makeResult(maintenanceCursor);
        }
        return makeResult(null);
      }
    );

    await sandboxReaperWorkflow();

    expect(killRequestedSleepingCalls).toBe(1);
    expect(
      mockReapSandboxPhaseActivity.mock.calls.some(
        ([{ phase }]) => phase === "sleeping"
      )
    ).toBe(false);
    expect(mockLogWarn).toHaveBeenCalledWith(
      "Reaper phase reached its batch limit.",
      expect.objectContaining({
        phase: "kill_requested",
        sandboxModelId: capacityCursor.sandboxModelId,
        timestampMs: capacityCursor.timestampMs,
      })
    );
  });
});
