import {
  getChronologicalRunsForAgentMessage,
  inferDustRunIdForStepContent,
} from "@app/scripts/backfill_agent_step_content_dust_run_ids";
import { describe, expect, it } from "vitest";

describe("inferDustRunIdForStepContent", () => {
  const runs = [
    {
      dustRunId: "run-0",
      createdAt: new Date("2026-08-01T00:00:00.000Z"),
      runModelId: 10,
    },
    {
      dustRunId: "run-1",
      createdAt: new Date("2026-08-01T00:01:00.000Z"),
      runModelId: 11,
    },
    {
      dustRunId: "run-2",
      createdAt: new Date("2026-08-01T00:02:00.000Z"),
      runModelId: 12,
    },
  ];
  const runByDustRunId = new Map(runs.map((run) => [run.dustRunId, run]));

  it("orders and deduplicates the message run ids", () => {
    expect(
      getChronologicalRunsForAgentMessage(
        ["run-2", "run-0", "run-1", "run-1"],
        runByDustRunId
      )?.map((run) => run.dustRunId)
    ).toEqual(["run-0", "run-1", "run-2"]);
  });

  it("does not infer when an in-progress message references a run that is not persisted yet", () => {
    expect(
      getChronologicalRunsForAgentMessage(
        ["run-0", "run-not-persisted-yet"],
        runByDustRunId
      )
    ).toBeNull();
  });

  it("matches the run at the content step within its timestamp bounds", () => {
    expect(
      inferDustRunIdForStepContent(
        {
          step: 1,
          createdAt: new Date("2026-08-01T00:01:30.000Z"),
        },
        runs
      )
    ).toBe("run-1");
  });

  it("does not guess when the step and run chronology disagree", () => {
    expect(
      inferDustRunIdForStepContent(
        {
          step: 1,
          createdAt: new Date("2026-08-01T00:00:30.000Z"),
        },
        runs
      )
    ).toBeNull();

    expect(
      inferDustRunIdForStepContent(
        {
          step: 1,
          createdAt: new Date("2026-08-01T00:02:30.000Z"),
        },
        runs
      )
    ).toBeNull();

    expect(
      inferDustRunIdForStepContent(
        {
          step: 3,
          createdAt: new Date("2026-08-01T00:03:30.000Z"),
        },
        runs
      )
    ).toBeNull();
  });
});
