import { continueAfterRecordingModelStep } from "@app/temporal/agent_loop/lib/model_step_state";
import { describe, expect, it } from "vitest";

describe("continueAfterRecordingModelStep", () => {
  it("retains model evidence when the following tool phase fails", async () => {
    const recordedRunIds: string[] = [];
    const recordedActionIds: number[] = [];
    const modelResult = {
      runId: "run-1",
      actionModelIds: [101, 102],
    };

    await expect(
      continueAfterRecordingModelStep({
        modelResult,
        recordModelStep: (result) => {
          recordedRunIds.push(result.runId);
          recordedActionIds.push(...result.actionModelIds);
        },
        continueStep: async () => {
          throw new Error("tool failed");
        },
      })
    ).rejects.toThrow("tool failed");

    expect(recordedRunIds).toEqual(["run-1"]);
    expect(recordedActionIds).toEqual([101, 102]);
  });
});
