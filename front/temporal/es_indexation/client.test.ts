import { launchSearchUsageSchedule } from "@app/temporal/es_indexation/client";
import { QUEUE_NAME } from "@app/temporal/es_indexation/config";
import { refreshSearchUsageWorkflow } from "@app/temporal/es_indexation/workflows";
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

describe("launchSearchUsageSchedule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts a new cell's daily schedule immediately", async () => {
    const result = await launchSearchUsageSchedule();

    expect(result.isOk()).toBe(true);
    expect(mocks.createSchedule).toHaveBeenCalledExactlyOnceWith({
      scheduleId: "search-usage-daily",
      action: {
        type: "startWorkflow",
        workflowType: refreshSearchUsageWorkflow,
        args: [],
        taskQueue: QUEUE_NAME,
      },
      spec: { calendars: [{ hour: 3, minute: 0 }], timezone: "UTC" },
      policies: { overlap: ScheduleOverlapPolicy.BUFFER_ONE },
      state: { triggerImmediately: true },
    });
  });

  it("leaves an existing schedule alone when bootstrapped again", async () => {
    mocks.createSchedule.mockRejectedValue(
      new ScheduleAlreadyRunning(
        "Schedule already exists",
        "search-usage-daily"
      )
    );

    const result = await launchSearchUsageSchedule();

    expect(result.isOk()).toBe(true);
    expect(mocks.createSchedule).toHaveBeenCalledTimes(1);
  });

  it("reports schedule creation failures", async () => {
    const error = new Error("Temporal unavailable");
    mocks.createSchedule.mockRejectedValue(error);

    const result = await launchSearchUsageSchedule();

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error).toBe(error);
    }
  });
});
