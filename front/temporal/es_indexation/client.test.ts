import { launchCodeDefinedSearchSchedule } from "@app/temporal/es_indexation/client";
import { QUEUE_NAME } from "@app/temporal/es_indexation/config";
import { reindexCodeDefinedSearchWorkflow } from "@app/temporal/es_indexation/workflows";
import {
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
} from "@temporalio/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createSchedule: vi.fn() }));

vi.mock("@app/lib/temporal", () => ({
  getTemporalClientForFrontNamespace: async () => ({
    schedule: { create: mocks.createSchedule },
  }),
}));

describe("launchCodeDefinedSearchSchedule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("creates an hourly schedule that runs immediately", async () => {
    const result = await launchCodeDefinedSearchSchedule();

    expect(result.isOk()).toBe(true);
    expect(mocks.createSchedule).toHaveBeenCalledExactlyOnceWith({
      scheduleId: "search-code-defined-hourly",
      action: {
        type: "startWorkflow",
        workflowType: reindexCodeDefinedSearchWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      spec: { cronExpressions: ["0 * * * *"], timezone: "UTC" },
      policies: { overlap: ScheduleOverlapPolicy.SKIP },
      state: { triggerImmediately: true },
    });
  });

  it("leaves an existing schedule alone", async () => {
    mocks.createSchedule.mockRejectedValue(
      new ScheduleAlreadyRunning(
        "Schedule already exists",
        "search-code-defined-hourly"
      )
    );

    const result = await launchCodeDefinedSearchSchedule();

    expect(result.isOk()).toBe(true);
  });

  it("reports schedule creation failures", async () => {
    const error = new Error("Temporal unavailable");
    mocks.createSchedule.mockRejectedValue(error);

    const result = await launchCodeDefinedSearchSchedule();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(error);
    }
  });
});
